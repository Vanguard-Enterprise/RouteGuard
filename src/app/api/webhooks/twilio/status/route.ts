import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { smsMessages } from "@/db/schema";
import { eq } from "drizzle-orm";

// Twilio status values mapped to our schema enum
const STATUS_MAP: Record<string, "queued" | "sent" | "delivered" | "failed"> = {
  queued: "queued",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
};

export async function POST(request: NextRequest) {
  try {
    // Twilio sends form-encoded webhooks
    const formData = await request.formData();

    const messageSid = formData.get("MessageSid") as string | null;
    const messageStatus = formData.get("MessageStatus") as string | null;

    if (!messageSid || !messageStatus) {
      return NextResponse.json(
        { error: "Missing MessageSid or MessageStatus" },
        { status: 400 }
      );
    }

    const mappedStatus = STATUS_MAP[messageStatus.toLowerCase()];
    if (!mappedStatus) {
      // Unknown status - acknowledge but don't update
      return new NextResponse(null, { status: 200 });
    }

    const db = await getDb();

    await db
      .update(smsMessages)
      .set({
        status: mappedStatus,
        ...(mappedStatus === "sent" || mappedStatus === "delivered"
          ? { sentAt: new Date() }
          : {}),
      })
      .where(eq(smsMessages.twilioSid, messageSid));

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("Twilio status webhook error:", error);
    // Return 200 to prevent Twilio from retrying
    return new NextResponse(null, { status: 200 });
  }
}
