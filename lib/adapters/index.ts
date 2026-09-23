/* Adapter switch (INTEGRATION.md §4). With CONFIG.SIMULATE the browser generates the board itself
   (lib/sim), exactly like the prototype; otherwise the server loads it from Supabase.

   Still to implement, per INTEGRATION.md §4:
   - subscribeJobs(cb)            → Supabase Realtime on jobs, messages, job_events (client side)
   - sendMessage(job, ch, text)   → /api/out/* : Gmail send · TrueDialog SMS · Zendesk mirror
   - recordAction(job, action, reason) → job_actions + job_events + Zendesk comment
   - writeWorkApp(job)            → /api/out/workapp
   - loadTraffic(bounds)          → TomTom flow tiles (map layer)
   - loadWeather(states)          → OpenWeather per state centroid, 10-min cache */
import "server-only";
import { CONFIG } from "@/lib/config";

export async function loadBoard() {
  if (CONFIG.SIMULATE) return null;
  return (await import("./supabase")).loadBoard();
}
