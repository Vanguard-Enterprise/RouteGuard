import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import {
  consumeOAuthState,
  exchangeZitadelCode,
  getZitadelUserInfo,
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
    if (!oauthState || oauthState.flowType !== "staff") {
      return NextResponse.redirect(
        new URL("/login?error=invalid_state", request.url),
      );
    }

    if (!oauthState.codeVerifier) {
      return NextResponse.redirect(
        new URL("/login?error=missing_verifier", request.url),
      );
    }

    // Exchange code for tokens using PKCE
    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/staff/callback`;
    const tokens = await exchangeZitadelCode(
      code,
      oauthState.codeVerifier,
      redirectUri,
    );

    // Get user info from Zitadel
    const userInfo = await getZitadelUserInfo(tokens.access_token);

    if (!userInfo.email) {
      return NextResponse.redirect(
        new URL("/login?error=no_email", request.url),
      );
    }

    // Find or create staff user
    const db = await getDb();
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, userInfo.email))
      .limit(1);

    if (user) {
      // Update existing user with Zitadel info
      await db
        .update(users)
        .set({
          ssoId: userInfo.sub,
          authProvider: "zitadel",
          lastLoginAt: new Date(),
          name: userInfo.name || user.name,
          avatarUrl: userInfo.picture || user.avatarUrl,
        })
        .where(eq(users.id, user.id));
    } else {
      // Auto-provision staff user from Zitadel
      [user] = await db
        .insert(users)
        .values({
          email: userInfo.email,
          name: userInfo.name || userInfo.email,
          role: "super_admin",
          ssoId: userInfo.sub,
          authProvider: "zitadel",
          avatarUrl: userInfo.picture || null,
          lastLoginAt: new Date(),
        })
        .returning();
    }

    // Create session and redirect to admin
    await createSession(user.id);
    return NextResponse.redirect(new URL("/admin", request.url));
  } catch (error) {
    console.error("Staff auth callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=callback_error", request.url),
    );
  }
}
