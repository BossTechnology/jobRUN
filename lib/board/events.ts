/* HEADER EVENT SIM — the alerts, alarms, anomalies and actions feeds behind the header badges,
   the Incidents and Activity panels. Ported from makeEvent() / logAction() / seedLive() / tick() / buildHistory().
   TODO(prod): derive these from job_events + current job health (INTEGRATION.md §7). */
import { fmtTime } from "@/lib/domain/time";
import { SERVICES, type Job } from "@/lib/domain/types";
import { strings, type Lang } from "@/lib/i18n";
import { ME } from "@/lib/operators";
import { pick, rnd } from "@/lib/sim/seed";
import type { WorldIndex } from "@/lib/sim/world";

export type IntelType = "alerts" | "alarms" | "anomalies" | "actions";
export const INTEL_TYPES: IntelType[] = ["alerts", "alarms", "anomalies", "actions"];
export type Severity = "critical" | "warning" | "info";

type Kind = [key: string, sev: Severity, stageIdx: number];
const KINDS: Record<IntelType, Kind[]> = {
  alerts: [["unclaimed", "warning", 0], ["pendingLong", "warning", 0], ["replyWait", "warning", 0], ["quickpay", "critical", 4]],
  alarms: [["noCheckin", "critical", 2], ["noConfirm", "critical", 1], ["lateCancel", "warning", 1]],
  anomalies: [["tooShort", "critical", 3], ["tooLong", "warning", 3], ["noEvidence", "critical", 3], ["location", "warning", 3]],
  actions: [["nudge1h", "info", 1], ["nudge5", "info", 2], ["zendesk", "info", -1], ["workapp", "info", 0], ["aiSender", "info", 0], ["paidQB", "info", 4]],
};
export const CHANNEL: Record<string, string> = { nudge1h: "TrueDialog", nudge5: "TrueDialog", zendesk: "Zendesk", workapp: "Work App", aiSender: "AI", newReq: "Gmail", paidQB: "QuickBooks" };
export const SEV_C: Record<Severity, string> = { critical: "#BD4444", warning: "#E39A9A", info: "#A6AEBF" };

export interface EventParams {
  jobId: string;
  customer: string;
  property: string;
  unit: string;
  cleaner: string;
  op: string;
  contact: string;
  m: number;
  h: number;
  e: string;
  d: string;
  time: number;
  svc: number;
  stageI: number;
  subject: string;
}

export interface LiveEvent {
  id: number;
  type: IntelType;
  key: string;
  sev: Severity;
  stageIdx: number;
  p: EventParams;
  t: number;
  open: boolean;
  closeAt: number;
  resolvedAt?: number;
  /** Logged by this browser (store.log); kept when live-mode events are re-derived. */
  local?: boolean;
}

let SEQ = 0;

export function makeEvent(w: WorldIndex, jobs: Job[], type: IntelType, t: number, force?: Kind): LiveEvent {
  const [key, sev, stageIdx] = force ?? pick(KINDS[type]);
  let pool = jobs.filter((j) => !(j.stage === 4 && j.paid) && j.propKnown && (stageIdx < 0 || j.stage === stageIdx));
  if (!pool.length) pool = jobs.filter((j) => j.propKnown);
  const jb = pick(pool), pr = w.prop(jb.prop), start = t + rnd(-30, 90) * 60000;
  const p: EventParams = {
    jobId: jb.id, customer: w.cust(jb.cust).n, property: pr.n, unit: jb.unit, cleaner: w.teams[jb.team ?? pr.team]?.[0] ?? "", op: jb.owner || ME,
    contact: pick(w.customers).contacts[0], m: rnd(12, 95), h: rnd(2, 9), e: pick(["2 h", "3 h", "90 min"]), d: (Math.random() * 4 + 0.8).toFixed(1),
    time: start, svc: jb.svc, stageI: stageIdx >= 0 ? stageIdx : jb.stage, subject: "",
  };
  if (key === "tooShort") p.m = rnd(18, 40);
  if (key === "tooLong") p.m = rnd(240, 330);
  return { id: ++SEQ, type, key, sev, stageIdx: stageIdx < 0 ? p.stageI : stageIdx, p, t, open: type !== "actions", closeAt: t + rnd(3, 14) * 60000 };
}

/** An automatic action jobRUN took on a job (logAction). */
export function actionEvent(w: WorldIndex, jobs: Job[], key: string, j: Job, stageI?: number): LiveEvent {
  const pr = w.prop(j.prop);
  const e = makeEvent(w, jobs, "actions", Date.now(), [key, "info", key === "aiSender" ? 0 : stageI ?? j.stage]);
  Object.assign(e.p, { jobId: j.id, svc: j.svc, customer: w.cust(j.cust).n, property: pr.n, unit: j.unit, contact: j.email || j.contact || "", op: j.owner || ME, stageI: stageI ?? j.stage, subject: j.req?.subj || "" });
  if (key === "newReq") Object.assign(e.p, { contact: j.req?.from ?? "", subject: j.req?.subj ?? "" });
  e.stageIdx = stageI ?? j.stage;
  e.local = true;
  return e;
}

export function evText(e: LiveEvent, lang: Lang): [string, string] {
  const l = strings(lang);
  const p = { ...e.p, time: fmtTime(e.p.time, lang), service: SERVICES[lang][e.p.svc], stage: l.stages[e.p.stageI] };
  const fn = (l.ev as Record<string, (x: typeof p) => string[]>)[e.key];
  const [title = e.key, desc = ""] = fn ? fn(p) : [];
  return [title, desc];
}

export function seedLive(w: WorldIndex, jobs: Job[]): LiveEvent[] {
  const now = Date.now(), out: LiveEvent[] = [];
  const s: Record<IntelType, number> = { alerts: 7, alarms: 2, anomalies: 4, actions: 18 };
  INTEL_TYPES.forEach((k) => {
    for (let i = 0; i < s[k]; i++) {
      const e = makeEvent(w, jobs, k, now - rnd(1, 55) * 60000);
      e.closeAt = now + rnd(1, 12) * 60000;
      out.push(e);
    }
  });
  return out;
}

const RATE: Record<IntelType, number> = { alerts: 0.28, alarms: 0.08, anomalies: 0.14, actions: 0.7 };

/** One 5-second tick: close expired incidents, spawn new ones, keep a rolling 6-hour window. */
export function tickEvents(w: WorldIndex, jobs: Job[], live: LiveEvent[]): { live: LiveEvent[]; bumped: Set<IntelType> } {
  const now = Date.now(), bumped = new Set<IntelType>();
  let out = live.map((e) => (e.open && now > e.closeAt ? { ...e, open: false, resolvedAt: now } : e));
  INTEL_TYPES.forEach((k) => {
    if (Math.random() < RATE[k]) {
      out.push(makeEvent(w, jobs, k, now));
      bumped.add(k);
    }
  });
  out = out.filter((e) => now - e.t < 6 * 3600000);
  return { live: out, bumped };
}

export type Timeframe = "now" | "today" | "week" | "month" | "custom";
export interface HistoryView {
  events: LiveEvent[];
  from: number;
  to: number;
}
export const TF_EVENTS = { today: 1, week: 5.5, month: 21 };

/** A static, simulated history for past timeframes. */
export function buildHistory(w: WorldIndex, jobs: Job[], from: number, to: number, mult: number): HistoryView {
  const span = Math.max(1, to - from), out: LiveEvent[] = [];
  const base: Record<IntelType, number> = { alerts: 38, alarms: 9, anomalies: 17, actions: 140 };
  INTEL_TYPES.forEach((k) => {
    const n = Math.round(base[k] * mult * (0.85 + Math.random() * 0.3));
    for (let i = 0; i < n; i++) {
      const e = makeEvent(w, jobs, k, from + Math.random() * span);
      if (e.type !== "actions") { e.open = false; e.resolvedAt = e.t + rnd(5, 120) * 60000; }
      out.push(e);
    }
  });
  return { events: out, from, to };
}

/** Header badge count: open incidents (or last hour of actions) now; everything in a past timeframe. */
export function countFor(scope: LiveEvent[], type: IntelType, tf: Timeframe, now = Date.now()) {
  const ev = scope.filter((e) => e.type === type);
  if (tf !== "now") return ev.length;
  return type === "actions" ? ev.filter((e) => now - e.t < 3600000).length : ev.filter((e) => e.open).length;
}

export function ago(lang: Lang, e: LiveEvent, now = Date.now()) {
  return strings(lang).ago(Math.floor((now - e.t) / 60000));
}

/* ── Live mode: incidents derived from job state, actions from job_events (INTEGRATION.md §7) ── */

export interface RecentEvent {
  job_id: number;
  at: string;
  kind: string;
  actor_type: string;
}

const EVENT_KEY: Record<string, string> = { auto_confirm: "nudge1h", auto_nudge: "nudge5", stage: "zendesk", assign: "workapp", field: "aiSender" };
const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return -Math.abs(h || 1);
};

/** Incidents open while their condition holds, timed from when the condition began; actions from job_events. */
export function deriveLiveEvents(w: WorldIndex, jobs: Job[], recent: RecentEvent[], now = Date.now()): LiveEvent[] {
  const out: LiveEvent[] = [];
  const add = (type: IntelType, key: string, sev: Severity, j: Job, since: number) => {
    const pr = w.prop(j.prop);
    if (!pr) return;
    out.push({
      id: hashId(`${type}|${key}|${j.id}`), type, key, sev, stageIdx: j.stage, t: since, open: true, closeAt: Infinity,
      p: {
        jobId: j.id, customer: w.cust(j.cust).n, property: pr.n, unit: j.unit, cleaner: j.team != null ? w.teams[j.team]?.[0] ?? "" : "",
        op: j.owner || "—", contact: j.contact ?? j.req?.name ?? "", m: Math.max(0, Math.round((now - since) / 60000)), h: Math.max(0, Math.round((now - since) / 3600000)),
        e: "", d: "", time: j.dateAt ?? now, svc: j.svc, stageI: j.stage, subject: j.req?.subj ?? "",
      },
    });
  };
  for (const j of jobs) {
    if (!j.propKnown || (j.stage === 4 && j.paid)) continue;
    if (j.stage === 0 && !j.owner && now - j.stageAt > 30 * 60000) add("alerts", "unclaimed", "warning", j, j.stageAt + 30 * 60000);
    if (j.stage === 0 && j.owner && !j.teamOk && now - (j.assignedAt ?? j.stageAt) > 4 * 3600000) add("alerts", "pendingLong", "warning", j, (j.assignedAt ?? j.stageAt) + 4 * 3600000);
    if (j.unread) {
      const lastIn = [...j.thread].reverse().find((m) => m.dir === "in");
      add("alerts", "replyWait", "warning", j, lastIn?.t ?? now);
    }
    if (j.stage === 4 && j.qp && now - j.stageAt > 24 * 3600000) add("alerts", "quickpay", "critical", j, j.stageAt + 24 * 3600000);
    if (j.stage === 1 && j.dateAt && !j.checkin && now > j.dateAt + 5 * 60000) add("alarms", "noCheckin", "critical", j, j.dateAt + 5 * 60000);
    if (j.stage === 1 && j.dateAt && !j.teamOk && j.dateAt - now < 3600000 && j.dateAt > now) add("alarms", "noConfirm", "critical", j, j.dateAt - 3600000);
    if (j.stage === 3 && j.evidence === 0) add("anomalies", "noEvidence", "critical", j, j.stageAt);
    else if (j.stage === 3 && j.flag) add("anomalies", "tooShort", "critical", j, j.stageAt);
  }
  const byId = new Map(jobs.map((j) => [j.id, j]));
  for (const r of recent) {
    const j = byId.get("J" + r.job_id), key = EVENT_KEY[r.kind];
    if (!j || !key) continue;
    const t = Date.parse(r.at);
    if (now - t > 6 * 3600000) continue;
    add("actions", key, "info", j, t);
    const e = out[out.length - 1];
    e.id = hashId(`action|${r.job_id}|${r.at}|${r.kind}`);
    e.open = false;
  }
  return out;
}
