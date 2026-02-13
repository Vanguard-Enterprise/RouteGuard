import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import {
  routes,
  stops,
  routeAssignments,
  vehicles,
  drivers,
  studentStops,
  students,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  const routeStops = await db
    .select()
    .from(stops)
    .where(eq(stops.routeId, id))
    .orderBy(asc(stops.sequenceOrder));

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

  return NextResponse.json({
    ...route,
    stops: routeStops,
    assignments,
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { name, type, status, description, estimatedDurationMin, stops: stopsData } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Route name is required" }, { status: 400 });
  }

  const db = await getDb();

  const [existing] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  // Update route
  const [updated] = await db
    .update(routes)
    .set({
      name: name.trim(),
      type: type || existing.type,
      status: status || existing.status,
      description: description?.trim() || null,
      estimatedDurationMin: estimatedDurationMin ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .returning();

  // Replace stops if provided
  if (Array.isArray(stopsData)) {
    // Delete existing stops
    await db.delete(stops).where(eq(stops.routeId, id));

    // Insert new stops
    if (stopsData.length > 0) {
      const stopValues = stopsData.map((s: any, idx: number) => ({
        routeId: id,
        name: s.name?.trim() || `Stop ${idx + 1}`,
        address: s.address?.trim() || null,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
        sequenceOrder: s.sequenceOrder ?? idx + 1,
        scheduledTime: s.scheduledTime?.trim() || null,
      }));

      await db.insert(stops).values(stopValues);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  await db.delete(routes).where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)));

  return NextResponse.json({ success: true });
}
