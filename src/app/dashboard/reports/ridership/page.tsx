import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { dailySummaries, routes, schools, stops, studentStops } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportFilters } from "../report-filters";
import { RidershipTable } from "./ridership-table";

export default async function RidershipReportPage({
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
        title="Ridership Report"
        description="Daily ridership data by route"
      />

      <ReportFilters
        routes={allRoutes}
        schools={allSchools}
        reportType="ridership"
      />

      <RidershipTable data={data} />
    </div>
  );
}
