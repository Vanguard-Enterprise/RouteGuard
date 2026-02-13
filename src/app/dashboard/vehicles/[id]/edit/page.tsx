import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { VehicleForm } from "@/components/dashboard/vehicle-form";

export default async function EditVehiclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .limit(1);

  if (!vehicle) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Vehicle"
        description={`Editing ${vehicle.name}`}
      />
      <VehicleForm mode="edit" vehicle={vehicle} />
    </div>
  );
}
