import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDb } from "@/db";
import { trips } from "@/db/schema";
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

  if (trip.status !== "in_progress") {
    return NextResponse.json(
      { error: "Trip is not in progress" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(trips)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(and(eq(trips.id, id), eq(trips.orgId, auth.orgId)))
    .returning();

  return NextResponse.json({ trip: updated });
}
