"use client";
/* Pieces shared by the Pending and Stage modals (headExtras, priceBadge, assignSelect, srcTag, locRow, roDetails, threadLeft). */
import { useEffect, useRef } from "react";
import { assignTo, type ActionCtx } from "@/lib/board/actions";
import { useBoard, useJobs } from "@/lib/board/context";
import { capLevel, priceOf, workload } from "@/lib/domain/health";
import { fmtDate, fmtTime, money, winTxt } from "@/lib/domain/time";
import { SERVICES, type FieldKey, type Job } from "@/lib/domain/types";
import { locale } from "@/lib/i18n";
import { ME, OPS } from "@/lib/operators";
import { Icon, P } from "@/lib/ui/icons";
import { jobReport } from "./report";

export type Channel = "email" | "sms" | "note";

export const PIN_IC = '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>';
const DL_IC = '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/>';
const CLOCK_IC = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';

export function useActionCtx(openId: string | null): ActionCtx {
  const { w, store, sim, lang, toast } = useBoard();
  return { w, store, sim, lang, toast, openId: () => openId };
}

export function PriceBadge({ j }: { j: Job }) {
  const { w, l } = useBoard();
  const { price, pay } = priceOf(j, w.prop(j.prop));
  return (
    <span className="jm-price" title={`${l.st2.price} / ${l.st2.cleanerPay}`}>
      <b>{money(price)}</b>
      <span>{money(pay)}</span>
      <i>{(((price - pay) / price) * 100).toFixed(0)}%</i>
    </span>
  );
}

export function CapMeter({ n }: { n: number }) {
  const { l } = useBoard();
  const lv = capLevel(n);
  return (
    <span className={`jm-cap lv${lv}`} title={`${l.st2.capacity[lv as 1 | 2 | 3]} · ${l.load(n)}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= lv ? "on" : ""} />
      ))}
    </span>
  );
}

export function HeadExtras({ j }: { j: Job }) {
  const ctx = useBoard();
  const { l } = ctx;
  const jobs = useJobs();
  const act = useActionCtx(j.id);
  return (
    <>
      <PriceBadge j={j} />
      {j.stage >= 3 && (
        <button className="jm-dl" onClick={() => jobReport(ctx, j)} title={l.st2.download}>
          <Icon d={DL_IC} sw={2} />
        </button>
      )}
      <label className="jm-assign">
        <span>{l.assignedTo}</span>
        <span className="jm-assign-w">
          <select className="jm-sel" value={j.owner ?? ""} onChange={(e) => assignTo(act, j.id, e.target.value)}>
            {!j.owner && <option value="">{l.unassigned}</option>}
            <option value={ME}>{l.meOpt(ME)}</option>
            {OPS.filter((o) => o !== ME).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {j.owner && <option value="">{l.unassigned}</option>}
          </select>
          {j.owner && <CapMeter n={workload(jobs, j.owner)} />}
        </span>
      </label>
    </>
  );
}

export function SrcTag({ j, k }: { j: Job; k: FieldKey }) {
  const { l } = useBoard();
  const s = j.fsrc[k];
  if (!s) return null;
  return <span className={`jm-src ${s}`}>{s === "ai" ? l.tagAi : l.tagYou}</span>;
}

/** Address row; opens the job's location map. */
export function LocRow({ j }: { j: Job }) {
  const { w, l, openMap } = useBoard();
  const p = w.prop(j.prop);
  return (
    <div className="full">
      <label className="jm-lbl">{l.st2.location}</label>
      {j.propKnown ? (
        <button className="jm-lc" onClick={() => openMap(j.id)}>
          <Icon d={PIN_IC} sw={2} />
          <span>{p.street}, {p.city}, {p.st} {p.zip}</span>
        </button>
      ) : (
        <div className="jm-ro jm-muted">{l.st2.pickPropLoc}</div>
      )}
    </div>
  );
}

function F({ lab, cls = "", children }: { lab: string; cls?: string; children: React.ReactNode }) {
  return (
    <div className={cls === "hl" ? "" : cls}>
      <label className="jm-lbl">{lab}</label>
      <div className={`jm-ro${cls === "hl" ? " hl" : ""}`}>{children}</div>
    </div>
  );
}

export function RoDetails({ j }: { j: Job }) {
  const { w, l, lang } = useBoard();
  const p = w.prop(j.prop);
  const v = (x: string | undefined | null) => (x ? x : <span className="jm-muted">—</span>);
  return (
    <div className="jm-fields jm-f3 jm-f3ro">
      <F lab={l.fProp} cls="span2">{v(j.propKnown ? p.n + " · " + p.city : "")}</F>
      <F lab={l.fUnit}>{v(j.unit)}</F>
      <LocRow j={j} />
      <F lab={l.fSvc}>{v(SERVICES[lang][j.svc])}</F>
      <F lab={l.fDate} cls="hl">
        {j.dateAt ? (
          <>
            <Icon d={P.cal} sw={2} />
            {new Date(j.dateAt).toLocaleDateString(locale(lang), { weekday: "short", month: "numeric", day: "numeric", timeZone: "America/New_York" })}
          </>
        ) : (
          v("")
        )}
      </F>
      <F lab={l.st2.window} cls="hl">
        {j.dateAt ? (
          <>
            <Icon d={CLOCK_IC} sw={2} />
            {winTxt(j, lang)}
          </>
        ) : (
          v("")
        )}
      </F>
      <F lab={l.fNotes} cls="full">{v(j.f.notes)}</F>
    </div>
  );
}

/** Left column: original request, unified thread and composer. */
export function Thread({ j, compose, setCompose, ch, setCh, onSend }: { j: Job; compose: string; setCompose: (v: string) => void; ch: Channel; setCh: (c: Channel) => void; onSend: () => void }) {
  const { l, lang } = useBoard();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [j.thread.length]);
  const req = j.req;
  const first = (req?.name ?? j.contact ?? "").split(" ")[0];
  const tabs: [Channel, React.ReactNode][] = [
    ["email", <><Icon d={P.mail} sw={2} />{l.toPM(first)}</>],
    ["sms", <><Icon d={P.chat} sw={2} />{l.toTeam}</>],
    ["note", l.noteTab],
  ];
  const ph = ch === "email" ? l.composePh : ch === "sms" ? l.smsPh : l.notePh;
  return (
    <div className="jm-rq-left">
      <div className="jm-thread" ref={ref}>
        {req && (
          <div className="jm-msg orig">
            <div className="jm-msg-h">
              <span className="jm-tag gray">{l.origTag}</span> {req.name} &lt;{req.from}&gt; · {req.ch} · {fmtDate(j.createdAt, lang)}
            </div>
            <div className="jm-msg-s">{req.subj}</div>
            <div className="jm-msg-b pre">{req.body[lang]}</div>
          </div>
        )}
        {j.thread.map((m, i) => (
          <div key={i} className={`jm-msg ${m.dir}${m.ch === "sms" ? " sms" : ""}${m.ch === "note" ? " note" : ""}`}>
            <div className="jm-msg-h">
              {m.ch === "sms" ? "SMS · " : m.ch === "note" ? "" : "Email · "}
              {m.ch === "note" ? l.noteBy(m.who) : m.who} · {fmtTime(m.t, lang)}
            </div>
            <div className="jm-msg-b">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="jm-composer">
        <textarea className="jm-ta" placeholder={ph} value={compose} onChange={(e) => setCompose(e.target.value)} />
        <div className="jm-tabs">
          {tabs.map(([k, t]) => (
            <button key={k} className={`jm-tab${ch === k ? " on" : ""}`} onClick={() => setCh(k)}>
              {t}
            </button>
          ))}
          <button className="jm-btn sm pri" style={{ marginLeft: "auto" }} onClick={onSend}>
            {l.send}
          </button>
        </div>
      </div>
    </div>
  );
}
