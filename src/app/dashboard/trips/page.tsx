import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  trips,
  routeAssignments,
  routes,
  vehicles,
  drivers,
  scanEvents,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { MetricCard } from "@/components/dashboard/metric-card";
import { TripTable } from "./trip-table";
import { MapPin, CheckCircle2, Users } from "lucide-react";

export default async function TripsPage() {
  const { orgId } = await requireAuth();
  const db = await getDb();

  const today = new Date().toISOString().split("T")[0];

  const allTrips = await db
    .select({
      id: trips.id,
      date: trips.date,
      status: trips.status,
      startedAt: trips.startedAt,
      completedAt: trips.completedAt,
      notes: trips.notes,
      routeName: routes.name,
      routeType: routes.type,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
      vehicleName: vehicles.name,
      vehicleNumber: vehicles.number,
    })
    .from(trips)
    .innerJoin(routeAssignments, eq(trips.routeAssignmentId, routeAssignments.id))
    .innerJoin(routes, eq(routeAssignments.routeId, routes.id))
    .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
    .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
    .where(eq(trips.orgId, orgId))
    .orderBy(desc(trips.date), desc(trips.startedAt));

  const activeTrips = allTrips.filter((t) => t.status === "in_progress");
  const completedToday = allTrips.filter(
    (t) => t.date === today && t.status === "completed"
  );

  // Count total students transported today from scan events
  const todayTrips = allTrips.filter((t) => t.date === today);
  let totalStudentsToday = 0;
  if (todayTrips.length > 0) {
    const todayTripIds = todayTrips.map((t) => t.id);
    const [result] = await db
      .select({
        count: sql<number>`count(distinct ${scanEvents.studentId})`,
      })
      .from(scanEvents)
      .where(
        and(
          sql`${scanEvents.tripId} in (${sql.join(
            todayTripIds.map((id) => sql`${id}`),
            sql`, `
          )})`,
          eq(scanEvents.scanType, "board")
        )
      );
    totalStudentsToday = result?.count ?? 0;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Trips" description="View and manage trip operations" />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Active Trips"
          value={activeTrips.length}
          description="Currently in progress"
          icon={MapPin}
        />
        <MetricCard
          title="Completed Today"
          value={completedToday.length}
          description={`For ${today}`}
          icon={CheckCircle2}
        />
        <MetricCard
          title="Students Transported"
          value={totalStudentsToday}
          description="Unique students today"
          icon={Users}
        />
      </div>

      <TripTable trips={allTrips} />
    </div>
  );
}
