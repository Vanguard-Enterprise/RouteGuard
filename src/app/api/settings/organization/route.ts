import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { UserRole } from "@/db/schema";

export async function PUT(request: NextRequest) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role as UserRole, "settings:write")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, timezone, logoUrl } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }

  const db = await getDb();

  const [updated] = await db
    .update(organizations)
    .set({
      name: name.trim(),
      timezone: timezone?.trim() || "America/New_York",
      logoUrl: logoUrl?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, session.orgId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
