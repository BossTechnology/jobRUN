"use client";
/* Shared board context: world lookups, job store, language, toast and modal control. */
import { createContext, useContext, useSyncExternalStore } from "react";
import { strings, type Lang, type Strings } from "@/lib/i18n";
import type { Job } from "@/lib/domain/types";
import type { Simulator } from "@/lib/sim/seed";
import type { WorldIndex } from "@/lib/sim/world";
import type { BoardStore } from "./store";

/** Modal state seeds, applied when a job modal opens (the prototype's PM object). */
export interface PMInit {
  teamEdit?: boolean;
  tab?: "details" | "tracker" | "billing";
}

export interface BoardCtx {
  w: WorldIndex;
  store: BoardStore;
  sim: Simulator | null;
  lang: Lang;
  l: Strings;
  now: number;
  toast: (msg: string) => void;
  openJob: (id: string, init?: PMInit) => void;
  closeModal: () => void;
  /** Card to highlight and scroll into view (after scheduling). */
  flash: (id: string) => void;
}

const Ctx = createContext<BoardCtx | null>(null);
export const BoardProvider = Ctx.Provider;

export function useBoard() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBoard outside BoardProvider");
  return c;
}

export function useJobs(): Job[] {
  const { store } = useBoard();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useJob(id: string | null): Job | undefined {
  const jobs = useJobs();
  return id ? jobs.find((j) => j.id === id) : undefined;
}

export { strings };
