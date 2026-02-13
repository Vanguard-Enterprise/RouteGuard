import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { students, schools } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  studentNumber: z.string().optional(),
  grade: z.string().optional(),
  schoolId: z.string().min(1).optional(),
  rfidTagId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  medicalNotes: z.string().optional(),
  status: z.enum(["active", "inactive", "graduated"]).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const db = await getDb();

    const [student] = await db
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
      .where(and(eq(students.id, id), eq(students.orgId, orgId)))
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (error) {
    console.error("GET /api/students/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch student." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const body = await request.json();
    const parsed = updateStudentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = await getDb();

    // Verify student belongs to org
    const [existing] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    // If schoolId is being changed, verify it belongs to org
    if (data.schoolId) {
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
    }

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (data.firstName !== undefined) updateFields.firstName = data.firstName;
    if (data.lastName !== undefined) updateFields.lastName = data.lastName;
    if (data.studentNumber !== undefined)
      updateFields.studentNumber = data.studentNumber || null;
    if (data.grade !== undefined) updateFields.grade = data.grade || null;
    if (data.schoolId !== undefined) updateFields.schoolId = data.schoolId;
    if (data.rfidTagId !== undefined)
      updateFields.rfidTagId = data.rfidTagId || null;
    if (data.address !== undefined) updateFields.address = data.address || null;
    if (data.city !== undefined) updateFields.city = data.city || null;
    if (data.state !== undefined) updateFields.state = data.state || null;
    if (data.zip !== undefined) updateFields.zip = data.zip || null;
    if (data.medicalNotes !== undefined)
      updateFields.medicalNotes = data.medicalNotes || null;
    if (data.status !== undefined) updateFields.status = data.status;

    const [updated] = await db
      .update(students)
      .set(updateFields)
      .where(eq(students.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/students/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update student." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const db = await getDb();

    // Verify student belongs to org
    const [existing] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.orgId, orgId)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    await db.delete(students).where(eq(students.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/students/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete student." },
      { status: 500 }
    );
  }
}
