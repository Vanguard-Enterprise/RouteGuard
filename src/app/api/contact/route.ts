import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, email, phone, organizationName, organizationType, message } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!organizationName || typeof organizationName !== "string" || organizationName.trim().length === 0) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }

  // In production, this would send an email notification or create a CRM entry
  // For now, just acknowledge the submission
  console.log("Contact form submission:", {
    name: name.trim(),
    email: email.trim(),
    phone: phone?.trim() || null,
    organizationName: organizationName.trim(),
    organizationType: organizationType || "district",
    message: message?.trim() || null,
    submittedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    message: "Thank you for your interest! We'll be in touch within 1 business day.",
  });
}
