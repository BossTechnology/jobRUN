import { BoardStore } from "@/lib/board/store";
import type { ActionCtx } from "@/lib/board/actions";
import type { Job } from "@/lib/domain/types";
import { buildSimWorld, indexWorld } from "@/lib/sim/world";

export const world = indexWorld(buildSimWorld());
const p0 = world.props.find((p) => p.n.length > 3 && p.lat)!;

export function job(over: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: "J1", stage: 0, prop: p0.id, cust: p0.cust, unit: "4B", svc: 0, stageAt: now, createdAt: now,
    owner: null, assignedAt: null, senderOk: false, senderBy: null, propKnown: true, team: p0.team, teamOk: false, teamAsked: false,
    dateAt: null, f: { date: "", time: "", time2: "", notes: "" }, fsrc: {}, checkin: false, evidence: 0, paid: false, paidAt: null,
    zd: "ZD-1", wa: null, po: "ok", rating: 0, pdfSent: false, thread: [], flag: false, qp: false, checkinOffset: null, req: null,
    ...over,
  };
}

export const minutesAgo = (m: number) => Date.now() - m * 60000;

export function ctxWith(jobs: Job[]) {
  const store = new BoardStore();
  store.set(jobs);
  const toasts: string[] = [];
  const ctx: ActionCtx = { w: world, store, sim: null, lang: "en", toast: (m) => toasts.push(m), openId: () => null };
  return { store, ctx, toasts };
}
