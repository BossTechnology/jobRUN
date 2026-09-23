/* Minute cron (vercel.json): 1-hour confirmation text and 5-minute check-in nudge via TrueDialog (INTEGRATION.md §8).
   Every-minute schedules need a Vercel Pro plan; Hobby only runs crons once a day. */
import { CONFIG } from "@/lib/config";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (CONFIG.SIMULATE) return Response.json({ ok: true, skipped: "simulation" });

  // TODO once TrueDialog is wired:
  //  1. scheduled jobs starting within the hour with team_confirmed = false and no confirmation text yet → send confirmation.
  //  2. scheduled jobs 5+ min past window_start with no tracker.arrived_at and no nudge yet → send check-in nudge.
  //  Log each send in messages (channel 'auto') so it shows in the thread and is not re-sent next minute.
  return Response.json({ ok: true, sent: 0 });
}
