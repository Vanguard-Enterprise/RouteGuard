import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { VehicleForm } from "@/components/dashboard/vehicle-form";

export default async function NewVehiclePage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="Add Vehicle" description="Add a new vehicle to your fleet" />
      <VehicleForm mode="create" />
    </div>
  );
}
