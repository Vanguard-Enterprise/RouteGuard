import { NextRequest, NextResponse } from "next/server";
import { handleSSOCallback, createSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.redirect(
        new URL("/login?error=missing_code", request.url)
      );
    }

    const user = await handleSSOCallback(code);

    if (!user) {
      return NextResponse.redirect(
        new URL("/login?error=sso_failed", request.url)
      );
    }

    await createSession(user.id);

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("SSO callback error:", error);
    return NextResponse.redirect(
      new URL("/login?error=callback_error", request.url)
    );
  }
}
