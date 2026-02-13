import { NextRequest, NextResponse } from "next/server";
import { devLogin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Dev login is only available in development mode." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const email = body.email?.trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const user = await devLogin(email);

    if (!user) {
      return NextResponse.json(
        { error: "No user found with that email address." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, redirect: "/dashboard" });
  } catch (error) {
    console.error("Dev login error:", error);
    return NextResponse.json(
      { error: "Dev login failed." },
      { status: 500 }
    );
  }
}
