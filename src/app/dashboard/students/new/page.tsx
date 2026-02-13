import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentForm } from "@/components/dashboard/student-form";

export default async function NewStudentPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const orgSchools = await db
    .select({ id: schools.id, name: schools.name })
    .from(schools)
    .where(eq(schools.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add Student"
        description="Create a new student record"
      />
      <StudentForm mode="create" schools={orgSchools} />
    </div>
  );
}
