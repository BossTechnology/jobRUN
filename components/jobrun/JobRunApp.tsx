"use client";
/* jobRUN client shell: header, board, job modal and toast, plus the 5-second clock (tick()).
   In simulation the world and jobs are generated here, in the browser, as the prototype does. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { simTick, ensureTrackerData, type ActionCtx } from "@/lib/board/actions";
import { BoardProvider, type BoardCtx, type PMInit } from "@/lib/board/context";
import { BoardStore } from "@/lib/board/store";
import { CONFIG } from "@/lib/config";
import type { Job, World } from "@/lib/domain/types";
import { strings, type Lang } from "@/lib/i18n";
import { Simulator } from "@/lib/sim/seed";
import { buildSimWorld, indexWorld } from "@/lib/sim/world";
import { Board } from "./Board";
import { JobModal, type ModalState } from "./modal/JobModal";

const LANG_KEY = "jobrun.lang";

export function JobRunApp({ initial }: { initial: { world: World; jobs: Job[] } | null }) {
  const [lang, setLang] = useState<Lang>("en");
  const [now, setNow] = useState(() => Date.now());
  const [ready, setReady] = useState(!!initial);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; n: number } | null>(null);
  const modalRef = useRef<string | null>(null);

  const world = useMemo(() => indexWorld(initial?.world ?? buildSimWorld()), [initial]);
  const sim = useMemo(() => (CONFIG.SIMULATE ? new Simulator(world) : null), [world]);
  const [store] = useState(() => {
    const s = new BoardStore();
    if (initial) s.set(initial.jobs);
    return s;
  });

  const toast = useCallback((text: string) => setToastMsg((t) => ({ text, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const actionCtx = useMemo<ActionCtx>(() => ({ w: world, store, sim, lang, toast, openId: () => modalRef.current }), [world, store, sim, lang, toast]);

  const openJob = useCallback(
    (id: string, init?: PMInit) => {
      ensureTrackerData(actionCtx, id);
      modalRef.current = id;
      setModal((m) => ({ id, nonce: (m?.nonce ?? 0) + 1, init }));
    },
    [actionCtx],
  );
  const closeModal = useCallback(() => {
    modalRef.current = null;
    setModal(null);
  }, []);
  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId((f) => (f === id ? null : f)), 1700);
  }, []);

  /* Seed on the client (random + clock), restore language. */
  useEffect(() => {
    let saved: Lang = "en";
    try {
      if (localStorage.getItem(LANG_KEY) === "es") saved = "es";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a per-viewer preference
    setLang(saved);
    if (!initial && sim) {
      store.set(sim.seedJobs(saved));
      setReady(true);
    }
  }, [initial, sim, store]);

  /* tick(): clocks every 5 s; in simulation also payments, follow-ups and new requests. */
  const ticks = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      ticks.current++;
      if (CONFIG.SIMULATE) simTick(actionCtx, ticks.current);
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(t);
  }, [actionCtx]);

  const changeLang = (v: Lang) => {
    setLang(v);
    try {
      localStorage.setItem(LANG_KEY, v);
    } catch {}
  };

  const ctx: BoardCtx = { w: world, store, sim, lang, l: strings(lang), now, toast, openJob, closeModal, flash };

  return (
    <BoardProvider value={ctx}>
      <header>
        <div className="header-spacer" />
        {CONFIG.SIMULATE && <span className="jr-sim">{lang === "es" ? "Simulación" : "Simulation"}</span>}
        <select className="jm-sel jr-lang" value={lang} onChange={(e) => changeLang(e.target.value as Lang)} aria-label={strings(lang).language}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <div className="jm-brand">jobRUN</div>
      </header>
      <div className="mm-shell jr-norail">{ready && <Board flashId={flashId} />}</div>
      {modal && <JobModal modal={modal} reopen={(init) => openJob(modal.id, init)} />}
      <div className={`jm-toast${toastMsg ? " show" : ""}`} role="status">
        {toastMsg?.text}
      </div>
    </BoardProvider>
  );
}
