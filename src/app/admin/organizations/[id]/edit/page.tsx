import { requireSuperAdmin } from "@/lib/auth";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrganizationForm } from "@/components/admin/organization-form";

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSuperAdmin();
  const db = await getDb();

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, id))
    .limit(1);

  if (!org) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${org.name}`}
        description="Update organization information."
      />
      <OrganizationForm mode="edit" organization={org} />
    </div>
  );
}
