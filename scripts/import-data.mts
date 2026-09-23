/* One-time import of PINCH customers, properties and contacts (INTEGRATION.md §5, steps 2, 3 and 5).
 *
 *   pnpm import:data --dry-run        # parse, filter and report; writes nothing
 *   pnpm import:data                  # upsert into Supabase (needs SUPABASE_SERVICE_ROLE_KEY)
 *   pnpm import:data --include-test   # keep PINCH's QA/test companies
 *   pnpm import:data --sql <dir>      # write the same import as SQL files (for the SQL editor); no key needed
 *
 * Source of truth is data/properties_list.csv (the PINCH export). data/properties.json only
 * contributes ZIP-centroid coordinates; rows it doesn't cover are imported with no lat/lng and
 * picked up by scripts/geocode-properties.mts. Re-runnable: customers upsert on name,
 * properties on import_key, contacts skip emails that already exist.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const sqlAt = process.argv.indexOf("--sql");
const SQL_DIR = sqlAt > 0 ? process.argv[sqlAt + 1] : null;
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

/* Rows to write, keyed by company name; customer ids are resolved at write time. */
const properties = rows.map(([k, r]) => {
  const c = coords.get(k);
  return {
    company: r.company_name,
    import_key: k,
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

/* One contact per manager email, de-duplicated (INTEGRATION.md §5.5). */
const contacts: { company: string; full_name: string; email: string; phone: string | null }[] = [];
const seenEmail = new Set<string>();
for (const [, r] of rows) {
  const email = r.manager_email.toLowerCase();
  if (!email.includes("@") || seenEmail.has(email)) continue;
  seenEmail.add(email);
  contacts.push({ company: r.company_name, full_name: person(r.manager_firstName, r.manager_lastName) ?? email, email, phone: nul(r.manager_phone) });
}

const chunk = <T,>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

if (SQL_DIR) {
  const lit = (v: unknown) => (v == null ? "null" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const PCOLS = ["import_key", "name", "type", "address1", "address2", "city", "state", "postal_code", "lat", "lng", "geocode_source", "units_count", "cleaners_count", "manager_name", "manager_phone", "manager_email", "supervisor_name", "supervisor_phone", "supervisor_email", "registered_at", "origin"] as const;
  const CAST: Record<string, string> = { lat: "::double precision", lng: "::double precision", units_count: "::int", cleaners_count: "::int", registered_at: "::date" };
  mkdirSync(SQL_DIR, { recursive: true });
  const files: string[] = [];
  const write = (name: string, sql: string) => { writeFileSync(join(SQL_DIR, name), sql); files.push(name); };
  write("01_customers.sql",
    `insert into customers (name, email_domain) values\n${companies.map((n) => `(${lit(n)}, ${lit(domainOf(n))})`).join(",\n")}\non conflict (name) do update set email_domain = excluded.email_domain;\n`);
  chunk(properties, 300).forEach((part, i) => {
    write(`02_properties_${i + 1}.sql`,
      `insert into properties (customer_id, ${PCOLS.join(", ")})\nselect c.id, ${PCOLS.map((k) => `v.${k}${CAST[k] ?? ""}`).join(", ")}\nfrom (values\n${part.map((p) => `(${lit(p.company)}, ${PCOLS.map((k) => lit(p[k])).join(", ")})`).join(",\n")}\n) as v(company, ${PCOLS.join(", ")})\nleft join customers c on c.name = v.company\non conflict (import_key) do update set ${PCOLS.filter((k) => k !== "import_key").map((k) => `${k} = excluded.${k}`).join(", ")}, customer_id = excluded.customer_id;\n`);
  });
  write("03_contacts.sql",
    `insert into contacts (customer_id, full_name, email, phone)\nselect c.id, v.full_name, v.email, v.phone\nfrom (values\n${contacts.map((x) => `(${lit(x.company)}, ${lit(x.full_name)}, ${lit(x.email)}, ${lit(x.phone)})`).join(",\n")}\n) as v(company, full_name, email, phone)\nleft join customers c on c.name = v.company\non conflict (lower(email)) where email is not null do nothing;\n`);
  console.log(`SQL written to ${SQL_DIR}: ${files.join(", ")} — run them in order.`);
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (or use --sql <dir>)");
const sb = createClient(url, key, { auth: { persistSession: false } });

// 1. customers
const { data: custRows, error: custErr } = await sb
  .from("customers")
  .upsert(companies.map((name) => ({ name, email_domain: domainOf(name) })), { onConflict: "name" })
  .select("id,name");
if (custErr) throw custErr;
const custId = new Map(custRows.map((c) => [c.name, c.id]));
console.log(`customers upserted: ${custRows.length}`);

// 2. properties
for (const part of chunk(properties)) {
  const payload = part.map(({ company, ...p }) => ({ ...p, customer_id: custId.get(company) ?? null }));
  const { error } = await sb.from("properties").upsert(payload, { onConflict: "import_key" });
  if (error) throw error;
}
console.log(`properties upserted: ${properties.length}`);

// 3. contacts — skip emails already on file
const { data: existing, error: exErr } = await sb.from("contacts").select("email");
if (exErr) throw exErr;
const onFile = new Set(existing.map((c) => c.email?.toLowerCase()));
const fresh = contacts.filter((x) => !onFile.has(x.email)).map(({ company, ...x }) => ({ ...x, customer_id: custId.get(company) ?? null }));
for (const part of chunk(fresh)) {
  const { error } = await sb.from("contacts").insert(part);
  if (error) throw error;
}
console.log(`contacts inserted: ${fresh.length}`);
console.log("Next: pnpm geocode (Mapbox), then load cleaning_teams and operators (not in the handoff package).");
