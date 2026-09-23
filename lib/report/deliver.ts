/* Evidence PDF on validation (INTEGRATION.md §10): render the job report, store it in the private "reports"
   bucket, and email it to the property manager when RESEND_API_KEY and REPORT_FROM are set. */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { etToEpoch } from "@/lib/domain/time";
import { PROPERTY_TYPES, SERVICE_KEYS, stageIndex, type Job, type Prop, type PropertyTypeCode, type Team } from "@/lib/domain/types";
import { htmlToPdf } from "./pdf";
import { reportHtml } from "./template";

const TYPE_CODE = Object.fromEntries(Object.entries(PROPERTY_TYPES).map(([k, v]) => [v, k])) as Record<string, PropertyTypeCode>;
const ts = (v: string | null | undefined) => (v ? Date.parse(v) : null);

/** Everything the template needs for one job, read with the service role. */
async function reportInput(jobId: number) {
  const sb = createAdminClient();
  const { data: j } = await sb.from("jobs").select("*, properties(*), customers(name), cleaning_teams(name,phone), operators(name), tracker(*), evidence(kind,url)").eq("id", jobId).maybeSingle();
  if (!j || !j.properties) return null;
  const p = j.properties as unknown as Record<string, never>;
  const prop: Prop = {
    id: p.id, n: p.name, cust: p.customer_id, custName: "", type: TYPE_CODE[p.type] ?? "mf", street: p.address1 ?? "", city: p.city ?? "", st: p.state ?? "", zip: p.postal_code ?? "",
    lat: p.lat ?? 0, lng: p.lng ?? 0, units: p.units_count ?? 0, cleaners: p.cleaners_count ?? 0, mgr: p.manager_name ?? "", phone: p.manager_phone ?? "", email: p.manager_email ?? "",
    code: `${p.state ?? ""}-${String(p.id).slice(0, 4)}`, beds: 0, team: 0,
  };
  const t = (Array.isArray(j.tracker) ? j.tracker[0] : j.tracker) as { arrived_at?: string; ended_at?: string; cleaner_notes?: string } | null;
  const ev = (j.evidence ?? []) as { kind: string; url: string }[];
  const date = j.window_date ?? "", start = j.window_start?.slice(0, 5) ?? "", end = j.window_end?.slice(0, 5) ?? "";
  const job: Job = {
    id: "J" + j.id, stage: stageIndex(j.stage), prop: prop.id, cust: j.customer_id ?? "", unit: j.unit ?? "", svc: Math.max(0, SERVICE_KEYS.indexOf(j.service as never)),
    stageAt: ts(j.stage_at)!, createdAt: ts(j.created_at)!, owner: (j.operators as { name: string } | null)?.name ?? null, assignedAt: ts(j.assigned_at),
    senderOk: !!j.sender_confirmed, senderBy: null, propKnown: true, team: 0, teamOk: !!j.team_confirmed, teamAsked: !!j.team_asked_at,
    dateAt: date && start ? etToEpoch(date, start) : null, dateEnd: date && end ? etToEpoch(date, end) : null, f: { date, time: start, time2: end, notes: j.access_notes ?? "" },
    fsrc: {}, checkin: !!t?.arrived_at, evidence: ev.length, paid: !!j.paid, paidAt: ts(j.paid_at), zd: j.zendesk_ticket ?? "", wa: j.workapp_id, po: j.po_status === "missing" ? "missing" : "ok",
    rating: j.rating_pinch ?? 0, pdfSent: !!j.evidence_pdf_sent, thread: [], flag: !!j.flagged, qp: !!j.quick_pay, delayed: !!j.delayed, checkinOffset: null,
    tArrive: ts(t?.arrived_at) ?? undefined, tEnd: ts(t?.ended_at) ?? undefined, cnote: t?.cleaner_notes,
    contact: j.request_name ?? undefined, req: j.request_channel ? { k: "known", prop: prop.n, unit: j.unit ?? "", from: j.request_from ?? "", name: j.request_name ?? "", ch: j.request_channel, subj: j.request_subject ?? "", body: { en: "", es: "" }, conf: 0, svc: 0 } : null,
  };
  const teamRow = j.cleaning_teams as { name: string; phone: string | null } | null;
  const team: Team | null = teamRow ? [teamRow.name, teamRow.phone ?? ""] : null;
  return {
    input: { job, prop, custName: (j.customers as { name: string } | null)?.name ?? "", team, lang: "en" as const, photos: { before: ev.filter((e) => e.kind === "before").map((e) => e.url), after: ev.filter((e) => e.kind === "after").map((e) => e.url) } },
    managerEmail: prop.email,
  };
}

/** Renders and stores the PDF; returns the storage path. */
export async function storeReport(jobId: number) {
  const data = await reportInput(jobId);
  if (!data) throw new Error(`job ${jobId} not found or has no property`);
  const pdf = await htmlToPdf(reportHtml(data.input));
  const path = `jobs/${jobId}/report-${Date.now()}.pdf`;
  const { error } = await createAdminClient().storage.from("reports").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return { path, pdf, managerEmail: data.managerEmail, input: data.input };
}

/** On validation: store the report and, when email is configured, send it to the property manager. */
export async function deliverReport(jobId: number) {
  const { path, pdf, managerEmail, input } = await storeReport(jobId);
  const key = process.env.RESEND_API_KEY, from = process.env.REPORT_FROM;
  if (!key || !from || !managerEmail) return { path, emailed: false };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [managerEmail],
      subject: `Cleaning completed — ${input.prop.n} ${input.job.unit}`.trim(),
      html: `<p>The cleaning at <b>${input.prop.n} ${input.job.unit}</b> is complete. The report with before and after photos is attached.</p><p>— PINCH</p>`,
      attachments: [{ filename: `PINCH-${input.job.id.slice(1)}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  await createAdminClient().from("jobs").update({ evidence_pdf_sent: true }).eq("id", jobId);
  return { path, emailed: true };
}
