import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { students, guardians, studentGuardians } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

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

    // Verify student belongs to org
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.orgId, orgId)))
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    const result = await db
      .select({
        id: guardians.id,
        firstName: guardians.firstName,
        lastName: guardians.lastName,
        phone: guardians.phone,
        altPhone: guardians.altPhone,
        email: guardians.email,
        smsOptIn: guardians.smsOptIn,
        language: guardians.language,
        relationship: studentGuardians.relationship,
        isPrimary: studentGuardians.isPrimary,
        linkId: studentGuardians.id,
      })
      .from(studentGuardians)
      .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
      .where(eq(studentGuardians.studentId, id));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/students/[id]/guardians error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guardians." },
      { status: 500 }
    );
  }
}

const addGuardianSchema = z.object({
  // If guardianId is provided, link to existing guardian
  guardianId: z.string().optional(),
  // Otherwise create a new guardian
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  altPhone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  relationship: z.enum(["parent", "guardian", "emergency"]).default("parent"),
  isPrimary: z.boolean().default(false),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const body = await request.json();
    const parsed = addGuardianSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const db = await getDb();

    // Verify student belongs to org
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, id), eq(students.orgId, orgId)))
      .limit(1);

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    let guardianId = data.guardianId;

    if (!guardianId) {
      // Create a new guardian
      if (!data.firstName || !data.lastName || !data.phone) {
        return NextResponse.json(
          { error: "firstName, lastName, and phone are required for new guardians." },
          { status: 400 }
        );
      }

      const [newGuardian] = await db
        .insert(guardians)
        .values({
          orgId,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          altPhone: data.altPhone || null,
          email: data.email || null,
        })
        .returning();

      guardianId = newGuardian.id;
    } else {
      // Verify guardian belongs to org
      const [existing] = await db
        .select({ id: guardians.id })
        .from(guardians)
        .where(and(eq(guardians.id, guardianId), eq(guardians.orgId, orgId)))
        .limit(1);

      if (!existing) {
        return NextResponse.json(
          { error: "Guardian not found in your organization." },
          { status: 400 }
        );
      }
    }

    // Create the student-guardian link
    const [link] = await db
      .insert(studentGuardians)
      .values({
        studentId: id,
        guardianId,
        relationship: data.relationship,
        isPrimary: data.isPrimary,
      })
      .returning();

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("POST /api/students/[id]/guardians error:", error);
    return NextResponse.json(
      { error: "Failed to add guardian." },
      { status: 500 }
    );
  }
}
