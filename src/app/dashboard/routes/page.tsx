import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, stops, routeAssignments, vehicles, drivers } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteTable } from "./route-table";
import { Plus } from "lucide-react";

export default async function RoutesPage() {
  const { orgId } = await requireAuth();
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
      stopCount: sql<number>`(SELECT count(*) FROM stops WHERE stops.route_id = ${routes.id})`.as(
        "stop_count"
      ),
    })
    .from(routes)
    .where(eq(routes.orgId, orgId));

  // Get assignments with vehicle/driver names
  const assignments = await db
    .select({
      routeId: routeAssignments.routeId,
      vehicleName: vehicles.name,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
    })
    .from(routeAssignments)
    .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
    .where(
      sql`${routeAssignments.routeId} IN (SELECT id FROM routes WHERE org_id = ${orgId})`
    );

  const assignmentMap: Record<string, { vehicleName: string; driverName: string }> = {};
  for (const a of assignments) {
    assignmentMap[a.routeId] = {
      vehicleName: a.vehicleName,
      driverName: `${a.driverFirstName} ${a.driverLastName}`,
    };
  }

  const tableData = allRoutes.map((r) => ({
    ...r,
    assignment: assignmentMap[r.id] ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Routes" description="Manage bus routes and stops">
        <Link href="/dashboard/routes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Route
          </Button>
        </Link>
      </PageHeader>
      <RouteTable routes={tableData} />
    </div>
  );
}
