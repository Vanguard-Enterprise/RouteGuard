import { NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.orgId, session.orgId)))
      .limit(1);

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (error) {
    console.error("GET /api/vehicles/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch vehicle." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const db = await getDb();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.orgId, session.orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const [updated] = await db
      .update(vehicles)
      .set({
        name: body.name,
        number: body.number || null,
        capacity: body.capacity ?? null,
        year: body.year ?? null,
        make: body.make || null,
        model: body.model || null,
        vin: body.vin || null,
        licensePlate: body.licensePlate || null,
        status: body.status || existing.status,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/vehicles/[id] error:", error);
    return NextResponse.json({ error: "Failed to update vehicle." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.orgId, session.orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    await db.delete(vehicles).where(eq(vehicles.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/vehicles/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete vehicle." }, { status: 500 });
  }
}
