/* One-time import of PINCH customers, properties and contacts (INTEGRATION.md §5, steps 2, 3 and 5).
 *
 *   pnpm import:data --dry-run        # parse, filter and report; writes nothing
 *   pnpm import:data                  # upsert into Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
 *   pnpm import:data --include-test   # keep PINCH's QA/test companies
 *
 * Source of truth is data/properties_list.csv (the PINCH export). data/properties.json only
 * contributes ZIP-centroid coordinates; rows it doesn't cover are imported with no lat/lng and
 * picked up by scripts/geocode-properties.mts. Re-runnable: customers upsert on name,
 * properties on import_key, contacts skip emails that already exist.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const INCLUDE_TEST = args.has("--include-test");

/* Companies PINCH uses for QA. "CRM" (135 properties) is kept: it looks like a real bucket, confirm with PINCH. */
const TEST_COMPANY = /\btests?\b|\bqa\b|prueba/i;

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const keyOf = (name: string, addr: string, zip: string) => [norm(name), norm(addr), zip.trim()].join("|");
const nul = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
const person = (first: string, last: string) => nul(`${first} ${last}`.replace(/\s+/g, " "));
const isoDate = (mdy: string) => {
  const m = mdy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
};
const TYPES = new Set(["multifamily", "singlefamily", "student", "commercial", "residential"]);

const csv = parseCsv(readFileSync(new URL("../data/properties_list.csv", import.meta.url), "utf8"));
const json = JSON.parse(readFileSync(new URL("../data/properties.json", import.meta.url), "utf8")) as {
  props: { n: string; a: string; z: string; la: number; lo: number }[];
};
const coords = new Map(json.props.map((p) => [keyOf(p.n, p.a, p.z), [p.la, p.lo] as const]));

const excluded = csv.filter((r) => !INCLUDE_TEST && TEST_COMPANY.test(r.company_name));
const kept = csv.filter((r) => !excluded.includes(r) && r.community_name);

/* The export has duplicate rows for the same property; last one wins. */
const byKey = new Map<string, Row>();
for (const r of kept) byKey.set(keyOf(r.community_name, r.community_address1, r.community_postalCode), r);
const rows = [...byKey.entries()];

const companies = [...new Set(rows.map(([, r]) => r.company_name).filter(Boolean))].sort();
const domainOf = (company: string) => {
  const counts = new Map<string, number>();
  for (const [, r] of rows) {
    if (r.company_name !== company || !r.manager_email.includes("@")) continue;
    const d = r.manager_email.split("@")[1].toLowerCase();
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

const noCoords = rows.filter(([k]) => !coords.has(k)).length;
const badType = rows.filter(([, r]) => !TYPES.has(r.community_type));
console.log(`CSV rows ${csv.length} · excluded as test ${excluded.length} · duplicates collapsed ${kept.length - rows.length}`);
console.log(`→ customers ${companies.length} · properties ${rows.length} (${noCoords} without coordinates, geocode them next)`);
if (badType.length) console.warn(`${badType.length} rows with unknown community_type will be stored with type null`);
if (excluded.length) console.log("Excluded companies:", [...new Set(excluded.map((r) => r.company_name))].join(" · "));
if (DRY) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// 1. customers
const { data: custRows, error: custErr } = await sb
  .from("customers")
  .upsert(companies.map((name) => ({ name, email_domain: domainOf(name) })), { onConflict: "name" })
  .select("id,name");
if (custErr) throw custErr;
const custId = new Map(custRows.map((c) => [c.name, c.id]));
console.log(`customers upserted: ${custRows.length}`);

// 2. properties
let propCount = 0;
for (const part of chunk(rows)) {
  const payload = part.map(([k, r]) => {
    const c = coords.get(k);
    return {
      import_key: k,
      customer_id: custId.get(r.company_name) ?? null,
      name: r.community_name,
      type: TYPES.has(r.community_type) ? r.community_type : null,
      address1: nul(r.community_address1),
      address2: nul(r.community_address2),
      city: nul(r.community_city),
      state: nul(r.community_state),
      postal_code: nul(r.community_postalCode),
      lat: c?.[0] ?? null,
      lng: c?.[1] ?? null,
      geocode_source: c ? "zip_centroid" : "none",
      units_count: Number(r.units_count) || 0,
      cleaners_count: Number(r.cleaners_count) || 0,
      manager_name: person(r.manager_firstName, r.manager_lastName),
      manager_phone: nul(r.manager_phone),
      manager_email: nul(r.manager_email)?.toLowerCase() ?? null,
      supervisor_name: person(r.supervisor_firstName, r.supervisor_lastName),
      supervisor_phone: nul(r.supervisor_phone),
      supervisor_email: nul(r.supervisor_email)?.toLowerCase() ?? null,
      registered_at: isoDate(r.community_registration_date),
      origin: nul(r.origin),
    };
  });
  const { error } = await sb.from("properties").upsert(payload, { onConflict: "import_key" });
  if (error) throw error;
  propCount += payload.length;
}
console.log(`properties upserted: ${propCount}`);

// 3. contacts — one per manager email, de-duplicated (INTEGRATION.md §5.5)
const { data: existing, error: exErr } = await sb.from("contacts").select("email");
if (exErr) throw exErr;
const seen = new Set(existing.map((c) => c.email?.toLowerCase()));
const contacts: { customer_id: string | null; full_name: string; email: string; phone: string | null }[] = [];
for (const [, r] of rows) {
  const email = r.manager_email.toLowerCase();
  if (!email.includes("@") || seen.has(email)) continue;
  seen.add(email);
  contacts.push({
    customer_id: custId.get(r.company_name) ?? null,
    full_name: person(r.manager_firstName, r.manager_lastName) ?? email,
    email,
    phone: nul(r.manager_phone),
  });
}
for (const part of chunk(contacts)) {
  const { error } = await sb.from("contacts").insert(part);
  if (error) throw error;
}
console.log(`contacts inserted: ${contacts.length}`);
console.log("Next: pnpm geocode (Mapbox), then load cleaning_teams and operators (not in the handoff package).");
