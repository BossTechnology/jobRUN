/* Twilio inbound SMS / call log → messages (direction in) or a new job. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: validate X-Twilio-Signature with TWILIO_AUTH_TOKEN, match the phone to a contact/job, insert messages.
  return notImplemented("/api/in/twilio", req, "Twilio inbound handler");
}
