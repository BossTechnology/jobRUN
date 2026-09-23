/* Job Tracker (TracWork): arrive / start / evidence / end → tracker, evidence; moves scheduled → in_progress → complete. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: PINCH to confirm how TracWork exposes events (open question 10.1). Upsert tracker, insert evidence, advance jobs.stage and write job_events.
  return notImplemented("/api/in/tracwork", req, "TracWork event handler");
}
