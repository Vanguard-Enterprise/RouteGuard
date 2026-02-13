import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  schools,
  students,
  vehicles,
  drivers,
  routes,
  trips,
} from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  School,
  Users,
  Route,
  Bus,
  MapPin,
  UserCircle,
  Activity,
  Clock,
} from "lucide-react";

export default async function DashboardPage() {
  const { user, orgId } = await requireAuth();
  const db = await getDb();

  const today = new Date().toISOString().split("T")[0];

  const [
    [{ value: totalSchools }],
    [{ value: totalStudents }],
    [{ value: activeRoutes }],
    [{ value: activeVehicles }],
    [{ value: activeTrips }],
    [{ value: activeDrivers }],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(schools)
      .where(eq(schools.orgId, orgId)),
    db
      .select({ value: count() })
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.status, "active"))),
    db
      .select({ value: count() })
      .from(routes)
      .where(and(eq(routes.orgId, orgId), eq(routes.status, "active"))),
    db
      .select({ value: count() })
      .from(vehicles)
      .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "active"))),
    db
      .select({ value: count() })
      .from(trips)
      .where(
        and(
          eq(trips.orgId, orgId),
          eq(trips.status, "in_progress"),
          eq(trips.date, today)
        )
      ),
    db
      .select({ value: count() })
      .from(drivers)
      .where(and(eq(drivers.orgId, orgId), eq(drivers.status, "active"))),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Here's an overview of your transportation operations."
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Schools"
          value={totalSchools}
          description="Registered schools"
          icon={School}
        />
        <MetricCard
          title="Active Students"
          value={totalStudents}
          description="Currently enrolled"
          icon={Users}
        />
        <MetricCard
          title="Active Routes"
          value={activeRoutes}
          description="Published routes"
          icon={Route}
        />
        <MetricCard
          title="Active Vehicles"
          value={activeVehicles}
          description="In service"
          icon={Bus}
        />
        <MetricCard
          title="Trips In Progress"
          value={activeTrips}
          description="Running today"
          icon={MapPin}
        />
        <MetricCard
          title="Active Drivers"
          value={activeDrivers}
          description="Available drivers"
          icon={UserCircle}
        />
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active Trips
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTrips > 0 ? (
              <p className="text-sm text-muted-foreground">
                {activeTrips} trip{activeTrips !== 1 ? "s" : ""} currently in
                progress.
              </p>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No active trips right now
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Trips will appear here once drivers begin their routes.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Activity className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No recent activity
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Activity from scans, trips, and alerts will show up here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
