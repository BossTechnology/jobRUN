/* Production adapter against Supabase (INTEGRATION.md §4): loads the world (customers, teams, properties) and
   the open jobs with threads, tracker times and evidence counts, mapped onto the board's shapes.
   Reads use the operator's session, so RLS (private.is_operator()) applies. */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROPERTY_TYPES, SERVICE_KEYS, stageIndex, type Customer, type Job, type Prop, type PropertyTypeCode, type Stage, type LiveBoard, type Operator, type Team, type ThreadMsg } from "@/lib/domain/types";
import { etToEpoch } from "@/lib/domain/time";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped until `supabase gen types`
type SB = Awaited<ReturnType<typeof createClient>>;

const TYPE_CODE = Object.fromEntries(Object.entries(PROPERTY_TYPES).map(([k, v]) => [v, k])) as Record<string, PropertyTypeCode>;
const ts = (v: string | null) => (v ? Date.parse(v) : null);


/* PostgREST caps responses at 1000 rows; page through. */
async function all(sb: SB, table: string, select: string, filter?: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw error;
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

export interface MapCtx {
  opName: Map<string, string>;
  teamIdx: Map<string, number>;
  threads: Map<string, ThreadMsg[]>;
  unread: Set<string>;
  tracker: Map<string, Row>;
  evidence: Map<string, number>;
}

/** One jobs row → board Job. Window columns are ET wall-clock without zone. */
export function mapJob(j: Row, c: MapCtx): Job {
  const key = String(j.id), t = c.tracker.get(key);
  const date = j.window_date ?? "", start = j.window_start?.slice(0, 5) ?? "", end = j.window_end?.slice(0, 5) ?? "";
  return {
    id: "J" + j.id, stage: stageIndex(j.stage as Stage), prop: j.property_id ?? "", cust: j.customer_id ?? "", unit: j.unit ?? "",
    svc: Math.max(0, SERVICE_KEYS.indexOf(j.service)), stageAt: ts(j.stage_at)!, createdAt: ts(j.created_at)!,
    owner: j.owner_id ? c.opName.get(j.owner_id) ?? null : null, assignedAt: ts(j.assigned_at),
    senderOk: !!j.sender_confirmed, senderBy: j.sender_confirmed_by, propKnown: !!j.property_id,
    team: j.team_id ? c.teamIdx.get(j.team_id) ?? null : null, teamOk: !!j.team_confirmed, teamAsked: !!j.team_asked_at,
    dateAt: date && start ? etToEpoch(date, start) : null, dateEnd: date && end ? etToEpoch(date, end) : null,
    f: { date, time: start, time2: end, notes: j.access_notes ?? "" },
    fsrc: j.field_sources ?? {}, checkin: !!t?.arrived_at, evidence: c.evidence.get(key) ?? 0,
    paid: !!j.paid, paidAt: ts(j.paid_at), zd: j.zendesk_ticket ?? "", wa: j.workapp_id, po: j.po_status === "missing" ? "missing" : "ok",
    rating: j.rating_pinch ?? 0, pdfSent: !!j.evidence_pdf_sent, thread: c.threads.get(key) ?? [], unread: c.unread.has(key),
    flag: !!j.flagged, qp: !!j.quick_pay, delayed: !!j.delayed, checkinOffset: null,
    tArrive: ts(t?.arrived_at) ?? undefined, tEnd: ts(t?.ended_at) ?? undefined, cnote: t?.cleaner_notes ?? undefined,
    req: j.request_subject || j.request_body
      ? { k: "known", prop: "", unit: j.unit ?? "", from: j.request_from ?? "", name: j.request_name ?? "", ch: j.request_channel ?? "Gmail", subj: j.request_subject ?? "", body: { en: j.request_body ?? "", es: j.request_body ?? "" }, conf: j.ai_confidence ?? 0, svc: 0 }
      : null,
  };
}

/** Board Job → jobs columns (used by /api/board/sync). */
export function jobColumns(j: Job, ids: { opId: (name: string | null) => string | null; teamId: (i: number | null) => string | null }) {
  return {
    stage: ["pending", "scheduled", "in_progress", "complete", "validation"][j.stage],
    stage_at: new Date(j.stageAt).toISOString(),
    property_id: j.propKnown ? j.prop : null,
    customer_id: j.cust || null,
    unit: j.unit || null,
    service: SERVICE_KEYS[j.svc],
    owner_id: ids.opId(j.owner),
    assigned_at: j.assignedAt ? new Date(j.assignedAt).toISOString() : null,
    sender_confirmed: j.senderOk,
    sender_confirmed_by: j.senderBy,
    team_id: ids.teamId(j.team),
    team_confirmed: j.teamOk,
    window_date: j.f.date || null,
    window_start: j.f.time || null,
    window_end: j.f.time2 || null,
    access_notes: j.f.notes || null,
    quick_pay: j.qp,
    flagged: j.flag,
    delayed: !!j.delayed,
    paid: j.paid,
    paid_at: j.paidAt ? new Date(j.paidAt).toISOString() : null,
    rating_pinch: j.rating || null,
    evidence_pdf_sent: j.pdfSent,
    workapp_id: j.wa,
    field_sources: j.fsrc,
  };
}

/** Everything mapJob needs, loaded once per request. */
async function mapContext(sb: SB, jobIds: number[] | null) {
  const inJobs = (q: any) => (jobIds ? q.in("job_id", jobIds) : q); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [opRows, teamRows, msgRows, trkRows, evRows] = await Promise.all([
    all(sb, "operators", "id,name,email,user_id,active"),
    // Ordered: the board refers to teams by position (World.teams / LiveBoard.teamIds).
    all(sb, "cleaning_teams", "id,name,phone", (q) => q.order("name").order("id")),
    all(sb, "messages", "job_id,at,channel,direction,from_name,body,read_at", (q) => inJobs(q).order("at")),
    all(sb, "tracker", "job_id,arrived_at,ended_at,cleaner_notes", inJobs),
    all(sb, "evidence", "job_id", inJobs),
  ]);
  const threads = new Map<string, ThreadMsg[]>(), unread = new Set<string>();
  for (const m of msgRows) {
    const k = String(m.job_id);
    if (m.direction === "in" && !m.read_at) unread.add(k);
    const list = threads.get(k) ?? [];
    list.push({ dir: m.channel === "note" ? "note" : m.direction, ch: m.channel === "auto" ? "sms" : m.channel, who: m.from_name ?? "", text: m.body ?? "", t: Date.parse(m.at) });
    threads.set(k, list);
  }
  const evidence = new Map<string, number>();
  evRows.forEach((e) => evidence.set(String(e.job_id), (evidence.get(String(e.job_id)) ?? 0) + 1));
  const ctx: MapCtx = {
    opName: new Map(opRows.map((o) => [o.id, o.name])),
    teamIdx: new Map(teamRows.map((t, i) => [t.id, i])),
    threads, unread, evidence,
    tracker: new Map(trkRows.map((t) => [String(t.job_id), t])),
  };
  return { ctx, opRows, teamRows };
}

/** Resolves the signed-in operator from the session; null when the user is not an active operator. */
export async function currentOperator(sb: SB): Promise<Operator | null> {
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: ops, error } = await sb.from("operators").select("id,name,email,user_id,active").eq("active", true);
  if (error || !ops) return null;
  const email = String(claims.email ?? "").toLowerCase();
  const op = ops.find((o) => o.user_id === claims.sub) ?? ops.find((o) => !o.user_id && o.email?.toLowerCase() === email);
  return op ? { id: op.id, name: op.name, email: op.email } : null;
}

export type { LiveBoard, Operator };

export async function loadBoard(): Promise<LiveBoard | null> {
  const sb = await createClient();
  const me = await currentOperator(sb);
  if (!me) return null;
  const [custRows, contactRows, propRows, jobRows] = await Promise.all([
    all(sb, "customers", "id,name,email_domain"),
    all(sb, "contacts", "customer_id,full_name,active"),
    all(sb, "properties", "*"),
    all(sb, "jobs", "*", (q) => q.is("cancelled_at", null)),
  ]);
  const { ctx, opRows, teamRows } = await mapContext(sb, null);

  const customers: Customer[] = custRows.map((c) => ({
    id: c.id, n: c.name, dom: c.email_domain ?? "",
    contacts: contactRows.filter((x) => x.customer_id === c.id && x.active).map((x) => x.full_name),
  }));
  const teams: Team[] = teamRows.map((t) => [t.name, t.phone ?? ""]);
  const custName = new Map(customers.map((c) => [c.id, c.n]));
  const props: Prop[] = propRows.map((p) => ({
    id: p.id, n: p.name, cust: p.customer_id, custName: custName.get(p.customer_id) ?? "", type: TYPE_CODE[p.type] ?? "mf",
    street: p.address1 ?? "", city: p.city ?? "", st: p.state ?? "", zip: p.postal_code ?? "", lat: p.lat ?? 0, lng: p.lng ?? 0,
    units: p.units_count ?? 0, cleaners: p.cleaners_count ?? 0, mgr: p.manager_name ?? "Property manager", phone: p.manager_phone ?? "",
    email: p.manager_email ?? "", code: `${p.state ?? ""}-${String(p.id).slice(0, 4)}`, beds: 0,
    team: p.default_team_id ? ctx.teamIdx.get(p.default_team_id) ?? 0 : 0,
  }));
  const { data: recentEvents } = await sb.from("job_events").select("job_id,at,kind,actor_type")
    .gte("at", new Date(Date.now() - 6 * 3600000).toISOString()).order("at", { ascending: false }).limit(500);
  return {
    recentEvents: recentEvents ?? [],
    world: { customers, teams, props },
    jobs: jobRows.map((j) => mapJob(j, ctx)),
    operators: opRows.filter((o) => o.active).map((o) => ({ id: o.id, name: o.name, email: o.email })),
    teamIds: teamRows.map((t) => t.id),
    me,
  };
}

/** A single job, freshly read — used after Realtime changes. */
export async function loadJob(id: number): Promise<Job | null> {
  const sb = await createClient();
  const { data: row, error } = await sb.from("jobs").select("*").eq("id", id).is("cancelled_at", null).maybeSingle();
  if (error || !row) return null;
  const { ctx } = await mapContext(sb, [id]);
  return mapJob(row, ctx);
}

