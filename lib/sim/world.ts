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

/** Lookups over a World; cheap to rebuild when the world changes. */
export function indexWorld(w: World) {
  const props = new Map(w.props.map((p) => [p.id, p]));
  const custs = new Map(w.customers.map((c) => [c.id, c]));
  return {
    ...w,
    prop: (id: string) => props.get(id)!,
    cust: (id: string) => custs.get(id) ?? w.customers[0],
  };
}
export type WorldIndex = ReturnType<typeof indexWorld>;
