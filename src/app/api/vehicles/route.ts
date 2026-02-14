import { NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();
    const allVehicles = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.orgId, session.orgId));

    return NextResponse.json(allVehicles);
  } catch (error) {
    console.error("GET /api/vehicles error:", error);
    return NextResponse.json({ error: "Failed to fetch vehicles." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const db = await getDb();

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        orgId: session.orgId,
        name: body.name,
        number: body.number || null,
        capacity: body.capacity ?? null,
        year: body.year ?? null,
        make: body.make || null,
        model: body.model || null,
        vin: body.vin || null,
        licensePlate: body.licensePlate || null,
        status: body.status || "active",
      })
      .returning();

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    console.error("POST /api/vehicles error:", error);
    return NextResponse.json({ error: "Failed to create vehicle." }, { status: 500 });
  }
}
