/* Print-ready job report, ported from jobReport(). In production this template renders server-side to a PDF
   stored in Supabase Storage and emailed on validation (INTEGRATION.md §10). */
import type { BoardCtx } from "@/lib/board/context";
import { priceOf } from "@/lib/domain/health";
import { dur, fmtDate, fmtDay, jobNo, money, winTxt } from "@/lib/domain/time";
import { EXPECT, SERVICES, type Job } from "@/lib/domain/types";
import { ME } from "@/lib/operators";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Placeholder evidence photo (the prototype's photoSrc). */
export function photoSrc(kind: "before" | "after", i: number) {
  const tones = kind === "before" ? ["#C9CED8", "#B9C0CC", "#D3D8E0"] : ["#DCE6DA", "#CFE0CC", "#E3EDE1"];
  const g = tones[i % tones.length], lbl = (kind === "before" ? "B" : "A") + (i + 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" fill="${g}"/><rect x="18" y="66" width="124" height="38" fill="#fff" opacity=".55"/><rect x="30" y="34" width="46" height="34" rx="3" fill="#fff" opacity=".7"/><circle cx="112" cy="40" r="13" fill="#fff" opacity=".7"/><text x="8" y="18" font-family="Arial" font-size="13" fill="#3A3A3A">${lbl}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function jobReport({ w, l, lang, toast }: BoardCtx, j: Job) {
  const T2 = l.st2, p = w.prop(j.prop), c = w.cust(j.cust), pr = priceOf(j, p), m = pr.price - pr.pay, exp = EXPECT[j.svc];
  const team = j.team != null ? w.teams[j.team] : null;
  const kv = (r: [string, string][]) => r.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join("");
  const shots = (kind: "before" | "after", n: number) => (n ? Array.from({ length: n }, (_, i) => `<img src="${photoSrc(kind, i)}">`).join("") : `<span class="mut">&mdash;</span>`);
  const pre = j.stage >= 3 ? Math.ceil(j.evidence / 2) : j.evidence, post = j.stage >= 3 ? j.evidence - pre : 0;
  const trail: [number, string][] = [[j.createdAt, T2.aReceived(j.req ? j.req.ch : "Gmail")], [j.assignedAt || j.createdAt, T2.aAssigned(j.owner || ME)]];
  if (j.dateAt) trail.push([j.dateAt, T2.aScheduled]);
  if (j.tArrive) trail.push([j.tArrive, T2.aCheckin]);
  if (j.tEnd) trail.push([j.tEnd, T2.aCompleted]);
  (j.actions ?? []).forEach((x) => trail.push([x.t, x.label + " — " + x.reason]));
  if (j.stage >= 4) trail.push([j.stageAt, T2.aConfirmed]);
  if (j.paid && j.paidAt) trail.push([j.paidAt, T2.aPaid]);
  trail.sort((a, b) => a[0] - b[0]);
  const css = `@page{margin:16mm}*{box-sizing:border-box}body{font:13px/1.5 'DM Sans',Arial,sans-serif;color:#111;margin:0;padding:28px}h1{font-size:20px;margin:0 0 2px}h2{font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8E96A8;margin:24px 0 8px;border-bottom:1px solid #D8DCE4;padding-bottom:5px}.sub{color:#6B7280;font-size:12px;margin-bottom:14px}.tag{display:inline-block;background:#111;color:#fff;font-size:10px;letter-spacing:.6px;padding:2px 7px;border-radius:4px;margin-right:8px;vertical-align:2px}.price{float:right;background:#4E7A3D;color:#fff;border-radius:7px;padding:6px 11px;font-weight:700}table{width:100%;border-collapse:collapse}th{width:150px;text-align:left;color:#6B7280;font-weight:400;padding:4px 8px 4px 0;vertical-align:top}td{padding:4px 0}img{width:118px;height:88px;object-fit:cover;border:1px solid #D8DCE4;border-radius:4px;margin:0 6px 6px 0}.mut{color:#8E96A8}.late{color:#BD4444;font-weight:700}.tl div{padding:3px 0 3px 14px;border-left:2px solid #D8DCE4}.tl b{font-weight:700}.tl span{display:block;font-size:11px;color:#8E96A8}.note{background:#F5F7FA;border:1px solid #D8DCE4;border-radius:6px;padding:8px 10px;margin:4px 0}@media print{body{padding:0}}`;
  const body = `<div class="price">${money(pr.price)} &middot; ${money(pr.pay)} &middot; ${((m / pr.price) * 100).toFixed(0)}%</div>
  <h1><span class="tag">${esc(l.stages[j.stage])}</span>${esc(p.n)} &middot; ${esc(j.unit)}</h1>
  <div class="sub">${jobNo(j)} &middot; ${esc(c.n)} &middot; ${esc(p.street)}, ${esc(p.city)}, ${p.st} ${p.zip} &middot; ${esc(T2.printed)} ${esc(fmtDate(Date.now(), lang))}</div>
  <h2>${esc(l.details)}</h2><table>${kv([[l.kv.cust, esc(c.n) + " &middot; " + esc(j.contact || "")], [l.fProp, esc(p.n) + " [" + esc(p.code) + "]"], [l.kv.unit, esc(j.unit)], [T2.location, esc(p.street) + ", " + esc(p.city) + ", " + p.st + " " + p.zip], [l.fSvc, esc(SERVICES[lang][j.svc]) + " &middot; " + esc(l.types[p.type as keyof typeof l.types])], [l.kv.date, j.dateAt ? esc(fmtDay(j.dateAt, lang)) + " &middot; " + esc(winTxt(j, lang)) + " ET" : "&mdash;"], [l.cleaner, team ? esc(team[0]) + " &middot; " + esc(team[1]) : "&mdash;"], [l.kv.owner, esc(j.owner || l.unassigned)], [l.fNotes, esc(j.f.notes || "—")]])}</table>
  <h2>${esc(T2.jobTracker)}</h2><table>${kv([[T2.arrival, j.tArrive ? '<span class="' + (j.dateEnd && j.tArrive > j.dateEnd ? "late" : "") + '">' + esc(fmtDate(j.tArrive, lang)) + "</span>" : "&mdash;"], [T2.jobEnd, j.tEnd ? esc(fmtDate(j.tEnd, lang)) : "&mdash;"], [T2.duration, j.tArrive && j.tEnd ? esc(dur(j.tEnd - j.tArrive)) + " / " + esc(T2.expected) + " " + esc(dur(exp * 60000)) : "&mdash;"], [T2.cleanerNotes2, esc(j.cnote || T2.noNotes)]])}</table>
  <h2>${esc(T2.evidence)}</h2><p><b>${esc(T2.before)}</b><br>${shots("before", pre)}</p><p><b>${esc(T2.after)}</b><br>${shots("after", post)}</p>
  ${j.actions?.length ? "<h2>" + esc(T2.actionsTaken) + "</h2>" + j.actions.map((x) => '<div class="note"><b>' + esc(x.label) + "</b> — " + esc(x.reason) + '<br><span class="mut">' + esc(fmtDate(x.t, lang)) + " &middot; " + esc(x.who) + "</span></div>").join("") : ""}
  <h2>${esc(T2.billing)}</h2><table>${kv([[T2.baseService, money(pr.base) + " / " + money(pr.basePay)], ...pr.ad.map((x): [string, string] => [esc(x.label), "+" + money(x.price) + " / " + money(x.pay) + ' <span class="mut">&middot; ' + esc(x.by) + "</span>"]), [T2.price, "<b>" + money(pr.price) + "</b>"], [T2.cleanerPay, money(pr.pay)], [T2.margin, money(m) + " &middot; " + ((m / pr.price) * 100).toFixed(1) + "%"], ["QuickBooks", j.paid ? esc(T2.paidOn(fmtDate(j.paidAt || j.stageAt, lang))) : esc(T2.awaiting)], [T2.po, j.po === "missing" ? esc(T2.poMissing) : esc(T2.poOk)], ["Zendesk", esc(j.zd)], ["Work App", esc(j.wa || "—")]])}</table>
  <h2>${esc(T2.audit)}</h2><div class="tl">${trail.map((x) => "<div><span>" + esc(fmtDate(x[0], lang)) + "</span><b>" + esc(x[1]) + "</b></div>").join("")}</div>`;
  const win = window.open("", "_blank");
  if (!win) { toast(T2.popupBlocked); return; }
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>jobRUN ${jobNo(j)}</title><style>${css}</style></head><body>${body}</body></html>`);
  win.document.close();
  setTimeout(() => {
    try { win.focus(); win.print(); } catch {}
  }, 400);
  toast(T2.reportOpened);
}
