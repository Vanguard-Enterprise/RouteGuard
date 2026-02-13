import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { ImportWizard } from "@/components/dashboard/import-wizard";

export default async function ImportStudentsPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const orgSchools = await db
    .select({ id: schools.id, name: schools.name })
    .from(schools)
    .where(eq(schools.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Students"
        description="Import students from a CSV file"
      />
      <ImportWizard orgId={orgId} schools={orgSchools} />
    </div>
  );
}
