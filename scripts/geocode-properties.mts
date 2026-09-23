/* Street-level geocoding through Mapbox, run once after the import (INTEGRATION.md §5.4).
 *
 *   pnpm geocode            # every property not yet geocoded by Mapbox
 *   pnpm geocode --limit 20 # try a few first
 *
 * Uses the Geocoding v6 forward endpoint with permanent=true, which Mapbox requires when results
 * are stored in a database (billed as permanent geocoding). The geom column is kept in sync by
 * a trigger, so only lat/lng are written.
 */
import { createClient } from "@supabase/supabase-js";

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;
const CONCURRENCY = 5;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, token = process.env.MAPBOX_GEOCODING_TOKEN;
if (!url || !key || !token) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and MAPBOX_GEOCODING_TOKEN in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });

type P = { id: string; name: string; address1: string | null; city: string | null; state: string | null; postal_code: string | null };
const todo: P[] = [];
for (let from = 0; todo.length < LIMIT; from += 1000) {
  const { data, error } = await sb
    .from("properties")
    .select("id,name,address1,city,state,postal_code")
    .neq("geocode_source", "mapbox")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  todo.push(...data);
  if (data.length < 1000) break;
}
const queue = todo.slice(0, LIMIT);
console.log(`geocoding ${queue.length} properties`);

let ok = 0, miss = 0;
async function geocode(p: P) {
  const params = new URLSearchParams({ country: "us", limit: "1", types: "address", permanent: "true", access_token: token! });
  if (p.address1) params.set("address_line1", p.address1);
  if (p.city) params.set("place", p.city);
  if (p.state) params.set("region", p.state);
  if (p.postal_code) params.set("postcode", p.postal_code);
  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`);
  if (!res.ok) throw new Error(`Mapbox ${res.status} for ${p.name}: ${await res.text()}`);
  const f = (await res.json()).features?.[0];
  const confidence = f?.properties?.match_code?.confidence;
  if (!f || confidence === "low") { miss++; console.warn(`no confident match: ${p.name} — ${p.address1}, ${p.city} ${p.state}`); return; }
  const [lng, lat] = f.geometry.coordinates as [number, number];
  const { error } = await sb.from("properties").update({ lat, lng, geocode_source: "mapbox" }).eq("id", p.id);
  if (error) throw error;
  ok++;
}

for (let i = 0; i < queue.length; i += CONCURRENCY) {
  await Promise.all(queue.slice(i, i + CONCURRENCY).map(geocode));
  if ((i / CONCURRENCY) % 20 === 0) console.log(`${Math.min(i + CONCURRENCY, queue.length)}/${queue.length}`);
}
console.log(`done · geocoded ${ok} · left for manual review ${miss}`);
