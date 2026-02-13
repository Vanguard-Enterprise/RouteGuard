import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { organizations, users, schools } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const db = await getDb();

    const allOrgs = await db
      .select()
      .from(organizations)
      .orderBy(organizations.name);

    // Get counts per org
    const userCounts = await db
      .select({ orgId: users.orgId, value: count() })
      .from(users)
      .groupBy(users.orgId);

    const schoolCounts = await db
      .select({ orgId: schools.orgId, value: count() })
      .from(schools)
      .groupBy(schools.orgId);

    const userCountMap = Object.fromEntries(userCounts.map((r) => [r.orgId, r.value]));
    const schoolCountMap = Object.fromEntries(schoolCounts.map((r) => [r.orgId, r.value]));

    const result = allOrgs.map((org) => ({
      ...org,
      userCount: userCountMap[org.id] ?? 0,
      schoolCount: schoolCountMap[org.id] ?? 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/organizations error:", error);
    return NextResponse.json({ error: "Failed to fetch organizations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const db = await getDb();

    // Validate required fields
    if (!body.name || !body.slug) {
      return NextResponse.json({ error: "Name and slug are required." }, { status: 400 });
    }

    // Check slug uniqueness
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, body.slug))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: "An organization with this slug already exists." }, { status: 409 });
    }

    // Create organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: body.name,
        slug: body.slug,
        type: body.type || "district",
        timezone: body.timezone || "America/New_York",
        ssoProvider: body.ssoProvider || null,
        ssoDomain: body.ssoDomain || null,
        ssoConnectionId: body.ssoConnectionId || null,
        logoUrl: body.logoUrl || null,
      })
      .returning();

    // Optionally create initial admin user
    if (body.adminEmail) {
      await db.insert(users).values({
        orgId: org.id,
        email: body.adminEmail,
        name: body.adminName || body.adminEmail,
        role: "org_admin",
      });
    }

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/organizations error:", error);
    return NextResponse.json({ error: "Failed to create organization." }, { status: 500 });
  }
}
