"use client";
/* BOARD — five lanes, cards, paid row. Ported from renderBoard() / cardHtml() / timerHtml(). */
import { useEffect, useRef, useState } from "react";
import { useBoard, useJobs } from "@/lib/board/context";
import { health, isBad, jobCls, sortLane } from "@/lib/domain/health";
import { clockParts, jobNo, winTxt } from "@/lib/domain/time";
import { SERVICES, type Job } from "@/lib/domain/types";
import { locale } from "@/lib/i18n";
import { Icon, MSG_IC, STAGE_IC, SVC_IC, SVC_SHORT, TYPE_IC, TYPE_SHORT } from "@/lib/ui/icons";

function Timer({ j }: { j: Job }) {
  const { l, lang, now } = useBoard();
  const h = health(j, now);
  const out = (a: string, b = "", c = "") => (
    <span className={`jm-clock ${c}`}>
      {a}
      {b ? " " + b : ""}
    </span>
  );
  if (j.stage === 1 && j.dateAt)
    return out(new Date(j.dateAt).toLocaleDateString(locale(lang), { month: "numeric", day: "numeric", timeZone: "America/New_York" }) + ",", winTxt(j, lang));
  if (j.stage === 3) {
    if (j.flag || j.evidence === 0) return out(l.paused, "", "bad");
    const p = clockParts(240 * 60000 - (now - j.stageAt));
    return out(p[1] ? p[0] + " " + p[1] : p[0], l.leftWord);
  }
  if (j.stage === 4 && j.paid) return out(l.paidLbl, "", "paid");
  if (j.delayed) return out(l.st2.delayedLbl, "", "delayed");
  const ref = j.stage === 0 && j.owner ? (j.assignedAt ?? j.stageAt) : j.stageAt;
  const p = clockParts(now - ref);
  return out(p[0], p[1], h === "bad" || h === "crit" ? "bad" : h === "risk" ? "risk" : "");
}

function Card({ j, flashing }: { j: Job; flashing: boolean }) {
  const { w, l, lang, now, openJob } = useBoard();
  const ref = useRef<HTMLElement>(null);
  const p = w.prop(j.prop);
  const cls = jobCls(j, now);
  const unassigned = j.stage === 0 && !j.owner;

  useEffect(() => {
    if (flashing) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [flashing]);

  const name = j.propKnown ? p.n : <span className="jm-dash">— — — —</span>;
  const row2 = j.propKnown ? (
    `${p.city}, ${p.st}`
  ) : (
    <>
      {j.senderOk ? w.cust(j.cust).n : <span className="unk">{l.unknownShort}</span>} · {j.req?.from}
    </>
  );
  return (
    <article
      ref={ref}
      className={`jm-card ${cls}${unassigned && !/crit/.test(cls) ? " low" : ""}${flashing ? " flash" : ""}`}
      id={`card-${j.id}`}
      tabIndex={0}
      role="button"
      onClick={() => openJob(j.id)}
      onKeyDown={(e) => e.key === "Enter" && openJob(j.id)}
    >
      <div className="jm-top">
        <b className="jm-name">{name}</b>
        <span className="num">{jobNo(j)}</span>
      </div>
      <div className="jm-row2">
        <span>{row2}</span>
        <Timer j={j} />
      </div>
      <div className="jm-row3">
        {j.propKnown && (
          <>
            <span title={l.types[p.type as keyof typeof l.types]}>
              <Icon d={TYPE_IC[p.type]} sw={1.7} />
              {TYPE_SHORT[lang][p.type]}
            </span>
            <i className="jm-vr" />
          </>
        )}
        <span title={SERVICES[lang][j.svc]}>
          <Icon d={SVC_IC[j.svc]} sw={1.7} />
          {SVC_SHORT[lang][j.svc]}
        </span>
        {j.unread && (
          <span className="jm-msgdot" title={l.replyNew}>
            <Icon d={MSG_IC} sw={2.2} />
          </span>
        )}
      </div>
    </article>
  );
}

export function Board({ flashId }: { flashId: string | null }) {
  const { l, now } = useBoard();
  const jobs = useJobs();
  const [paidOpen, setPaidOpen] = useState(false);
  // TODO(filters): apply matches(j) from the FILTERS section once the rail is ported.
  const hasFilters = false;

  return (
    <main className="jm-board" id="board" aria-label="Job board">
      {(l.stages as string[]).map((s, i) => {
        let list = sortLane(i, jobs.filter((j) => j.stage === i));
        let paid: Job[] = [];
        if (i === 4) {
          paid = list.filter((j) => j.paid);
          list = list.filter((j) => !j.paid);
        }
        const nbad = list.filter((j) => isBad(j, now)).length;
        return (
          <section className="jm-col" aria-label={s} key={s}>
            <div className="jm-col-hd">
              <Icon d={STAGE_IC[i]} sw={1.5} />
              <span className="nm">{s}</span>
              <span className="ct">
                {list.length + paid.length}
                {nbad > 0 && <em>({nbad})</em>}
              </span>
            </div>
            <div className="jm-col-body">
              {list.map((j) => (
                <Card key={j.id} j={j} flashing={flashId === j.id} />
              ))}
              {paid.length > 0 && (
                <>
                  <button className="jm-paidrow" onClick={() => setPaidOpen((o) => !o)}>
                    {paidOpen ? l.hidePaid : l.paidRow(paid.length)}
                  </button>
                  {paidOpen && paid.map((j) => <Card key={j.id} j={j} flashing={flashId === j.id} />)}
                </>
              )}
              {!list.length && !paid.length && <div className="jm-col-empty">{hasFilters ? l.colEmptyF : l.colEmpty}</div>}
            </div>
          </section>
        );
      })}
    </main>
  );
}
