import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/db";
import { organizations, users, schools, students } from "@/db/schema";
import { eq, count } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const db = await getDb();
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    return NextResponse.json(org);
  } catch (error) {
    console.error("GET /api/admin/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch organization." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const db = await getDb();

    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    // If slug is changing, check uniqueness
    if (body.slug && body.slug !== existing.slug) {
      const [slugTaken] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, body.slug))
        .limit(1);

      if (slugTaken) {
        return NextResponse.json({ error: "An organization with this slug already exists." }, { status: 409 });
      }
    }

    const [updated] = await db
      .update(organizations)
      .set({
        name: body.name ?? existing.name,
        slug: body.slug ?? existing.slug,
        type: body.type ?? existing.type,
        timezone: body.timezone ?? existing.timezone,
        ssoProvider: body.ssoProvider !== undefined ? (body.ssoProvider || null) : existing.ssoProvider,
        ssoDomain: body.ssoDomain !== undefined ? (body.ssoDomain || null) : existing.ssoDomain,
        ssoConnectionId: body.ssoConnectionId !== undefined ? (body.ssoConnectionId || null) : existing.ssoConnectionId,
        logoUrl: body.logoUrl !== undefined ? (body.logoUrl || null) : existing.logoUrl,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/admin/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to update organization." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const db = await getDb();

    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    // Check for child records
    const [[{ value: userCount }], [{ value: schoolCount }], [{ value: studentCount }]] =
      await Promise.all([
        db.select({ value: count() }).from(users).where(eq(users.orgId, id)),
        db.select({ value: count() }).from(schools).where(eq(schools.orgId, id)),
        db.select({ value: count() }).from(students).where(eq(students.orgId, id)),
      ]);

    if (userCount > 0 || schoolCount > 0 || studentCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete organization with existing records (${userCount} users, ${schoolCount} schools, ${studentCount} students). Remove all child records first.`,
        },
        { status: 400 }
      );
    }

    await db.delete(organizations).where(eq(organizations.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/admin/organizations/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete organization." }, { status: 500 });
  }
}
