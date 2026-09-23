"use client";
/* Alert / Alarm / Anomaly / Action Intelligence modal (openIntel / renderIntel / item). */
import { useEffect } from "react";
import { useBoard, useEventScope } from "@/lib/board/context";
import { ago, CHANNEL, evText, type IntelType, type LiveEvent } from "@/lib/board/events";
import { fmtDate } from "@/lib/domain/time";

const ICON_BG: Record<IntelType, string> = { alerts: "#F0D4D4", alarms: "#FFF8DE", anomalies: "#F1DEC4", actions: "#E8F0FE" };

function topBy(list: LiveEvent[], fn: (e: LiveEvent) => string): [string, number] {
  const m: Record<string, number> = {};
  list.forEach((e) => (m[fn(e)] = (m[fn(e)] || 0) + 1));
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glob-modal-section">
      <div className="glob-section-title">{title}</div>
      {children}
    </div>
  );
}

function Pill({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div className="glob-pill">
      <span className="glob-pill-count" style={{ color }}>{n}</span>
      <span className="glob-pill-label">{label}</span>
    </div>
  );
}

export function IntelModal({ type, rangeText, onClose }: { type: IntelType; rangeText: string; onClose: () => void }) {
  const { l, lang, tf, now, jumpTo } = useBoard();
  const scope = useEventScope();
  const all = scope.filter((e) => e.type === type).sort((a, b) => b.t - a.t);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const when = (e: LiveEvent) => (tf === "now" ? ago(lang, e, now) : fmtDate(e.t, lang));
  let summary: React.ReactNode, list: LiveEvent[], lt: string;
  if (type === "actions") {
    const by = (k: string) => all.filter((e) => CHANNEL[e.key] === k).length;
    summary = (
      <div className="glob-summary">
        <Pill n={all.length} label={l.total} color="var(--black)" />
        {["TrueDialog", "Zendesk", "Work App", "AI", "Gmail", "QuickBooks"].map((k) => <Pill key={k} n={by(k)} label={k} color="#4A6FA5" />)}
      </div>
    );
    list = all.slice(0, 8);
    lt = l.recent;
  } else {
    const open = tf === "now" ? all.filter((e) => e.open) : all;
    const crit = open.filter((e) => e.sev === "critical"), warn = open.filter((e) => e.sev === "warning"), res = all.filter((e) => !e.open);
    summary = (
      <div className="glob-summary">
        <Pill n={crit.length} label={l.critical} color="var(--red)" />
        <Pill n={warn.length} label={l.warning} color="#A68B52" />
        {tf === "now" ? <Pill n={res.length} label={l.resolved} color="#4E7A3D" /> : <Pill n={all.length} label={l.total} color="var(--black)" />}
      </div>
    );
    list = tf === "now" ? [...crit, ...warn].slice(0, 6) : all.slice(0, 8);
    lt = tf === "now" ? l.mostUrgent : l.recent;
  }

  const base = tf === "now" && type !== "actions" ? all.filter((e) => e.open) : all;
  const pats: [string, string, string][] = [];
  if (base.length) {
    const pr = topBy(base, (e) => e.p.property), op = topBy(base, (e) => e.p.op), cl = topBy(base, (e) => e.p.cleaner);
    if (type === "actions") {
      const ch = topBy(base, (e) => CHANNEL[e.key]);
      pats.push(["📡", l.pChannel + ": " + ch[0], l.pDetail(ch[1], base.length)]);
    }
    pats.push(["📍", l.pProperty + ": " + pr[0], l.pDetail(pr[1], base.length)]);
    pats.push(["👤", l.pOperator + ": " + op[0], l.pDetail(op[1], base.length)]);
    if (type !== "actions") pats.push(["🧹", l.pCleaner + ": " + cl[0], l.pDetail(cl[1], base.length)]);
  }

  return (
    <div className="glob-modal-bg open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glob-modal" role="dialog" aria-labelledby="intelTitle">
        <div className="glob-modal-head">
          <div className="glob-modal-icon" style={{ background: ICON_BG[type] }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static icon from the prototype */}
            <img src={`/icons/${type}.png`} alt="" style={{ width: 22, height: 22 }} />
          </div>
          <div className="glob-modal-info">
            <h3 id="intelTitle">{l[`${type}T` as "alertsT"]}</h3>
            <p>{l[`${type}S` as "alertsS"]}</p>
          </div>
          <button className="glob-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="glob-modal-body">
          {tf !== "now" && <div className="glob-modal-note">{l.staticNote} {rangeText}</div>}
          <Section title={l.summary}>{summary}</Section>
          <Section title={lt}>
            {list.length ? (
              list.map((e) => {
                const [title, desc] = evText(e, lang);
                const sc = e.sev === "info" ? "sev-info" : "sev-" + e.sev;
                const status = e.type === "actions" ? CHANNEL[e.key] : e.open ? (e.sev === "critical" ? l.critical : l.warning) : l.resolved;
                return (
                  <div key={e.id} className={`anomaly-item ${sc} jm-link`} role="button" tabIndex={0} onClick={() => jumpTo(e.p.jobId)} onKeyDown={(k) => k.key === "Enter" && jumpTo(e.p.jobId)}>
                    <div className="anomaly-item-head">
                      <span className={`anomaly-dot ${sc}`} />
                      <span className="anomaly-title">{title}</span>
                      <span className="anomaly-time">{when(e)}</span>
                    </div>
                    <div className="anomaly-desc">{desc}</div>
                    <div className="anomaly-footer">
                      <span className="anomaly-status">{status}</span>
                      <span className="anomaly-metric">{l.stages[e.stageIdx]}</span>
                    </div>
                    <div><span className="jm-chip">{l.kv.owner}: {e.p.op}</span></div>
                  </div>
                );
              })
            ) : (
              <div className="jm-empty">{l.nothing}</div>
            )}
          </Section>
          {pats.length > 0 && (
            <Section title={l.patterns}>
              {pats.map((p, i) => (
                <div key={i} className="pattern-item">
                  <div className="pattern-icon">{p[0]}</div>
                  <div className="pattern-content">
                    <div className="pattern-title">{p[1]}</div>
                    <div className="pattern-detail">{p[2]}</div>
                  </div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
