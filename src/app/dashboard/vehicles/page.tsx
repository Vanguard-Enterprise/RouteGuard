import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { VehicleTable } from "./vehicle-table";
import { Plus } from "lucide-react";

export default async function VehiclesPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const allVehicles = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader title="Vehicles" description="Manage your fleet vehicles">
        <Link href="/dashboard/vehicles/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Button>
        </Link>
      </PageHeader>
      <VehicleTable vehicles={allVehicles} />
    </div>
  );
}
