/* POST /api/board/sync — persists a board change made by the signed-in operator (INTEGRATION.md §4:
   recordAction, sendMessage storage, stage transitions). The client sends the job as it now stands plus what
   was appended since the last sync; RLS (private.is_operator()) scopes every write. Zendesk is mirrored when
   configured. Outbound delivery (Gmail / TrueDialog) is not wired yet: messages are stored and mirrored only. */
import { z } from "zod";
import { currentOperator, jobColumns } from "@/lib/adapters/supabase";
import { SERVICE_KEYS, STAGES, type Job } from "@/lib/domain/types";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { zendeskComment } from "@/lib/integrations/zendesk";
import { createClient } from "@/lib/supabase/server";

const Msg = z.object({ dir: z.enum(["in", "out", "note"]), ch: z.enum(["email", "sms", "note"]), who: z.string().max(200), text: z.string().max(10000), t: z.number() });
const Body = z.object({
  job: z.custom<Job>((v) => !!v && typeof v === "object" && typeof (v as Job).id === "string"),
  prev: z.object({ stage: z.number(), owner: z.string().nullable(), teamAsked: z.boolean(), unread: z.boolean().optional() }),
  newMessages: z.array(Msg).max(50).default([]),
  newActions: z.array(z.object({ t: z.number(), who: z.string(), key: z.string(), label: z.string(), reason: z.string().max(4000) })).max(20).default([]),
  newAddons: z.array(z.object({ k: z.string(), label: z.string(), price: z.number(), pay: z.number(), by: z.string(), t: z.number(), note: z.string() })).max(20).default([]),
  cancelled: z.object({ reason: z.string().max(4000) }).optional(),
  teamIds: z.array(z.string()).max(1000),
});

const STAGE = STAGES;
const iso = (t: number) => new Date(t).toISOString();

export async function POST(req: Request) {
  const sb = await createClient();
  const me = await currentOperator(sb);
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 400 });
  const { job, prev, newMessages, newActions, newAddons, cancelled, teamIds } = parsed.data;
  const id = Number(job.id.replace(/^J/, ""));
  if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const { data: ops } = await sb.from("operators").select("id,name");
  const opId = (name: string | null) => (name ? ops?.find((o) => o.name === name)?.id ?? null : null);
  const teamId = (i: number | null) => (i == null ? null : teamIds[i] ?? null);

  const cols: TablesUpdate<"jobs"> = jobColumns(job, { opId, teamId });
  if (job.teamAsked && !prev.teamAsked) cols.team_asked_at = iso(Date.now());
  if (!job.teamAsked) cols.team_asked_at = null;
  if (cancelled) Object.assign(cols, { cancelled_at: iso(Date.now()), cancel_reason: cancelled.reason });
  const { data: row, error } = await sb.from("jobs").update(cols).eq("id", id).select("id,zendesk_ticket").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const writes: PromiseLike<{ error: unknown }>[] = [];
  if (newMessages.length)
    writes.push(sb.from("messages").insert(newMessages.map((m) => ({
      job_id: id, at: iso(m.t), channel: m.ch, direction: m.dir === "in" ? "in" : "out", from_name: m.who, body: m.text,
    }))));
  if (prev.unread && !job.unread)
    writes.push(sb.from("messages").update({ read_at: iso(Date.now()) }).eq("job_id", id).eq("direction", "in").is("read_at", null));
  if (newActions.length)
    writes.push(sb.from("job_actions").insert(newActions.map((a) => ({ job_id: id, at: iso(a.t), by_name: a.who, action: a.key, reason: a.reason, payload: { label: a.label } }))));
  if (newAddons.length)
    writes.push(sb.from("job_addons").insert(newAddons.map((a) => ({ job_id: id, at: iso(a.t), by_name: a.by, addon: a.k, price: a.price, cleaner_pay: a.pay, note: a.note }))));
  const events: TablesInsert<"job_events">[] = [];
  if (prev.stage !== job.stage) events.push({ job_id: id, actor_type: "human", actor: me.name, from_stage: STAGE[prev.stage], to_stage: STAGE[job.stage], kind: "stage" });
  if (prev.owner !== job.owner) events.push({ job_id: id, actor_type: "human", actor: me.name, kind: "assign", detail: { from: prev.owner, to: job.owner } });
  if (cancelled) events.push({ job_id: id, actor_type: "human", actor: me.name, kind: "cancel", detail: { reason: cancelled.reason } });
  if (events.length) writes.push(sb.from("job_events").insert(events));
  const results = await Promise.all(writes);
  const failed = results.find((r) => r.error);
  if (failed) return Response.json({ error: String((failed.error as { message?: string }).message ?? failed.error) }, { status: 500 });

  // Mirror to Zendesk (best effort; the board is the source of truth for the flow).
  const lines = [
    ...newMessages.map((m) => `${m.ch === "note" ? "Note" : m.ch.toUpperCase()} · ${m.who}: ${m.text}`),
    ...newActions.map((a) => `${a.label}: ${a.reason}`),
    ...(prev.stage !== job.stage ? [`Stage: ${STAGE[prev.stage]} → ${STAGE[job.stage]} (${me.name})`] : []),
  ];
  if (lines.length && row.zendesk_ticket)
    await zendeskComment(row.zendesk_ticket, lines.join("\n"), [`jobrun_${STAGE[job.stage]}`, `svc_${SERVICE_KEYS[job.svc]}`]).catch((e) => console.error("zendesk mirror failed", e));

  return Response.json({ ok: true });
}
