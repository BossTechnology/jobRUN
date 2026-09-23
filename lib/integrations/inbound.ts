/* Inbound text handling shared by the SMS webhooks (INTEGRATION.md §8): match the sender's number to a
   cleaning team or a customer contact, attach the message to their open job (or open a new Pending job for
   a customer), and mark the cleaner confirmed when they reply yes. Runs with the service role. */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const last10 = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10);
const YES = /\b(yes|yep|yeah|ok|okay|confirm(ed)?|s[ií]|confirmado)\b/i;
const OPEN = ["pending", "scheduled", "in_progress"] as const;

export interface InboundSms {
  from: string;
  body: string;
  channel: "twilio" | "truedialog";
  externalId?: string;
}

export async function handleInboundSms(msg: InboundSms) {
  const sb = createAdminClient();
  const phone = last10(msg.from);
  if (phone.length < 10) return { ok: false as const, reason: "bad number" };
  const now = new Date().toISOString();

  // 1) A cleaning team replying about a job.
  const { data: teams } = await sb.from("cleaning_teams").select("id,name,phone");
  const team = teams?.find((t) => last10(t.phone) === phone);
  if (team) {
    const { data: job } = await sb.from("jobs").select("id,stage,team_confirmed")
      .eq("team_id", team.id).in("stage", OPEN).is("cancelled_at", null)
      .order("window_date", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
    if (!job) return { ok: true as const, matched: "team", job: null };
    await sb.from("messages").insert({ job_id: job.id, at: now, channel: "sms", direction: "in", from_name: team.name, from_addr: msg.from, body: msg.body, external_id: msg.externalId ?? null });
    if (!job.team_confirmed && (job.stage === "pending" || job.stage === "scheduled") && YES.test(msg.body)) {
      await sb.from("jobs").update({ team_confirmed: true }).eq("id", job.id);
      await sb.from("job_events").insert({ job_id: job.id, actor_type: "system", actor: msg.channel, kind: "field", detail: { team_confirmed: true, via: "sms reply" } });
    }
    return { ok: true as const, matched: "team", job: job.id };
  }

  // 2) A customer contact: attach to their latest open job, or open a new Pending job.
  const { data: contacts } = await sb.from("contacts").select("id,customer_id,full_name,phone").not("phone", "is", null);
  const contact = contacts?.find((c) => last10(c.phone) === phone);
  if (contact) {
    const { data: job } = await sb.from("jobs").select("id")
      .or(`contact_id.eq.${contact.id},customer_id.eq.${contact.customer_id}`).in("stage", OPEN).is("cancelled_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (job) {
      await sb.from("messages").insert({ job_id: job.id, at: now, channel: "sms", direction: "in", from_name: contact.full_name, from_addr: msg.from, body: msg.body, external_id: msg.externalId ?? null });
      return { ok: true as const, matched: "contact", job: job.id };
    }
  }

  // 3) New request (known contact without an open job, or an unknown number).
  const { data: created, error } = await sb.from("jobs").insert({
    stage: "pending", customer_id: contact?.customer_id ?? null, contact_id: contact?.id ?? null,
    request_channel: msg.channel === "twilio" ? "Twilio" : "TrueDialog", request_subject: "Text message", request_body: msg.body,
    request_from: msg.from, request_name: contact?.full_name ?? null, sender_confirmed: false,
  }).select("id").single();
  if (error) throw error;
  await sb.from("job_events").insert({ job_id: created.id, actor_type: "system", actor: msg.channel, to_stage: "pending", kind: "stage", detail: { source: "inbound sms" } });
  return { ok: true as const, matched: contact ? "contact" : "unknown", job: created.id, created: true };
}
