import { getDb } from "@/db";
import { oauthStates, ssoConnections, users, organizations } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";

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
