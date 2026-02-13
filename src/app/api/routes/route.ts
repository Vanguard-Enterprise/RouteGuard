import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, stops, routeAssignments, vehicles, drivers } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();

  const allRoutes = await db
    .select({
      id: routes.id,
      orgId: routes.orgId,
      name: routes.name,
      type: routes.type,
      status: routes.status,
      description: routes.description,
      estimatedDurationMin: routes.estimatedDurationMin,
      createdAt: routes.createdAt,
      updatedAt: routes.updatedAt,
      stopCount: sql<number>`(SELECT count(*) FROM stops WHERE stops.route_id = ${routes.id})`.as("stop_count"),
    })
    .from(routes)
    .where(eq(routes.orgId, session.orgId));

  // Get latest assignment per route
  const assignments = await db
    .select({
      routeId: routeAssignments.routeId,
      vehicleId: routeAssignments.vehicleId,
      driverId: routeAssignments.driverId,
      vehicleName: vehicles.name,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
    })
    .from(routeAssignments)
    .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
    .where(
      sql`${routeAssignments.routeId} IN (SELECT id FROM routes WHERE org_id = ${session.orgId})`
    );

  const assignmentMap: Record<string, { vehicleName: string; driverName: string }> = {};
  for (const a of assignments) {
    assignmentMap[a.routeId] = {
      vehicleName: a.vehicleName,
      driverName: `${a.driverFirstName} ${a.driverLastName}`,
    };
  }

  const result = allRoutes.map((r) => ({
    ...r,
    assignment: assignmentMap[r.id] ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, type, status, description, estimatedDurationMin, stops: stopsData } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Route name is required" }, { status: 400 });
  }

  const db = await getDb();

  // Create route
  const [route] = await db
    .insert(routes)
    .values({
      orgId: session.orgId,
      name: name.trim(),
      type: type || "morning",
      status: status || "draft",
      description: description?.trim() || null,
      estimatedDurationMin: estimatedDurationMin ?? null,
    })
    .returning();

  // Create stops if provided
  if (Array.isArray(stopsData) && stopsData.length > 0) {
    const stopValues = stopsData.map((s: any, idx: number) => ({
      routeId: route.id,
      name: s.name?.trim() || `Stop ${idx + 1}`,
      address: s.address?.trim() || null,
      lat: s.lat ?? null,
      lng: s.lng ?? null,
      sequenceOrder: s.sequenceOrder ?? idx + 1,
      scheduledTime: s.scheduledTime?.trim() || null,
    }));

    await db.insert(stops).values(stopValues);
  }

  return NextResponse.json(route, { status: 201 });
}
