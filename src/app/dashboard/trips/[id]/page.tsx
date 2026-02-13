import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  trips,
  tripLocations,
  scanEvents,
  routeAssignments,
  routes,
  vehicles,
  drivers,
  students,
  stops,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bus,
  UserCircle,
  Route,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { TripDetailMap } from "./trip-detail-map";

function formatDateTime(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(date: Date | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(start: Date | null, end: Date | null): string {
  if (!start) return "--";
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diffMs = endTime - new Date(start).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  // Fetch trip with related data
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.orgId, orgId)))
    .limit(1);

  if (!trip) notFound();

  // Fetch route assignment details
  const [assignment] = await db
    .select()
    .from(routeAssignments)
    .where(eq(routeAssignments.id, trip.routeAssignmentId))
    .limit(1);

  const [route] = assignment
    ? await db
        .select()
        .from(routes)
        .where(eq(routes.id, assignment.routeId))
        .limit(1)
    : [null];

  const [vehicle] = assignment
    ? await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, assignment.vehicleId))
        .limit(1)
    : [null];

  const [driver] = assignment
    ? await db
        .select()
        .from(drivers)
        .where(eq(drivers.id, assignment.driverId))
        .limit(1)
    : [null];

  // Fetch GPS locations
  const locations = await db
    .select()
    .from(tripLocations)
    .where(eq(tripLocations.tripId, id))
    .orderBy(asc(tripLocations.recordedAt));

  // Fetch scan events with student and stop data
  const scans = await db
    .select({
      id: scanEvents.id,
      scanType: scanEvents.scanType,
      rfidTagId: scanEvents.rfidTagId,
      authorized: scanEvents.authorized,
      recordedAt: scanEvents.recordedAt,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      studentNumber: students.studentNumber,
      stopName: stops.name,
    })
    .from(scanEvents)
    .leftJoin(students, eq(scanEvents.studentId, students.id))
    .leftJoin(stops, eq(scanEvents.stopId, stops.id))
    .where(eq(scanEvents.tripId, id))
    .orderBy(asc(scanEvents.recordedAt));

  // Fetch route stops for timeline
  const routeStops = route
    ? await db
        .select()
        .from(stops)
        .where(eq(stops.routeId, route.id))
        .orderBy(asc(stops.sequenceOrder))
    : [];

  const routeLine: [number, number][] = locations.map((loc) => [
    loc.lng,
    loc.lat,
  ]);

  const mapMarkers = [];
  if (locations.length > 0) {
    mapMarkers.push({
      lat: locations[0].lat,
      lng: locations[0].lng,
      label: "Start",
      color: "#16a34a",
    });
    if (locations.length > 1) {
      const last = locations[locations.length - 1];
      mapMarkers.push({
        lat: last.lat,
        lng: last.lng,
        label: "End",
        color: "#dc2626",
      });
    }
  }

  // Add stop markers
  for (const stop of routeStops) {
    if (stop.lat && stop.lng) {
      mapMarkers.push({
        lat: stop.lat,
        lng: stop.lng,
        label: stop.name,
        color: "#f59e0b",
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Trip: ${route?.name ?? "Unknown Route"}`}
        description={`${trip.date} - ${trip.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`}
      />

      {/* Trip Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Route</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{route?.name ?? "--"}</div>
            {route && <StatusBadge status={route.type} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Driver</CardTitle>
            <UserCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              {driver
                ? `${driver.firstName} ${driver.lastName}`
                : "--"}
            </div>
            {driver?.phone && (
              <p className="text-xs text-muted-foreground">{driver.phone}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vehicle</CardTitle>
            <Bus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{vehicle?.name ?? "--"}</div>
            {vehicle?.number && (
              <p className="text-xs text-muted-foreground">
                #{vehicle.number}
                {vehicle.licensePlate ? ` - ${vehicle.licensePlate}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="mb-1">
              <StatusBadge status={trip.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(trip.startedAt)} &rarr;{" "}
              {trip.completedAt ? formatDateTime(trip.completedAt) : "Ongoing"}
            </p>
            <p className="text-xs text-muted-foreground">
              Duration: {formatDuration(trip.startedAt, trip.completedAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      {(routeLine.length > 0 || mapMarkers.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Trip Route</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <TripDetailMap
              markers={mapMarkers}
              routeLine={routeLine.length >= 2 ? routeLine : undefined}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scan Events */}
        <Card>
          <CardHeader>
            <CardTitle>Scan Events ({scans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {scans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scan events recorded for this trip.
              </p>
            ) : (
              <div className="space-y-3">
                {scans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-start gap-3 rounded-md border p-3"
                  >
                    {scan.scanType === "board" ? (
                      <ArrowUpCircle className="mt-0.5 h-5 w-5 text-green-600" />
                    ) : (
                      <ArrowDownCircle className="mt-0.5 h-5 w-5 text-orange-600" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {scan.studentFirstName && scan.studentLastName
                            ? `${scan.studentFirstName} ${scan.studentLastName}`
                            : `Tag: ${scan.rfidTagId}`}
                        </span>
                        <StatusBadge status={scan.scanType} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>{formatTime(scan.recordedAt)}</span>
                        {scan.stopName && <span>at {scan.stopName}</span>}
                        {scan.studentNumber && (
                          <span>#{scan.studentNumber}</span>
                        )}
                      </div>
                      {!scan.authorized && (
                        <p className="text-xs text-red-600 font-medium mt-1">
                          Unauthorized scan
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stops Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Stops Timeline ({routeStops.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {routeStops.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stops defined for this route.
              </p>
            ) : (
              <div className="relative space-y-0">
                {routeStops.map((stop, index) => {
                  const stopScans = scans.filter(
                    (s) => s.stopName === stop.name
                  );
                  const isLast = index === routeStops.length - 1;

                  return (
                    <div key={stop.id} className="relative flex gap-3 pb-6">
                      {/* Timeline line */}
                      {!isLast && (
                        <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
                      )}
                      {/* Dot */}
                      <div
                        className={`mt-1 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                          stopScans.length > 0
                            ? "border-green-600 bg-green-100 text-green-800"
                            : "border-muted-foreground bg-muted text-muted-foreground"
                        }`}
                      >
                        {stop.sequenceOrder}
                      </div>
                      {/* Content */}
                      <div className="flex-1">
                        <p className="font-medium">{stop.name}</p>
                        {stop.scheduledTime && (
                          <p className="text-xs text-muted-foreground">
                            Scheduled: {stop.scheduledTime}
                          </p>
                        )}
                        {stop.address && (
                          <p className="text-xs text-muted-foreground">
                            {stop.address}
                          </p>
                        )}
                        {stopScans.length > 0 && (
                          <p className="text-xs text-green-700 mt-1">
                            {stopScans.length} scan(s) recorded
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {trip.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{trip.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
