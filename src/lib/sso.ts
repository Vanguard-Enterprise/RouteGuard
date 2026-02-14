import { getDb } from "@/db";
import { oauthStates, ssoConnections, users, organizations } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import { promisify } from "node:util";
import { deflateRaw as deflateRawCb } from "node:zlib";

const deflateRaw = promisify(deflateRawCb);

// ============================================================================
// PKCE Helpers (Web Crypto API — Cloudflare Workers compatible)
// ============================================================================

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64url(digest);
}

// ============================================================================
// OAuth State Management
// ============================================================================

function generateRandomState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes.buffer);
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function createOAuthState(params: {
  flowType: "staff" | "customer_oidc" | "customer_saml";
  codeVerifier?: string;
  connectionId?: string;
  redirectAfter?: string;
}): Promise<string> {
  const db = await getDb();
  const state = generateRandomState();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await db.insert(oauthStates).values({
    state,
    codeVerifier: params.codeVerifier ?? null,
    connectionId: params.connectionId ?? null,
    flowType: params.flowType,
    redirectAfter: params.redirectAfter ?? null,
    expiresAt,
  });

  return state;
}

export async function consumeOAuthState(state: string) {
  const db = await getDb();

  // Clean up expired states
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));

  const [record] = await db
    .select()
    .from(oauthStates)
    .where(eq(oauthStates.state, state))
    .limit(1);

  if (!record) return null;

  // Delete the used state
  await db.delete(oauthStates).where(eq(oauthStates.id, record.id));

  // Check expiry
  if (record.expiresAt < new Date()) return null;

  return record;
}

// ============================================================================
// Zitadel (Staff Auth — PKCE)
// ============================================================================

function getZitadelIssuer(): string {
  const issuer = process.env.ZITADEL_ISSUER;
  if (!issuer) throw new Error("ZITADEL_ISSUER environment variable is not set");
  return issuer.replace(/\/$/, "");
}

function getZitadelClientId(): string {
  const clientId = process.env.ZITADEL_CLIENT_ID;
  if (!clientId) throw new Error("ZITADEL_CLIENT_ID environment variable is not set");
  return clientId;
}

export function getZitadelAuthorizationUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  const issuer = getZitadelIssuer();
  const clientId = getZitadelClientId();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${issuer}/oauth/v2/authorize?${params.toString()}`;
}

export async function exchangeZitadelCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ access_token: string; id_token?: string }> {
  const issuer = getZitadelIssuer();
  const clientId = getZitadelClientId();

  const res = await fetch(`${issuer}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zitadel token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function getZitadelUserInfo(
  accessToken: string,
): Promise<{ sub: string; email?: string; name?: string; picture?: string }> {
  const issuer = getZitadelIssuer();

  const res = await fetch(`${issuer}/oidc/v1/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Zitadel userinfo failed (${res.status})`);
  }

  return res.json();
}

// ============================================================================
// OIDC (Customer SSO)
// ============================================================================

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  issuer: string;
}

export async function fetchOidcDiscovery(issuerUrl: string): Promise<OidcDiscovery> {
  const url = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;

  const res = await fetch(url, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  } as RequestInit);

  if (!res.ok) {
    throw new Error(`OIDC discovery failed for ${issuerUrl} (${res.status})`);
  }

  return res.json();
}

export function getOidcAuthorizationUrl(
  discovery: OidcDiscovery,
  params: {
    clientId: string;
    redirectUri: string;
    state: string;
    scopes: string;
  },
): string {
  const searchParams = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scopes,
    state: params.state,
  });

  return `${discovery.authorization_endpoint}?${searchParams.toString()}`;
}

export async function exchangeOidcCode(
  discovery: OidcDiscovery,
  params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
): Promise<{ access_token: string; id_token?: string }> {
  const res = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OIDC token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

export function decodeIdToken(idToken: string): Record<string, unknown> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");

  const payload = parts[1];
  // Restore base64 padding
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decoded);
}

// ============================================================================
// User Provisioning
// ============================================================================

export async function findOrCreateSsoUser(params: {
  email: string;
  name: string;
  ssoId: string;
  orgId: string;
  authProvider: string;
  avatarUrl?: string;
}) {
  const db = await getDb();

  // Try to find by ssoId first
  let [existing] = await db
    .select()
    .from(users)
    .where(eq(users.ssoId, params.ssoId))
    .limit(1);

  if (!existing) {
    // Try by email within the org
    [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, params.orgId), eq(users.email, params.email)))
      .limit(1);

    if (existing) {
      await db
        .update(users)
        .set({
          ssoId: params.ssoId,
          authProvider: params.authProvider,
          lastLoginAt: new Date(),
          avatarUrl: params.avatarUrl || existing.avatarUrl,
        })
        .where(eq(users.id, existing.id));
      return existing;
    }
  }

  if (!existing) {
    // Auto-provision new user
    const [newUser] = await db
      .insert(users)
      .values({
        orgId: params.orgId,
        email: params.email,
        name: params.name,
        role: "school_admin",
        ssoId: params.ssoId,
        authProvider: params.authProvider,
        avatarUrl: params.avatarUrl || null,
        lastLoginAt: new Date(),
      })
      .returning();
    return newUser;
  }

  // Update existing user's login info
  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      authProvider: params.authProvider,
      avatarUrl: params.avatarUrl || existing.avatarUrl,
    })
    .where(eq(users.id, existing.id));

  return existing;
}

// ============================================================================
// SAML 2.0 Helpers
// ============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

/**
 * Fetch and parse SAML IdP metadata from a URL.
 * Extracts entityId, SSO redirect URL, and signing certificate.
 */
export async function fetchSamlMetadata(url: string): Promise<{
  entityId: string;
  ssoUrl: string;
  certificate: string;
}> {
  const res = await fetch(url, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  } as RequestInit);

  if (!res.ok) {
    throw new Error(`Failed to fetch SAML metadata (${res.status})`);
  }

  const xml = await res.text();
  const doc = xmlParser.parse(xml);

  const descriptor =
    doc.EntityDescriptor ?? doc["md:EntityDescriptor"] ?? doc;
  const entityId = descriptor["@_entityID"];
  if (!entityId) {
    throw new Error("SAML metadata missing entityID");
  }

  const idpSso = descriptor.IDPSSODescriptor ?? descriptor["md:IDPSSODescriptor"];
  if (!idpSso) {
    throw new Error("SAML metadata missing IDPSSODescriptor");
  }

  // Find HTTP-Redirect binding SSO URL
  const ssoServices = Array.isArray(idpSso.SingleSignOnService)
    ? idpSso.SingleSignOnService
    : [idpSso.SingleSignOnService];

  const redirectBinding = ssoServices.find(
    (s: Record<string, string>) =>
      s["@_Binding"] === "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
  );
  const ssoUrl = redirectBinding?.["@_Location"];
  if (!ssoUrl) {
    throw new Error("SAML metadata missing HTTP-Redirect SingleSignOnService");
  }

  // Extract signing certificate
  const keyDescriptors = Array.isArray(idpSso.KeyDescriptor)
    ? idpSso.KeyDescriptor
    : [idpSso.KeyDescriptor];

  const signingKey =
    keyDescriptors.find(
      (kd: Record<string, string>) =>
        !kd["@_use"] || kd["@_use"] === "signing",
    ) ?? keyDescriptors[0];

  const keyInfo = signingKey?.KeyInfo ?? signingKey?.["ds:KeyInfo"];
  const x509Data = keyInfo?.X509Data ?? keyInfo?.["ds:X509Data"];
  const certificate: string =
    x509Data?.X509Certificate ?? x509Data?.["ds:X509Certificate"] ?? "";

  if (!certificate) {
    throw new Error("SAML metadata missing X509Certificate");
  }

  return {
    entityId,
    ssoUrl,
    certificate: certificate.replace(/\s+/g, ""),
  };
}

/**
 * Return SP entity ID and ACS URL based on the application origin.
 */
export function getSamlSpConfig(origin: string) {
  return {
    entityId: `${origin}/api/auth/sso/saml/metadata`,
    acsUrl: `${origin}/api/auth/sso/saml/acs`,
  };
}

/**
 * Build a SAML 2.0 AuthnRequest XML string.
 */
export function buildSamlAuthnRequest(config: {
  id: string;
  issueInstant: string;
  acsUrl: string;
  entityId: string;
  destination: string;
}): string {
  return [
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    ` ID="${config.id}"`,
    ` Version="2.0"`,
    ` IssueInstant="${config.issueInstant}"`,
    ` Destination="${config.destination}"`,
    ` AssertionConsumerServiceURL="${config.acsUrl}"`,
    ` ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">`,
    `<saml:Issuer>${config.entityId}</saml:Issuer>`,
    `<samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>`,
    `</samlp:AuthnRequest>`,
  ].join("");
}

/**
 * Deflate + base64 + URL-encode an AuthnRequest for HTTP-Redirect binding.
 * Returns the full redirect URL with SAMLRequest and RelayState params.
 */
export async function buildSamlRedirectUrl(
  ssoUrl: string,
  authnRequest: string,
  relayState: string,
): Promise<string> {
  const compressed = await deflateRaw(Buffer.from(authnRequest, "utf-8"));
  const encoded = compressed.toString("base64");

  const params = new URLSearchParams({
    SAMLRequest: encoded,
    RelayState: relayState,
  });

  const separator = ssoUrl.includes("?") ? "&" : "?";
  return `${ssoUrl}${separator}${params.toString()}`;
}

/**
 * Base64-decode and parse a SAML Response from HTTP-POST binding.
 */
export function parseSamlResponse(b64: string): Record<string, unknown> {
  const xml = Buffer.from(b64, "base64").toString("utf-8");
  return xmlParser.parse(xml);
}

/**
 * Import an X.509 certificate PEM (or raw base64 DER) as a Web Crypto public key.
 */
export async function importX509PublicKey(
  pem: string,
): Promise<CryptoKey> {
  // Strip PEM headers/whitespace to get raw base64 DER
  const b64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // Parse X.509 DER to extract SubjectPublicKeyInfo (SPKI)
  const spki = extractSpkiFromCert(der);

  return crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Minimal ASN.1 DER parser to extract SPKI from an X.509 certificate.
 */
function extractSpkiFromCert(der: Uint8Array): ArrayBuffer {
  let offset = 0;

  function readTag() {
    const tag = der[offset++];
    let length = der[offset++];
    if (length & 0x80) {
      const numBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | der[offset++];
      }
    }
    const value = der.slice(offset, offset + length);
    offset += length;
    return { tag, length, value };
  }

  function readSequenceHeader() {
    const tag = der[offset++];
    if (tag !== 0x30) throw new Error("Expected SEQUENCE tag");
    let length = der[offset++];
    if (length & 0x80) {
      const numBytes = length & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) {
        length = (length << 8) | der[offset++];
      }
    }
    return length;
  }

  // Certificate SEQUENCE
  readSequenceHeader();
  // TBSCertificate SEQUENCE
  const tbsStart = offset;
  readSequenceHeader();

  // version [0] EXPLICIT
  if (der[offset] === 0xa0) {
    readTag();
  }

  // serialNumber
  readTag();
  // signature AlgorithmIdentifier
  readTag();
  // issuer
  readTag();
  // validity
  readTag();
  // subject
  readTag();

  // subjectPublicKeyInfo — this is what we need
  const spkiStart = offset;
  readTag(); // read it to advance past it
  const spkiEnd = offset;

  return der.slice(spkiStart, spkiEnd).buffer;
}

/**
 * Validate the XML signature on a SAML Response using Web Crypto API.
 * Supports RSA-SHA256 signatures (most common for SAML 2.0).
 */
export async function validateSamlSignature(
  b64Response: string,
  certPem: string,
): Promise<boolean> {
  const xml = Buffer.from(b64Response, "base64").toString("utf-8");

  // Extract the SignatureValue
  const sigValueMatch = xml.match(
    /<(?:ds:)?SignatureValue[^>]*>([^<]+)<\/(?:ds:)?SignatureValue>/,
  );
  if (!sigValueMatch) throw new Error("No SignatureValue found in SAML response");

  const signatureValue = Uint8Array.from(
    atob(sigValueMatch[1].replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );

  // Extract SignedInfo element (inclusive of tags)
  const signedInfoMatch = xml.match(
    /<(?:ds:)?SignedInfo[^>]*>[\s\S]*?<\/(?:ds:)?SignedInfo>/,
  );
  if (!signedInfoMatch) throw new Error("No SignedInfo found in SAML response");

  let signedInfo = signedInfoMatch[0];

  // Canonicalize: ensure namespace declarations are present on SignedInfo
  // This is needed because Exclusive C14N requires ns decls in scope.
  if (!signedInfo.includes("xmlns:ds")) {
    // Try to pull ds namespace from Signature element
    const sigNsMatch = xml.match(
      /<(?:ds:)?Signature([^>]*xmlns:ds="[^"]*"[^>]*)>/,
    );
    if (sigNsMatch) {
      const nsDecl = sigNsMatch[1].match(/xmlns:ds="[^"]*"/)?.[0];
      if (nsDecl) {
        signedInfo = signedInfo.replace(/<(ds:)?SignedInfo/, `<$1SignedInfo ${nsDecl}`);
      }
    }
  }

  // Ensure samlp / saml namespaces propagated if referenced
  const signatureBlock = xml.match(
    /<(?:ds:)?Signature[^>]*>[\s\S]*?<\/(?:ds:)?Signature>/,
  );
  if (signatureBlock) {
    // Get parent element's namespaces
    const beforeSig = xml.substring(0, xml.indexOf(signatureBlock[0]));
    const parentMatch = beforeSig.match(/<[^/][^>]*$/);
    if (parentMatch) {
      const parentTag = parentMatch[0];
      const nsDeclMatches = parentTag.match(/xmlns(?::\w+)?="[^"]*"/g) || [];
      for (const ns of nsDeclMatches) {
        if (!signedInfo.includes(ns)) {
          signedInfo = signedInfo.replace(
            /<((?:ds:)?SignedInfo)/,
            `<$1 ${ns}`,
          );
        }
      }
    }
  }

  const signedInfoBytes = new TextEncoder().encode(signedInfo);
  const publicKey = await importX509PublicKey(certPem);

  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    signatureValue,
    signedInfoBytes,
  );
}

// Common SAML attribute name URIs
const ATTR_EMAIL_URIS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "urn:oid:0.9.2342.19200300.100.1.3",
  "email",
  "Email",
  "emailAddress",
  "mail",
];

const ATTR_NAME_URIS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  "http://schemas.microsoft.com/identity/claims/displayname",
  "urn:oid:2.16.840.1.113730.3.1.241",
  "displayName",
  "name",
];

const ATTR_FIRST_NAME_URIS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  "urn:oid:2.5.4.42",
  "firstName",
  "givenName",
];

const ATTR_LAST_NAME_URIS = [
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  "urn:oid:2.5.4.4",
  "lastName",
  "sn",
  "surname",
];

/**
 * Extract NameID and common attributes (email, name) from a parsed SAML Assertion.
 */
export function extractSamlAttributes(doc: Record<string, unknown>): {
  nameId: string;
  email?: string;
  name?: string;
} {
  const response = (doc.Response ?? doc["samlp:Response"] ?? doc) as Record<string, unknown>;
  const assertion = (response.Assertion ?? response["saml:Assertion"]) as Record<string, unknown> | undefined;
  if (!assertion) throw new Error("No Assertion found in SAML response");

  // Extract NameID
  const subject = (assertion.Subject ?? assertion["saml:Subject"]) as Record<string, unknown> | undefined;
  const nameIdNode = subject?.NameID ?? subject?.["saml:NameID"];
  const nameId: string =
    typeof nameIdNode === "object" && nameIdNode !== null
      ? (nameIdNode as Record<string, string>)["#text"] ?? ""
      : String(nameIdNode ?? "");

  if (!nameId) throw new Error("No NameID found in SAML assertion");

  // Build attribute map
  const attrStatement =
    (assertion.AttributeStatement ?? assertion["saml:AttributeStatement"]) as Record<string, unknown> | undefined;
  const attrMap = new Map<string, string>();

  if (attrStatement) {
    const attrs = Array.isArray(attrStatement.Attribute ?? attrStatement["saml:Attribute"])
      ? (attrStatement.Attribute ?? attrStatement["saml:Attribute"]) as Record<string, unknown>[]
      : [attrStatement.Attribute ?? attrStatement["saml:Attribute"]] as Record<string, unknown>[];

    for (const attr of attrs) {
      if (!attr) continue;
      const attrName = (attr["@_Name"] ?? attr["@_FriendlyName"]) as string;
      const value = attr.AttributeValue ?? attr["saml:AttributeValue"];
      const strValue =
        typeof value === "object" && value !== null
          ? (value as Record<string, string>)["#text"] ?? ""
          : String(value ?? "");
      if (attrName && strValue) {
        attrMap.set(attrName, strValue);
      }
    }
  }

  function findAttr(uris: string[]): string | undefined {
    for (const uri of uris) {
      const v = attrMap.get(uri);
      if (v) return v;
    }
    return undefined;
  }

  const email = findAttr(ATTR_EMAIL_URIS) || (nameId.includes("@") ? nameId : undefined);
  const displayName = findAttr(ATTR_NAME_URIS);
  const firstName = findAttr(ATTR_FIRST_NAME_URIS);
  const lastName = findAttr(ATTR_LAST_NAME_URIS);

  let name = displayName;
  if (!name && firstName) {
    name = lastName ? `${firstName} ${lastName}` : firstName;
  }

  return { nameId, email, name };
}

/**
 * Validate SAML Response conditions (NotBefore, NotOnOrAfter, Audience).
 */
export function validateSamlConditions(
  doc: Record<string, unknown>,
  expectedAudience: string,
): void {
  const response = (doc.Response ?? doc["samlp:Response"] ?? doc) as Record<string, unknown>;
  const assertion = (response.Assertion ?? response["saml:Assertion"]) as Record<string, unknown> | undefined;
  if (!assertion) throw new Error("No Assertion found in SAML response");

  const conditions = (assertion.Conditions ?? assertion["saml:Conditions"]) as Record<string, unknown> | undefined;
  if (!conditions) return; // Conditions are optional per SAML spec

  const now = Date.now();
  const clockSkewMs = 120_000; // 2-minute tolerance

  const notBefore = conditions["@_NotBefore"] as string | undefined;
  if (notBefore) {
    const notBeforeTime = new Date(notBefore).getTime();
    if (now < notBeforeTime - clockSkewMs) {
      throw new Error("SAML assertion is not yet valid (NotBefore)");
    }
  }

  const notOnOrAfter = conditions["@_NotOnOrAfter"] as string | undefined;
  if (notOnOrAfter) {
    const notOnOrAfterTime = new Date(notOnOrAfter).getTime();
    if (now >= notOnOrAfterTime + clockSkewMs) {
      throw new Error("SAML assertion has expired (NotOnOrAfter)");
    }
  }

  // Audience restriction
  const audienceRestriction =
    conditions.AudienceRestriction ?? conditions["saml:AudienceRestriction"];
  if (audienceRestriction) {
    const ar = audienceRestriction as Record<string, unknown>;
    const audience = ar.Audience ?? ar["saml:Audience"];
    const audienceStr =
      typeof audience === "object" && audience !== null
        ? (audience as Record<string, string>)["#text"] ?? ""
        : String(audience ?? "");
    if (audienceStr && audienceStr !== expectedAudience) {
      throw new Error(
        `SAML audience mismatch: expected ${expectedAudience}, got ${audienceStr}`,
      );
    }
  }
}

/**
 * Check that the SAML Response Status is Success.
 */
export function checkSamlStatus(doc: Record<string, unknown>): void {
  const response = (doc.Response ?? doc["samlp:Response"] ?? doc) as Record<string, unknown>;
  const status = (response.Status ?? response["samlp:Status"]) as Record<string, unknown> | undefined;
  if (!status) throw new Error("No Status element in SAML response");

  const statusCode = (status.StatusCode ?? status["samlp:StatusCode"]) as Record<string, unknown> | undefined;
  const value = statusCode?.["@_Value"] as string | undefined ?? "";

  if (!value.endsWith(":Success")) {
    const message = (status.StatusMessage ?? status["samlp:StatusMessage"]) as string | undefined;
    throw new Error(`SAML authentication failed: ${message || value}`);
  }
}
