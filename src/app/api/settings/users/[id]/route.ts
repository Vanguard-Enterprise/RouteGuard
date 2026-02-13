import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageUsers } from "@/lib/rbac";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { UserRole } from "@/db/schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { role } = body;

  const validRoles: UserRole[] = ["org_admin", "school_admin", "driver"];
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json({ error: "Valid role is required" }, { status: 400 });
  }

  // Prevent changing your own role
  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 });
  }

  const db = await getDb();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(users)
    .set({ role })
    .where(and(eq(users.id, id), eq(users.orgId, session.orgId)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.user.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  // Prevent deleting yourself
  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const db = await getDb();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await db
    .delete(users)
    .where(and(eq(users.id, id), eq(users.orgId, session.orgId)));

  return NextResponse.json({ success: true });
}
