import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, stops, vehicles, drivers } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteBuilder } from "@/components/dashboard/route-builder";

interface EditRoutePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRoutePage({ params }: EditRoutePageProps) {
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

  const [routeStops, activeVehicles, activeDrivers] = await Promise.all([
    db
      .select()
      .from(stops)
      .where(eq(stops.routeId, id))
      .orderBy(asc(stops.sequenceOrder)),
    db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.orgId, orgId), eq(vehicles.status, "active"))),
    db
      .select()
      .from(drivers)
      .where(and(eq(drivers.orgId, orgId), eq(drivers.status, "active"))),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Route" description={`Editing ${route.name}`} />
      <RouteBuilder
        mode="edit"
        initialData={{
          id: route.id,
          name: route.name,
          type: route.type,
          status: route.status,
          description: route.description,
          estimatedDurationMin: route.estimatedDurationMin,
          stops: routeStops.map((s) => ({
            id: s.id,
            name: s.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            sequenceOrder: s.sequenceOrder,
            scheduledTime: s.scheduledTime,
          })),
        }}
        vehicles={activeVehicles}
        drivers={activeDrivers}
      />
    </div>
  );
}
