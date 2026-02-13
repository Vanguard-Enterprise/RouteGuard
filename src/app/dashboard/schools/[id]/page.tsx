import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { schools, students } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, Pencil } from "lucide-react";

interface SchoolDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SchoolDetailPage({ params }: SchoolDetailPageProps) {
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

  const schoolStudents = await db
    .select()
    .from(students)
    .where(and(eq(students.schoolId, id), eq(students.orgId, orgId)));

  return (
    <div className="space-y-6">
      <PageHeader title={school.name} description="School details and enrolled students">
        <Link href="/dashboard/schools">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Schools
          </Button>
        </Link>
        <Link href={`/dashboard/schools/${id}/edit`}>
          <Button>
            <Pencil className="mr-2 h-4 w-4" />
            Edit School
          </Button>
        </Link>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>School Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{school.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Address</dt>
                <dd className="font-medium text-right">{school.address || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">City</dt>
                <dd className="font-medium">{school.city || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">State</dt>
                <dd className="font-medium">{school.state || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ZIP</dt>
                <dd className="font-medium">{school.zip || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{school.phone || "--"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Contact Name</dt>
                <dd className="font-medium">{school.contactName || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Contact Email</dt>
                <dd className="font-medium">{school.contactEmail || "--"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total Students</dt>
                <dd className="font-medium">{schoolStudents.length}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enrolled Students ({schoolStudents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {schoolStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No students enrolled at this school yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Student #</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schoolStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell>{student.studentNumber || "--"}</TableCell>
                      <TableCell>{student.grade || "--"}</TableCell>
                      <TableCell>
                        <StatusBadge status={student.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
