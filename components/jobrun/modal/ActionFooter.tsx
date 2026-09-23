"use client";
/* Actions menu with a required reason, plus Approve / Reject in Complete (actionFooter / openAct / doAct). */
import { useEffect, useRef } from "react";
import { ACTS, ADDONS, actLabel, approveJob, doAct, type ActResult } from "@/lib/board/actions";
import { useBoard } from "@/lib/board/context";
import { money } from "@/lib/domain/time";
import type { Job } from "@/lib/domain/types";
import { useActionCtx } from "./parts";

export interface ActState {
  act: string | null;
  menu: boolean;
  actReason: string;
  addon: string;
}
export const NO_ACT: ActState = { act: null, menu: false, actReason: "", addon: "" };

export function ActionFooter({ j, st, set, onResult }: { j: Job; st: ActState; set: (s: Partial<ActState>) => void; onResult: (r: ActResult | { kind: "approved" }) => void }) {
  const { l, lang } = useBoard();
  const a = l.st2;
  const ctx = useActionCtx(j.id);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const open = st.act;

  useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);

  const openAct = (k: string) => set({ act: k, menu: false, actReason: "", addon: "" });
  const back = () => set({ act: null, actReason: "", addon: "" });
  const pickReason = (r: string) => {
    const t = st.actReason;
    set({ actReason: r + (t && !t.startsWith(r) ? " — " + t : "") });
    reasonRef.current?.focus();
  };
  const go = () => {
    const reason = st.actReason.trim();
    if (!open || !reason) return;
    const r = doAct(ctx, j.id, open, reason, st.addon);
    set(NO_ACT);
    onResult(r);
  };

  let panel = null;
  if (open === "addon") {
    panel = (
      <div className="jm-actpanel">
        <div className="jm-actpanel-h">
          <b>{a.acts.addon}</b>
          <button className="jm-edit" onClick={back}>{a.back}</button>
        </div>
        <p>{a.desc.addon}</p>
        <div className="jm-qr">
          {ADDONS.map((x) => (
            <button key={x.k} className={st.addon === x.k ? "on" : ""} onClick={() => set({ addon: x.k })}>
              {(a.addons as Record<string, string>)[x.k]} · +{money(x.p)}
            </button>
          ))}
        </div>
        <label className="jm-lbl">{a.note}</label>
        <textarea ref={reasonRef} className="jm-ta" placeholder={a.addonPh} value={st.actReason} onChange={(e) => set({ actReason: e.target.value })} />
      </div>
    );
  } else if (open) {
    const desc = open === "delay" && j.delayed ? a.desc.clearDelay : (a.desc as Record<string, string>)[open];
    panel = (
      <div className="jm-actpanel">
        <div className="jm-actpanel-h">
          <b>{actLabel(lang, open, j)}</b>
          <button className="jm-edit" onClick={back}>{a.back}</button>
        </div>
        <p>{desc}</p>
        {open === "cancel" && (
          <div className="jm-qr">
            {(a.cancelReasons as string[]).map((r) => (
              <button key={r} onClick={() => pickReason(r)}>{r}</button>
            ))}
          </div>
        )}
        <label className="jm-lbl">{a.reason}</label>
        <textarea ref={reasonRef} className="jm-ta" placeholder={a.reasonPh} value={st.actReason} onChange={(e) => set({ actReason: e.target.value })} />
      </div>
    );
  }

  const list = ACTS[j.stage] ?? [];
  const menu = list.length > 0 && (
    <div className="jm-actmenu">
      <button className="jm-btn pri" onClick={() => set({ menu: !st.menu })}>{a.actions}</button>
      {st.menu && (
        <div className="jm-actlist">
          {list.map((k) => (
            <button key={k} className={k === "cancel" ? "dg" : ""} onClick={() => openAct(k)}>
              {actLabel(lang, k, j)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const ready = !!st.actReason.trim() && (open !== "addon" || !!st.addon);
  const goBtn = open && (
    <button className="jm-btn blue" disabled={!ready} onClick={go}>
      {a.confirmAct}
    </button>
  );

  return (
    <div className="jm-actwrap">
      {panel}
      <div className="jm-pane jm-footrow">
        {menu}
        {j.stage === 3 && (
          <button className="jm-btn danger" onClick={() => openAct("reject")}>
            {a.reject}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {goBtn ||
          (j.stage === 3 && (
            <button
              className="jm-btn green"
              onClick={() => {
                approveJob(ctx, j.id);
                onResult({ kind: "approved" });
              }}
            >
              {a.approve}
            </button>
          ))}
      </div>
    </div>
  );
}
