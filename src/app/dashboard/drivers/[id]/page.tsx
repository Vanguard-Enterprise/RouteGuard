import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { drivers, routeAssignments, routes, vehicles } from "@/db/schema";
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
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Pencil, Trash2, ArrowLeft } from "lucide-react";

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [driver] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
    .limit(1);

  if (!driver) {
    notFound();
  }

  const assignments = await db
    .select({
      id: routeAssignments.id,
      routeName: routes.name,
      routeType: routes.type,
      vehicleName: vehicles.name,
      vehicleNumber: vehicles.number,
      effectiveDate: routeAssignments.effectiveDate,
      endDate: routeAssignments.endDate,
      daysOfWeek: routeAssignments.daysOfWeek,
    })
    .from(routeAssignments)
    .innerJoin(routes, eq(routeAssignments.routeId, routes.id))
    .innerJoin(vehicles, eq(routeAssignments.vehicleId, vehicles.id))
    .where(eq(routeAssignments.driverId, driver.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${driver.firstName} ${driver.lastName}`}
        description="Driver details"
      >
        <Link href="/dashboard/drivers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Link href={`/dashboard/drivers/${driver.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
        <form action={`/api/drivers/${driver.id}`} method="POST">
          <input type="hidden" name="_method" value="DELETE" />
          <Button variant="destructive" size="sm" type="submit">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </form>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Driver Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">First Name</dt>
                <dd className="font-medium">{driver.firstName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last Name</dt>
                <dd className="font-medium">{driver.lastName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{driver.phone || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={driver.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">License Number</dt>
                <dd className="font-medium">{driver.licenseNumber || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">License Expiry</dt>
                <dd className="font-medium">
                  {driver.licenseExpiry
                    ? new Date(driver.licenseExpiry).toLocaleDateString()
                    : "--"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Added</dt>
                <dd className="font-medium">
                  {driver.createdAt
                    ? new Date(driver.createdAt).toLocaleDateString()
                    : "--"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Route Assignments & Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No route assignments for this driver.
              </p>
            ) : (
              <div className="space-y-3">
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{a.routeName}</p>
                      <p className="text-muted-foreground">
                        Vehicle: {a.vehicleName}
                        {a.vehicleNumber ? ` (#${a.vehicleNumber})` : ""}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <StatusBadge status={a.routeType} />
                      <p className="mt-1 text-muted-foreground">
                        {a.daysOfWeek || "MTWRF"}
                      </p>
                      <p className="text-muted-foreground">
                        {a.effectiveDate || "Start"} - {a.endDate || "Ongoing"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
