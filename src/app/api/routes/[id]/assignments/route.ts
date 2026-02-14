import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, routeAssignments, vehicles, drivers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  // Verify route belongs to org
  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  const assignments = await db
    .select({
      id: routeAssignments.id,
      routeId: routeAssignments.routeId,
      vehicleId: routeAssignments.vehicleId,
      driverId: routeAssignments.driverId,
      effectiveDate: routeAssignments.effectiveDate,
      endDate: routeAssignments.endDate,
      daysOfWeek: routeAssignments.daysOfWeek,
      createdAt: routeAssignments.createdAt,
      vehicleName: vehicles.name,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
    })
    .from(routeAssignments)
    .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
    .where(eq(routeAssignments.routeId, id));

  return NextResponse.json(assignments);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { vehicleId, driverId, effectiveDate, endDate, daysOfWeek } = body;

  if (!vehicleId || !driverId) {
    return NextResponse.json(
      { error: "Vehicle and driver are required" },
      { status: 400 }
    );
  }

  const db = await getDb();

  // Verify route belongs to org
  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  // Verify vehicle belongs to org
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.orgId, session.orgId)))
    .limit(1);

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  // Verify driver belongs to org
  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, driverId), eq(drivers.orgId, session.orgId)))
    .limit(1);

  if (!driver) {
    return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  }

  const [assignment] = await db
    .insert(routeAssignments)
    .values({
      routeId: id,
      vehicleId,
      driverId,
      effectiveDate: effectiveDate || null,
      endDate: endDate || null,
      daysOfWeek: daysOfWeek || "MTWRF",
    })
    .returning();

  return NextResponse.json(assignment, { status: 201 });
}
