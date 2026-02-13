import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { getDb } from "@/db";
import {
  trips,
  scanEvents,
  students,
  studentStops,
  stops,
  routeAssignments,
  schools,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { rfidTagId?: string; stopId?: string; scanType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rfidTagId, stopId, scanType } = body;

  if (!rfidTagId || typeof rfidTagId !== "string") {
    return NextResponse.json(
      { error: "rfidTagId is required" },
      { status: 400 },
    );
  }

  if (scanType !== "board" && scanType !== "exit") {
    return NextResponse.json(
      { error: 'scanType must be "board" or "exit"' },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Verify trip exists and belongs to this org
  const [trip] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, id), eq(trips.orgId, auth.orgId)))
    .limit(1);

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  // Look up student by rfidTagId within this org
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(eq(students.rfidTagId, rfidTagId), eq(students.orgId, auth.orgId)),
    )
    .limit(1);

  // Determine if the student is authorized for this route
  let authorized = false;

  if (student) {
    // Get the routeId from the route assignment
    const [assignment] = await db
      .select()
      .from(routeAssignments)
      .where(eq(routeAssignments.id, trip.routeAssignmentId))
      .limit(1);

    if (assignment) {
      // Check if student has a student_stops entry for this route
      const [studentStop] = await db
        .select()
        .from(studentStops)
        .where(
          and(
            eq(studentStops.studentId, student.id),
            eq(studentStops.routeId, assignment.routeId),
          ),
        )
        .limit(1);

      authorized = !!studentStop;
    }
  }

  // Insert scan event
  await db.insert(scanEvents).values({
    tripId: id,
    studentId: student?.id ?? null,
    stopId: stopId ?? null,
    rfidTagId,
    scanType,
    authorized,
    recordedAt: new Date(),
  });

  // Build student response with school name if found
  let studentResponse: {
    id: string;
    firstName: string;
    lastName: string;
    grade: string | null;
    schoolName: string | null;
  } | null = null;

  if (student) {
    const [school] = await db
      .select()
      .from(schools)
      .where(eq(schools.id, student.schoolId))
      .limit(1);

    studentResponse = {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      schoolName: school?.name ?? null,
    };
  }

  return NextResponse.json({
    authorized,
    student: studentResponse,
  });
}
