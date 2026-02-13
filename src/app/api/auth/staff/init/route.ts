import { NextRequest, NextResponse } from "next/server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  createOAuthState,
  getZitadelAuthorizationUrl,
} from "@/lib/sso";

export async function POST(request: NextRequest) {
  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const state = await createOAuthState({
      flowType: "staff",
      codeVerifier,
    });

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/staff/callback`;
    const url = getZitadelAuthorizationUrl(state, codeChallenge, redirectUri);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Staff auth init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize staff login." },
      { status: 500 },
    );
  }
}
