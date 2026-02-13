import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDb } from "@/db";
import {
  routes,
  stops,
  studentStops,
  students,
  schools,
  routeAssignments,
  vehicles,
  drivers,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  // Fetch the route scoped to this org
  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, auth.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  // Fetch stops ordered by sequence
  const routeStops = await db
    .select()
    .from(stops)
    .where(eq(stops.routeId, route.id))
    .orderBy(asc(stops.sequenceOrder));

  // Fetch students at each stop with school info
  const stopsWithStudents = await Promise.all(
    routeStops.map(async (stop) => {
      const stopStudents = await db
        .select({
          id: students.id,
          firstName: students.firstName,
          lastName: students.lastName,
          grade: students.grade,
          rfidTagId: students.rfidTagId,
          studentNumber: students.studentNumber,
          schoolId: students.schoolId,
          schoolName: schools.name,
        })
        .from(studentStops)
        .innerJoin(students, eq(studentStops.studentId, students.id))
        .leftJoin(schools, eq(students.schoolId, schools.id))
        .where(
          and(
            eq(studentStops.stopId, stop.id),
            eq(studentStops.routeId, route.id),
          ),
        );

      return {
        ...stop,
        students: stopStudents,
      };
    }),
  );

  // Fetch current route assignments (vehicle + driver)
  const assignments = await db
    .select()
    .from(routeAssignments)
    .where(eq(routeAssignments.routeId, route.id));

  const assignmentsWithDetails = await Promise.all(
    assignments.map(async (assignment) => {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, assignment.vehicleId))
        .limit(1);

      const [driver] = await db
        .select()
        .from(drivers)
        .where(eq(drivers.id, assignment.driverId))
        .limit(1);

      return {
        id: assignment.id,
        effectiveDate: assignment.effectiveDate,
        endDate: assignment.endDate,
        daysOfWeek: assignment.daysOfWeek,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              name: vehicle.name,
              number: vehicle.number,
              capacity: vehicle.capacity,
              licensePlate: vehicle.licensePlate,
            }
          : null,
        driver: driver
          ? {
              id: driver.id,
              firstName: driver.firstName,
              lastName: driver.lastName,
              phone: driver.phone,
            }
          : null,
      };
    }),
  );

  return NextResponse.json({
    route: {
      id: route.id,
      name: route.name,
      type: route.type,
      status: route.status,
      description: route.description,
      estimatedDurationMin: route.estimatedDurationMin,
    },
    stops: stopsWithStudents,
    assignments: assignmentsWithDetails,
  });
}
