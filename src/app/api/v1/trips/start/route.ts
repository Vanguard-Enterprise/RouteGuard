import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDb } from "@/db";
import {
  trips,
  routeAssignments,
  routes,
  stops,
  studentStops,
  students,
  schools,
  vehicles,
  drivers,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { routeAssignmentId?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { routeAssignmentId, date } = body;

  if (!routeAssignmentId || typeof routeAssignmentId !== "string") {
    return NextResponse.json(
      { error: "routeAssignmentId is required" },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Verify the route assignment exists and belongs to this org
  const [assignment] = await db
    .select()
    .from(routeAssignments)
    .where(eq(routeAssignments.id, routeAssignmentId))
    .limit(1);

  if (!assignment) {
    return NextResponse.json(
      { error: "Route assignment not found" },
      { status: 404 },
    );
  }

  // Verify the route belongs to this org
  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, assignment.routeId), eq(routes.orgId, auth.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json(
      { error: "Route assignment not found" },
      { status: 404 },
    );
  }

  const tripDate =
    date || new Date().toISOString().split("T")[0];

  // Create the trip
  const [trip] = await db
    .insert(trips)
    .values({
      routeAssignmentId,
      orgId: auth.orgId,
      date: tripDate,
      status: "in_progress",
      startedAt: new Date(),
    })
    .returning();

  // Fetch route manifest data: stops with students
  const routeStops = await db
    .select()
    .from(stops)
    .where(eq(stops.routeId, route.id))
    .orderBy(asc(stops.sequenceOrder));

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
        })
        .from(studentStops)
        .innerJoin(students, eq(studentStops.studentId, students.id))
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

  // Fetch vehicle and driver info
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

  return NextResponse.json(
    {
      trip,
      route: {
        id: route.id,
        name: route.name,
        type: route.type,
        description: route.description,
        estimatedDurationMin: route.estimatedDurationMin,
      },
      stops: stopsWithStudents,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            name: vehicle.name,
            number: vehicle.number,
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
    },
    { status: 201 },
  );
}
