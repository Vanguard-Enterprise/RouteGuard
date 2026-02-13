import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { students, schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { StudentTable } from "./student-table";
import { Plus, Upload } from "lucide-react";

export default async function StudentsPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const allStudents = await db
    .select({
      id: students.id,
      orgId: students.orgId,
      schoolId: students.schoolId,
      firstName: students.firstName,
      lastName: students.lastName,
      studentNumber: students.studentNumber,
      grade: students.grade,
      rfidTagId: students.rfidTagId,
      address: students.address,
      city: students.city,
      state: students.state,
      zip: students.zip,
      lat: students.lat,
      lng: students.lng,
      status: students.status,
      medicalNotes: students.medicalNotes,
      createdAt: students.createdAt,
      updatedAt: students.updatedAt,
      schoolName: schools.name,
    })
    .from(students)
    .leftJoin(schools, eq(students.schoolId, schools.id))
    .where(eq(students.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader title="Students" description="Manage students in your organization">
        <Link href="/dashboard/students/import">
          <Button variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
        </Link>
        <Link href="/dashboard/students/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </Link>
      </PageHeader>
      <StudentTable students={allStudents} />
    </div>
  );
}
