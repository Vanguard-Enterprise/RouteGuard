import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  students,
  schools,
  guardians,
  studentGuardians,
  studentStops,
  stops,
  routes,
} from "@/db/schema";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, Pencil, Plus } from "lucide-react";

interface StudentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function StudentDetailPage({
  params,
}: StudentDetailPageProps) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  // Query student with school name
  const [student] = await db
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
    .where(and(eq(students.id, id), eq(students.orgId, orgId)))
    .limit(1);

  if (!student) {
    notFound();
  }

  // Query guardians for this student
  const studentGuardianRows = await db
    .select({
      id: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      phone: guardians.phone,
      altPhone: guardians.altPhone,
      email: guardians.email,
      relationship: studentGuardians.relationship,
      isPrimary: studentGuardians.isPrimary,
    })
    .from(studentGuardians)
    .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
    .where(eq(studentGuardians.studentId, id));

  // Query route assignments/stops for this student
  const routeStopRows = await db
    .select({
      stopId: studentStops.stopId,
      stopName: stops.name,
      stopAddress: stops.address,
      scheduledTime: stops.scheduledTime,
      routeId: studentStops.routeId,
      routeName: routes.name,
      routeType: routes.type,
      routeStatus: routes.status,
    })
    .from(studentStops)
    .innerJoin(stops, eq(studentStops.stopId, stops.id))
    .innerJoin(routes, eq(studentStops.routeId, routes.id))
    .where(eq(studentStops.studentId, id));

  const fullAddress = [student.address, student.city, student.state, student.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`Student ${student.studentNumber ? `#${student.studentNumber}` : ""}`}
      >
        <Link href="/dashboard/students">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to List
          </Button>
        </Link>
        <Link href={`/dashboard/students/${id}/edit`}>
          <Button>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
      </PageHeader>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="guardians">
            Guardians ({studentGuardianRows.length})
          </TabsTrigger>
          <TabsTrigger value="routes">
            Routes ({routeStopRows.length})
          </TabsTrigger>
          <TabsTrigger value="scans">Scan History</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Full Name
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.firstName} {student.lastName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge status={student.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    School
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.schoolName || "--"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Grade
                  </dt>
                  <dd className="mt-1 text-sm">{student.grade || "--"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Student Number
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.studentNumber || "--"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    RFID Tag
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.rfidTagId ? (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {student.rfidTagId}
                      </code>
                    ) : (
                      "--"
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Address
                  </dt>
                  <dd className="mt-1 text-sm">{fullAddress || "--"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">
                    Medical Notes
                  </dt>
                  <dd className="mt-1 text-sm">
                    {student.medicalNotes || "--"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guardians">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Guardians</CardTitle>
              <Link href={`/dashboard/students/${id}?addGuardian=true`}>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Guardian
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {studentGuardianRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No guardians linked to this student.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Relationship</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Primary</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentGuardianRows.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium">
                            {g.firstName} {g.lastName}
                          </TableCell>
                          <TableCell className="capitalize">
                            {g.relationship}
                          </TableCell>
                          <TableCell>{g.phone}</TableCell>
                          <TableCell>
                            {g.email || (
                              <span className="text-muted-foreground">
                                --
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {g.isPrimary ? (
                              <StatusBadge status="active" />
                            ) : (
                              <span className="text-muted-foreground">
                                No
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes">
          <Card>
            <CardHeader>
              <CardTitle>Route Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {routeStopRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No route assignments for this student.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Route</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Stop</TableHead>
                        <TableHead>Scheduled Time</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeStopRows.map((r) => (
                        <TableRow key={`${r.routeId}-${r.stopId}`}>
                          <TableCell className="font-medium">
                            {r.routeName}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.routeType} />
                          </TableCell>
                          <TableCell>{r.stopName}</TableCell>
                          <TableCell>
                            {r.scheduledTime || (
                              <span className="text-muted-foreground">
                                --
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.routeStatus} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scans">
          <Card>
            <CardHeader>
              <CardTitle>Scan History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground text-center py-8">
                Scan history will be displayed here once trips are recorded.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
