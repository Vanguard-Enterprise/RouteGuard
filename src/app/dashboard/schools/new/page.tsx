import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { SchoolForm } from "@/components/dashboard/school-form";

export default async function NewSchoolPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="Add School" description="Create a new school in your organization" />
      <SchoolForm />
    </div>
  );
}
