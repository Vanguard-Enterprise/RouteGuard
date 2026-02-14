import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { ssoConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import {
  consumeOAuthState,
  fetchOidcDiscovery,
  exchangeOidcCode,
  decodeIdToken,
  findOrCreateSsoUser,
} from "@/lib/sso";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/login?error=missing_params", request.url),
      );
    }

    // Validate and consume state
    const oauthState = await consumeOAuthState(state);
    if (!oauthState || oauthState.flowType !== "customer_oidc") {
      return NextResponse.redirect(
        new URL("/login?error=invalid_state", request.url),
      );
    }

    if (!oauthState.connectionId) {
      return NextResponse.redirect(
        new URL("/login?error=missing_connection", request.url),
      );
    }

    // Load SSO connection
    const db = await getDb();
    const [connection] = await db
      .select()
      .from(ssoConnections)
      .where(eq(ssoConnections.id, oauthState.connectionId))
      .limit(1);

    if (!connection || !connection.oidcIssuerUrl || !connection.oidcClientId) {
      return NextResponse.redirect(
        new URL("/login?error=invalid_connection", request.url),
      );
    }

    // Fetch discovery and exchange code
    const discovery = await fetchOidcDiscovery(connection.oidcIssuerUrl);
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/sso/callback`;

    const tokens = await exchangeOidcCode(discovery, {
      code,
      clientId: connection.oidcClientId,
      clientSecret: connection.oidcClientSecret ?? undefined,
      codeVerifier: oauthState.codeVerifier ?? undefined,
      redirectUri,
    });

    if (!tokens.id_token) {
      return NextResponse.redirect(
        new URL("/login?error=no_id_token", request.url),
      );
    }

    // Decode ID token to get user claims
    const claims = decodeIdToken(tokens.id_token);
    const sub = claims.sub as string;
    const email = (claims.email || claims.preferred_username || claims.upn) as string | undefined;
    const name = (claims.name || claims.given_name || email) as string | undefined;
    const picture = claims.picture as string | undefined;

    if (!email) {
      return NextResponse.redirect(
        new URL("/login?error=no_email", request.url),
      );
    }

    // Find or create user in the connection's org
    const user = await findOrCreateSsoUser({
      email,
      name: name || email,
      ssoId: sub,
      orgId: connection.orgId,
      authProvider: "oidc",
      avatarUrl: picture,
    });

    // Create session and redirect to dashboard
    await createSession(user.id);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=callback_error", request.url),
    );
  }
}
