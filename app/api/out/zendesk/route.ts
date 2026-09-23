/* Called by jobRUN: mirror every message and stage change as Zendesk ticket comments/tags. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: post to Zendesk with ZENDESK_TOKEN using jobs.zendesk_ticket; require an operator session or internal secret.
  return notImplemented("/api/out/zendesk", req, "Zendesk mirror");
}
