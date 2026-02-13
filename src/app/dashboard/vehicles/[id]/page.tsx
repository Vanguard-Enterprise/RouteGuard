import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { vehicles, routeAssignments, routes, drivers } from "@/db/schema";
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

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireAuth();
  const db = await getDb();

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .limit(1);

  if (!vehicle) {
    notFound();
  }

  const assignments = await db
    .select({
      id: routeAssignments.id,
      routeName: routes.name,
      driverFirstName: drivers.firstName,
      driverLastName: drivers.lastName,
      effectiveDate: routeAssignments.effectiveDate,
      endDate: routeAssignments.endDate,
      daysOfWeek: routeAssignments.daysOfWeek,
    })
    .from(routeAssignments)
    .innerJoin(routes, eq(routeAssignments.routeId, routes.id))
    .innerJoin(drivers, eq(routeAssignments.driverId, drivers.id))
    .where(eq(routeAssignments.vehicleId, vehicle.id));

  return (
    <div className="space-y-6">
      <PageHeader title={vehicle.name} description={`Vehicle #${vehicle.number || "N/A"}`}>
        <Link href="/dashboard/vehicles">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <Link href={`/dashboard/vehicles/${vehicle.id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </Link>
        <form action={`/api/vehicles/${vehicle.id}`} method="POST">
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
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{vehicle.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Number</dt>
                <dd className="font-medium">{vehicle.number || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Capacity</dt>
                <dd className="font-medium">{vehicle.capacity ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={vehicle.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Year</dt>
                <dd className="font-medium">{vehicle.year ?? "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Make</dt>
                <dd className="font-medium">{vehicle.make || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-medium">{vehicle.model || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">VIN</dt>
                <dd className="font-medium">{vehicle.vin || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">License Plate</dt>
                <dd className="font-medium">{vehicle.licensePlate || "--"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Added</dt>
                <dd className="font-medium">
                  {vehicle.createdAt
                    ? new Date(vehicle.createdAt).toLocaleDateString()
                    : "--"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Route Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No route assignments for this vehicle.
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
                        Driver: {a.driverFirstName} {a.driverLastName}
                      </p>
                    </div>
                    <div className="text-right text-muted-foreground text-xs">
                      <p>{a.daysOfWeek || "MTWRF"}</p>
                      <p>
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
