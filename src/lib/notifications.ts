import { getDb } from "@/db";
import { guardians, studentGuardians, smsMessages, students } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sendSms, formatPhoneNumber } from "./twilio";

interface NotifyGuardiansParams {
  studentId: string;
  tripId: string;
  messageType: "eta" | "board" | "exit" | "alert";
  messageBody: string;
}

export async function notifyGuardians({ studentId, tripId, messageType, messageBody }: NotifyGuardiansParams) {
  const db = await getDb();

  // Get student info
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.id, studentId))
    .limit(1);

  if (!student) return;

  // Get guardians who opted in to SMS
  const guardianLinks = await db
    .select({ guardian: guardians })
    .from(studentGuardians)
    .innerJoin(guardians, eq(studentGuardians.guardianId, guardians.id))
    .where(
      and(
        eq(studentGuardians.studentId, studentId),
        eq(guardians.smsOptIn, true)
      )
    );

  for (const { guardian } of guardianLinks) {
    const personalizedMessage = messageBody
      .replace("{student_name}", `${student.firstName} ${student.lastName}`)
      .replace("{guardian_name}", `${guardian.firstName}`);

    try {
      const result = await sendSms({
        to: formatPhoneNumber(guardian.phone),
        body: personalizedMessage,
      });

      await db.insert(smsMessages).values({
        guardianId: guardian.id,
        tripId,
        studentId,
        messageType,
        messageBody: personalizedMessage,
        twilioSid: result.sid,
        status: result.error_code ? "failed" : "queued",
        sentAt: new Date(),
      });
    } catch {
      await db.insert(smsMessages).values({
        guardianId: guardian.id,
        tripId,
        studentId,
        messageType,
        messageBody: personalizedMessage,
        status: "failed",
        sentAt: new Date(),
      });
    }
  }
}

export function boardMessage(studentName: string): string {
  return `RouteGuard: ${studentName} has boarded the school bus.`;
}

export function exitMessage(studentName: string): string {
  return `RouteGuard: ${studentName} has exited the school bus.`;
}

export function etaMessage(studentName: string, minutes: number): string {
  return `RouteGuard: The school bus carrying ${studentName} is approximately ${minutes} minutes away.`;
}

export function alertMessage(message: string): string {
  return `RouteGuard Alert: ${message}`;
}
