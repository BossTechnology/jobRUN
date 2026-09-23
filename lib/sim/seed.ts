/* Simulated jobs — ported from the prototype's REQ_T / baseJob / newRequest / newJob / seedJobs.
   Runs in the browser only (random + clock), so server and client never disagree on the seed. */
import { strings, type Lang } from "@/lib/i18n";
import { OPS } from "@/lib/operators";
import { etISO, etToEpoch, fmtDay, fmtTime, nextDow, plus2 } from "@/lib/domain/time";
import { SERVICES, type Job, type JobRequest, type Prop, type StageIndex } from "@/lib/domain/types";
import { hashStr, type WorldIndex } from "./world";

export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const UNITS = ["2B", "3D", "4B", "5A", "7A", "9F", "12C", "14E", "Lobby", "Bldg B", "Suite 210"];

type ReqTemplate = Omit<JobRequest, "prop"> & { prop: string; date: () => string };

export const REQ_T: ReqTemplate[] = [
  { k: "newContact", prop: "Avalon Heights", unit: "4B", from: "jim.carter@avalonproperties.com", name: "Jim Carter", ch: "Gmail", subj: "Need apt clean tomorrow", body: { en: "Need apt clean tomorrow, 4B.\n\nThanks,\nJim", es: "Necesito limpieza del depto mañana, 4B.\n\nGracias,\nJim" }, conf: 94, prev: "Mike Reyes", svc: 0, date: () => etISO(1), time: "" },
  { k: "structured", prop: "Uptown Residences", unit: "12C", from: "workorders@lpc.com", name: "Work Orders", ch: "Gmail", subj: "Work Order #48213 — Turnover Clean — Unit 12C", body: { en: "Property: Uptown Residences\nUnit: 12C\nService: Turnover clean (2BR)\nMove-in: Friday 9:00 AM\nAccess: Lockbox 4471\nRequested by: Mike Russo", es: "Propiedad: Uptown Residences\nUnidad: 12C\nServicio: Limpieza de rotación (2 hab.)\nMudanza: viernes 9:00 AM\nAcceso: caja de llaves 4471\nSolicitado por: Mike Russo" }, conf: 98, svc: 0, date: () => nextDow(5), time: "09:00", notes: "Lockbox 4471" },
  { k: "known", prop: "Maple Tower", unit: "7A", from: "sara.lin@greystar.com", name: "Sara Lin", ch: "Gmail", subj: "cleaning", body: { en: "Can you guys come Thursday? Same as last time.", es: "¿Pueden venir el jueves? Igual que la última vez." }, conf: 88, svc: 0, date: () => nextDow(4), time: "", unitAi: false },
  { k: "unknown", prop: "Lakeshore Apartments", unit: "3D", from: "tom.becker@gmail.com", name: "Tom Becker", ch: "Gmail", subj: "Move-out clean", body: { en: "Hi, I manage Lakeshore Apartments now. We need a move-out clean for 3D sometime next week.\n\nTom", es: "Hola, ahora administro Lakeshore Apartments. Necesitamos una limpieza de salida para el 3D la próxima semana.\n\nTom" }, conf: 61, svc: 0, date: () => "", time: "" },
  { k: "text", prop: "Riverside Lofts", unit: "Lobby", from: "+1 (617) 555-0147", name: "Ray Patel", ch: "Twilio", subj: "Text message", body: { en: "Common areas at Riverside Lofts need a refresh before Saturday's open house.", es: "Las áreas comunes de Riverside Lofts necesitan limpieza antes del open house del sábado." }, conf: 79, svc: 3, date: () => nextDow(5), time: "" },
  { k: "known", prop: "Peachtree Place", unit: "Bldg B", from: "ray.patel@cortland.com", name: "Ray Patel", ch: "Gmail", subj: "Post-construction clean — Building B, floors 2–4", body: { en: "Contractors finish Wednesday. Please schedule the post-construction clean for Building B, floors 2 through 4.", es: "Los contratistas terminan el miércoles. Programen la limpieza post-construcción del Edificio B, pisos 2 a 4." }, conf: 96, svc: 2, date: () => nextDow(4), time: "" },
  { k: "known", prop: "Campus View", unit: "Suite 210", from: "dee.morales@assetliving.com", name: "Dee Morales", ch: "Gmail", subj: "Guest suite before parents weekend", body: { en: "Please refresh the guest suite (210) before Friday afternoon.", es: "Por favor preparen la suite de huéspedes (210) antes del viernes por la tarde." }, conf: 91, svc: 4, date: () => nextDow(5), time: "12:00" },
  { k: "weak", prop: "The Parkline", unit: "Lobby", from: "frontdesk@parklinebos.com", name: "Front desk", ch: "Gmail", subj: "Help needed", body: { en: "Hi, we have a mess in the lobby after the event last night. Can someone come today?", es: "Hola, tenemos un desorden en el lobby después del evento de anoche. ¿Puede venir alguien hoy?" }, conf: 54, svc: 3, date: () => etISO(0), time: "" },
];

export class Simulator {
  readonly activeProps: Prop[];
  private seq = 10400;

  constructor(private w: WorldIndex) {
    const pool = w.props.filter((p) => p.n.length > 3);
    const out: Prop[] = [];
    for (let i = 0; i < 520; i++) out.push(pool[(i * 61 + 13) % pool.length]);
    this.activeProps = [...new Set(out)];
  }

  private baseJob(p: Prop, stage: StageIndex, ageMin: number): Job {
    const now = Date.now();
    return {
      id: "J" + ++this.seq, stage, prop: p.id, cust: p.cust, unit: pick(UNITS),
      svc: p.type === "mf" ? pick([0, 0, 0, 1, 4]) : p.type === "st" ? pick([0, 1]) : pick([3, 5, 2]),
      stageAt: now - ageMin * 60000, createdAt: now - ageMin * 60000, owner: null, assignedAt: null, senderOk: false, senderBy: null, propKnown: true,
      team: null, teamOk: false, teamAsked: false, dateAt: null, f: { date: "", time: "", time2: "", notes: "" }, fsrc: {}, checkin: false, evidence: 0, paid: false,
      zd: "ZD-" + rnd(40000, 49999), wa: null, po: p.type === "co" && Math.random() < 0.45 ? "missing" : "ok", rating: 0, pdfSent: false, paidAt: null,
      thread: [], flag: false, qp: false, checkinOffset: null, req: null,
    };
  }

  newRequest(tpl: ReqTemplate, ageMin: number): Job {
    const p = this.activeProps[hashStr(tpl.prop) % this.activeProps.length], j = this.baseJob(p, 0, ageMin);
    j.unit = tpl.unit; j.svc = tpl.svc;
    const { date, ...req } = tpl;
    j.req = { ...req, prop: p.n };
    j.contact = tpl.name; j.email = tpl.from;
    const low = tpl.conf < 75 || tpl.k === "unknown";
    j.propKnown = !low;
    if (!low) {
      j.fsrc.prop = "ai";
      if (tpl.unitAi === false) j.unit = "";
      else j.fsrc.unit = "ai";
      j.fsrc.svc = "ai";
    } else { j.unit = tpl.unit; j.fsrc.unit = "ai"; j.fsrc.svc = "ai"; }
    const d = date();
    if (d) { j.f.date = d; j.fsrc.date = "ai"; }
    if (tpl.time) { j.f.time = tpl.time; j.f.time2 = plus2(tpl.time); j.fsrc.time = "ai"; }
    if (tpl.notes) { j.f.notes = tpl.notes; j.fsrc.notes = "ai"; }
    j.team = p.team; j.thread = [];
    return j;
  }

  private genericReq(j: Job): JobRequest {
    const p = this.w.prop(j.prop), svcN = SERVICES.en[j.svc], contact = j.contact ?? "";
    return {
      k: "known", prop: p.n, unit: j.unit, svc: j.svc, from: j.email ?? "", name: contact, ch: "Gmail", conf: rnd(85, 98), subj: `${svcN} — ${p.n} ${j.unit}`,
      body: {
        en: `Hi team,\n\nPlease schedule a ${svcN.toLowerCase()} clean for ${p.n}, unit ${j.unit}.\n\nThanks,\n${contact.split(" ")[0]}`,
        es: `Hola equipo,\n\nPor favor programen una limpieza (${SERVICES.es[j.svc].toLowerCase()}) para ${p.n}, unidad ${j.unit}.\n\nGracias,\n${contact.split(" ")[0]}`,
      },
    };
  }

  newJob(stage: StageIndex, ageMin: number, lang: Lang): Job {
    const l = strings(lang);
    const p = pick(this.activeProps), j = this.baseJob(p, stage, ageMin), now = Date.now(), c = this.w.cust(p.cust);
    j.contact = p.mgr; j.email = p.email || p.mgr.split(" ")[0].toLowerCase() + "@" + c.dom;
    j.req = this.genericReq(j); j.owner = pick(OPS); j.assignedAt = j.stageAt + rnd(3, 25) * 60000; j.senderOk = true; j.senderBy = Math.random() < 0.75 ? "ai" : "human";
    j.fsrc = { prop: "ai", unit: "ai", svc: "ai" }; j.team = p.team; j.wa = "WA-" + rnd(210000, 219999);
    const dd = stage === 0 ? rnd(1, 4) : stage === 1 ? rnd(0, 5) : -rnd(0, 2);
    const iso = etISO(dd), tm = pick(["08:00", "09:00", "09:30", "10:00", "11:00", "13:00", "14:00", "15:30"]);
    if (stage === 0) {
      if (Math.random() < 0.6) {
        j.f.date = iso; j.fsrc.date = pick(["ai", "you"] as const);
        if (Math.random() < 0.6) { j.f.time = tm; j.f.time2 = plus2(tm); j.fsrc.time = "you"; }
      }
      j.teamAsked = Math.random() < 0.5; j.teamOk = j.teamAsked && Math.random() < 0.4;
      if (Math.random() < 0.25) j.unread = true;
      const when = etToEpoch(j.f.date || iso, j.f.time || tm);
      if (j.teamAsked) j.thread.push({ dir: "out", ch: "sms", who: `PINCH (${j.owner})`, text: l.smsAsk(p.n, j.unit, fmtDay(when, lang), fmtTime(when, lang)), t: now - rnd(10, 90) * 60000 });
      if (j.teamOk) j.thread.push({ dir: "in", ch: "sms", who: this.w.teams[j.team][0], text: l.smsYes, t: now - rnd(1, 9) * 60000 });
    } else {
      j.f.date = iso; j.f.time = tm; j.f.time2 = plus2(tm); j.fsrc.date = "you"; j.fsrc.time = "you"; j.teamOk = true; j.teamAsked = true;
      j.dateAt = etToEpoch(iso, tm); j.dateEnd = etToEpoch(iso, j.f.time2);
      if (stage === 1 && j.dateAt < now) { j.f.date = etISO(dd + 1); j.dateAt = etToEpoch(j.f.date, tm); }
    }
    j.checkin = stage >= 2; j.evidence = stage >= 3 ? rnd(6, 18) : stage === 2 ? rnd(3, 8) : 0;
    if (stage === 3 && Math.random() < 0.3) { j.flag = true; if (Math.random() < 0.4) j.evidence = 0; }
    if (stage === 4 && Math.random() < 0.3) j.qp = true;
    if (stage === 2 && Math.random() < 0.25) j.checkinOffset = [(Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08];
    return j;
  }

  seedJobs(lang: Lang): Job[] {
    this.seq = 10400; // first request is #10401, as in the prototype
    const jobs: Job[] = [];
    REQ_T.forEach((t, i) => jobs.push(this.newRequest(t, [42, 66, 17, 11, 8, 5, 2, 21][i])));
    ([[0, 74], [1, 168], [2, 58], [3, 66], [4, 84]] as [StageIndex, number][]).forEach(([s, n]) => {
      for (let i = 0; i < n; i++) jobs.push(this.newJob(s, s === 1 ? rnd(60, 2880) : s === 4 ? rnd(60, 3000) : rnd(8, [560, 0, 320, 330, 0][s]), lang));
    });
    for (let i = 0; i < 70; i++) {
      const j = this.newJob(4, rnd(600, 6000), lang);
      j.paid = true; j.qp = false;
      jobs.push(j);
    }
    return jobs;
  }
}
