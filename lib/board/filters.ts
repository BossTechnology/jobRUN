/* FILTERS — Observe, Geo, health, property type and operators. Ported from matches() / catalog() / hasFilters(). */
import { health, miles, workload } from "@/lib/domain/health";
import { jobNo } from "@/lib/domain/time";
import { SERVICES, type Job } from "@/lib/domain/types";
import { strings, type Lang } from "@/lib/i18n";
import { OPS } from "@/lib/operators";
import { P } from "@/lib/ui/icons";
import type { WorldIndex } from "@/lib/sim/world";

export type ObserveKind = "customer" | "property" | "team" | "operator" | "service" | "stage" | "keyword";
export type GeoKind = "metro" | "city" | "zip" | "state";

export interface Tag {
  kind: ObserveKind | GeoKind;
  v: string | number;
  label: string;
  sub?: string;
  ic?: string;
  lat?: number;
  lng?: number;
}

export type HealthBand = "on" | "risk" | "bad";

export interface Filters {
  observe: Tag[];
  geo: Tag[];
  health: Set<HealthBand>;
  types: Set<string>;
  /** miles around each city or ZIP */
  radius: number;
  /** operators shown; "__un" = unassigned */
  ops: Set<string>;
}

export const UNASSIGNED = "__un";
export const emptyFilters = (): Filters => ({ observe: [], geo: [], health: new Set(), types: new Set(), radius: 10, ops: new Set([UNASSIGNED, ...OPS]) });

export const opsAll = (F: Filters) => F.ops.size === OPS.length + 1;
export const hasFilters = (F: Filters) => !!(F.observe.length || F.geo.length || F.health.size || F.types.size || !opsAll(F));

export function matches(F: Filters, w: WorldIndex, j: Job, now = Date.now()): boolean {
  const p = w.prop(j.prop), c = w.cust(j.cust), team = j.team != null ? w.teams[j.team]?.[0] ?? "" : "";
  const groups: Record<string, Tag[]> = {};
  F.observe.forEach((t) => (groups[t.kind] ??= []).push(t));
  for (const k in groups) {
    const ok = groups[k].some((t) => {
      if (k === "customer") return j.cust === t.v;
      if (k === "property") return j.prop === t.v;
      if (k === "team") return j.team === t.v;
      if (k === "operator") return j.owner === t.v;
      if (k === "service") return j.svc === t.v;
      if (k === "stage") return j.stage === t.v;
      const q = String(t.v).toLowerCase();
      return [p.n, p.city, c.n, team, j.owner || "", j.unit, j.req?.subj || "", j.email || "", jobNo(j)].join(" ").toLowerCase().includes(q);
    });
    if (!ok) return false;
  }
  if (F.geo.length && !F.geo.some((t) => (t.kind === "state" ? p.st === t.v : miles(p, { lat: t.lat!, lng: t.lng! }) <= F.radius))) return false;
  if (!opsAll(F) && !F.ops.has(j.owner || UNASSIGNED)) return false;
  if (F.types.size && !F.types.has(p.type)) return false;
  if (F.health.size) {
    const h = health(j, now);
    if (!F.health.has(h === "crit" ? "bad" : h)) return false;
  }
  return true;
}

/** Everything the Observe / Geo inputs can suggest. */
export function catalog(sec: "observe" | "geo", w: WorldIndex, jobs: Job[], lang: Lang): Tag[] {
  const l = strings(lang), out: Tag[] = [];
  if (sec === "observe") {
    w.customers.forEach((c) => out.push({ kind: "customer", v: c.id, label: c.n, sub: c.dom, ic: P.bldg }));
    w.props.forEach((p) => out.push({ kind: "property", v: p.id, label: p.n, sub: `${p.city}, ${p.st} · ${w.cust(p.cust).n}`, ic: P.pin }));
    w.teams.forEach((t, i) => out.push({ kind: "team", v: i, label: t[0], sub: t[1], ic: P.team }));
    OPS.forEach((o) => out.push({ kind: "operator", v: o, label: o, sub: l.load(workload(jobs, o)), ic: P.person }));
    SERVICES[lang].forEach((s, i) => out.push({ kind: "service", v: i, label: s, sub: "", ic: P.tag }));
    (l.stages as string[]).forEach((s, i) => out.push({ kind: "stage", v: i, label: s, sub: "", ic: P.stage }));
  } else {
    w.states.forEach((st) => out.push({ kind: "state", v: st, label: st, sub: `${w.stateC[st][2]} ${l.mp.props}`, ic: P.map }));
    // Keyed by "City, ST": the prototype used the bare city name, which collides (Charleston SC / WV).
    w.cities.forEach((c) => out.push({ kind: "city", v: c.k, label: `${c.ci}, ${c.st}`, sub: `${c.n} ${l.mp.props}`, lat: c.lat, lng: c.lng, ic: P.pin }));
    const seen = new Set<string>();
    w.props.forEach((p) => {
      if (!p.zip || seen.has(p.zip) || !(p.lat || p.lng)) return;
      seen.add(p.zip);
      out.push({ kind: "zip", v: p.zip, label: p.zip, sub: `${p.city}, ${p.st}`, lat: p.lat, lng: p.lng, ic: P.tag });
    });
  }
  return out;
}

export const SUGGEST_ORDER: Record<"observe" | "geo", Tag["kind"][]> = {
  observe: ["customer", "property", "team", "operator", "service", "stage"],
  geo: ["metro", "city", "zip", "state"],
};

/** Grouped suggestions for the typed query (suggest()). */
export function suggestions(sec: "observe" | "geo", q: string, have: Tag[], all: Tag[]) {
  const query = q.trim().toLowerCase(), taken = new Set(have.map((t) => t.kind + ":" + t.v));
  const items = all.filter((i) => !taken.has(i.kind + ":" + i.v) && (!query || i.label.toLowerCase().includes(query) || String(i.sub ?? "").toLowerCase().includes(query)));
  const groups: { kind: Tag["kind"]; items: Tag[] }[] = [];
  SUGGEST_ORDER[sec].forEach((k) => {
    const g = items.filter((i) => i.kind === k).slice(0, query ? 6 : 4);
    if (g.length) groups.push({ kind: k, items: g });
  });
  return groups;
}

/** Filters as short text for Rosie's snapshot and insight cache key (filterText). */
export function filterText(F: Filters): string[] {
  const f: string[] = [];
  if (F.health.size) f.push("health=" + [...F.health].join("/"));
  F.observe.forEach((t) => f.push(t.kind + "=" + t.label));
  F.geo.forEach((t) => f.push("place=" + t.label + (t.kind === "city" || t.kind === "zip" ? " within " + F.radius + " mi" : "")));
  if (F.types.size) f.push("type=" + [...F.types].join("/"));
  if (!opsAll(F)) f.push("operators=" + [...F.ops].map((x) => (x === UNASSIGNED ? "Unassigned" : x)).join("/"));
  return f;
}
