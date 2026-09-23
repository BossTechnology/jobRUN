/* TrueDialog inbound (cleaner replies) → messages; sets jobs.team_confirmed on a confirmation. */
import { notImplemented } from "@/lib/http/pending";

export async function POST(req: Request) {
  // TODO: authenticate with TRUEDIALOG_KEY, match the cleaner's number to the open job, insert messages, set team_confirmed on 'confirmed'.
  return notImplemented("/api/in/truedialog", req, "TrueDialog inbound handler");
}
