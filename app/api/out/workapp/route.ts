/* Called by jobRUN: create/update the job record in PINCH's Work App. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: PINCH to confirm the Work App API and required fields (open question 10.1). Store the returned id in jobs.workapp_id.
  return notImplemented("/api/out/workapp", req, "Work App sync");
}
