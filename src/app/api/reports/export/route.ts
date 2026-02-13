import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import {
  dailySummaries,
  routes,
  scanEvents,
  students,
  schools,
  trips,
  routeAssignments,
} from "@/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const routeId = searchParams.get("routeId");
  const schoolId = searchParams.get("schoolId");

  if (!type || !["ridership", "attendance", "performance"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid report type. Must be ridership, attendance, or performance." },
      { status: 400 }
    );
  }

  const db = await getDb();
  let csvContent = "";

  if (type === "ridership") {
    const conditions = [eq(dailySummaries.orgId, session.orgId)];
    if (startDate) conditions.push(gte(dailySummaries.date, startDate));
    if (endDate) conditions.push(lte(dailySummaries.date, endDate));
    if (routeId) conditions.push(eq(dailySummaries.routeId, routeId));

    const data = await db
      .select({
        date: dailySummaries.date,
        routeName: routes.name,
        totalStudents: dailySummaries.totalStudents,
        boardedCount: dailySummaries.boardedCount,
        onTime: dailySummaries.onTime,
        delayMinutes: dailySummaries.delayMinutes,
        notes: dailySummaries.notes,
      })
      .from(dailySummaries)
      .innerJoin(routes, eq(dailySummaries.routeId, routes.id))
      .where(and(...conditions))
      .orderBy(desc(dailySummaries.date));

    const header = toCsvRow([
      "Date",
      "Route",
      "Total Students",
      "Boarded",
      "On Time",
      "Delay (min)",
      "Notes",
    ]);
    const rows = data.map((r) =>
      toCsvRow([
        r.date,
        r.routeName,
        r.totalStudents,
        r.boardedCount,
        r.onTime ? "Yes" : "No",
        r.delayMinutes ?? 0,
        r.notes,
      ])
    );
    csvContent = [header, ...rows].join("\n");
  } else if (type === "attendance") {
    const tripConditions = [eq(trips.orgId, session.orgId)];
    if (startDate) tripConditions.push(gte(trips.date, startDate));
    if (endDate) tripConditions.push(lte(trips.date, endDate));

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
      .orderBy(desc(trips.date));

    let filteredScans = rawScans;
    if (routeId) {
      filteredScans = filteredScans.filter((s) => s.routeId === routeId);
    }
    if (schoolId) {
      filteredScans = filteredScans.filter((s) => s.schoolId === schoolId);
    }

    // Aggregate
    const attendanceMap = new Map<
      string,
      {
        studentName: string;
        studentNumber: string | null;
        schoolName: string | null;
        routeName: string;
        date: string;
        boarded: boolean;
        boardTime: string;
        exitTime: string;
      }
    >();

    for (const scan of filteredScans) {
      const key = `${scan.studentId ?? scan.scanId}-${scan.tripDate}`;
      if (!attendanceMap.has(key)) {
        attendanceMap.set(key, {
          studentName:
            scan.studentFirstName && scan.studentLastName
              ? `${scan.studentFirstName} ${scan.studentLastName}`
              : "Unknown",
          studentNumber: scan.studentNumber,
          schoolName: scan.schoolName,
          routeName: scan.routeName,
          date: scan.tripDate,
          boarded: false,
          boardTime: "",
          exitTime: "",
        });
      }
      const rec = attendanceMap.get(key)!;
      if (scan.scanType === "board") {
        rec.boarded = true;
        rec.boardTime = new Date(scan.recordedAt).toISOString();
      }
      if (scan.scanType === "exit") {
        rec.exitTime = new Date(scan.recordedAt).toISOString();
      }
    }

    const header = toCsvRow([
      "Date",
      "Student",
      "Student #",
      "School",
      "Route",
      "Boarded",
      "Board Time",
      "Exit Time",
    ]);
    const rows = Array.from(attendanceMap.values()).map((r) =>
      toCsvRow([
        r.date,
        r.studentName,
        r.studentNumber,
        r.schoolName,
        r.routeName,
        r.boarded ? "Yes" : "No",
        r.boardTime,
        r.exitTime,
      ])
    );
    csvContent = [header, ...rows].join("\n");
  } else if (type === "performance") {
    const conditions = [eq(dailySummaries.orgId, session.orgId)];
    if (startDate) conditions.push(gte(dailySummaries.date, startDate));
    if (endDate) conditions.push(lte(dailySummaries.date, endDate));
    if (routeId) conditions.push(eq(dailySummaries.routeId, routeId));

    const data = await db
      .select({
        routeName: routes.name,
        totalTrips: sql<number>`count(*)`,
        avgDelay: sql<number>`round(avg(${dailySummaries.delayMinutes}), 1)`,
        onTimeCount:
          sql<number>`sum(case when ${dailySummaries.onTime} = 1 then 1 else 0 end)`,
        totalStudents: sql<number>`sum(${dailySummaries.totalStudents})`,
        totalBoarded: sql<number>`sum(${dailySummaries.boardedCount})`,
      })
      .from(dailySummaries)
      .innerJoin(routes, eq(dailySummaries.routeId, routes.id))
      .where(and(...conditions))
      .groupBy(dailySummaries.routeId, routes.name);

    const header = toCsvRow([
      "Route",
      "Total Trips",
      "Avg Delay (min)",
      "On-Time %",
      "Total Students",
      "Total Boarded",
    ]);
    const rows = data.map((r) => {
      const totalTrips = Number(r.totalTrips);
      const onTimePercent =
        totalTrips > 0
          ? Math.round((Number(r.onTimeCount) / totalTrips) * 100)
          : 0;
      return toCsvRow([
        r.routeName,
        totalTrips,
        Number(r.avgDelay) || 0,
        `${onTimePercent}%`,
        Number(r.totalStudents),
        Number(r.totalBoarded),
      ]);
    });
    csvContent = [header, ...rows].join("\n");
  }

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-report-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
