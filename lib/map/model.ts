/* MAP MODE model — which properties and jobs the map shows, clusters, weather and traffic simulation.
   Ported from allMapJobs() / mapJobs() / propMatches() / clusters() / propHealth() / initSim() / driftWeather()
   / rushFactor() / segLevel() in public/prototype.html. */
import { health, incKind, isBad, miles } from "@/lib/domain/health";
import type { Job, Prop } from "@/lib/domain/types";
import { opsAll, UNASSIGNED, type Filters } from "@/lib/board/filters";
import { pick, rnd } from "@/lib/sim/seed";
import type { WorldIndex } from "@/lib/sim/world";

export type PropHealth = "crit" | "bad" | "risk" | "on" | "none";
export type IncKind = "crit" | "late" | "msg" | "risk";

/** Map-only filters layered over the board filters (health dot, incident chip, "needs attention"). */
export interface MapFilter {
  on: boolean;
  hfilter: PropHealth | null;
  kind: IncKind | null;
  attn: boolean;
}
export const MAP_OFF: MapFilter = { on: false, hfilter: null, kind: null, attn: false };
export const mapFiltersOn = (m: MapFilter) => !!(m.hfilter || m.kind || m.attn);

export const HCOL: Record<PropHealth, string> = { crit: "#8E2F2F", bad: "#BD4444", risk: "#E39A9A", on: "#4B5260", none: "#C3C9D3" };
export const INC_COL: Record<string, string> = { crit: "#8E2F2F", late: "#BD4444", msg: "#4A9FE0", risk: "#E39A9A" };

/** Active jobs at known properties that pass the board filters. */
export function allMapJobs(jobs: Job[], matches: (j: Job) => boolean) {
  return jobs.filter((j) => matches(j) && j.propKnown && !(j.stage === 4 && j.paid));
}
export function mapJobs(jobs: Job[], matches: (j: Job) => boolean, m: MapFilter, now: number) {
  const base = allMapJobs(jobs, matches);
  if (m.kind) return base.filter((j) => incKind(j, now) === m.kind);
  return m.attn ? base.filter((j) => isBad(j, now) || j.unread) : base;
}

export function indexByProp(jobs: Job[]) {
  const by: Record<string, Job[]> = {};
  jobs.forEach((j) => (by[j.prop] ??= []).push(j));
  return by;
}

export function propHealth(js: Job[] | undefined, now: number): PropHealth {
  if (!js?.length) return "none";
  if (js.some((j) => health(j, now) === "crit")) return "crit";
  if (js.some((j) => isBad(j, now))) return "bad";
  if (js.some((j) => health(j, now) === "risk")) return "risk";
  return "on";
}

const located = (p: Prop) => !!(p.lat || p.lng);

/** Property-level version of the board filters, used for pins and the location list. */
export function propMatches(F: Filters, m: MapFilter, byProp: Record<string, Job[]>, p: Prop, now: number): boolean {
  if (!located(p)) return false;
  if (F.types.size && !F.types.has(p.type)) return false;
  if (F.geo.length && !F.geo.some((t) => (t.kind === "state" ? p.st === t.v : t.kind === "zip" ? p.zip === t.v : miles(p, { lat: t.lat!, lng: t.lng! }) <= F.radius))) return false;
  const js = byProp[p.id] ?? [];
  if (m.hfilter && propHealth(js, now) !== m.hfilter) return false;
  if (m.kind && !js.some((j) => incKind(j, now) === m.kind)) return false;
  if (m.attn && !js.some((j) => isBad(j, now) || j.unread)) return false;
  const groups: Record<string, typeof F.observe> = {};
  F.observe.forEach((t) => (groups[t.kind] ??= []).push(t));
  for (const k in groups) {
    const ok = groups[k].some((t) => {
      if (k === "customer") return p.cust === t.v;
      if (k === "property") return p.id === t.v;
      if (k === "team") return p.team === t.v || js.some((j) => j.team === t.v);
      if (k === "operator") return js.some((j) => j.owner === t.v);
      if (k === "service") return js.some((j) => j.svc === t.v);
      if (k === "stage") return js.some((j) => j.stage === t.v);
      const q = String(t.v).toLowerCase();
      return [p.n, p.city, p.st, p.custName, p.zip, p.mgr].join(" ").toLowerCase().includes(q);
    });
    if (!ok) return false;
  }
  if (F.health.size && !js.some((j) => { const h = health(j, now); return F.health.has(h === "crit" ? "bad" : h); })) return false;
  if (!opsAll(F) && js.length && !js.some((j) => F.ops.has(j.owner || UNASSIGNED))) return false;
  return true;
}

export interface Cluster {
  k: string;
  lat: number;
  lng: number;
  label: string;
  props: Prop[];
  jobs: Job[];
  cluster: boolean;
}

/** State clusters when zoomed out, city clusters in between, single pins up close (GL zoom = Leaflet zoom − 1). */
export function clusters(w: WorldIndex, props: Prop[], byProp: Record<string, Job[]>, zoom: number, inView: (p: Prop) => boolean): Cluster[] {
  const out: Cluster[] = [];
  const mk = (k: string, lat: number, lng: number, label: string, list: Prop[], cluster: boolean) =>
    out.push({ k, lat, lng, label, props: list, jobs: list.flatMap((p) => byProp[p.id] ?? []), cluster });
  const avg = (ps: Prop[]): [number, number] => [ps.reduce((a, p) => a + p.lat, 0) / ps.length, ps.reduce((a, p) => a + p.lng, 0) / ps.length];
  if (zoom < 5.2) {
    const by: Record<string, Prop[]> = {};
    props.forEach((p) => (by[p.st] ??= []).push(p));
    for (const st in by) {
      const c = w.stateC[st];
      const [lat, lng] = c && (c[0] || c[1]) ? [c[0], c[1]] : avg(by[st]);
      mk(st, lat, lng, st, by[st], true);
    }
  } else if (zoom < 8.5) {
    const by: Record<string, Prop[]> = {};
    props.forEach((p) => (by[p.city + ", " + p.st] ??= []).push(p));
    for (const k in by) {
      const [lat, lng] = avg(by[k]);
      mk(k, lat, lng, k, by[k], by[k].length > 1);
    }
  } else {
    props.filter(inView).slice(0, 500).forEach((p) => mk(p.id, p.lat, p.lng, p.n, [p], false));
  }
  return out;
}

export const clusterHealth = (js: Job[], now: number): PropHealth =>
  js.length ? (js.some((j) => health(j, now) === "crit") ? "crit" : js.some((j) => isBad(j, now)) ? "bad" : js.some((j) => health(j, now) === "risk") ? "risk" : "on") : "none";

/** Worst-first list for the tour and the "needs attention" cards (tourList). */
export function tourList(jobs: Job[], now: number) {
  const r = (x: Job) => (health(x, now) === "crit" ? 0 : health(x, now) === "bad" ? 1 : 2);
  return jobs.filter((j) => isBad(j, now) || j.unread).sort((a, b) => r(a) - r(b) || a.stageAt - b.stageAt);
}

/* ── Weather (OpenWeather when configured, simulated otherwise) ── */
export type Cond = "clear" | "cloud" | "rain" | "storm" | "snow";
export const W_COND: Record<Cond, [string, string, string]> = {
  clear: ["Clear", "Despejado", "☀"], cloud: ["Cloudy", "Nublado", "☁"], rain: ["Rain", "Lluvia", "🌧"], storm: ["Storm", "Tormenta", "⛈"], snow: ["Snow", "Nieve", "❄"],
};
export const WX_FILL: Record<Cond, string> = { clear: "#F3F6EF", cloud: "#EDEFF3", rain: "#E4EDF6", storm: "#DCE4F0", snow: "#F1F5F9" };
export type Weather = Record<string, { cond: Cond; temp: number }>;

export function simWeather(states: string[]): Weather {
  const wx: Weather = {};
  states.forEach((k) => (wx[k] = { cond: pick<Cond>(["clear", "clear", "cloud", "cloud", "rain", "storm", "snow"]), temp: rnd(34, 92) }));
  return wx;
}
export function driftWeather(wx: Weather): Weather {
  const out: Weather = {};
  for (const k in wx) {
    out[k] = {
      cond: Math.random() < 0.12 ? pick<Cond>(["clear", "cloud", "cloud", "rain", "storm", "snow"]) : wx[k].cond,
      temp: Math.max(20, Math.min(100, wx[k].temp + rnd(-2, 2))),
    };
  }
  return out;
}

/* ── Simulated traffic on interstates (TomTom flow tiles replace it when configured) ── */
export const TCOL = ["#6BAF7B", "#E3B04B", "#BD4444", "#7A2626"];
function rushFactor(now: number) {
  const h = +new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date(now));
  const g = (c: number, w: number) => Math.exp(-Math.pow(h - c, 2) / (2 * w * w));
  return Math.max(g(8, 1.2), g(17.5, 1.5)) + 0.2 * g(12.5, 1.2);
}
/** 0 free-flowing · 1 slow · 2 heavy — congestion rises at rush hour, near late jobs and in bad weather. */
export function segLevel(seg: { base: number; mid: [number, number]; st?: string }, lateJobs: Prop[], wx: Weather | null, now: number) {
  let c = seg.base + rushFactor(now) * 0.34;
  c += lateJobs.filter((p) => miles(p, { lat: seg.mid[0], lng: seg.mid[1] }) < 40).length * 0.14;
  if (seg.st && wx?.[seg.st] && ["rain", "storm", "snow"].includes(wx[seg.st].cond)) c += 0.2;
  c = Math.min(1, c);
  return c < 0.34 ? 0 : c < 0.64 ? 1 : 2;
}
