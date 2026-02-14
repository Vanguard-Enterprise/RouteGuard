import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, stops } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";

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

  const routeStops = await db
    .select()
    .from(stops)
    .where(eq(stops.routeId, id))
    .orderBy(asc(stops.sequenceOrder));

  return NextResponse.json(routeStops);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const { name, address, lat, lng, sequenceOrder, scheduledTime } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Stop name is required" }, { status: 400 });
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

  // Auto-determine sequence order if not provided
  let order = sequenceOrder;
  if (order == null) {
    const [maxRow] = await db
      .select({ maxSeq: sql<number>`COALESCE(MAX(${stops.sequenceOrder}), 0)` })
      .from(stops)
      .where(eq(stops.routeId, id));
    order = (maxRow?.maxSeq ?? 0) + 1;
  }

  const [stop] = await db
    .insert(stops)
    .values({
      routeId: id,
      name: name.trim(),
      address: address?.trim() || null,
      lat: lat ?? null,
      lng: lng ?? null,
      sequenceOrder: order,
      scheduledTime: scheduledTime?.trim() || null,
    })
    .returning();

  return NextResponse.json(stop, { status: 201 });
}
