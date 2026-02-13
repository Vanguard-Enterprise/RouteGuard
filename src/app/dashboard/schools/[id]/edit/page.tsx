import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { SchoolForm } from "@/components/dashboard/school-form";

interface EditSchoolPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSchoolPage({ params }: EditSchoolPageProps) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [school] = await db
    .select()
    .from(schools)
    .where(and(eq(schools.id, id), eq(schools.orgId, orgId)))
    .limit(1);

  if (!school) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit School" description={`Editing ${school.name}`} />
      <SchoolForm school={school} />
    </div>
  );
}
