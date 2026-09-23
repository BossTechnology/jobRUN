/* Production adapters against Supabase (INTEGRATION.md §4). Server-side reads use the operator's session. */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PROPERTY_TYPES, stageIndex, type Job, type Property, type PropertyTypeCode, type Stage } from "@/lib/domain/types";

const TYPE_CODE = Object.fromEntries(Object.entries(PROPERTY_TYPES).map(([k, v]) => [v, k])) as Record<string, PropertyTypeCode>;
const ts = (v: string | null) => (v ? Date.parse(v) : null);

export async function loadProperties(): Promise<Property[]> {
  const sb = await createClient();
  const out: Property[] = [];
  // PostgREST caps responses at 1000 rows; page through.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("properties")
      .select("id,name,customer_id,type,address1,city,state,postal_code,lat,lng,units_count,cleaners_count,manager_name,manager_phone,manager_email,customers(name)")
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    for (const p of data) {
      out.push({
        id: p.id,
        name: p.name,
        customerId: p.customer_id,
        customerName: (p.customers as unknown as { name: string } | null)?.name ?? null,
        type: TYPE_CODE[p.type ?? ""] ?? "mf",
        street: p.address1,
        city: p.city,
        state: p.state,
        zip: p.postal_code,
        lat: p.lat,
        lng: p.lng,
        units: p.units_count ?? 0,
        cleaners: p.cleaners_count ?? 0,
        manager: p.manager_name,
        phone: p.manager_phone,
        email: p.manager_email,
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadJobs(): Promise<Job[]> {
  const sb = await createClient();
  const [{ data: jobs, error }, { data: unanswered, error: uErr }] = await Promise.all([
    sb.from("jobs").select("*, operators(name)"),
    sb.from("jobs_unanswered").select("job_id, unanswered"),
  ]);
  if (error) throw error;
  if (uErr) throw uErr;
  const unread = new Set((unanswered ?? []).map((u) => String(u.job_id)));
  const svcIdx = ["turnover", "deep_clean", "post_construction", "common_areas", "guest_suite", "porter"];
  return (jobs ?? []).map((j) => {
    const dateAt = j.window_date && j.window_start ? Date.parse(`${j.window_date}T${j.window_start}`) : null;
    const dateEnd = j.window_date && j.window_end ? Date.parse(`${j.window_date}T${j.window_end}`) : null;
    return {
      id: String(j.id),
      stage: stageIndex(j.stage as Stage),
      stageAt: ts(j.stage_at)!,
      createdAt: ts(j.created_at)!,
      prop: j.property_id,
      cust: j.customer_id,
      unit: j.unit ?? "",
      svc: j.service ? svcIdx.indexOf(j.service) : null,
      owner: (j.operators as { name: string } | null)?.name ?? null,
      assignedAt: ts(j.assigned_at),
      senderOk: j.sender_confirmed,
      teamOk: j.team_confirmed,
      // TODO: window_date/start are stored without zone; interpret in BUSINESS_TZ once the adapter is live.
      dateAt,
      dateEnd,
      evidence: 0, // TODO: count from evidence table (or add a view) when TracWork lands.
      flag: j.flagged,
      delayed: j.delayed,
      paid: j.paid,
      qp: j.quick_pay,
      unread: unread.has(String(j.id)),
      subject: j.request_subject ?? "",
    } satisfies Job;
  });
}
