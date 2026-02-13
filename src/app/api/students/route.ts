import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { students, schools } from "@/db/schema";
import { eq, and, like, or } from "drizzle-orm";
import { z } from "zod";

const createStudentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  studentNumber: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  schoolId: z.string().min(1),
  rfidTagId: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  zip: z.string().optional().default(""),
  medicalNotes: z.string().optional().default(""),
  status: z.enum(["active", "inactive", "graduated"]).default("active"),
});

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const db = await getDb();

    const conditions = [eq(students.orgId, orgId)];

    if (schoolId) {
      conditions.push(eq(students.schoolId, schoolId));
    }
    if (status) {
      conditions.push(
        eq(
          students.status,
          status as "active" | "inactive" | "graduated"
        )
      );
    }

    let query = db
      .select({
        id: students.id,
        orgId: students.orgId,
        schoolId: students.schoolId,
        firstName: students.firstName,
        lastName: students.lastName,
        studentNumber: students.studentNumber,
        grade: students.grade,
        rfidTagId: students.rfidTagId,
        address: students.address,
        city: students.city,
        state: students.state,
        zip: students.zip,
        lat: students.lat,
        lng: students.lng,
        status: students.status,
        medicalNotes: students.medicalNotes,
        createdAt: students.createdAt,
        updatedAt: students.updatedAt,
        schoolName: schools.name,
      })
      .from(students)
      .leftJoin(schools, eq(students.schoolId, schools.id))
      .where(and(...conditions))
      .$dynamic();

    if (search) {
      const pattern = `%${search}%`;
      query = query.where(
        and(
          ...conditions,
          or(
            like(students.firstName, pattern),
            like(students.lastName, pattern),
            like(students.studentNumber, pattern)
          )
        )
      );
    }

    const result = await query;

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/students error:", error);
    return NextResponse.json(
      { error: "Failed to fetch students." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const body = await request.json();
    const parsed = createStudentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = await getDb();

    // Verify school belongs to org
    const [school] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(and(eq(schools.id, data.schoolId), eq(schools.orgId, orgId)))
      .limit(1);

    if (!school) {
      return NextResponse.json(
        { error: "School not found in your organization." },
        { status: 400 }
      );
    }

    const [newStudent] = await db
      .insert(students)
      .values({
        orgId,
        schoolId: data.schoolId,
        firstName: data.firstName,
        lastName: data.lastName,
        studentNumber: data.studentNumber || null,
        grade: data.grade || null,
        rfidTagId: data.rfidTagId || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        medicalNotes: data.medicalNotes || null,
        status: data.status,
      })
      .returning();

    return NextResponse.json(newStudent, { status: 201 });
  } catch (error) {
    console.error("POST /api/students error:", error);
    return NextResponse.json(
      { error: "Failed to create student." },
      { status: 500 }
    );
  }
}
