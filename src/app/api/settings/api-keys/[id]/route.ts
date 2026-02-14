import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { UserRole } from "@/db/schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role as UserRole, "api_keys:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, session.orgId)));

  return NextResponse.json({ success: true });
}
