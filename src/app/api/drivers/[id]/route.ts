import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();
    const [driver] = await db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.orgId, session.orgId)))
      .limit(1);

    if (!driver) {
      return NextResponse.json({ error: "Driver not found." }, { status: 404 });
    }

    return NextResponse.json(driver);
  } catch (error) {
    console.error("GET /api/drivers/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch driver." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const db = await getDb();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.orgId, session.orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Driver not found." }, { status: 404 });
    }

    const [updated] = await db
      .update(drivers)
      .set({
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || null,
        licenseNumber: body.licenseNumber || null,
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
        status: body.status || existing.status,
        updatedAt: new Date(),
      })
      .where(eq(drivers.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/drivers/[id] error:", error);
    return NextResponse.json({ error: "Failed to update driver." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(drivers)
      .where(and(eq(drivers.id, id), eq(drivers.orgId, session.orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Driver not found." }, { status: 404 });
    }

    await db.delete(drivers).where(eq(drivers.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/drivers/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete driver." }, { status: 500 });
  }
}
