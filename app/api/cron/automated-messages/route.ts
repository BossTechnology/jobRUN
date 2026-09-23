/* Minute cron (vercel.json, needs Vercel Pro): automated texts to cleaning teams (INTEGRATION.md §8).
   - 1-hour confirmation: scheduled jobs starting within the hour.
   - Check-in nudge: scheduled jobs 5+ minutes past their start with no Job Tracker arrival.
   Each is sent once (tracked in job_events), logged in the thread as an automatic message, and delivered
   through lib/integrations/sms.ts when a provider is configured. */
import { CONFIG } from "@/lib/config";
import { epochToET, etToEpoch } from "@/lib/domain/time";
import { sendSms } from "@/lib/integrations/sms";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const fmt = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CONFIG.BUSINESS_TZ });

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  if (CONFIG.SIMULATE) return Response.json({ ok: true, skipped: "simulation" });

  const sb = createAdminClient(), now = Date.now();
  const [today] = epochToET(now), [yesterday] = epochToET(now - 864e5), [tomorrow] = epochToET(now + 864e5);
  const { data: jobs, error } = await sb.from("jobs")
    .select("id,unit,window_date,window_start,team_id,properties(name),cleaning_teams(name,phone),tracker(arrived_at)")
    .eq("stage", "scheduled").is("cancelled_at", null).gte("window_date", yesterday).lte("window_date", tomorrow);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return Response.json({ ok: true, today, sent: 0 });

  const { data: done } = await sb.from("job_events").select("job_id,kind").in("job_id", jobs.map((j) => j.id)).in("kind", ["auto_confirm", "auto_nudge"]);
  const sentAlready = new Set((done ?? []).map((e) => `${e.job_id}:${e.kind}`));
  const out: { job: number; kind: string; delivered: boolean }[] = [];

  for (const j of jobs) {
    if (!j.window_date || !j.window_start) continue;
    const start = etToEpoch(j.window_date, String(j.window_start).slice(0, 5));
    const prop = (j.properties as unknown as { name: string } | null)?.name ?? "the property";
    const team = j.cleaning_teams as unknown as { name: string; phone: string | null } | null;
    const arrived = (j.tracker as unknown as { arrived_at: string | null }[] | { arrived_at: string | null } | null);
    const hasArrival = Array.isArray(arrived) ? arrived.some((t) => t.arrived_at) : !!arrived?.arrived_at;
    const place = `${prop}${j.unit ? " " + j.unit : ""}`;

    let kind: "auto_confirm" | "auto_nudge" | null = null, body = "";
    if (now >= start - 3600000 && now < start && !sentAlready.has(`${j.id}:auto_confirm`)) {
      kind = "auto_confirm";
      body = `Reminder: ${place} today at ${fmt(start)}. Reply YES to confirm. — PINCH`;
    } else if (now >= start + 300000 && !hasArrival && !sentAlready.has(`${j.id}:auto_nudge`)) {
      kind = "auto_nudge";
      body = `Are you on the way to ${place}? Please check in on TracWork when you arrive. — PINCH`;
    }
    if (!kind) continue;

    const res = team?.phone ? await sendSms(team.phone, body) : { sent: false, provider: "none" as const };
    await sb.from("messages").insert({ job_id: j.id, channel: "auto", direction: "out", from_name: "jobRUN", from_addr: res.provider, body, external_id: "id" in res ? res.id ?? null : null });
    await sb.from("job_events").insert({ job_id: j.id, actor_type: "rule", actor: "cron", kind, detail: { delivered: res.sent, provider: res.provider, error: "error" in res ? res.error : undefined } });
    out.push({ job: j.id, kind, delivered: res.sent });
  }
  return Response.json({ ok: true, today, sent: out.length, out });
}
