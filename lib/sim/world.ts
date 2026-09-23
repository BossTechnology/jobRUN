/* PINCH WORLD — customers, cleaning teams and properties built from data/properties.json, as in the prototype.
   Teams are placeholders until PINCH sends the Pro list (INTEGRATION.md §5.6). */
import raw from "@/data/properties.json";
import type { Customer, Prop, PropertyTypeCode, Team, World } from "@/lib/domain/types";

type RawProp = { n: string; c: number; t: PropertyTypeCode; a: string; ci: string; s: string; z: string; la: number; lo: number; u: number; cl: number; m: string; p: string; e: string };
const REAL = raw as { companies: string[]; props: RawProp[] };

export const SIM_TEAMS: Team[] = [
  ["Sparkle Co.", "(203) 555-0142"], ["BrightPath Cleaning", "(617) 555-0188"], ["Fresh Start Services", "(404) 555-0119"],
  ["Clean Slate Pros", "(214) 555-0163"], ["Prime Shine", "(312) 555-0107"], ["TidyTeam", "(213) 555-0175"],
  ["Urban Maids", "(718) 555-0131"], ["Northside Cleaners", "(914) 555-0158"], ["Coastal Clean Crew", "(843) 555-0164"],
  ["Sunstate Services", "(904) 555-0172"], ["Heartland Cleaning", "(317) 555-0119"], ["Summit Janitorial", "(704) 555-0186"],
];

export const hashStr = (x: string) => {
  let h = 0;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export function buildSimWorld(): World {
  const customers: Customer[] = REAL.companies.map((n, i) => ({
    id: "c" + i,
    n,
    dom: n.includes(".") ? n : n.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com",
    contacts: [],
  }));
  const teams = SIM_TEAMS;
  const props: Prop[] = REAL.props.map((p, i) => ({
    id: "p" + i, n: p.n, cust: "c" + p.c, custName: REAL.companies[p.c], type: p.t, street: p.a, city: p.ci, st: p.s, zip: p.z,
    lat: p.la, lng: p.lo, units: p.u, cleaners: p.cl, mgr: p.m || "Property manager", phone: p.p, email: p.e,
    code: p.s + "-" + String(i).padStart(4, "0"), beds: p.t === "mf" || p.t === "st" ? 1 + (i % 3) : 0,
    team: hashStr(p.s + p.ci) % teams.length,
  }));
  const byId = new Map(customers.map((c) => [c.id, c]));
  props.forEach((p) => {
    const c = byId.get(p.cust);
    if (!c) return;
    if (p.mgr && !c.contacts.includes(p.mgr)) c.contacts.push(p.mgr);
    if (p.email && p.email.includes("@")) c.dom = p.email.split("@")[1];
  });
  customers.forEach((c) => {
    if (!c.contacts.length) c.contacts.push("Property manager");
  });
  return { customers, teams, props };
}

export interface City {
  k: string;
  ci: string;
  st: string;
  lat: number;
  lng: number;
  n: number;
}

/** Lookups over a World, plus the state and city lists the Geo filter uses (STATES_LIST / STATE_C / CITY_LIST). */
export function indexWorld(w: World) {
  const props = new Map(w.props.map((p) => [p.id, p]));
  const custs = new Map(w.customers.map((c) => [c.id, c]));
  const located = w.props.filter((p) => p.lat || p.lng);
  const states = [...new Set(w.props.map((p) => p.st).filter(Boolean))].sort();
  /** state → [lat, lng, property count] */
  const stateC: Record<string, [number, number, number]> = {};
  states.forEach((st) => {
    const ps = located.filter((p) => p.st === st);
    const n = w.props.filter((p) => p.st === st).length;
    stateC[st] = ps.length ? [ps.reduce((a, p) => a + p.lat, 0) / ps.length, ps.reduce((a, p) => a + p.lng, 0) / ps.length, n] : [0, 0, n];
  });
  const m: Record<string, City> = {};
  located.forEach((p) => {
    const k = p.city + ", " + p.st;
    const c = (m[k] ??= { k, ci: p.city, st: p.st, lat: 0, lng: 0, n: 0 });
    c.lat += p.lat; c.lng += p.lng; c.n++;
  });
  const cities = Object.values(m).map((c) => ({ ...c, lat: c.lat / c.n, lng: c.lng / c.n })).sort((a, b) => b.n - a.n);
  return {
    ...w,
    prop: (id: string) => props.get(id)!,
    cust: (id: string) => custs.get(id) ?? w.customers[0],
    states,
    stateC,
    cities,
  };
}
export type WorldIndex = ReturnType<typeof indexWorld>;
