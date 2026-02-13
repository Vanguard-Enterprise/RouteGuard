import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSSOAuthorizationUrl } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email?.trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const domain = email.split("@")[1].toLowerCase();

    const db = await getDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ssoDomain, domain))
      .limit(1);

    if (!org || !org.ssoConnectionId) {
      return NextResponse.json(
        { error: "No SSO configuration found for this email domain." },
        { status: 404 }
      );
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/auth/sso/callback`;
    const url = getSSOAuthorizationUrl(org.ssoConnectionId, redirectUri);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("SSO init error:", error);
    return NextResponse.json(
      { error: "Failed to initialize SSO login." },
      { status: 500 }
    );
  }
}
