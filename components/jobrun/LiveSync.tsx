"use client";
/* Live mode wiring (INTEGRATION.md §4, §7):
   - subscribeJobs: Supabase Realtime on jobs, messages, tracker and evidence → re-read the changed job.
   - recordAction / sendMessage storage: local board changes are batched per job and sent to /api/board/sync. */
import { useEffect } from "react";
import type { BoardStore } from "@/lib/board/store";
import type { Job } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/browser";

const FLUSH_MS = 400, REFETCH_MS = 300;

export function LiveSync({ store, teamIds, onError }: { store: BoardStore; teamIds: string[]; onError: (msg: string) => void }) {
  useEffect(() => {
    /* ── outgoing: batch local changes per job ── */
    const pending = new Map<string, { base: Job; latest: Job | null; lastLive: Job; timer: ReturnType<typeof setTimeout> }>();
    const flush = async (id: string) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      const job = p.latest ?? p.lastLive, base = p.base;
      const newActions = (job.actions ?? []).slice(base.actions?.length ?? 0);
      const body = {
        job,
        prev: { stage: base.stage, owner: base.owner, teamAsked: base.teamAsked, unread: !!base.unread },
        newMessages: job.thread.slice(base.thread.length),
        newActions,
        newAddons: (job.addons ?? []).slice(base.addons?.length ?? 0),
        cancelled: p.latest ? undefined : { reason: newActions.at(-1)?.reason ?? "" },
        teamIds,
      };
      try {
        const res = await fetch("/api/board/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      } catch (e) {
        onError(String((e as Error).message ?? e));
      }
    };
    store.setChangeHook((prev, next) => {
      const p = pending.get(prev.id);
      if (p) {
        clearTimeout(p.timer);
        p.latest = next;
        if (next) p.lastLive = next;
        p.timer = setTimeout(() => flush(prev.id), FLUSH_MS);
      } else {
        pending.set(prev.id, { base: prev, latest: next, lastLive: next ?? prev, timer: setTimeout(() => flush(prev.id), FLUSH_MS) });
      }
    });

    /* ── incoming: Realtime → re-read the job ── */
    const sb = createClient();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const refetch = (jobId: number | string | undefined) => {
      if (jobId == null) return;
      const id = "J" + jobId;
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(async () => {
        timers.delete(id);
        if (pending.has(id)) return; // our own change is on its way; its echo will arrive after the flush
        const res = await fetch(`/api/board/job/${id}`);
        if (res.status === 404) store.removeRemote(id);
        else if (res.ok) store.upsertRemote(await res.json());
      }, REFETCH_MS));
    };
    type Change = { new: Record<string, unknown> | null; old: Record<string, unknown> | null };
    const pick = (key: "id" | "job_id") => (c: Change) => refetch((c.new?.[key] ?? c.old?.[key]) as number | undefined);
    const channel = sb
      .channel("jobrun-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, pick("id"))
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, pick("job_id"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tracker" }, pick("job_id"))
      .on("postgres_changes", { event: "*", schema: "public", table: "evidence" }, pick("job_id"))
      .subscribe();

    return () => {
      store.setChangeHook(null);
      pending.forEach((p, id) => { clearTimeout(p.timer); flush(id); });
      timers.forEach((t) => clearTimeout(t));
      sb.removeChannel(channel);
    };
  }, [store, teamIds, onError]);
  return null;
}
