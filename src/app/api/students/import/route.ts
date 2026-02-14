import { NextResponse } from "next/server";
import { getOrgSession } from "@/lib/auth";
import { getDb } from "@/db";
import { students, schools } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const studentRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  studentNumber: z.string().optional().default(""),
  grade: z.string().optional().default(""),
  schoolId: z.string().optional().default(""),
  rfidTagId: z.string().optional().default(""),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  zip: z.string().optional().default(""),
  medicalNotes: z.string().optional().default(""),
  status: z.enum(["active", "inactive", "graduated"]).default("active"),
});

const importSchema = z.object({
  students: z.array(z.record(z.string(), z.string())),
});

export async function POST(request: Request) {
  try {
    const session = await getOrgSession();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { orgId } = session;

    const body = await request.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid import data.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Load valid schools for the org
    const orgSchools = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.orgId, orgId));
    const validSchoolIds = new Set(orgSchools.map((s) => s.id));

    let imported = 0;
    const errors: { row: number; message: string }[] = [];

    const studentRows = parsed.data.students;

    for (let i = 0; i < studentRows.length; i++) {
      const rowData = studentRows[i];
      const rowParsed = studentRowSchema.safeParse(rowData);

      if (!rowParsed.success) {
        const messages = rowParsed.error.issues.map((iss) => iss.message).join("; ");
        errors.push({ row: i + 1, message: messages });
        continue;
      }

      const row = rowParsed.data;

      // Validate school ID if provided
      if (row.schoolId && !validSchoolIds.has(row.schoolId)) {
        errors.push({
          row: i + 1,
          message: `School ID "${row.schoolId}" not found in organization`,
        });
        continue;
      }

      // Skip rows without a school assignment
      if (!row.schoolId) {
        errors.push({
          row: i + 1,
          message: "No school assigned",
        });
        continue;
      }

      try {
        await db.insert(students).values({
          orgId,
          schoolId: row.schoolId,
          firstName: row.firstName,
          lastName: row.lastName,
          studentNumber: row.studentNumber || null,
          grade: row.grade || null,
          rfidTagId: row.rfidTagId || null,
          address: row.address || null,
          city: row.city || null,
          state: row.state || null,
          zip: row.zip || null,
          medicalNotes: row.medicalNotes || null,
          status: row.status,
        });
        imported++;
      } catch (err) {
        errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : "Insert failed",
        });
      }
    }

    return NextResponse.json({ imported, errors });
  } catch (error) {
    console.error("POST /api/students/import error:", error);
    return NextResponse.json(
      { error: "Failed to import students." },
      { status: 500 }
    );
  }
}
