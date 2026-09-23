/* Simulated data so the board never goes blank while integrations land (CONFIG.SIMULATE).
   This is a slim stand-in for the prototype's seedJobs(); port the full generator from
   public/prototype.html (PINCH WORLD section) when porting the board. */
import raw from "@/data/properties.json";
import { PROPERTY_TYPES, type Job, type Property, type PropertyTypeCode, type StageIndex } from "@/lib/domain/types";

type RawProp = { n: string; c: number; t: PropertyTypeCode; a: string; ci: string; s: string; z: string; la: number; lo: number; u: number; cl: number; m: string; p: string; e: string };
const data = raw as { companies: string[]; props: RawProp[] };

export async function loadProperties(): Promise<Property[]> {
  return data.props.map((p, i) => ({
    id: "p" + i,
    name: p.n,
    customerId: "c" + p.c,
    customerName: data.companies[p.c] ?? null,
    type: p.t in PROPERTY_TYPES ? p.t : "mf",
    street: p.a,
    city: p.ci,
    state: p.s,
    zip: p.z,
    lat: p.la,
    lng: p.lo,
    units: p.u,
    cleaners: p.cl,
    manager: p.m || null,
    phone: p.p || null,
    email: p.e || null,
  }));
}

/* Deterministic PRNG so server and client render the same seed. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const OPS = ["Federico", "Jake", "Priya", "Luis", "Dana", "Omar", "Kelly"];
const UNITS = ["2B", "3D", "4B", "5A", "7A", "9F", "12C", "14E", "Lobby", "Bldg B", "Suite 210"];
/* Lane sizes and max age (minutes) taken from seedJobs(). */
const LANES: [StageIndex, number, number][] = [[0, 82, 560], [1, 168, 2880], [2, 58, 320], [3, 66, 330], [4, 154, 6000]];

export async function loadJobs(now = Date.now()): Promise<Job[]> {
  const r = rng(10400);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const props = data.props.filter((p) => p.n.length > 3);
  const jobs: Job[] = [];
  let seq = 10400;
  for (const [stage, count, maxAge] of LANES) {
    for (let i = 0; i < count; i++) {
      const pi = Math.floor(r() * props.length);
      const p = props[pi];
      const ageMin = 8 + r() * maxAge;
      const stageAt = now - ageMin * 60000;
      const owner = stage === 0 && r() < 0.15 ? null : pick(OPS);
      const dateAt = stage === 1 ? now + r() * 5 * 864e5 : stage >= 2 ? now - r() * 2 * 864e5 : null;
      const svc = p.t === "mf" ? pick([0, 0, 0, 1, 4]) : p.t === "st" ? pick([0, 1]) : pick([3, 5, 2]);
      const paid = stage === 4 && i >= 84;
      const flag = stage === 3 && r() < 0.3;
      jobs.push({
        id: "J" + ++seq,
        stage,
        stageAt,
        createdAt: stageAt,
        prop: "p" + data.props.indexOf(p),
        cust: "c" + p.c,
        unit: pick(UNITS),
        svc,
        owner,
        assignedAt: owner ? stageAt + (3 + r() * 22) * 60000 : null,
        senderOk: !!owner,
        teamOk: stage >= 1,
        dateAt,
        dateEnd: dateAt ? dateAt + 2 * 36e5 : null,
        evidence: stage >= 3 ? (flag && r() < 0.4 ? 0 : 6 + Math.floor(r() * 12)) : stage === 2 ? 3 : 0,
        flag,
        delayed: false,
        paid,
        qp: stage === 4 && !paid && r() < 0.3,
        unread: stage === 0 && r() < 0.25,
        subject: p.n,
      });
    }
  }
  return jobs;
}
