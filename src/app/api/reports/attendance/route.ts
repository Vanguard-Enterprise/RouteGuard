import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import {
  scanEvents,
  students,
  schools,
  trips,
  routes,
  routeAssignments,
} from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const routeId = searchParams.get("routeId");
  const schoolId = searchParams.get("schoolId");

  const db = await getDb();

  const tripConditions = [eq(trips.orgId, session.orgId)];
  if (startDate) {
    tripConditions.push(gte(trips.date, startDate));
  }
  if (endDate) {
    tripConditions.push(lte(trips.date, endDate));
  }

  const rawScans = await db
    .select({
      scanId: scanEvents.id,
      scanType: scanEvents.scanType,
      recordedAt: scanEvents.recordedAt,
      tripDate: trips.date,
      studentId: students.id,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      studentNumber: students.studentNumber,
      schoolName: schools.name,
      schoolId: students.schoolId,
      routeName: routes.name,
      routeId: routes.id,
    })
    .from(scanEvents)
    .innerJoin(trips, eq(scanEvents.tripId, trips.id))
    .innerJoin(
      routeAssignments,
      eq(trips.routeAssignmentId, routeAssignments.id)
    )
    .innerJoin(routes, eq(routeAssignments.routeId, routes.id))
    .leftJoin(students, eq(scanEvents.studentId, students.id))
    .leftJoin(schools, eq(students.schoolId, schools.id))
    .where(and(...tripConditions))
    .orderBy(desc(trips.date), desc(scanEvents.recordedAt));

  // Filter in application layer
  let filteredScans = rawScans;
  if (routeId) {
    filteredScans = filteredScans.filter((s) => s.routeId === routeId);
  }
  if (schoolId) {
    filteredScans = filteredScans.filter((s) => s.schoolId === schoolId);
  }

  // Aggregate into attendance records
  const attendanceMap = new Map<
    string,
    {
      studentId: string | null;
      studentName: string;
      studentNumber: string | null;
      schoolName: string | null;
      routeName: string;
      date: string;
      boarded: boolean;
      boardTime: Date | null;
      exitTime: Date | null;
    }
  >();

  for (const scan of filteredScans) {
    const key = `${scan.studentId ?? scan.scanId}-${scan.tripDate}`;

    if (!attendanceMap.has(key)) {
      attendanceMap.set(key, {
        studentId: scan.studentId,
        studentName:
          scan.studentFirstName && scan.studentLastName
            ? `${scan.studentFirstName} ${scan.studentLastName}`
            : "Unknown Student",
        studentNumber: scan.studentNumber,
        schoolName: scan.schoolName,
        routeName: scan.routeName,
        date: scan.tripDate,
        boarded: false,
        boardTime: null,
        exitTime: null,
      });
    }

    const record = attendanceMap.get(key)!;
    if (scan.scanType === "board") {
      record.boarded = true;
      if (
        !record.boardTime ||
        new Date(scan.recordedAt) < new Date(record.boardTime)
      ) {
        record.boardTime = scan.recordedAt;
      }
    }
    if (scan.scanType === "exit") {
      if (
        !record.exitTime ||
        new Date(scan.recordedAt) > new Date(record.exitTime)
      ) {
        record.exitTime = scan.recordedAt;
      }
    }
  }

  return NextResponse.json(Array.from(attendanceMap.values()));
}
