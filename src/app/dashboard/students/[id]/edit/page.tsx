import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { students, schools } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentForm } from "@/components/dashboard/student-form";

interface EditStudentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditStudentPage({
  params,
}: EditStudentPageProps) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, id), eq(students.orgId, orgId)))
    .limit(1);

  if (!student) {
    notFound();
  }

  const orgSchools = await db
    .select({ id: schools.id, name: schools.name })
    .from(schools)
    .where(eq(schools.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Student"
        description={`Editing ${student.firstName} ${student.lastName}`}
      />
      <StudentForm
        mode="edit"
        schools={orgSchools}
        initialData={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentNumber: student.studentNumber ?? "",
          grade: student.grade ?? "",
          schoolId: student.schoolId,
          rfidTagId: student.rfidTagId ?? "",
          address: student.address ?? "",
          city: student.city ?? "",
          state: student.state ?? "",
          zip: student.zip ?? "",
          medicalNotes: student.medicalNotes ?? "",
          status: student.status,
        }}
      />
    </div>
  );
}
