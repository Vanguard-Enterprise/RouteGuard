import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const db = await getDb();
    const allDrivers = await db
      .select()
      .from(drivers)
      .where(eq(drivers.orgId, session.orgId));

    return NextResponse.json(allDrivers);
  } catch (error) {
    console.error("GET /api/drivers error:", error);
    return NextResponse.json({ error: "Failed to fetch drivers." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const db = await getDb();

    const [driver] = await db
      .insert(drivers)
      .values({
        orgId: session.orgId,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || null,
        licenseNumber: body.licenseNumber || null,
        licenseExpiry: body.licenseExpiry ? new Date(body.licenseExpiry) : null,
        status: body.status || "active",
      })
      .returning();

    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    console.error("POST /api/drivers error:", error);
    return NextResponse.json({ error: "Failed to create driver." }, { status: 500 });
  }
}
