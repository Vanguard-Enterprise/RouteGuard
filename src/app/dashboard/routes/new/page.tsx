import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles, drivers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteBuilder } from "@/components/dashboard/route-builder";

export default async function NewRoutePage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [activeVehicles, activeDrivers] = await Promise.all([
    db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "active"))),
    db
      .select()
      .from(drivers)
      .where(and(eq(drivers.orgId, orgId), eq(drivers.status, "active"))),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="New Route" description="Create a new bus route with stops" />
      <RouteBuilder
        mode="create"
        vehicles={activeVehicles}
        drivers={activeDrivers}
      />
    </div>
  );
}
