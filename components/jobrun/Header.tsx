"use client";
/* HEADER — logo/config, timeframe, live clock, intelligence buttons, operator switcher.
   Ported from the prototype's header markup, onTimeChange() / applyDate() / updateTimeLabel() / renderBadges()
   / teamSelHtml() and the CONFIG sidebar. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBoard, useEventScope, useJobs } from "@/lib/board/context";
import { CONFIG } from "@/lib/config";
import { countFor, INTEL_TYPES, type IntelType, type Timeframe } from "@/lib/board/events";
import { opsAll, UNASSIGNED } from "@/lib/board/filters";
import { isBizHours } from "@/lib/domain/health";
import { fmtDate } from "@/lib/domain/time";
import { locale, type Lang } from "@/lib/i18n";
import { ME, OPS } from "@/lib/operators";
import { workload } from "@/lib/domain/health";
import { Icon, P } from "@/lib/ui/icons";
import { CapMeter } from "./modal/parts";
import { canSpeak, chosenVoice, setVoice, voicesFor } from "@/lib/ui/speech";

/* Voices load asynchronously; re-read them when the browser announces changes. */
const subscribeVoices = (cb: () => void) => {
  if (!canSpeak()) return () => {};
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
};
const voiceKey = () => (canSpeak() ? speechSynthesis.getVoices().length : 0);

function VoiceSelect({ lang }: { lang: Lang }) {
  const { l } = useBoard();
  const n = useSyncExternalStore(subscribeVoices, voiceKey, () => 0);
  const [picked, setPicked] = useState<string | null>(null);
  const list = n ? voicesFor(lang).slice(0, 14) : [];
  if (!list.length) return <select className="sb-select" disabled aria-label="Voice"><option>{l.st2.noVoices}</option></select>;
  const cur = picked ?? chosenVoice(lang)?.name ?? list[0].name;
  return (
    <select className="sb-select" value={cur} aria-label="Voice" onChange={(e) => { setPicked(e.target.value); setVoice(lang, e.target.value); }}>
      {list.map((v) => <option key={v.name} value={v.name}>{v.name.replace(/Microsoft |Google /, "")}</option>)}
    </select>
  );
}

export interface TimeControl {
  tf: Timeframe;
  onTf: (tf: Timeframe) => void;
  applyRange: (from: string, to: string) => boolean;
  rangeText: string | null;
}

function TimeLabel({ tf, from, to }: { tf: Timeframe; from?: number; to?: number }) {
  const { l, lang } = useBoard();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tf !== "now") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [tf]);
  if (tf !== "now") return <span className="time-lbl">{from && to ? `${fmtDate(from, lang)} – ${fmtDate(to, lang)}` : ""}</span>;
  const biz = isBizHours("America/New_York", new Date(now));
  const clock = new Date(now).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
  return (
    <span className="time-lbl">
      {/* The clock ticks every second, so server and client text differ by design. */}
      <span className={`jm-live ${biz ? "" : "after"}`} suppressHydrationWarning>
        <i />
        {l.live} · {clock} ET · {biz ? l.bizHours : l.afterHours}
      </span>
    </span>
  );
}

function DateRange({ time }: { time: TimeControl }) {
  const { l } = useBoard();
  const [open, setOpen] = useState(true);
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && (e.target as HTMLElement).id !== "timeSel") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);
  const lbl = { fontSize: 10, color: "var(--gray-mid)", width: 36 };
  const inp = { flex: 1, fontSize: 11, padding: "5px 6px", border: "1px solid var(--gray-border)", borderRadius: 6, fontFamily: "var(--font)" };
  return (
    <div className="date-range-wrap show" ref={ref}>
      <span onClick={() => setOpen((o) => !o)} style={{ cursor: "pointer", fontSize: 11, fontWeight: 500, color: "var(--black)" }}>
        {time.rangeText ?? l.selectRange}
      </span>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, background: "var(--white)", border: "1px solid var(--gray-border)", borderRadius: 10, padding: 14, boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 10, width: 260, marginTop: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--gray-light)", marginBottom: 8 }}>{l.customRange}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={lbl}>{l.from}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={lbl}>{l.to}</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inp} />
            </div>
          </div>
          <button className="date-apply" style={{ width: "100%", marginTop: 10, padding: 7, borderRadius: 6, fontSize: 12 }} onClick={() => time.applyRange(from, to) && setOpen(false)}>
            {l.applyRange}
          </button>
        </div>
      )}
    </div>
  );
}

/** Header badge that replays its bump animation whenever the count goes up. */
function Badge({ n }: { n: number }) {
  const [prev, setPrev] = useState(n);
  const [bumps, setBumps] = useState(0);
  if (n !== prev) {
    setPrev(n);
    if (n > prev) setBumps((b) => b + 1);
  }
  return (
    <span key={bumps} className={`hdr-icon-badge${n > 0 ? " show" : ""}${bumps ? " bump" : ""}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function IntelButtons({ tf, onOpen }: { tf: Timeframe; onOpen: (t: IntelType) => void }) {
  const { l, now } = useBoard();
  const scope = useEventScope();
  return (
    <>
      {INTEL_TYPES.map((k) => {
        const n = countFor(scope, k, tf, now);
        return (
          <button key={k} className="hdr-icon-btn" title={l[k]} aria-label={`${l[k]}: ${n}`} onClick={() => onOpen(k)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small static icon from the prototype */}
            <img src={`/icons/${k}.png`} alt="" />
            <Badge n={n} />
          </button>
        );
      })}
    </>
  );
}

function TeamSel() {
  const { l, filters, setFilters, matches } = useBoard();
  const jobs = useJobs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);
  const all = opsAll(filters);
  const sel = [...filters.ops].filter((x) => x !== UNASSIGNED);
  const label = all ? l.st2.allTeam : sel.length === 1 ? sel[0] : sel.length === 0 ? l.unassigned : l.st2.nSelected(filters.ops.size);
  const un = jobs.filter((j) => !j.owner && j.stage === 0).length;
  const toggle = (k: string, on: boolean) =>
    setFilters((f) => {
      const ops = new Set(f.ops);
      if (on) ops.add(k);
      else ops.delete(k);
      return { ...f, ops };
    });
  const row = (k: string, name: string, sub: string, n: number | null) => (
    <label key={k} className="jm-tsrow">
      <input type="checkbox" checked={filters.ops.has(k)} onChange={(e) => toggle(k, e.target.checked)} />
      <span className="jm-ts-n">{name}</span>
      <span className="jm-ts-s">{sub}</span>
      {n !== null && <CapMeter n={n} />}
    </label>
  );
  return (
    <div className="jm-teamsel" ref={ref}>
      <button className={`jm-tsbtn${all ? "" : " on"}`} onClick={() => setOpen((o) => !o)}>
        <Icon d={P.person} sw={1.8} />
        <span>{label}</span>
        {!all && <b>{jobs.filter(matches).length}</b>}
      </button>
      {open && (
        <div className="jm-tspop">
          <div className="jm-opslinks">
            <button onClick={() => setFilters((f) => ({ ...f, ops: new Set([ME]) }))}>{l.onlyMe}</button>
            <button onClick={() => setFilters((f) => ({ ...f, ops: new Set([UNASSIGNED, ...OPS]) }))}>{l.selectAll}</button>
          </div>
          {row(UNASSIGNED, l.unassigned, `${un} ${l.activeJobs}`, null)}
          {OPS.map((o) => row(o, o + (o === ME ? " (" + l.me + ")" : ""), `${workload(jobs, o)} ${l.activeJobs}`, workload(jobs, o)))}
        </div>
      )}
    </div>
  );
}

export function Header({ time, onIntel, onOpenConfig, logo, from, to }: { time: TimeControl; onIntel: (t: IntelType) => void; onOpenConfig: () => void; logo: string | null; from?: number; to?: number }) {
  const { l, lang } = useBoard();
  const opts: [Timeframe, string][] = [["now", l.tfNow], ["today", l.tfToday], ["week", l.tfWeek], ["month", l.tfMonth], ["custom", l.tfCustom]];
  return (
    <header>
      <button className="hamburger" onClick={onOpenConfig} aria-label="Open configuration">
        <span />
        <span />
        <span />
      </button>
      <div className="header-logo" onClick={onOpenConfig} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpenConfig()}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL
          <img src={logo} alt="Client logo" style={{ display: "block" }} />
        ) : (
          <div className="header-logo-icon" style={{ display: "flex" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
          </div>
        )}
      </div>
      <div className="time-wrap">
        <select id="timeSel" value={time.tf} onChange={(e) => time.onTf(e.target.value as Timeframe)} aria-label="Timeframe">
          {opts.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      </div>
      <TimeLabel key={lang} tf={time.tf} from={from} to={to} />
      {time.tf === "custom" && <DateRange time={time} />}
      <IntelButtons tf={time.tf} onOpen={onIntel} />
      <div className="header-spacer" />
      {CONFIG.SIMULATE && <span className="jr-sim">{lang === "es" ? "Simulación" : "Simulation"}</span>}
      <TeamSel />
      <div className="jm-brand">jobRUN</div>
    </header>
  );
}

/* ── CONFIG sidebar: client logo and language (Rosie's voice arrives with Rosie). ── */
export function ConfigSidebar({ open, onClose, logo, lang, onApply }: { open: boolean; onClose: () => void; logo: string | null; lang: Lang; onApply: (logo: string | null, lang: Lang) => void }) {
  const { l, toast } = useBoard();
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [pickLang, setPickLang] = useState<Lang>(lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = pending === undefined ? logo : pending;
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast(l.logoTooBig); return; }
    const r = new FileReader();
    r.onload = (e) => setPending(String(e.target?.result));
    r.readAsDataURL(f);
  };
  return (
    <>
      <div className={`overlay${open ? " open" : ""}`} onClick={onClose} />
      <div className={`sidebar${open ? " open" : ""}`} role="dialog" aria-labelledby="sbTitle">
        <div className="sb-head">
          <h2 id="sbTitle">{l.cfgTitle}</h2>
          <button className="sb-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sb-body">
          <div className="sb-section">
            <div className="sb-title">{l.clientIdentity}</div>
            <div className="logo-upload-area" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}>
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data URL
                <img src={shown} alt="" style={{ maxHeight: 40, maxWidth: 180, objectFit: "contain" }} />
              ) : (
                <>
                  <div style={{ fontSize: 26, color: "var(--gray-light)" }}>↑</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gray-mid)", marginTop: 4 }}>{l.uploadLogo}</div>
                  <div className="logo-hint">{l.logoHint}</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            {shown && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <span className="logo-clear" onClick={() => { setPending(null); if (fileRef.current) fileRef.current.value = ""; }} role="button" tabIndex={0}>
                  {l.removeLogo}
                </span>
              </div>
            )}
          </div>
          <div className="sb-section">
            <div className="sb-title">{l.voice}</div>
            <VoiceSelect lang={pickLang} />
            <div className="logo-hint">{l.voiceHint}</div>
          </div>
          <div className="sb-section">
            <div className="sb-title">{l.language}</div>
            <select className="sb-select" value={pickLang} onChange={(e) => setPickLang(e.target.value as Lang)} aria-label="Language">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
        <div className="sb-apply-wrap">
          <button className="sb-apply" onClick={() => { onApply(pending === undefined ? logo : pending, pickLang); setPending(undefined); }}>
            {l.apply}
          </button>
        </div>
      </div>
    </>
  );
}
