import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { dailySummaries, routes } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

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
      routeId: dailySummaries.routeId,
      routeName: routes.name,
      totalTrips: sql<number>`count(*)`.as("total_trips"),
      avgDelay: sql<number>`round(avg(${dailySummaries.delayMinutes}), 1)`.as(
        "avg_delay"
      ),
      onTimeCount:
        sql<number>`sum(case when ${dailySummaries.onTime} = 1 then 1 else 0 end)`.as(
          "on_time_count"
        ),
      totalStudents: sql<number>`sum(${dailySummaries.totalStudents})`.as(
        "total_students"
      ),
      totalBoarded: sql<number>`sum(${dailySummaries.boardedCount})`.as(
        "total_boarded"
      ),
    })
    .from(dailySummaries)
    .innerJoin(routes, eq(dailySummaries.routeId, routes.id))
    .where(and(...conditions))
    .groupBy(dailySummaries.routeId, routes.name);

  const performanceData = data.map((row) => ({
    routeId: row.routeId,
    routeName: row.routeName,
    totalTrips: Number(row.totalTrips),
    avgDelay: Number(row.avgDelay) || 0,
    onTimePercent:
      row.totalTrips > 0
        ? Math.round((Number(row.onTimeCount) / Number(row.totalTrips)) * 100)
        : 0,
    totalStudents: Number(row.totalStudents),
    totalBoarded: Number(row.totalBoarded),
  }));

  return NextResponse.json(performanceData);
}
