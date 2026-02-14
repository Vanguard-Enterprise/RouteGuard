import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  const [school] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.orgId, session.orgId)))
    .limit(1);

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  return NextResponse.json(school);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const { name, address, city, state, zip, phone, contactName, contactEmail } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "School name is required" }, { status: 400 });
  }

  const db = await getDb();

  const [existing] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(schools)
    .set({
      name: name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim() || null,
      zip: zip?.trim() || null,
      phone: phone?.trim() || null,
      contactName: contactName?.trim() || null,
      contactEmail: contactEmail?.trim() || null,
      updatedAt: new Date(),
    })
    .where(and(eq(schools.id, id), eq(schools.orgId, session.orgId)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  await db
    .delete(schools)
    .where(and(eq(schools.id, id), eq(schools.orgId, session.orgId)));

  return NextResponse.json({ success: true });
}
