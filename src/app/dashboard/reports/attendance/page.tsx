import { requireAuth } from "@/lib/auth";
import { getDb } from "@/db";
import {
  scanEvents,
  students,
  schools,
  trips,
  routes,
  routeAssignments,
} from "@/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReportFilters } from "../report-filters";
import { AttendanceTable } from "./attendance-table";

export default async function AttendanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const { orgId } = await requireAuth();
  const db = await getDb();
  const params = await searchParams;

  const startDate = params.startDate;
  const endDate = params.endDate;
  const routeId = params.routeId;
  const schoolId = params.schoolId;

  // Build trip conditions for the org and date range
  const tripConditions = [eq(trips.orgId, orgId)];
  if (startDate) {
    tripConditions.push(gte(trips.date, startDate));
  }
  if (endDate) {
    tripConditions.push(lte(trips.date, endDate));
  }

  // Query scan events joined with student info, trips, and routes
  let query = db
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

  const rawScans = await query;

  // Filter by routeId and schoolId in application layer
  let filteredScans = rawScans;
  if (routeId) {
    filteredScans = filteredScans.filter((s) => s.routeId === routeId);
  }
  if (schoolId) {
    filteredScans = filteredScans.filter((s) => s.schoolId === schoolId);
  }

  // Group by student + date to produce attendance rows
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

  const attendanceData = Array.from(attendanceMap.values());

  // Fetch filter options
  const allRoutes = await db
    .select({ id: routes.id, name: routes.name })
    .from(routes)
    .where(eq(routes.orgId, orgId));

  const allSchools = await db
    .select({ id: schools.id, name: schools.name })
    .from(schools)
    .where(eq(schools.orgId, orgId));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Report"
        description="Student bus attendance by day"
      />

      <ReportFilters
        routes={allRoutes}
        schools={allSchools}
        reportType="attendance"
      />

      <AttendanceTable data={attendanceData} />
    </div>
  );
}
