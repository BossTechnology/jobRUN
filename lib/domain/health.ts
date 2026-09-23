/* Pure functions ported unchanged from the prototype's PINCH WORLD / MAP MODE / HEADER EVENT SIM sections.
   INTEGRATION.md §4: "port them unchanged" — keep behavior identical to public/prototype.html. */
import type { Health, IncidentKind, Job } from "./types";

/** [first limit, critical limit] in minutes, or null when the lane has no clock. */
export function thresholdFor(j: Job): [number, number] | null {
  if (j.stage === 0) return j.owner ? [240, 480] : [30, 60];
  if (j.stage === 2) return [180, 300];
  if (j.stage === 4) return j.paid ? null : j.qp ? [1440, 2880] : [4320, 8640];
  return null;
}

export function health(j: Job, now = Date.now()): Health {
  if (j.delayed) return "on";
  if (j.flag || (j.stage === 3 && j.evidence === 0)) return "bad";
  const th = thresholdFor(j);
  if (!th) return "on";
  const ref = j.stage === 0 && j.owner ? (j.assignedAt ?? j.stageAt) : j.stageAt;
  const age = (now - ref) / 60000;
  if (age >= th[1]) return "crit";
  if (age >= th[0]) return "bad";
  if (age >= th[0] * 0.7) return "risk";
  return "on";
}

export const isBad = (j: Job, now = Date.now()) => ["bad", "crit"].includes(health(j, now));

export function jobCls(j: Job, now = Date.now()): string {
  if (j.stage === 4 && j.paid) return "paid";
  const h = health(j, now);
  return h === "bad" || h === "crit" ? h : "";
}

export function incKind(j: Job, now = Date.now()): IncidentKind {
  return health(j, now) === "crit" ? "crit" : isBad(j, now) ? "late" : j.unread ? "msg" : "risk";
}

/** Lane sort orders from renderBoard(). */
export function sortLane(stage: number, list: Job[]): Job[] {
  const out = [...list];
  if (stage === 0) out.sort((a, b) => Number(!!a.owner) - Number(!!b.owner) || a.stageAt - b.stageAt);
  else if (stage === 1) out.sort((a, b) => (a.dateAt ?? 0) - (b.dateAt ?? 0));
  else out.sort((a, b) => a.stageAt - b.stageAt);
  return out;
}

/** Worst-first order for the map tour. */
export function tourOrder(jobs: Job[], now = Date.now()): Job[] {
  const rank = (x: Job) => (health(x, now) === "crit" ? 0 : health(x, now) === "bad" ? 1 : 2);
  return jobs
    .filter((j) => isBad(j, now) || j.unread)
    .sort((a, b) => rank(a) - rank(b) || a.stageAt - b.stageAt);
}

/** Intake clocks (time-to-claim) only count Mon–Fri 9–5 in BUSINESS_TZ; job-time clocks run 24/7. */
export function isBizHours(tz: string, at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, weekday: "short", timeZone: tz }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  return !["Sat", "Sun"].includes(wd) && h >= 9 && h < 17;
}
