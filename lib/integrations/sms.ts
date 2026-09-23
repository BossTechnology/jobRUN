/* Outbound SMS to cleaning teams. PINCH texts cleaners through TrueDialog; until its API details are confirmed
   (open question 10.1) this sends through Twilio's standard Messages API when TWILIO_ACCOUNT_SID,
   TWILIO_AUTH_TOKEN and TWILIO_FROM are set, and otherwise records the text without sending it. */
import "server-only";

export type SmsResult = { sent: boolean; provider: "twilio" | "none"; id?: string; error?: string };

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  const digits = to.replace(/\D/g, "");
  if (!sid || !token || !from || digits.length < 10) return { sent: false, provider: "none" };
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, From: from, Body: body }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { sent: true, provider: "twilio", id: data.sid } : { sent: false, provider: "twilio", error: data.message ?? String(res.status) };
}
