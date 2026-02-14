import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const allSchools = await db
    .select()
    .from(schools)
    .where(eq(schools.orgId, session.orgId));

  return NextResponse.json(allSchools);
}

export async function POST(request: NextRequest) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { name, address, city, state, zip, phone, contactName, contactEmail } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "School name is required" }, { status: 400 });
  }

  const db = await getDb();

  const [school] = await db
    .insert(schools)
    .values({
      orgId: session.orgId,
      name: name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      phone: phone?.trim() || null,
      contactName: contactName?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
    })
    .returning();

  return NextResponse.json(school, { status: 201 });
}
