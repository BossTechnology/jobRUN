"use client";
/* MODAL SHELL + openJob(): Pending/Scheduled use the Pending modal, later stages the Stage modal. */
import { useEffect } from "react";
import type { ActResult } from "@/lib/board/actions";
import { useBoard, useJob, type PMInit } from "@/lib/board/context";
import { jobNo, fmtTime } from "@/lib/domain/time";
import { SERVICES } from "@/lib/domain/types";
import { Icon, STAGE_IC } from "@/lib/ui/icons";
import { HeadExtras } from "./parts";
import { PendingView } from "./PendingView";
import { StageView } from "./StageView";

export interface ModalState {
  id: string;
  /** Bumped to remount the view with fresh UI state (the prototype re-ran openPending/openStage). */
  nonce: number;
  init?: PMInit;
}

export function JobModal({ modal, reopen }: { modal: ModalState; reopen: (init?: PMInit) => void }) {
  const { w, l, lang, closeModal } = useBoard();
  const j = useJob(modal.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeModal]);

  useEffect(() => {
    if (!j) closeModal(); // cancelled
  }, [j, closeModal]);
  if (!j) return null;

  const p = w.prop(j.prop);
  const pendingView = j.stage <= 1;
  const onActResult = (r: ActResult | { kind: "approved" }) => {
    if (r.kind === "closed") closeModal();
    else if (r.kind === "pending") reopen({ teamEdit: r.teamEdit });
  };
  const title = pendingView && !j.propKnown ? j.req?.subj ?? "" : p.n;
  const sub = pendingView
    ? `${jobNo(j)} · ${l.rqSub(fmtTime(j.createdAt, lang), j.req?.ch ?? "")}${j.propKnown ? " · " + p.city + ", " + p.st : ""}`
    : `${jobNo(j)} · ${p.city}, ${p.st} · ${SERVICES[lang][j.svc]}`;
  // Remount when the job crosses between the two modal types, like the prototype's renderStage → openPending.
  const viewKey = `${modal.id}:${modal.nonce}:${pendingView ? "p" : "s"}`;

  return (
    <div className="glob-modal-bg open" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className="glob-modal jm-wide" role="dialog" aria-labelledby="modalTitle">
        <div className="glob-modal-head">
          <div className="glob-modal-icon" style={{ background: "var(--gray-bg)" }}>
            <Icon d={STAGE_IC[j.stage]} sw={1.6} />
          </div>
          <div className="glob-modal-info">
            <h3 id="modalTitle">
              <span className="jm-stagetag">{l.stages[j.stage]}</span>
              {title}
            </h3>
            <p>{sub}</p>
          </div>
          <div id="modalHeadExtra">
            <HeadExtras j={j} />
          </div>
          <button className="glob-modal-close" onClick={closeModal} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="glob-modal-body" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {pendingView ? (
            <PendingView key={viewKey} j={j} initialTeamEdit={modal.init?.teamEdit} onActResult={onActResult} />
          ) : (
            <StageView key={viewKey} j={j} initialTab={modal.init?.tab} onActResult={onActResult} />
          )}
        </div>
      </div>
    </div>
  );
}

