import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  routes,
  stops,
  routeAssignments,
  vehicles,
  drivers,
  studentStops,
  students,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, Pencil, MapPin, ListOrdered, Users, Truck } from "lucide-react";
import { RouteDetailMap } from "./route-detail-map";

interface RouteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RouteDetailPage({ params }: RouteDetailPageProps) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, orgId)))
    .limit(1);

  if (!route) {
    notFound();
  }

  const [routeStops, assignments, routeStudents] = await Promise.all([
    db
      .select()
      .from(stops)
      .where(eq(stops.routeId, id))
      .orderBy(asc(stops.sequenceOrder)),
    db
      .select({
        id: routeAssignments.id,
        routeId: routeAssignments.routeId,
        vehicleId: routeAssignments.vehicleId,
        driverId: routeAssignments.driverId,
        effectiveDate: routeAssignments.effectiveDate,
        endDate: routeAssignments.endDate,
        daysOfWeek: routeAssignments.daysOfWeek,
        createdAt: routeAssignments.createdAt,
        vehicleName: vehicles.name,
        driverFirstName: drivers.firstName,
        driverLastName: drivers.lastName,
      })
      .from(routeAssignments)
      .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
      .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
      .where(eq(routeAssignments.routeId, id)),
    db
      .select({
        studentStopId: studentStops.id,
        studentId: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        studentNumber: students.studentNumber,
        grade: students.grade,
        status: students.status,
        stopId: studentStops.stopId,
        stopName: stops.name,
        effectiveDate: studentStops.effectiveDate,
        endDate: studentStops.endDate,
      })
      .from(studentStops)
      .innerJoin(students, eq(studentStops.studentId, students.id))
      .innerJoin(stops, eq(studentStops.stopId, stops.id))
      .where(eq(studentStops.routeId, id)),
  ]);

  const mapMarkers = routeStops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, idx) => ({
      lat: s.lat!,
      lng: s.lng!,
      label: `${idx + 1}. ${s.name}`,
      color: idx === 0 ? "#22c55e" : idx === routeStops.length - 1 ? "#ef4444" : "#3b82f6",
    }));

  const routeCoords: [number, number][] = routeStops
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => [s.lng!, s.lat!]);

  return (
    <div className="space-y-6">
      <PageHeader title={route.name} description="Route details and management">
        <Link href="/dashboard/routes">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Routes
          </Button>
        </Link>
        <Link href={`/dashboard/routes/${id}/edit`}>
          <Button>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Route
          </Button>
        </Link>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Route Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{route.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Type</dt>
                <dd><StatusBadge status={route.type} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd><StatusBadge status={route.status} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Stops</dt>
                <dd className="font-medium">{routeStops.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Est. Duration</dt>
                <dd className="font-medium">
                  {route.estimatedDurationMin != null
                    ? `${route.estimatedDurationMin} min`
                    : "--"}
                </dd>
              </div>
              {route.description && (
                <div className="pt-2 border-t">
                  <dt className="text-muted-foreground mb-1">Description</dt>
                  <dd className="text-sm">{route.description}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Current Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length > 0 ? (
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Vehicle</dt>
                  <dd className="font-medium">{assignments[0].vehicleName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Driver</dt>
                  <dd className="font-medium">
                    {assignments[0].driverFirstName} {assignments[0].driverLastName}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Days</dt>
                  <dd className="font-medium">{assignments[0].daysOfWeek}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Effective Date</dt>
                  <dd className="font-medium">{assignments[0].effectiveDate || "--"}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No vehicle or driver assigned to this route yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map">
            <MapPin className="mr-1.5 h-4 w-4" />
            Map
          </TabsTrigger>
          <TabsTrigger value="stops">
            <ListOrdered className="mr-1.5 h-4 w-4" />
            Stops ({routeStops.length})
          </TabsTrigger>
          <TabsTrigger value="students">
            <Users className="mr-1.5 h-4 w-4" />
            Students ({routeStudents.length})
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <Truck className="mr-1.5 h-4 w-4" />
            Assignments ({assignments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card>
            <CardContent className="p-0 overflow-hidden rounded-lg">
              <RouteDetailMap markers={mapMarkers} routeCoords={routeCoords} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stops">
          <Card>
            <CardHeader>
              <CardTitle>Stops</CardTitle>
            </CardHeader>
            <CardContent>
              {routeStops.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No stops added to this route yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Scheduled Time</TableHead>
                        <TableHead>Coordinates</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeStops.map((stop) => (
                        <TableRow key={stop.id}>
                          <TableCell className="font-medium">{stop.sequenceOrder}</TableCell>
                          <TableCell className="font-medium">{stop.name}</TableCell>
                          <TableCell>{stop.address || "--"}</TableCell>
                          <TableCell>{stop.scheduledTime || "--"}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {stop.lat != null && stop.lng != null
                              ? `${stop.lat.toFixed(5)}, ${stop.lng.toFixed(5)}`
                              : "--"}
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

        <TabsContent value="students">
          <Card>
            <CardHeader>
              <CardTitle>Student Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {routeStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No students assigned to this route yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Student #</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Stop</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routeStudents.map((rs) => (
                        <TableRow key={rs.studentStopId}>
                          <TableCell className="font-medium">
                            {rs.firstName} {rs.lastName}
                          </TableCell>
                          <TableCell>{rs.studentNumber || "--"}</TableCell>
                          <TableCell>{rs.grade || "--"}</TableCell>
                          <TableCell>{rs.stopName}</TableCell>
                          <TableCell>
                            <StatusBadge status={rs.status} />
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

        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle>Assignment History</CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No assignments created for this route yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Driver</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Effective Date</TableHead>
                        <TableHead>End Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.vehicleName}</TableCell>
                          <TableCell>
                            {a.driverFirstName} {a.driverLastName}
                          </TableCell>
                          <TableCell>{a.daysOfWeek}</TableCell>
                          <TableCell>{a.effectiveDate || "--"}</TableCell>
                          <TableCell>{a.endDate || "--"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
