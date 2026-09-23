/* Street-level geocoding, run once after the import (INTEGRATION.md §5.4).
 *
 *   pnpm geocode                     # US Census batch geocoder (free, no key) — default
 *   pnpm geocode --provider mapbox   # Mapbox v6 (needs MAPBOX_GEOCODING_TOKEN; billed as permanent geocoding)
 *   pnpm geocode --limit 20          # try a few first
 *   pnpm geocode --fill-missing      # give rows with no coordinates the centroid of their ZIP (else city)
 *
 * Only rows not yet street-geocoded are sent. Unmatched addresses keep their ZIP-centroid coordinates
 * and are listed for manual review. The geom column follows lat/lng through a trigger.
 */
import { createClient } from "@supabase/supabase-js";

const argv = process.argv;
const arg = (name: string) => (argv.indexOf(name) > 0 ? argv[argv.indexOf(name) + 1] : undefined);
const LIMIT = Number(arg("--limit") ?? Infinity);
const PROVIDER = arg("--provider") ?? "census";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
if (PROVIDER === "mapbox" && !process.env.MAPBOX_GEOCODING_TOKEN) throw new Error("Set MAPBOX_GEOCODING_TOKEN for --provider mapbox");
const sb = createClient(url, key, { auth: { persistSession: false } });

if (argv.includes("--fill-missing")) {
  const { data, error } = await sb.from("properties").select("id,name,city,state,postal_code,lat,lng");
  if (error) throw error;
  const avg = (rows: typeof data) => (rows.length ? { lat: rows.reduce((a, r) => a + r.lat!, 0) / rows.length, lng: rows.reduce((a, r) => a + r.lng!, 0) / rows.length } : null);
  const located = data.filter((r) => r.lat != null);
  let filled = 0;
  for (const r of data.filter((x) => x.lat == null)) {
    const zip = r.postal_code?.slice(0, 5);
    const c = (zip && avg(located.filter((x) => x.postal_code?.slice(0, 5) === zip))) ||
      (r.city && avg(located.filter((x) => x.state === r.state && x.city?.toLowerCase() === r.city!.toLowerCase())));
    if (!c) { console.log(`  no reference for ${r.name}`); continue; }
    const { error: e } = await sb.from("properties").update({ ...c, geocode_source: "zip_centroid" }).eq("id", r.id);
    if (e) throw e;
    filled++;
  }
  console.log(`filled ${filled} properties from ZIP/city centroids`);
  process.exit(0);
}

type P = { id: string; name: string; address1: string | null; city: string | null; state: string | null; postal_code: string | null };
type Hit = { lat: number; lng: number };

const todo: P[] = [];
for (let from = 0; todo.length < LIMIT; from += 1000) {
  const { data, error } = await sb
    .from("properties")
    .select("id,name,address1,city,state,postal_code")
    .not("geocode_source", "in", "(mapbox,census,manual)")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  todo.push(...data);
  if (data.length < 1000) break;
}
const queue = todo.slice(0, LIMIT).filter((p) => p.address1);
console.log(`geocoding ${queue.length} properties with ${PROVIDER}`);

/* US Census Geocoder, batch endpoint: CSV of id,street,city,state,zip → CSV of matches. */
async function census(batch: P[]): Promise<Map<string, Hit>> {
  const esc = (s: string | null) => `"${(s ?? "").replace(/"/g, "'")}"`;
  const csv = batch.map((p, i) => [i, esc(p.address1), esc(p.city), esc(p.state), esc(p.postal_code)].join(",")).join("\n");
  const form = new FormData();
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  form.append("benchmark", "Public_AR_Current");
  const res = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Census ${res.status}: ${await res.text()}`);
  const out = new Map<string, Hit>();
  for (const line of (await res.text()).split("\n")) {
    const cols = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    if (cols[2] !== "Match" || !cols[5]) continue;
    const [lng, lat] = cols[5].split(",").map(Number);
    out.set(batch[Number(cols[0])].id, { lat, lng });
  }
  return out;
}

async function mapbox(p: P): Promise<Hit | null> {
  const params = new URLSearchParams({ country: "us", limit: "1", types: "address", permanent: "true", access_token: process.env.MAPBOX_GEOCODING_TOKEN! });
  if (p.address1) params.set("address_line1", p.address1);
  if (p.city) params.set("place", p.city);
  if (p.state) params.set("region", p.state);
  if (p.postal_code) params.set("postcode", p.postal_code);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  if (!res.ok) throw new Error(`Mapbox ${res.status} for ${p.name}: ${await res.text()}`);
  const f = (await res.json()).features?.[0];
  if (!f || f.properties?.match_code?.confidence === "low") return null;
  const [lng, lat] = f.geometry.coordinates as [number, number];
  return { lat, lng };
}

let ok = 0;
const missed: P[] = [];
const save = async (p: P, hit: Hit) => {
  const { error } = await sb.from("properties").update({ lat: hit.lat, lng: hit.lng, geocode_source: PROVIDER }).eq("id", p.id);
  if (error) throw error;
  ok++;
};

if (PROVIDER === "census") {
  for (let i = 0; i < queue.length; i += 500) {
    const batch = queue.slice(i, i + 500);
    const hits = await census(batch);
    for (const p of batch) {
      const hit = hits.get(p.id);
      if (hit) await save(p, hit);
      else missed.push(p);
    }
    console.log(`${Math.min(i + 500, queue.length)}/${queue.length} · matched ${ok}`);
  }
} else {
  for (let i = 0; i < queue.length; i += 5) {
    await Promise.all(queue.slice(i, i + 5).map(async (p) => {
      const hit = await mapbox(p);
      if (hit) await save(p, hit);
      else missed.push(p);
    }));
  }
}

console.log(`done · geocoded ${ok} · not matched ${missed.length} (keep ZIP-centroid or no coordinates)`);
missed.slice(0, 30).forEach((p) => console.log(`  - ${p.name} — ${p.address1}, ${p.city} ${p.state} ${p.postal_code}`));
if (missed.length > 30) console.log(`  … and ${missed.length - 30} more`);
