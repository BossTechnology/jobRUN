"use client";
/* ROSIE — modes, Focused/Global scope, insight card, chat, hold-to-talk and read-aloud.
   Ported from renderRosie() / loadInsight() / askRosie() / micStart() against POST /api/rosie (INTEGRATION.md §9). */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBoard, useJobs } from "@/lib/board/context";
import { filterText, hasFilters } from "@/lib/board/filters";
import { CONFIG } from "@/lib/config";
import { isBad } from "@/lib/domain/health";
import { ME } from "@/lib/operators";
import { boardSnapshot, type RosieMode, type RosieScope } from "@/lib/rosie";
import { canSpeak, speak, stopSpeaking } from "@/lib/ui/speech";
import { Icon } from "@/lib/ui/icons";

type Turn = { role: "user" | "assistant"; content: string; thinking?: boolean };
type Insight = { text: string; t: number } | { busy: true };
const SPEAK_KEY = "jm_speak";
const noop = () => () => {};
const readSpeakPref = () => {
  try { return localStorage.getItem(SPEAK_KEY) === "1"; } catch { return false; }
};

/** Streams /api/rosie; onText receives the text so far. Throws { off: true } when Rosie isn't configured. */
async function callRosie(body: object, onText: (text: string) => void, signal?: AbortSignal) {
  const res = await fetch(CONFIG.ROSIE_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (res.status === 503) throw { off: true };
  if (!res.ok || !res.body) throw { status: res.status };
  const reader = res.body.getReader(), dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

/** Rosie's replies: job numbers become links to the card; **bold** and "- " bullets render as formatting. */
function Linkified({ text }: { text: string }) {
  const { jumpTo } = useBoard();
  const jobs = useJobs();
  const links = (chunk: string, key: string) =>
    chunk.split(/(#\d{5})/g).map((p, i) => {
      const m = p.match(/^#(\d{5})$/);
      return m && jobs.some((j) => j.id === "J" + m[1]) ? (
        <a key={key + i} onClick={() => jumpTo("J" + m[1])} role="button" tabIndex={0}>{p}</a>
      ) : (
        <span key={key + i}>{p}</span>
      );
    });
  const clean = text.replace(/^\s*[-*]\s+/gm, "• ").replace(/^#{1,6}\s+/gm, "");
  return (
    <>
      {clean.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? <b key={i}>{links(part.slice(2, -2), `b${i}-`)}</b> : <span key={i}>{links(part, `t${i}-`)}</span>,
      )}
    </>
  );
}

export function RosieHeader({ mode, setMode, onClose }: { mode: RosieMode; setMode: (m: RosieMode) => void; onClose: () => void }) {
  const { l } = useBoard();
  return (
    <div className="mm-fly-hd jm-rh">
      {/* eslint-disable-next-line @next/next/no-img-element -- Rosie avatar from the prototype */}
      <img className="jm-rh-img" src="/icons/rosie.png" alt="" />
      <span className="jm-rh-name">ROSIE</span>
      <div className="jm-rmodes" role="tablist">
        {(["situation", "recommendation", "prediction"] as RosieMode[]).map((m) => (
          <button key={m} className={`jm-rmode${mode === m ? " on" : ""}`} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
            {l.rz.modes[m]}
          </button>
        ))}
      </div>
      <button className="mm-fly-x" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}

export function RosiePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { w, l, lang, filters, matches, toast } = useBoard();
  const jobs = useJobs();
  const [mode, setModeState] = useState<RosieMode>("situation");
  const [scope, setScope] = useState<RosieScope>("focus");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const [input, setInput] = useState("");
  const [insights, setInsights] = useState<Record<string, Insight>>({});
  const [more, setMore] = useState(false);
  // Browser-only capabilities and the saved read-aloud preference; false during server render.
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const storedSpeak = useSyncExternalStore(noop, readSpeakPref, () => false);
  const [speakChoice, setSpeakOn] = useState<boolean | null>(null);
  const speakOn = speakChoice ?? storedSpeak;
  const [micOn, setMicOn] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const mic = useRef<{ stop: () => void } | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  const ft = filterText(filters);
  const inScope = scope === "global" ? jobs : jobs.filter(matches);
  const insKey = `${mode}|${scope}|${lang}|${scope === "global" ? "" : ft.join(";")}`;

  /** Request body: live mode sends ids + filters (server builds the snapshot); simulation sends the snapshot. */
  const requestBase = useCallback(() => {
    const base = { mode, scope, lang, filters: ft, jobIds: scope === "focus" ? inScope.map((j) => j.id) : undefined };
    if (!CONFIG.SIMULATE) return base;
    const props = new Map(w.props.map((p) => [p.id, p]));
    return {
      ...base,
      jobIds: undefined,
      snapshot: boardSnapshot({ jobs: inScope, total: jobs.length, prop: (id) => props.get(id), teams: w.teams, operator: ME, scope, tz: CONFIG.BUSINESS_TZ, filters: ft }),
    };
  }, [mode, scope, lang, ft, inScope, jobs, w]);

  /* loadInsight(): one short card per mode/scope/filters, cached 3 minutes. */
  const loadInsight = useCallback(
    (force = false) => {
      const c = insights[insKey];
      if (!force && c && ("busy" in c || Date.now() - c.t < 180000)) return;
      setInsights((s) => ({ ...s, [insKey]: { busy: true } }));
      callRosie({ ...requestBase(), kind: "insight" }, () => {})
        .then((text) => setInsights((s) => ({ ...s, [insKey]: { text: text.trim(), t: Date.now() } })))
        .catch((e) => {
          if (e?.off) setOff(true);
          setInsights((s) => ({ ...s, [insKey]: { text: e?.off ? l.rosieOff : l.rosieErr, t: Date.now() - 170000 } }));
        });
    },
    [insights, insKey, requestBase, l],
  );

  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open || off || lastKey.current === insKey) return;
    lastKey.current = insKey;
    loadInsight();
  }, [open, off, insKey, loadInsight]);

  useEffect(() => {
    if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
  }, [turns]);
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  const setMode = (m: RosieMode) => { setModeState(m); setMore(false); };
  const setScopeTo = (s: RosieScope) => { setScope(s); setMore(false); };

  /* askRosie(): streams the answer into the last turn. */
  const ask = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy || off) return;
    setInput("");
    const history = [...turns.filter((t) => !t.thinking), { role: "user" as const, content: question }];
    setTurns([...history, { role: "assistant", content: l.rosieThinking, thinking: true }]);
    setBusy(true);
    abort.current = new AbortController();
    try {
      const text = await callRosie(
        { ...requestBase(), kind: "chat", turns: history.slice(-8).map(({ role, content }) => ({ role, content })) },
        (t) => setTurns([...history, { role: "assistant", content: t }]),
        abort.current.signal,
      );
      setTurns([...history, { role: "assistant", content: text }]);
      if (speakOn) speak(text, lang);
    } catch (e) {
      const err = e as { off?: boolean };
      if (err?.off) setOff(true);
      setTurns([...history, { role: "assistant", content: err?.off ? l.rosieOff : l.rosieErr }]);
    }
    setBusy(false);
  };

  const toggleSpeak = () => {
    const v = !speakOn;
    setSpeakOn(v);
    try { localStorage.setItem(SPEAK_KEY, v ? "1" : "0"); } catch {}
    if (!v) stopSpeaking();
    toast(v ? l.rz.speakOn : l.rz.speakOff);
  };

  /* Voice in: hold to talk (Web Speech API). */
  const micStart = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!SR || mic.current) return;
    try {
      const r = new SR();
      r.lang = lang === "es" ? "es-US" : "en-US";
      r.interimResults = true;
      r.continuous = true;
      const base = input ? input + " " : "";
      r.onresult = (ev) => {
        let t = "";
        for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        setInput(base + t);
      };
      r.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { setMicBlocked(true); toast(l.rz.micBlocked); }
      };
      r.onend = () => { mic.current = null; setMicOn(false); };
      r.start();
      mic.current = r;
      setMicOn(true);
    } catch {
      mic.current = null;
    }
  };
  const micStop = () => mic.current?.stop();
  const hasMic = isClient && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) && !micBlocked;

  const bad = inScope.filter((j) => isBad(j)).length, un = inScope.filter((j) => j.unread).length;
  const tail = l.rz.counts(inScope.length, bad, un);
  const caption = scope === "global" ? l.rz.globalCap + " · " + tail : (hasFilters(filters) ? l.rz.focusCapF(ft.length) : l.rz.focusCap) + " · " + tail;
  const ins = insights[insKey];

  return (
    <section className={`mm-sec${open ? " active" : ""}`}>
      <RosieHeader mode={mode} setMode={setMode} onClose={onClose} />
      <div className="jm-rosie">
        <div className="jm-rscope">
          {([["focus", l.rz.focused], ["global", l.rz.global]] as [RosieScope, string][]).map(([k, t]) => (
            <button key={k} className={scope === k ? "on" : ""} onClick={() => setScopeTo(k)}>{t}</button>
          ))}
        </div>
        <div className="jm-rcap">{caption}</div>
        {!off && (
          <div className="jm-rins">
            {!ins || "busy" in ins ? (
              <div className="jm-rins-t thinking">{l.rz.loading[mode]}</div>
            ) : (
              <>
                <div className={`jm-rins-t${more ? " more" : ""}`}><Linkified text={ins.text} /></div>
                <div className="jm-rins-f">
                  <button className="jm-btn sm" onClick={() => setMore((m) => !m)}>{more ? l.rz.less : l.rz.more}</button>
                  <button className="jm-rins-r" onClick={() => loadInsight(true)} title={l.rz.refresh}>↻</button>
                  <button className="jm-rins-r" onClick={() => speak(ins.text, lang)} title={l.rz.read}>
                    <Icon d='<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/>' sw={1.8} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="jm-rosie-msgs" ref={msgsRef}>
          <div className="jm-rmsg bot">{off ? l.rosieOff : l.rz.hello}</div>
          {turns.map((m, i) => (
            <div key={i} className={`jm-rmsg ${m.role === "user" ? "user" : "bot"}${m.thinking ? " thinking" : ""}`}>
              {m.role === "user" ? m.content : <Linkified text={m.content} />}
            </div>
          ))}
        </div>
        {!off && !turns.length && (
          <div className="jm-rosie-sug">
            {(l.rosieSug as string[]).map((q) => <button key={q} onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        <div className="jm-rosie-in">
          {hasMic && (
            <button className={`jm-mic${micOn ? " on" : ""}`} aria-label="Hold to talk" onMouseDown={micStart} onMouseUp={micStop} onMouseLeave={micStop} onTouchStart={micStart} onTouchEnd={micStop}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0M12 21v-4M8 21h8" /></svg>
            </button>
          )}
          <input className="jm-in" type="text" autoComplete="off" placeholder={l.rosiePh} value={input} disabled={off} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }} />
          {isClient && canSpeak() && (
            <button className={`jm-spk${speakOn ? " on" : ""}`} onClick={toggleSpeak} aria-label="Read replies aloud" title={speakOn ? l.rz.speakOn : l.rz.speakOff}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 9v6h4l5 4V5L8 9z" />
                {speakOn ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
              </svg>
            </button>
          )}
          <button className="jm-btn pri sm" disabled={off || busy} onClick={() => ask()}>{l.send}</button>
        </div>
      </div>
    </section>
  );
}

/* Minimal Web Speech API typing (not in lib.dom for every TS target). */
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}
