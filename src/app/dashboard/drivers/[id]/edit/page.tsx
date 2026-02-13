import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { DriverForm } from "@/components/dashboard/driver-form";

export default async function EditDriverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
    .limit(1);

  if (!driver) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Driver"
        description={`Editing ${driver.firstName} ${driver.lastName}`}
      />
      <DriverForm mode="edit" driver={driver} />
    </div>
  );
}
