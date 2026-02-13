import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, stops } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string; stopId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, stopId } = await context.params;
  const body = await request.json();
  const { name, address, lat, lng, sequenceOrder, scheduledTime } = body;

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

  const [existing] = await db
    .select()
    .from(stops)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(stops)
    .set({
      name: name?.trim() ?? existing.name,
      address: address !== undefined ? (address?.trim() || null) : existing.address,
      lat: lat !== undefined ? lat : existing.lat,
      lng: lng !== undefined ? lng : existing.lng,
      sequenceOrder: sequenceOrder ?? existing.sequenceOrder,
      scheduledTime: scheduledTime !== undefined ? (scheduledTime?.trim() || null) : existing.scheduledTime,
      updatedAt: new Date(),
    })
    .where(and(eq(stops.id, stopId), eq(stops.routeId, id)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, stopId } = await context.params;
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

  const [existing] = await db
    .select()
    .from(stops)
    .where(and(eq(stops.id, stopId), eq(stops.routeId, id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Stop not found" }, { status: 404 });
  }

  await db.delete(stops).where(and(eq(stops.id, stopId), eq(stops.routeId, id)));

  return NextResponse.json({ success: true });
}
