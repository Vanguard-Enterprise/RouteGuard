import { NextRequest, NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { routes, studentStops, students, stops } from "@/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await getOrgSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const db = await getDb();

  // Verify route belongs to org
  const [route] = await db
    .select()
    .from(routes)
    .where(and(eq(routes.id, id), eq(routes.orgId, session.orgId)))
    .limit(1);

  if (!route) {
    return NextResponse.json({ error: "Route not found" }, { status: 404 });
  }

  const routeStudents = await db
    .select({
      studentStopId: studentStops.id,
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      studentNumber: students.studentNumber,
      grade: students.grade,
      status: students.status,
      stopId: studentStops.stopId,
      stopName: stops.name,
      effectiveDate: studentStops.effectiveDate,
      endDate: studentStops.endDate,
    })
    .from(studentStops)
    .innerJoin(students, eq(studentStops.studentId, students.id))
    .innerJoin(stops, eq(studentStops.stopId, stops.id))
    .where(eq(studentStops.routeId, id));

  return NextResponse.json(routeStudents);
}
