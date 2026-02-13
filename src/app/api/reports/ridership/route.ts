import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { dailySummaries, routes } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const routeId = searchParams.get("routeId");

  const db = await getDb();

  const conditions = [eq(dailySummaries.orgId, session.orgId)];

  if (startDate) {
    conditions.push(gte(dailySummaries.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(dailySummaries.date, endDate));
  }
  if (routeId) {
    conditions.push(eq(dailySummaries.routeId, routeId));
  }

  const data = await db
    .select({
      id: dailySummaries.id,
      date: dailySummaries.date,
      totalStudents: dailySummaries.totalStudents,
      boardedCount: dailySummaries.boardedCount,
      onTime: dailySummaries.onTime,
      delayMinutes: dailySummaries.delayMinutes,
      notes: dailySummaries.notes,
      routeName: routes.name,
      routeId: dailySummaries.routeId,
    })
    .from(dailySummaries)
    .innerJoin(routes, eq(dailySummaries.routeId, routes.id))
    .where(and(...conditions))
    .orderBy(desc(dailySummaries.date));

  return NextResponse.json(data);
}
