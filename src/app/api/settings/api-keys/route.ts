import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateApiKey } from "@/lib/api-auth";
import type { UserRole } from "@/db/schema";

export async function GET() {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role as UserRole, "api_keys:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      permissions: apiKeys.permissions,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, session.orgId));

  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role as UserRole, "api_keys:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, permissions, expiresInDays } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "API key name is required" }, { status: 400 });
  }

  const { key, keyHash, keyPrefix } = await generateApiKey();

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const db = await getDb();

  const [created] = await db
    .insert(apiKeys)
    .values({
      orgId: session.orgId,
      name: name.trim(),
      keyHash,
      keyPrefix,
      permissions: permissions ? JSON.stringify(permissions) : "{}",
      expiresAt,
    })
    .returning();

  // Return the raw key ONCE - it cannot be retrieved again
  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      key,
      keyPrefix: created.keyPrefix,
      permissions: created.permissions,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    },
    { status: 201 }
  );
}
