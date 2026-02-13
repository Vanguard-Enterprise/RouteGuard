import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { dailySummaries, routes, schools } from "@/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportFilters } from "../report-filters";
import { PerformanceTable } from "./performance-table";

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { orgId } = await requireAuth();
  const db = await getDb();
  const params = await searchParams;

  const startDate = params.startDate;
  const endDate = params.endDate;
  const routeId = params.routeId;

  // Build conditions
  const conditions = [eq(dailySummaries.orgId, orgId)];

  if (startDate) {
    conditions.push(gte(dailySummaries.date, startDate));
  }
  if (endDate) {
    conditions.push(lte(dailySummaries.date, endDate));
  }
  if (routeId) {
    conditions.push(eq(dailySummaries.routeId, routeId));
  }

  // Aggregate performance metrics by route
  const data = await db
    .select({
      routeId: dailySummaries.routeId,
      routeName: routes.name,
      totalTrips: sql<number>`count(*)`.as("total_trips"),
      avgDelay: sql<number>`round(avg(${dailySummaries.delayMinutes}), 1)`.as(
        "avg_delay"
      ),
      onTimeCount: sql<number>`sum(case when ${dailySummaries.onTime} = 1 then 1 else 0 end)`.as(
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

  // Fetch filter options
  const allRoutes = await db
    .select({ id: routes.id, name: routes.name })
    .from(routes)
    .where(eq(routes.orgId, orgId));

  const allSchools = await db
    .select({ id: schools.id, name: schools.name })
    .from(schools)
    .where(eq(schools.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Route Performance"
        description="On-time performance and delay metrics by route"
      />

      <ReportFilters
        routes={allRoutes}
        schools={allSchools}
        reportType="performance"
      />

      <PerformanceTable data={performanceData} />
    </div>
  );
}
