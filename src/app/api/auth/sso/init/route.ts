import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createOAuthState,
  fetchOidcDiscovery,
  getOidcAuthorizationUrl,
  buildSamlAuthnRequest,
  buildSamlRedirectUrl,
  getSamlSpConfig,
} from "@/lib/sso";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    const domain = email.split("@")[1].toLowerCase();

    const db = await getDb();
    const [connection] = await db
      .select()
      .from(ssoConnections)
      .where(and(eq(ssoConnections.domain, domain), eq(ssoConnections.enabled, true)))
      .limit(1);

    if (!connection) {
      return NextResponse.json(
        { error: "No SSO configuration found for this email domain." },
        { status: 404 },
      );
    }

    const origin = request.nextUrl.origin;

    // ── OIDC flow ──
    if (connection.type === "oidc") {
      if (!connection.oidcIssuerUrl || !connection.oidcClientId) {
        return NextResponse.json(
          { error: "SSO is not fully configured for this domain." },
          { status: 400 },
        );
      }

      const discovery = await fetchOidcDiscovery(connection.oidcIssuerUrl);

      const state = await createOAuthState({
        flowType: "customer_oidc",
        connectionId: connection.id,
      });

      const redirectUri = `${origin}/api/auth/sso/callback`;
      const url = getOidcAuthorizationUrl(discovery, {
        clientId: connection.oidcClientId,
        redirectUri,
        state,
        scopes: connection.oidcScopes || "openid email profile",
      });

      return NextResponse.json({ url });
    }

    // ── SAML flow ──
    if (connection.type === "saml") {
      if (!connection.samlSsoUrl || !connection.samlCertificate) {
        return NextResponse.json(
          { error: "SSO is not fully configured for this domain." },
          { status: 400 },
        );
      }

      const state = await createOAuthState({
        flowType: "customer_saml",
        connectionId: connection.id,
      });

      const { entityId, acsUrl } = getSamlSpConfig(origin);

      const authnRequest = buildSamlAuthnRequest({
        id: `_${crypto.randomUUID()}`,
        issueInstant: new Date().toISOString(),
        acsUrl,
        entityId,
        destination: connection.samlSsoUrl,
      });

      const url = await buildSamlRedirectUrl(
        connection.samlSsoUrl,
        authnRequest,
        state,
      );

      return NextResponse.json({ url });
    }

    return NextResponse.json(
      { error: "SSO is not fully configured for this domain." },
      { status: 400 },
    );
  } catch (error) {
    console.error("SSO init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize SSO login." },
      { status: 500 },
    );
  }
}
