import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDb } from "@/db";
import { trips, tripLocations } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { lat?: number; lng?: number; speed?: number; heading?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lat, lng, speed, heading } = body;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { error: "lat and lng are required and must be numbers" },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Verify trip exists and belongs to this org
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.orgId, auth.orgId)))
    .limit(1);

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  await db.insert(tripLocations).values({
    tripId: id,
    lat,
    lng,
    speed: speed ?? null,
    heading: heading ?? null,
    recordedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
