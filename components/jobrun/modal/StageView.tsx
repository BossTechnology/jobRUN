"use client";
/* STAGE MODAL — In Progress, Complete and Validation: tabs for details, Job Tracker and billing.
   Ported from openStage() / renderStage() / detailsTab() / trackerTab() / billingTab(). */
import { useState } from "react";
import { rate, sendMsg, type ActResult } from "@/lib/board/actions";
import { useBoard } from "@/lib/board/context";
import { miles, priceOf } from "@/lib/domain/health";
import { dur, fmtDate, fmtTime, jobNo, money, winTxt } from "@/lib/domain/time";
import { EXPECT, type Job } from "@/lib/domain/types";
import { locale } from "@/lib/i18n";
import { ME } from "@/lib/operators";
import { Icon, P } from "@/lib/ui/icons";
import { ActionFooter, NO_ACT, type ActState } from "./ActionFooter";
import { RoDetails, Thread, useActionCtx, type Channel } from "./parts";
import { photoSrc } from "./report";

export type StageTab = "details" | "tracker" | "billing";
const tabsFor = (j: Job): StageTab[] => (j.stage === 4 ? ["details", "tracker", "billing"] : ["details", "tracker"]);
export const defaultTab = (j: Job): StageTab => (j.stage === 4 ? "billing" : j.stage >= 2 ? "tracker" : "details");

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jm-pane">
      <div className="jm-pt">{title}</div>
      {children}
    </div>
  );
}

function Kv({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <dl className="jm-kv wide">
      {rows.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailsTab({ j }: { j: Job }) {
  const { w, l } = useBoard();
  const c = w.cust(j.cust), team = j.team != null ? w.teams[j.team] : null;
  return (
    <>
      <Sec title={l.step1}>
        <div className="jm-ok">
          <Icon d={P.check} sw={2.4} />
          <div><b>{j.contact ?? ""} · {c.n}</b><small>{j.email ?? ""}</small></div>
        </div>
      </Sec>
      <Sec title={l.details}><RoDetails j={j} /></Sec>
      <Sec title={l.cleaner}>
        <div className="jm-team">
          <div className="jm-team-i"><Icon d={P.team} sw={1.8} /></div>
          <div className="jm-team-m"><b>{team ? team[0] : "—"}</b><small>{team ? team[1] : ""}{j.qp ? " · " + l.quickPay : ""}</small></div>
          <span className="jm-state ok">{l.confirmedTeam}</span>
        </div>
      </Sec>
    </>
  );
}

function PhotoRow({ kind, n, onOpen }: { kind: "before" | "after"; n: number; onOpen: (i: number) => void }) {
  if (!n) return <div className="jm-muted">—</div>;
  return (
    <div className="jm-shots">
      {Array.from({ length: Math.min(n, 6) }, (_, i) => (
        <button key={i} className="jm-shot" onClick={() => onOpen(i)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG placeholders until TracWork evidence URLs land */}
          <img src={photoSrc(kind, i)} alt={`${kind} ${i + 1}`} />
        </button>
      ))}
      {n > 6 && <span className="jm-more">+{n - 6}</span>}
    </div>
  );
}

function TrackerTab({ j, onPhoto }: { j: Job; onPhoto: (kind: "before" | "after", i: number) => void }) {
  const { w, l, lang, now } = useBoard();
  const ctx = useActionCtx(j.id);
  const T2 = l.st2, p = w.prop(j.prop), exp = EXPECT[j.svc];
  const state: [string, string] = j.stage === 1 ? ["", T2.notStarted] : j.stage === 2 ? (j.delayed ? ["delay", T2.delayedLbl] : ["prog", T2.inProgress]) : ["done", T2.completed];
  const arrive = j.stage >= 2 ? j.tArrive ?? null : null;
  // The prototype re-rolled start on every render; derive it once from arrival instead.
  const start = arrive ? arrive + 5 * 60000 : null;
  const end = j.stage >= 3 ? j.tEnd ?? null : null;
  const late = !!(arrive && j.dateEnd && arrive > j.dateEnd);
  const win = j.dateAt
    ? `${new Date(j.dateAt).toLocaleDateString(locale(lang), { weekday: "short", month: "numeric", day: "numeric", timeZone: "America/New_York" })} · ${winTxt(j, lang)}`
    : "—";
  const cell = (lab: string, val: React.ReactNode, bad = false) => (
    <div className="jm-cell"><span>{lab}</span><b className={bad ? "late" : ""}>{val}</b></div>
  );
  const pre = j.stage === 2 ? j.evidence : Math.ceil(j.evidence / 2), post = j.stage >= 3 ? j.evidence - pre : 0;

  const flagged = j.flag || j.evidence === 0, left = 240 * 60000 - (now - j.stageAt);
  const reasons: string[] = [];
  if (j.evidence === 0) reasons.push(T2.rNoEv);
  if (j.flag && j.evidence > 0) reasons.push(T2.rShort);

  return (
    <>
      <Sec title={T2.jobTracker}>
        <div className="jm-trk-head"><span className={`jm-trk-state ${state[0]}`}>{state[1]}</span></div>
        <div className="jm-tlwrap"><div className="jm-tl"><span>{T2.window}</span><b>{win}</b></div></div>
        <div className="jm-cells">
          {cell(T2.arrival, arrive ? fmtTime(arrive, lang) + (late ? " · " + T2.late : "") : "—", late)}
          {cell(T2.jobStart, start ? fmtTime(start, lang) : "—", late)}
          {cell(T2.jobEnd, end ? fmtTime(end, lang) : "—")}
          {cell(T2.duration, start ? <>{dur((end || now) - start)} <span className="jm-muted">/ {dur(exp * 60000)}</span></> : "—")}
        </div>
      </Sec>
      {j.stage === 1 && j.dateAt && (() => {
        const t1 = j.dateAt - 3600000, t2 = (j.dateEnd || j.dateAt) + 300000, sent1 = now > t1;
        return (
          <Sec title={T2.autoMsgs}>
            <div className="jm-steps">
              <div className={sent1 ? "ok" : ""}><i>{sent1 && <Icon d={P.check} sw={3} />}</i>{T2.nudge1h(fmtDate(t1, lang))}</div>
              <div><i />{T2.nudge5(fmtTime(t2, lang))}</div>
            </div>
          </Sec>
        );
      })()}
      {j.stage >= 2 && (
        <>
          <Sec title={T2.evidence}>
            <div className="jm-shotblock">
              <div className="jm-shot-h">{T2.before} <span className="jm-muted">{pre ? l.photos(pre) : ""}</span></div>
              <PhotoRow kind="before" n={pre} onOpen={(i) => onPhoto("before", i)} />
            </div>
            {j.stage >= 3 && (
              <div className="jm-shotblock">
                <div className="jm-shot-h">{T2.after} <span className="jm-muted">{post ? l.photos(post) : ""}</span></div>
                <PhotoRow kind="after" n={post} onOpen={(i) => onPhoto("after", i)} />
              </div>
            )}
            {j.evidence === 0 && <div className="jm-banner warn"><b>{T2.evIncomplete}</b><span>{T2.evIncompleteD(l.stages[j.stage])}</span></div>}
            {j.checkinOffset && (
              <div className="jm-banner warn">
                <b>{T2.locTitle}</b>
                <span>{l.checkinOff(miles(p, { lat: p.lat + j.checkinOffset[0], lng: p.lng + j.checkinOffset[1] }).toFixed(1))}</span>
              </div>
            )}
          </Sec>
          <Sec title={T2.cleanerNotes2}>{j.cnote ? <div className="jm-quote" style={{ margin: 0 }}>{j.cnote}</div> : <div className="jm-muted">{T2.noNotes}</div>}</Sec>
        </>
      )}
      {!!j.actions?.length && (
        <Sec title={T2.actionsTaken}>
          <div className="jm-trail">
            {j.actions.map((x, i) => (
              <div key={i}><span>{fmtDate(x.t, lang)} · {x.who}</span><b>{x.label}</b> — {x.reason}</div>
            ))}
          </div>
        </Sec>
      )}
      {j.stage === 3 && (
        <Sec title={T2.review}>
          {flagged ? (
            <div className="jm-banner bad"><b>{T2.paused}</b><span>{reasons.join(" · ")}</span></div>
          ) : (
            <div className="jm-muted" style={{ marginBottom: 8 }}>{T2.autoConfirm(dur(Math.max(0, left)))}</div>
          )}
          <Kv
            rows={[
              [T2.pinchRating, <span key="s" className="jm-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`jm-star${j.rating >= n ? " on" : ""}`} onClick={() => rate(ctx, j.id, n)} aria-label={String(n)}>★</button>)}</span>],
              [T2.custRating, <span key="c" className="jm-muted">{T2.notYet}</span>],
              [T2.pdf, <span key="p" className="jm-muted">{T2.pdfOnConfirm}</span>],
            ]}
          />
        </Sec>
      )}
      {j.stage === 4 && <Sec title={T2.review}><Kv rows={[[T2.pinchRating, j.rating ? "★".repeat(j.rating) : "—"], [T2.pdf, T2.pdfSent]]} /></Sec>}
    </>
  );
}

function BillingTab({ j }: { j: Job }) {
  const { w, l, lang } = useBoard();
  const T2 = l.st2, pr = priceOf(j, w.prop(j.prop)), m = pr.price - pr.pay;
  const t0 = j.createdAt, ta = j.assignedAt || t0 + 600000, span = Math.max(1, j.stageAt - ta);
  const trail: [number, string][] = [[t0, T2.aReceived(j.req ? j.req.ch : "Gmail")], [ta, T2.aAssigned(j.owner || ME)], [ta + span * 0.25, T2.aScheduled], [ta + span * 0.5, T2.aCheckin], [ta + span * 0.8, T2.aCompleted], [j.stageAt, T2.aConfirmed]];
  (j.actions ?? []).forEach((x) => trail.push([x.t, x.label + " — " + x.reason]));
  trail.sort((a, b) => a[0] - b[0]);
  if (j.paid && j.paidAt) trail.push([j.paidAt, T2.aPaid]);
  return (
    <>
      <Sec title={T2.billing}>
        <Kv
          rows={[
            [T2.baseService, <>{money(pr.base)} <span className="jm-muted">/ {money(pr.basePay)}</span></>],
            ...pr.ad.map((x): [React.ReactNode, React.ReactNode] => [<>{x.label} <span className="jm-muted">· {x.by}</span></>, <>+{money(x.price)} <span className="jm-muted">/ {money(x.pay)}</span></>]),
            [T2.price, <b key="p">{money(pr.price)}</b>],
            [T2.cleanerPay, money(pr.pay)],
            [T2.margin, <b key="m" className="jm-margin">{money(m)} · {((m / pr.price) * 100).toFixed(1)}%</b>],
          ]}
        />
      </Sec>
      <Sec title={T2.payment}>
        <Kv
          rows={[
            ["QuickBooks", j.paid && j.paidAt ? <span className="jm-okc">{T2.paidOn(fmtDate(j.paidAt, lang))}</span> : T2.awaiting],
            [l.quickPay, j.qp ? T2.qpYes : T2.qpNo],
            [T2.po, j.po === "missing" ? <span className="jm-badc">{T2.poMissing}</span> : T2.poOk],
          ]}
        />
      </Sec>
      <Sec title={T2.audit}>
        <div className="jm-muted" style={{ marginBottom: 8 }}>{jobNo(j)} · Zendesk {j.zd}{j.wa ? " · Work App " + j.wa : ""}</div>
        <div className="jm-trail">
          {trail.map(([t, x], i) => (
            <div key={i}><span>{fmtDate(t, lang)}</span>{x}</div>
          ))}
        </div>
      </Sec>
    </>
  );
}

export function StageView({ j, initialTab, onActResult }: { j: Job; initialTab?: StageTab; onActResult: (r: ActResult | { kind: "approved" }) => void }) {
  const { w, l } = useBoard();
  const ctx = useActionCtx(j.id);
  const [tab, setTab] = useState<StageTab>(initialTab ?? defaultTab(j));
  const [compose, setCompose] = useState("");
  const [ch, setCh] = useState<Channel>("email");
  const [act, setActState] = useState<ActState>(NO_ACT);
  const [lb, setLb] = useState<{ kind: "before" | "after"; i: number } | null>(null);
  const tabs = tabsFor(j);
  const cur = tabs.includes(tab) ? tab : "details";
  const p = w.prop(j.prop);

  return (
    <div className="jm-rq">
      <Thread j={j} compose={compose} setCompose={setCompose} ch={ch} setCh={setCh} onSend={() => sendMsg(ctx, j.id, ch, compose) && setCompose("")} />
      <div className="jm-gutter" />
      <div className="jm-rq-right jm-stage-right">
        <div className="jm-tabbar">
          {tabs.map((t) => (
            <button key={t} className={`jm-tabbtn${cur === t ? " on" : ""}`} onClick={() => setTab(t)}>{l.st2.tabs[t]}</button>
          ))}
        </div>
        <div className="jm-tabbody">
          {cur === "details" ? <DetailsTab j={j} /> : cur === "tracker" ? <TrackerTab j={j} onPhoto={(kind, i) => setLb({ kind, i })} /> : <BillingTab j={j} />}
        </div>
        {(j.stage === 2 || j.stage === 3) && (
          <ActionFooter
            j={j}
            st={act}
            set={(x) => setActState((s) => ({ ...s, ...x }))}
            onResult={(r) => {
              if (r.kind === "compose") { setCh("email"); setCompose(r.text); }
              if (r.kind === "approved") setTab("billing");
              onActResult(r);
            }}
          />
        )}
      </div>
      {lb && (
        <div className="jm-lb" onClick={() => setLb(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG placeholder */}
          <img src={photoSrc(lb.kind, lb.i)} alt="" />
          <div className="jm-lb-c">{l.st2[lb.kind]} {lb.i + 1} · {p.n} {j.unit}</div>
        </div>
      )}
    </div>
  );
}
