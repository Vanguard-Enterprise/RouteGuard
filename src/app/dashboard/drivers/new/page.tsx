import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { DriverForm } from "@/components/dashboard/driver-form";

export default async function NewDriverPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="Add Driver" description="Add a new driver to your organization" />
      <DriverForm mode="create" />
    </div>
  );
}
