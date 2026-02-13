import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await destroySession();
  } catch (error) {
    console.error("Logout error:", error);
  }

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
}
