/* Gmail push (Pub/Sub) on PINCH's shared inbox → new job in pending + messages (INTEGRATION.md §8). */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: verify the Pub/Sub push JWT, fetch the message via Gmail history API, extract sender/fields with AI (ai_confidence, field_sources), insert jobs + messages + job_events with the service-role client.
  return notImplemented("/api/in/gmail", req, "Gmail push handler");
}
