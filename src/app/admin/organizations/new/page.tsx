import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrganizationForm } from "@/components/admin/organization-form";

export default async function NewOrganizationPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Organization"
        description="Onboard a new school district or bus company."
      />
      <OrganizationForm mode="create" />
    </div>
  );
}
