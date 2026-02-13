import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  createOAuthState,
  fetchOidcDiscovery,
  getOidcAuthorizationUrl,
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

    if (connection.type !== "oidc" || !connection.oidcIssuerUrl || !connection.oidcClientId) {
      return NextResponse.json(
        { error: "SSO is not fully configured for this domain." },
        { status: 400 },
      );
    }

    // Fetch OIDC discovery
    const discovery = await fetchOidcDiscovery(connection.oidcIssuerUrl);

    // Create OAuth state
    const state = await createOAuthState({
      flowType: "customer_oidc",
      connectionId: connection.id,
    });

    // Build authorization URL
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/sso/callback`;
    const url = getOidcAuthorizationUrl(discovery, {
      clientId: connection.oidcClientId,
      redirectUri,
      state,
      scopes: connection.oidcScopes || "openid email profile",
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("SSO init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize SSO login." },
      { status: 500 },
    );
  }
}
