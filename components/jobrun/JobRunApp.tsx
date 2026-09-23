"use client";
/* jobRUN client shell: header, rail + flyouts, board, modals and toast, plus the 5-second clock (tick()).
   In simulation the world, jobs and event feeds are generated here, in the browser, as the prototype does. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ensureTrackerData, simTick, type ActionCtx } from "@/lib/board/actions";
import { BoardProvider, type BoardCtx, type PMInit } from "@/lib/board/context";
import { actionEvent, buildHistory, seedLive, tickEvents, TF_EVENTS, type HistoryView, type IntelType, type Timeframe } from "@/lib/board/events";
import { emptyFilters, matches as matchesFilters, type Filters } from "@/lib/board/filters";
import { BoardStore } from "@/lib/board/store";
import { CONFIG } from "@/lib/config";
import { fmtDate } from "@/lib/domain/time";
import type { Job, World } from "@/lib/domain/types";
import { strings, type Lang } from "@/lib/i18n";
import { Simulator } from "@/lib/sim/seed";
import { buildSimWorld, indexWorld } from "@/lib/sim/world";
import { Board } from "./Board";
import { ConfigSidebar, Header, type TimeControl } from "./Header";
import { IntelModal } from "./IntelModal";
import { JobModal, type ModalState } from "./modal/JobModal";
import { MapModal } from "./modal/MapModal";
import { MapMode } from "./MapMode";
import { Rail, type FlySection } from "./Rail";
import { MAP_OFF, type MapFilter } from "@/lib/map/model";

const LANG_KEY = "jm_lang", LOGO_KEY = "jm_logo";
const load = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const save = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {}
};

type Overlay = { kind: "job"; modal: ModalState } | { kind: "map"; id: string } | { kind: "intel"; type: IntelType } | null;

export function JobRunApp({ initial }: { initial: { world: World; jobs: Job[] } | null }) {
  const [lang, setLang] = useState<Lang>("en");
  const [logo, setLogo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(!!initial);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [fly, setFly] = useState<FlySection | null>(null);
  const [cfgOpen, setCfgOpen] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number } | null>(null);
  const [filters, setFilterState] = useState<Filters>(emptyFilters);
  const [paidOpen, setPaidOpen] = useState(false);
  const [tf, setTf] = useState<Timeframe>("now");
  const [view, setView] = useState<HistoryView | null>(null);
  const [rangeText, setRangeText] = useState<string | null>(null);
  const [mapF, setMapFState] = useState<MapFilter>(MAP_OFF);
  const setMapF = useCallback((fn: (m: MapFilter) => MapFilter) => setMapFState(fn), []);
  const openJobId = useRef<string | null>(null);

  const world = useMemo(() => indexWorld(initial?.world ?? buildSimWorld()), [initial]);
  const sim = useMemo(() => (CONFIG.SIMULATE ? new Simulator(world) : null), [world]);
  const [store] = useState(() => {
    const s = new BoardStore();
    if (initial) s.set(initial.jobs);
    return s;
  });
  useEffect(() => {
    store.setLogHook((key, j, stageI) => actionEvent(world, store.all(), key, j, stageI));
  }, [store, world]);

  const toast = useCallback((text: string) => setToastMsg((t) => ({ text, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const actionCtx = useMemo<ActionCtx>(() => ({ w: world, store, sim, lang, toast, openId: () => openJobId.current }), [world, store, sim, lang, toast]);

  const openJob = useCallback(
    (id: string, init?: PMInit) => {
      ensureTrackerData(actionCtx, id);
      openJobId.current = id;
      setOverlay((o) => ({ kind: "job", modal: { id, nonce: (o?.kind === "job" ? o.modal.nonce : 0) + 1, init } }));
    },
    [actionCtx],
  );
  const closeModal = useCallback(() => {
    openJobId.current = null;
    setOverlay(null);
  }, []);
  const openMap = useCallback((id: string) => {
    openJobId.current = null;
    setOverlay({ kind: "map", id });
  }, []);
  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1700);
  }, []);

  const setFilters = useCallback((fn: (f: Filters) => Filters) => setFilterState(fn), []);
  const clearFilters = useCallback(() => {
    setFilterState(emptyFilters());
    setMapFState((m) => ({ ...MAP_OFF, on: m.on }));
  }, []);
  const matches = useCallback((j: Job) => matchesFilters(filters, world, j, now), [filters, world, now]);

  /* jumpTo(): close panels, clear filters hiding the job, reveal its card, then open it. */
  const jumpTo = useCallback(
    (id: string) => {
      const j = store.get(id);
      if (!j) return;
      setFly(null);
      closeModal();
      if (!matchesFilters(filters, world, j)) clearFilters();
      if (j.stage === 4 && j.paid) setPaidOpen(true);
      flash(id);
      setTimeout(() => openJob(id), 350);
    },
    [store, filters, world, closeModal, clearFilters, flash, openJob],
  );

  /* Seed on the client (random + clock); restore the per-viewer language and logo. */
  useEffect(() => {
    const saved: Lang = load(LANG_KEY) === "es" ? "es" : "en";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of per-viewer preferences
    setLang(saved);
    setLogo(load(LOGO_KEY));
    if (!initial && sim) {
      store.set(sim.seedJobs(saved));
      store.setEvents(seedLive(world, store.all()));
      setReady(true);
    }
  }, [initial, sim, store, world]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  /* tick(): clocks every 5 s; in simulation also payments, follow-ups, new requests and event feeds. */
  const ticks = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      ticks.current++;
      if (CONFIG.SIMULATE) {
        simTick(actionCtx, ticks.current);
        store.setEvents(tickEvents(world, store.all(), store.getEvents()).live);
      }
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, [actionCtx, store, world]);

  /* Timeframe (onTimeChange / applyDate). */
  const time: TimeControl = {
    tf,
    rangeText,
    onTf: (v) => {
      setTf(v);
      if (v === "now" || v === "custom") {
        if (v === "custom" && !rangeText) setView(null);
        return;
      }
      const to = new Date(), from = new Date();
      if (v === "today") from.setHours(0, 0, 0, 0);
      if (v === "week") { from.setDate(to.getDate() - to.getDay()); from.setHours(0, 0, 0, 0); }
      if (v === "month") { from.setDate(1); from.setHours(0, 0, 0, 0); }
      setView(buildHistory(world, store.all(), from.getTime(), to.getTime(), TF_EVENTS[v]));
    },
    applyRange: (f, t) => {
      const l = strings(lang);
      if (!f || !t) { toast(l.rangeBoth); return false; }
      const from = new Date(f + "T00:00").getTime(), to = new Date(t + "T23:59").getTime();
      if (to <= from) { toast(l.rangeOrder); return false; }
      setView(buildHistory(world, store.all(), from, to, Math.max(0.3, (to - from) / 864e5)));
      setRangeText(`${f.slice(5).replace("-", "/")} → ${t.slice(5).replace("-", "/")}`);
      toast(l.rangeApplied);
      return true;
    },
  };
  const viewText = view ? `${fmtDate(view.from, lang)} – ${fmtDate(view.to, lang)}` : "";

  const ctx: BoardCtx = {
    w: world, store, sim, lang, l: strings(lang), now, toast, openJob, closeModal, flash,
    filters, setFilters, clearFilters, matches, paidOpen, setPaidOpen, jumpTo, tf, view, openMap, mapF, setMapF,
  };

  return (
    <BoardProvider value={ctx}>
      <ConfigSidebar
        key={cfgOpen}
        open={cfgOpen % 2 === 1}
        onClose={() => setCfgOpen((n) => n + 1)}
        logo={logo}
        lang={lang}
        onApply={(lg, lng) => {
          setLogo(lg);
          save(LOGO_KEY, lg);
          setLang(lng);
          save(LANG_KEY, lng);
          setCfgOpen((n) => n + 1);
          toast(strings(lng).applied);
        }}
      />
      <Header
        time={time}
        logo={logo}
        onOpenConfig={() => setCfgOpen((n) => (n % 2 ? n : n + 1))}
        onIntel={(type) => setOverlay({ kind: "intel", type })}
        from={view?.from}
        to={view?.to}
      />
      <div className="mm-shell">
        <Rail fly={fly} setFly={setFly} />
        {ready && (mapF.on ? <MapMode /> : <Board flashId={flashId} />)}
      </div>
      {overlay?.kind === "job" && <JobModal modal={overlay.modal} reopen={(init) => openJob(overlay.modal.id, init)} />}
      {overlay?.kind === "map" && <MapModal id={overlay.id} onClose={closeModal} />}
      {overlay?.kind === "intel" && <IntelModal type={overlay.type} rangeText={viewText} onClose={closeModal} />}
      <div className={`jm-toast${toastMsg ? " show" : ""}`} role="status">
        {toastMsg?.text}
      </div>
    </BoardProvider>
  );
}
