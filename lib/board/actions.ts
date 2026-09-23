/* Job actions ported from the prototype's PENDING MODAL, ACTIONS and STAGE MODAL sections.
   Each works on the store; UI-only state (the prototype's PM object) stays in the modal components.
   TODO(prod): each write also goes through an adapter (recordAction, sendMessage, writeWorkApp — INTEGRATION.md §4). */
import { CONFIG } from "@/lib/config";
import { strings, type Lang } from "@/lib/i18n";
import { ME } from "@/lib/operators";
import { lowConf, priceOf } from "@/lib/domain/health";
import { etToEpoch, fmtDate, fmtDay, fmtTime, money, plus2, sameETDay } from "@/lib/domain/time";
import { EXPECT, SERVICES, type FieldKey, type Job } from "@/lib/domain/types";
import { pick, rnd, REQ_T, type Simulator } from "@/lib/sim/seed";
import type { WorldIndex } from "@/lib/sim/world";
import type { BoardStore } from "./store";

export interface ActionCtx {
  w: WorldIndex;
  store: BoardStore;
  sim: Simulator | null;
  lang: Lang;
  toast: (msg: string) => void;
  /** Id of the job open in the modal, if any. */
  openId: () => string | null;
}

export const ACTS: Record<number, string[]> = {
  1: ["addon", "reschedule", "team", "svc", "cancel"],
  2: ["addon", "extra", "delay", "partial", "cancel", "endman"],
  3: ["addon"],
  4: ["addon"],
};
export const ADDONS = [
  { k: "fridge", p: 45, c: 34 }, { k: "oven", p: 40, c: 30 }, { k: "carpet", p: 120, c: 90 },
  { k: "windows", p: 85, c: 64 }, { k: "balcony", p: 55, c: 41 }, { k: "garage", p: 70, c: 52 },
];

const note = (j: Job, text: string) => j.thread.push({ dir: "note", ch: "note", who: ME, text, t: Date.now() });

export function actLabel(lang: Lang, k: string, j?: Job) {
  const a = strings(lang).st2.acts as Record<string, string>;
  return k === "delay" && j?.delayed ? a.clearDelay : k === "reject" ? strings(lang).st2.reject : a[k];
}

/* ── Pending ─────────────────────────────────────────────── */

export function assignTo(c: ActionCtx, id: string, v: string) {
  c.store.update(id, (j) => {
    j.owner = v || null;
    j.assignedAt = v ? Date.now() : null;
  });
  const l = strings(c.lang);
  c.toast(v ? l.assignedToast(v) : l.unassignedToast);
}

export function confirmSender(c: ActionCtx, id: string, by: "ai" | "human", pm: { custSel: string; contactName: string; upd: boolean }) {
  c.store.update(id, (j) => {
    if (by === "human") {
      if (pm.custSel !== j.cust) {
        j.cust = pm.custSel;
        const first = c.w.props.find((x) => x.cust === j.cust);
        if (first) { j.prop = first.id; j.team = first.team; }
        j.propKnown = false;
        delete j.fsrc.prop;
      }
      j.contact = pm.contactName || j.req?.name;
    } else j.contact = j.req?.name;
    if (pm.upd || j.req?.k === "newContact") {
      const cu = c.w.cust(j.cust);
      if (j.contact && !cu.contacts.includes(j.contact)) cu.contacts.unshift(j.contact);
    }
    j.senderOk = true;
    j.senderBy = by;
    if (!j.propKnown && by === "human" && !lowConf(j)) j.propKnown = true;
  });
}

export function undoSender(c: ActionCtx, id: string) {
  c.store.update(id, (j) => {
    j.senderOk = false;
    j.senderBy = null;
  });
}

/** Returns true when the change sent a scheduled job back to Pending. */
export function setField(c: ActionCtx, id: string, k: FieldKey, v: string | number): boolean {
  const l = strings(c.lang);
  const cur = c.store.get(id);
  if (!cur) return false;
  let movedBack = false;
  if (cur.stage === 1 && ["prop", "svc", "date", "time"].includes(k)) movedBack = true;
  else if (cur.stage === 1) {
    c.store.update(id, (j) => {
      if (k === "unit") j.unit = String(v).trim();
      else j.f[k as "date" | "time" | "time2" | "notes"] = String(v);
      j.fsrc[k] = "you";
    });
    c.store.log("workapp", cur, 1);
    return false;
  }
  let fixedWindow = false;
  c.store.update(id, (j) => {
    if (movedBack) {
      j.stage = 0; j.stageAt = Date.now(); j.assignedAt = Date.now(); j.dateAt = null; j.teamOk = false; j.teamAsked = false;
      note(j, l.st2.editBack);
    }
    if (k === "prop") {
      if (!v) return;
      j.prop = String(v); j.propKnown = true; j.team = c.w.prop(j.prop).team; j.teamOk = false; j.teamAsked = false;
    } else if (k === "unit") j.unit = String(v).trim();
    else if (k === "svc") j.svc = Number(v);
    else j.f[k] = String(v);
    if (k === "time" && v && !j.f.time2) j.f.time2 = plus2(String(v));
    if (k === "time2" && v && j.f.time && String(v) <= j.f.time) { j.f.time2 = plus2(j.f.time); fixedWindow = true; }
    j.fsrc[k] = "you";
  });
  if (movedBack) { c.store.log("zendesk", cur, 0); c.toast(l.st2.movedBack); }
  if (fixedWindow) c.toast(l.st2.winFix);
  return movedBack;
}

export function setTeam(c: ActionCtx, id: string, team: number) {
  c.store.update(id, (j) => {
    j.team = team;
    j.teamOk = false;
    j.teamAsked = false;
  });
}

/** Cleaning teams free over the job's window, default team first (teamOptions). */
export function teamOptions(c: ActionCtx, j: Job) {
  const p = c.w.prop(j.prop), T = c.w.teams.length;
  // Live data may have no cleaning teams yet (PINCH's Pro list pending) or no property picked.
  if (!T || !p.id) return [];
  const pool = [...new Set([p.team % T, (p.team + 3) % T, (p.team + 7) % T])];
  const start = j.f.date && j.f.time ? etToEpoch(j.f.date, j.f.time) : null;
  const end = j.f.date ? etToEpoch(j.f.date, j.f.time2 || plus2(j.f.time || "09:00")) : null;
  return pool
    .map((i) => {
      const jobs = c.store.all().filter((x) => x.team === i && x.id !== j.id && x.dateAt && start && sameETDay(x.dateAt, start));
      const clash = start ? jobs.find((x) => x.dateAt! < (end || start + 7200000) && (x.dateEnd || x.dateAt! + 7200000) > start) : null;
      return { i, name: c.w.teams[i][0], phone: c.w.teams[i][1], jobs: jobs.length, clash, def: i === p.team };
    })
    .filter((o) => !o.clash)
    .sort((a, b) => Number(b.def) - Number(a.def) || a.jobs - b.jobs);
}

export function sendMsg(c: ActionCtx, id: string, ch: "email" | "sms" | "note", txt: string): boolean {
  const l = strings(c.lang), j0 = c.store.get(id);
  if (!j0 || !txt.trim()) return false;
  if (ch === "sms" && j0.team == null) { c.toast(l.noTeamYet); return false; }
  c.store.update(id, (j) => {
    j.thread.push({ dir: ch === "note" ? "note" : "out", ch, who: ch === "note" ? ME : `PINCH (${ME})`, text: txt.trim(), t: Date.now() });
    if (ch !== "note") j.unread = false;
  });
  if (ch !== "note") { c.store.log("zendesk", j0); c.toast(l.sent); }
  if (ch === "email") simulateReply(c, id, "email");
  return true;
}

export function textTeam(c: ActionCtx, id: string) {
  const l = strings(c.lang), j0 = c.store.get(id)!, p = c.w.prop(j0.prop);
  const when = etToEpoch(j0.f.date, j0.f.time), end = etToEpoch(j0.f.date, j0.f.time2 || plus2(j0.f.time));
  c.store.update(id, (j) => {
    j.thread.push({ dir: "out", ch: "sms", who: `PINCH (${ME})`, text: l.smsAsk(p.n, j.unit, fmtDay(when, c.lang), fmtTime(when, c.lang) + "–" + fmtTime(end, c.lang)), t: Date.now() });
    j.teamAsked = true;
  });
  c.store.log("nudge1h", j0, 0);
  c.toast(l.sent);
  simulateReply(c, id, "sms");
}

export function phoneConfirm(c: ActionCtx, id: string) {
  c.store.update(id, (j) => {
    note(j, strings(c.lang).phoneNote);
    j.teamOk = true;
    j.teamAsked = true;
  });
}

/** Simulation only: the property manager or cleaner answers after a few seconds. */
function simulateReply(c: ActionCtx, id: string, ch: "email" | "sms") {
  if (!CONFIG.SIMULATE) return;
  setTimeout(() => {
    const j0 = c.store.get(id);
    if (!j0 || (ch === "sms" && j0.stage !== 0)) return;
    const ans = {
      en: ["It's the standard turnover. Keys are at the leasing office after 9.", "Yes, same scope as last time. Anytime after 10 AM works.", "Unit confirmed. Please text the on-site manager when you arrive."],
      es: ["Es la limpieza de rotación estándar. Las llaves están en la oficina después de las 9.", "Sí, mismo alcance que la última vez. Cualquier hora después de las 10 AM.", "Unidad confirmada. Envíen un texto al administrador al llegar."],
    };
    c.store.update(id, (j) => {
      if (ch === "sms") {
        j.thread.push({ dir: "in", ch: "sms", who: c.w.teams[j.team!][0], text: strings(c.lang).smsYes, t: Date.now() });
        j.teamOk = true;
      } else {
        j.thread.push({ dir: "in", ch: "email", who: j.req?.name ?? j.contact ?? "", text: pick(ans[c.lang]), t: Date.now() });
        j.unread = true;
      }
    });
    if (ch !== "sms" && c.openId() !== id) c.toast(strings(c.lang).replyIn);
  }, ch === "sms" ? rnd(5000, 8000) : rnd(7000, 11000));
}

export function schedule(c: ActionCtx, id: string) {
  c.store.update(id, (j) => {
    j.dateAt = etToEpoch(j.f.date, j.f.time);
    j.dateEnd = etToEpoch(j.f.date, j.f.time2 || plus2(j.f.time));
    j.stage = 1; j.stageAt = Date.now(); j.wa = j.wa || "WA-" + rnd(210000, 219999); j.unread = false;
  });
  const j = c.store.get(id)!;
  c.store.log("workapp", j, 1);
  c.store.log("zendesk", j, 1);
  c.toast(strings(c.lang).scheduledToast(fmtDate(j.dateAt!, c.lang)));
}

/* ── Scheduled → Validation ──────────────────────────────── */

export type BackKind = "date" | "team" | "svc" | "partial";

export function backToPending(c: ActionCtx, id: string, kind: BackKind, why: string) {
  const l = strings(c.lang);
  c.store.update(id, (j) => {
    j.stage = 0; j.delayed = false; j.stageAt = Date.now(); j.assignedAt = Date.now();
    if (kind === "date" || kind === "partial") {
      j.f.date = ""; j.f.time = ""; j.f.time2 = ""; j.dateAt = null; j.dateEnd = null;
      if (kind === "date") { delete j.fsrc.date; delete j.fsrc.time; }
      if (kind === "partial") j.checkin = false;
    }
    j.teamOk = false; j.teamAsked = false;
    note(j, l.st2.backLog[kind] + (why ? " " + why : ""));
  });
  c.store.log("zendesk", c.store.get(id)!, 0);
  c.toast(l.st2.movedBack);
}

export function approveJob(c: ActionCtx, id: string) {
  c.store.update(id, (j) => {
    j.flag = false;
    if (!j.evidence) note(j, strings(c.lang).st2.noEvNote);
    j.stage = 4; j.stageAt = Date.now(); j.pdfSent = true;
  });
  c.store.log("zendesk", c.store.get(id)!, 4);
  c.toast(strings(c.lang).st2.approved);
}

export function rejectJob(c: ActionCtx, id: string, why: string) {
  const l = strings(c.lang);
  c.store.update(id, (j) => {
    j.stage = 0; j.stageAt = Date.now(); j.assignedAt = Date.now(); j.flag = false;
    j.f.date = ""; j.f.time = ""; j.f.time2 = ""; j.dateAt = null; j.dateEnd = null;
    j.teamOk = false; j.teamAsked = false; j.evidence = 0; j.checkin = false;
    note(j, l.st2.rejectNote + (why ? " " + why : ""));
  });
  c.store.log("zendesk", c.store.get(id)!, 0);
  c.toast(l.st2.rejected);
}

export function rate(c: ActionCtx, id: string, n: number) {
  c.store.update(id, (j) => {
    j.rating = n;
  });
}

export type ActResult =
  | { kind: "pending"; teamEdit?: boolean }
  | { kind: "closed" }
  | { kind: "compose"; text: string }
  | { kind: "stay" };

/** Runs an Actions-menu entry; every action records its reason (doAct). */
export function doAct(c: ActionCtx, id: string, k: string, reason: string, addonKey?: string): ActResult {
  const j0 = c.store.get(id)!, l = strings(c.lang), a = l.st2, label = actLabel(c.lang, k, j0);
  c.store.update(id, (j) => {
    j.actions = (j.actions ?? []).concat({ t: Date.now(), who: ME, key: k, label, reason });
  });
  const why = label + ": " + reason;
  if (k === "reschedule") { backToPending(c, id, "date", why); return { kind: "pending" }; }
  if (k === "team") { backToPending(c, id, "team", why); return { kind: "pending", teamEdit: true }; }
  if (k === "svc") { backToPending(c, id, "svc", why); return { kind: "pending" }; }
  if (k === "partial") { backToPending(c, id, "partial", why); return { kind: "pending" }; }
  if (k === "reject") { rejectJob(c, id, why); return { kind: "pending" }; }
  if (k === "cancel") {
    c.store.log("zendesk", j0, j0.stage);
    c.store.remove(id);
    c.toast(a.cancelled);
    return { kind: "closed" };
  }
  let result: ActResult = { kind: "stay" };
  c.store.update(id, (j) => {
    note(j, why);
    if (k === "addon") {
      const x = ADDONS.find((y) => y.k === addonKey);
      if (x) {
        const name = (a.addons as Record<string, string>)[x.k];
        j.addons = (j.addons ?? []).concat({ k: x.k, label: name, price: x.p, pay: x.c, by: ME, t: Date.now(), note: reason });
        note(j, a.addonNote(name, money(x.p)) + " — " + reason);
        if (j.team != null && j.stage < 3) j.thread.push({ dir: "out", ch: "sms", who: `PINCH (${ME})`, text: a.addonSms(name, c.w.prop(j.prop).n, j.unit), t: Date.now() });
      }
    }
    if (k === "extra") {
      const p = c.w.prop(j.prop);
      result = { kind: "compose", text: a.extraEmail((j.req ? j.req.name : j.contact || "").split(" ")[0], p.n, j.unit, SERVICES[c.lang][j.svc].toLowerCase(), reason) };
    }
    if (k === "delay") j.delayed = !j.delayed;
    if (k === "endman") { j.stage = 3; j.stageAt = Date.now(); j.tEnd = j.stageAt; j.checkin = true; }
  });
  const j = c.store.get(id)!;
  if (k === "addon") { c.toast(a.addonToast); c.store.log("workapp", j, j.stage); return result; }
  if (k === "extra") c.toast(a.extraToast);
  if (k === "delay") c.toast(j.delayed ? a.delayedToast : a.clearedToast);
  if (k === "endman") { c.store.log("zendesk", j, 3); c.toast(a.endedToast); }
  c.store.log("zendesk", j, j.stage);
  return result;
}

/** Fills the Job Tracker times, payment date and cleaner note the prototype derived on first render. */
export function ensureTrackerData(c: ActionCtx, id: string) {
  const j0 = c.store.get(id);
  if (!j0 || !CONFIG.SIMULATE) return;
  const needArrive = j0.stage >= 2 && !j0.tArrive, needEnd = j0.stage >= 3 && !j0.tEnd;
  const needNote = j0.stage >= 3 && j0.cnote === undefined, needPaid = j0.paid && !j0.paidAt;
  if (!needArrive && !needEnd && !needNote && !needPaid) return;
  const exp = EXPECT[j0.svc];
  c.store.update(id, (j) => {
    if (needArrive) j.tArrive = Math.max((j.assignedAt || j.createdAt) + 45 * 60000, (j.stage === 2 ? j.stageAt : j.stageAt - (exp + rnd(-20, 40)) * 60000) - rnd(2, 9) * 60000);
    if (needEnd) j.tEnd = j.stage === 3 ? j.stageAt : j.stageAt - rnd(60, 240) * 60000;
    if (needNote) j.cnote = Math.random() < 0.6 ? pick(strings(c.lang).st2.cleanerNotes) : "";
    if (needPaid) j.paidAt = j.stageAt + rnd(60, 600) * 60000;
  });
}

/* ── Simulation clock (tick) ─────────────────────────────── */

/** Clean completed jobs confirm themselves when the 4-hour review window closes. */
function autoConfirm(c: ActionCtx) {
  c.store.all().forEach((j) => {
    if (j.stage === 3 && !j.flag && j.evidence > 0 && Date.now() - j.stageAt >= 240 * 60000) {
      c.store.update(j.id, (d) => { d.stage = 4; d.stageAt = Date.now(); });
      c.store.log("zendesk", j, 4);
    }
  });
}

/** One 5-second tick of the prototype's simulation: payments, follow-ups and new requests. */
export function simTick(c: ActionCtx, ticks: number) {
  autoConfirm(c);
  if (!c.sim) return;
  const openId = c.openId();
  if (ticks % 5 === 0) {
    const cand = c.store.all().filter((j) => j.stage === 4 && !j.paid && Date.now() - j.stageAt > 30 * 60000);
    if (cand.length) {
      const pj = pick(cand);
      c.store.update(pj.id, (j) => { j.paid = true; j.paidAt = Date.now(); });
      c.store.log("paidQB", pj, 4); // TODO: payout orb (map mode) fires here
    }
  }
  if (ticks % 11 === 0) {
    const cand = c.store.all().filter((j) => !(j.stage === 4 && j.paid) && j.id !== openId);
    if (cand.length) {
      const j0 = pick(cand);
      const fu = j0.stage === 0
        ? { en: "Just following up on my earlier email — any update?", es: "Solo hago seguimiento a mi correo anterior, ¿alguna novedad?" }
        : { en: "Quick question about the schedule for this one.", es: "Una pregunta rápida sobre el horario de este trabajo." };
      const fromTeam = j0.stage >= 1 && j0.team != null && Math.random() < 0.5;
      c.store.update(j0.id, (j) => {
        j.thread.push({
          dir: "in", ch: fromTeam ? "sms" : "email",
          who: fromTeam ? c.w.teams[j.team!][0] : j.req ? j.req.name : j.contact ?? "",
          text: fromTeam ? (c.lang === "es" ? "Vamos a llegar 15 minutos tarde." : "Running about 15 minutes late.") : fu[c.lang],
          t: Date.now(),
        });
        j.unread = true;
      });
    }
  }
  if (ticks % 14 === 0 && c.store.all().filter((j) => j.stage === 0 && !j.owner).length < 10) {
    const nj = c.sim.newRequest(pick(REQ_T), 0);
    c.store.add(nj);
    c.store.log("newReq", nj, 0);
  }
}

export { priceOf };
