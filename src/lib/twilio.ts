const TWILIO_API = "https://api.twilio.com/2010-04-01";

interface SendSmsParams {
  to: string;
  body: string;
}

interface TwilioResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

export async function sendSms({ to, body }: SendSmsParams): Promise<TwilioResponse> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromNumber = process.env.TWILIO_FROM_NUMBER!;

  const url = `${TWILIO_API}/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const params = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: body,
    StatusCallback: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/twilio/status`,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  return response.json() as Promise<TwilioResponse>;
}

export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
