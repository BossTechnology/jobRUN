/* Twilio inbound SMS webhook (INTEGRATION.md §8). Verifies X-Twilio-Signature with TWILIO_AUTH_TOKEN, then
   attaches the text to the sender's open job or opens a new Pending job (lib/integrations/inbound.ts).
   Configure the number's "A message comes in" webhook as POST https://<domain>/api/in/twilio. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleInboundSms } from "@/lib/integrations/inbound";

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return Response.json({ error: "twilio not configured" }, { status: 501 });
  const params = Object.fromEntries(new URLSearchParams(await req.text()));

  // Signature: base64(HMAC-SHA1(token, publicUrl + concat(sorted key+value))).
  const url = new URL(req.url);
  const publicUrl = `${req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")}://${req.headers.get("x-forwarded-host") ?? req.headers.get("host")}${url.pathname}${url.search}`;
  const data = publicUrl + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest();
  const given = Buffer.from(req.headers.get("x-twilio-signature") ?? "", "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("invalid signature", { status: 403 });

  if (params.From && params.Body) await handleInboundSms({ from: params.From, body: params.Body, channel: "twilio", externalId: params.MessageSid });
  return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
}
