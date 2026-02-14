import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { UserRole } from "@/db/schema";

export async function GET() {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const allUsers = await db
    .select()
    .from(users)
    .where(eq(users.orgId, session.orgId));

  return NextResponse.json(allUsers);
}

export async function POST(request: NextRequest) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, name, role } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const validRoles: UserRole[] = ["org_admin", "school_admin", "driver"];
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json({ error: "Valid role is required (org_admin, school_admin, driver)" }, { status: 400 });
  }

  const db = await getDb();

  // Check if user with this email already exists in the org
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (existing && existing.orgId === session.orgId) {
    return NextResponse.json({ error: "A user with this email already exists in your organization" }, { status: 409 });
  }

  const [newUser] = await db
    .insert(users)
    .values({
      orgId: session.orgId,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
    })
    .returning();

  return NextResponse.json(newUser, { status: 201 });
}
