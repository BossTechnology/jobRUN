/* Production adapter against Supabase (INTEGRATION.md §4): loads the world (customers, teams, properties)
   and the jobs with their threads, mapped onto the board's shapes. Reads use the operator's session (RLS). */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROPERTY_TYPES, SERVICE_KEYS, stageIndex, type Customer, type Job, type Prop, type PropertyTypeCode, type Stage, type Team, type ThreadMsg, type World } from "@/lib/domain/types";

const TYPE_CODE = Object.fromEntries(Object.entries(PROPERTY_TYPES).map(([k, v]) => [v, k])) as Record<string, PropertyTypeCode>;
const ts = (v: string | null) => (v ? Date.parse(v) : null);

type SB = Awaited<ReturnType<typeof createClient>>;

/* PostgREST caps responses at 1000 rows; page through. */
async function all<T>(sb: SB, table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped until `supabase gen types`

export async function loadBoard(): Promise<{ world: World; jobs: Job[] }> {
  const sb = await createClient();
  const [custRows, contactRows, teamRows, propRows, opRows, jobRows, msgRows] = await Promise.all([
    all<Row>(sb, "customers", "id,name,email_domain"),
    all<Row>(sb, "contacts", "customer_id,full_name,active"),
    all<Row>(sb, "cleaning_teams", "id,name,phone"),
    all<Row>(sb, "properties", "*"),
    all<Row>(sb, "operators", "id,name"),
    // TODO: bound this to open jobs + recent validation once volume grows.
    all<Row>(sb, "jobs", "*"),
    all<Row>(sb, "messages", "job_id,at,channel,direction,from_name,body"),
  ]);

  const customers: Customer[] = custRows.map((c) => ({
    id: c.id,
    n: c.name,
    dom: c.email_domain ?? "",
    contacts: contactRows.filter((x) => x.customer_id === c.id && x.active).map((x) => x.full_name),
  }));
  const teams: Team[] = teamRows.map((t) => [t.name, t.phone ?? ""]);
  const teamIdx = new Map(teamRows.map((t, i) => [t.id as string, i]));
  const custName = new Map(customers.map((c) => [c.id, c.n]));
  const props: Prop[] = propRows.map((p) => ({
    id: p.id, n: p.name, cust: p.customer_id, custName: custName.get(p.customer_id) ?? "", type: TYPE_CODE[p.type] ?? "mf",
    street: p.address1 ?? "", city: p.city ?? "", st: p.state ?? "", zip: p.postal_code ?? "", lat: p.lat ?? 0, lng: p.lng ?? 0,
    units: p.units_count ?? 0, cleaners: p.cleaners_count ?? 0, mgr: p.manager_name ?? "Property manager", phone: p.manager_phone ?? "",
    email: p.manager_email ?? "", code: `${p.state ?? ""}-${String(p.id).slice(0, 4)}`, beds: 0,
    team: p.default_team_id ? teamIdx.get(p.default_team_id) ?? 0 : 0,
  }));
  const opName = new Map(opRows.map((o) => [o.id as string, o.name as string]));

  const threads = new Map<string, ThreadMsg[]>();
  for (const m of msgRows) {
    const list = threads.get(String(m.job_id)) ?? [];
    list.push({ dir: m.channel === "note" ? "note" : m.direction, ch: m.channel === "auto" ? "sms" : m.channel, who: m.from_name ?? "", text: m.body ?? "", t: Date.parse(m.at) });
    threads.set(String(m.job_id), list);
  }

  const jobs: Job[] = jobRows.map((j) => {
    const id = "J" + j.id;
    // TODO: window_date/start are stored without zone; interpret in BUSINESS_TZ (see etToEpoch).
    const dateAt = j.window_date && j.window_start ? Date.parse(`${j.window_date}T${j.window_start}-04:00`) : null;
    const dateEnd = j.window_date && j.window_end ? Date.parse(`${j.window_date}T${j.window_end}-04:00`) : null;
    return {
      id, stage: stageIndex(j.stage as Stage), prop: j.property_id, cust: j.customer_id, unit: j.unit ?? "",
      svc: Math.max(0, SERVICE_KEYS.indexOf(j.service)), stageAt: ts(j.stage_at)!, createdAt: ts(j.created_at)!,
      owner: j.owner_id ? opName.get(j.owner_id) ?? null : null, assignedAt: ts(j.assigned_at),
      senderOk: j.sender_confirmed, senderBy: j.sender_confirmed_by, propKnown: !!j.property_id,
      team: j.team_id ? teamIdx.get(j.team_id) ?? null : null, teamOk: j.team_confirmed, teamAsked: !!j.team_asked_at,
      dateAt, dateEnd,
      f: { date: j.window_date ?? "", time: j.window_start?.slice(0, 5) ?? "", time2: j.window_end?.slice(0, 5) ?? "", notes: j.access_notes ?? "" },
      fsrc: j.field_sources ?? {}, checkin: ["in_progress", "complete", "validation"].includes(j.stage),
      evidence: 0, // TODO: count from the evidence table once TracWork lands.
      paid: j.paid, paidAt: ts(j.paid_at), zd: j.zendesk_ticket ?? "", wa: j.workapp_id, po: j.po_status === "missing" ? "missing" : "ok",
      rating: j.rating_pinch ?? 0, pdfSent: j.evidence_pdf_sent, thread: threads.get(String(j.id)) ?? [],
      flag: j.flagged, qp: j.quick_pay, delayed: j.delayed, checkinOffset: null,
      req: j.request_subject
        ? { k: "known", prop: "", unit: j.unit ?? "", from: "", name: "", ch: j.request_channel ?? "Gmail", subj: j.request_subject, body: { en: j.request_body ?? "", es: j.request_body ?? "" }, conf: j.ai_confidence ?? 0, svc: 0 }
        : null,
    } satisfies Job;
  });
  return { world: { customers, teams, props }, jobs };
}
