/* Adapter switch (INTEGRATION.md §4). Each adapter returns the same shape as the simulation;
   flip CONFIG.SIMULATE (NEXT_PUBLIC_SIMULATE=false) once Supabase is loaded.

   Still to implement, per INTEGRATION.md §4:
   - subscribeJobs(cb)            → Supabase Realtime on jobs, messages, job_events (client side)
   - sendMessage(job, ch, text)   → /api/out/* : Gmail send · TrueDialog SMS · Zendesk mirror
   - recordAction(job, action, reason) → job_actions + job_events + Zendesk comment
   - writeWorkApp(job)            → /api/out/workapp
   - loadTraffic(bounds)          → TomTom flow tiles (map layer, no adapter call needed)
   - loadWeather(states)          → OpenWeather per state centroid, 10-min cache */
import "server-only";
import { CONFIG } from "@/lib/config";
import * as sim from "./simulated";

export async function loadProperties() {
  if (CONFIG.SIMULATE) return sim.loadProperties();
  return (await import("./supabase")).loadProperties();
}

export async function loadJobs() {
  if (CONFIG.SIMULATE) return sim.loadJobs();
  return (await import("./supabase")).loadJobs();
}
