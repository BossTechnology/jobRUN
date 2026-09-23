"use client";
/* PENDING MODAL — also shows Scheduled jobs read-only with an Edit toggle and the Actions footer.
   Ported from openPending() / renderPending() and its handlers. */
import { useState } from "react";
import { confirmSender, phoneConfirm, schedule, sendMsg, setField, setTeam, teamOptions, textTeam, undoSender, type ActResult } from "@/lib/board/actions";
import { useBoard } from "@/lib/board/context";
import { fieldsDone, lowConf } from "@/lib/domain/health";
import { winTxt } from "@/lib/domain/time";
import { SERVICES, type FieldKey, type Job } from "@/lib/domain/types";
import { ME } from "@/lib/operators";
import { Icon, P } from "@/lib/ui/icons";
import { ActionFooter, NO_ACT, type ActState } from "./ActionFooter";
import { LocRow, RoDetails, SrcTag, Thread, useActionCtx, type Channel } from "./parts";

const EDIT_IC = '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>';

function aiWhy(j: Job, custName: string, propName: string, lang: "en" | "es") {
  const r = j.req!, dom = r.from.split("@")[1] || "", c = custName, pn = propName;
  const en = {
    newContact: `Domain ${dom} belongs to ${c}. New contact at this customer — previous contact was ${r.prev}.`,
    structured: `Structured work order from ${c}. Property and unit read from the message.`,
    known: `Known contact at ${c}, with previous requests for ${pn}.`,
    unknown: `Personal email domain. The message names ${pn}, a ${c} property.`,
    text: `Phone number matches earlier texts from ${c} about ${pn}.`,
    weak: `Domain ${dom} is not on file and the message names no property. Closest guess: ${pn} (${c}), from the domain name.`,
  };
  const es = {
    newContact: `El dominio ${dom} pertenece a ${c}. Contacto nuevo en este cliente — el anterior era ${r.prev}.`,
    structured: `Orden de trabajo estructurada de ${c}. Propiedad y unidad leídas del mensaje.`,
    known: `Contacto conocido de ${c}, con solicitudes anteriores para ${pn}.`,
    unknown: `Dominio de correo personal. El mensaje menciona ${pn}, propiedad de ${c}.`,
    text: `El número coincide con textos anteriores de ${c} sobre ${pn}.`,
    weak: `El dominio ${dom} no está registrado y el mensaje no menciona propiedad. Mejor estimación: ${pn} (${c}), por el nombre del dominio.`,
  };
  return (lang === "es" ? es : en)[r.k];
}

export interface PendingPM {
  mode: "ai" | "edit";
  custSel: string;
  contactName: string;
  upd: boolean;
  edit: boolean;
  teamEdit: boolean;
  compose: string;
  ch: Channel;
}

export function initPendingPM(j: Job, teamEdit = false): PendingPM {
  return {
    mode: lowConf(j) && !j.senderOk ? "edit" : "ai",
    custSel: lowConf(j) ? "" : j.cust,
    contactName: j.req?.name ?? j.contact ?? "",
    upd: j.req?.k === "newContact" || j.req?.k === "unknown",
    edit: false,
    teamEdit,
    compose: "",
    ch: "email",
  };
}

export function PendingView({ j, initialTeamEdit, onActResult }: { j: Job; initialTeamEdit?: boolean; onActResult: (r: ActResult | { kind: "approved" }) => void }) {
  const { w, l, lang, closeModal, flash } = useBoard();
  const ctx = useActionCtx(j.id);
  const [pm, setPmState] = useState<PendingPM>(() => initPendingPM(j, initialTeamEdit));
  const [act, setActState] = useState<ActState>(NO_ACT);
  const setPm = (x: Partial<PendingPM>) => setPmState((s) => ({ ...s, ...x }));
  const setAct = (x: Partial<ActState>) => setActState((s) => ({ ...s, ...x }));

  const c = w.cust(j.cust), p = w.prop(j.prop);
  const ro = j.stage === 1, edit = ro && pm.edit;
  const team = j.team != null ? w.teams[j.team] : null;

  const field = (k: FieldKey, v: string | number) => {
    if (setField(ctx, j.id, k, v)) setPm({ edit: false });
  };
  const send = () => {
    if (sendMsg(ctx, j.id, pm.ch, pm.compose)) setPm({ compose: "" });
  };

  /* step 1: sender */
  let s1: React.ReactNode;
  if (j.senderOk) {
    s1 = (
      <div className="jm-ok">
        <Icon d={P.check} sw={2.4} />
        <div>
          <b>{j.contact} · {c.n}</b>
          <small>{j.senderBy === "ai" ? l.confirmedAi(ME) : l.confirmedHuman(ME)}</small>
        </div>
        {!ro && (
          <button className="undo" onClick={() => { undoSender(ctx, j.id); setPm({ mode: "edit", custSel: j.cust }); }}>
            {l.undo}
          </button>
        )}
      </div>
    );
  } else if (pm.mode === "ai" && j.req) {
    s1 = (
      <div className="jm-ai">
        <div className="jm-ai-top">
          <span className="jm-tag">{l.aiSug}</span>
          <span className="jm-conf">{j.req.conf}%</span>
        </div>
        <div className="jm-ai-who">{j.req.name}</div>
        <div className="jm-ai-sub">{c.n}</div>
        <div className="jm-ai-why">{aiWhy(j, c.n, p.n, lang)}</div>
        <div className="jm-row">
          <button className="jm-btn pri sm" onClick={() => confirmSender(ctx, j.id, "ai", pm)}>{l.confirm}</button>
          <button className="jm-btn sm" onClick={() => setPm({ mode: "edit", custSel: pm.custSel || j.cust })}>{l.change}</button>
        </div>
      </div>
    );
  } else {
    s1 = (
      <>
        {lowConf(j) && j.req && (
          <div className="jm-ai warn" style={{ marginBottom: 8 }}>
            <div className="jm-ai-top">
              <span className="jm-tag red">{j.req.k === "unknown" ? l.unknownTag : l.lowTag}</span>
              <span className="jm-conf">{l.aiSug} {j.req.conf}%</span>
            </div>
            <div className="jm-ai-why" style={{ marginTop: 2 }}>{aiWhy(j, c.n, p.n, lang)}</div>
          </div>
        )}
        <div className="jm-grid2">
          <div>
            <label className="jm-lbl">{l.customer}</label>
            <select className="jm-sel" value={pm.custSel} onChange={(e) => setPm({ custSel: e.target.value })}>
              <option value="">{l.pickCustomer}</option>
              {w.customers.map((x) => (
                <option key={x.id} value={x.id}>{x.n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="jm-lbl">{l.contact}</label>
            <input className="jm-in" value={pm.contactName} onChange={(e) => setPm({ contactName: e.target.value })} />
          </div>
        </div>
        <label className="jm-check">
          <input type="checkbox" checked={pm.upd} onChange={(e) => setPm({ upd: e.target.checked })} /> {l.updContact}
        </label>
        <div className="jm-row">
          <button className="jm-btn pri sm" disabled={!pm.custSel} onClick={() => confirmSender(ctx, j.id, "human", pm)}>{l.confirmSender}</button>
          {!lowConf(j) && <button className="jm-btn sm" onClick={() => setPm({ mode: "ai" })}>{l.aiSug}</button>}
        </div>
      </>
    );
  }

  /* step 2: details (inputs commit on change/blur, like the prototype's onchange) */
  const propOpts = w.props.filter((x) => x.cust === j.cust);
  const s2 = (
    <div className="jm-fields jm-f3">
      <div className="span2">
        <label className="jm-lbl">{l.fProp}<SrcTag j={j} k="prop" /></label>
        <select className="jm-sel" value={j.propKnown ? j.prop : ""} onChange={(e) => field("prop", e.target.value)}>
          {!j.propKnown && <option value="">{l.pickProp}</option>}
          {propOpts.map((x) => (
            <option key={x.id} value={x.id}>{x.n} · {x.city}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="jm-lbl">{l.fUnit}<SrcTag j={j} k="unit" /></label>
        <input className="jm-in" key={`unit-${j.unit}`} defaultValue={j.unit} onBlur={(e) => e.target.value !== j.unit && field("unit", e.target.value)} />
      </div>
      <LocRow j={j} />
      <div>
        <label className="jm-lbl">{l.fSvc}<SrcTag j={j} k="svc" /></label>
        <select className="jm-sel" value={j.svc} onChange={(e) => field("svc", +e.target.value)}>
          {SERVICES[lang].map((s, i) => (
            <option key={i} value={i}>{s}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="jm-lbl">{l.fDate}<SrcTag j={j} k="date" /></label>
        <input className="jm-in" type="date" value={j.f.date} onChange={(e) => field("date", e.target.value)} />
      </div>
      <div className="jm-win">
        <label className="jm-lbl">{l.st2.window}<SrcTag j={j} k="time" /></label>
        <div className="jm-win-r">
          <input className="jm-in" type="time" step={1800} key={`t1-${j.f.time}`} defaultValue={j.f.time} onBlur={(e) => e.target.value !== j.f.time && field("time", e.target.value)} />
          <span>–</span>
          <input className="jm-in" type="time" step={1800} key={`t2-${j.f.time2}`} defaultValue={j.f.time2} onBlur={(e) => e.target.value !== j.f.time2 && field("time2", e.target.value)} />
        </div>
      </div>
      <div className="full">
        <label className="jm-lbl">{l.fNotes} <em>({l.optional})</em><SrcTag j={j} k="notes" /></label>
        <input className="jm-in" key={`n-${j.f.notes}`} defaultValue={j.f.notes} onBlur={(e) => e.target.value !== j.f.notes && field("notes", e.target.value)} />
      </div>
    </div>
  );

  /* step 3: cleaner */
  let s3: React.ReactNode;
  const state = j.teamOk ? l.confirmedTeam : j.teamAsked ? l.waiting : l.notAsked;
  if (ro) {
    s3 = (
      <div className="jm-team">
        <div className="jm-team-i"><Icon d={P.team} sw={1.8} /></div>
        <div className="jm-team-m"><b>{team ? team[0] : "—"}</b><small>{team ? team[1] : ""}</small></div>
        <span className="jm-state ok">{l.confirmedTeam}</span>
      </div>
    );
  } else if (team && !pm.teamEdit) {
    const canText = !!(j.f.date && j.f.time);
    s3 = (
      <>
        <div className="jm-team">
          <div className="jm-team-i"><Icon d={P.team} sw={1.8} /></div>
          <div className="jm-team-m">
            <b>{team[0]}</b>
            <small>{team[1]}{j.team === p.team ? " · " + l.defaultTeam : ""}</small>
          </div>
          <span className={`jm-state ${j.teamOk ? "ok" : j.teamAsked ? "wait" : ""}`}>{state}</span>
        </div>
        {!j.teamOk && (
          <>
            <div className="jm-row">
              <button className="jm-btn pri sm" disabled={!canText} onClick={() => textTeam(ctx, j.id)}>
                <Icon d={P.chat} sw={2} />
                {l.textConfirm}
              </button>
              <button className="jm-btn sm" onClick={() => phoneConfirm(ctx, j.id)}>{l.byPhone}</button>
              <button className="jm-btn sm" onClick={() => setPm({ teamEdit: true })}>{l.changeTeam}</button>
            </div>
            {!canText && <div className="mm-hint">{l.needDate}</div>}
          </>
        )}
      </>
    );
  } else {
    const opts = teamOptions(ctx, j);
    s3 = (
      <>
        {opts.length ? (
          <div className="jm-teamlist">
            {opts.map((o) => (
              <button key={o.i} className={`jm-teamopt${j.team === o.i ? " on" : ""}`} onClick={() => { setTeam(ctx, j.id, o.i); setPm({ teamEdit: false }); }}>
                <span className="jm-team-i"><Icon d={P.team} sw={1.8} /></span>
                <span className="jm-team-m">
                  <b>{o.name}</b>
                  <small>{o.phone} · {l.st2.available} · {l.st2.jobsThatDay(o.jobs)}{o.def ? " · " + l.defaultTeam : ""}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="jm-banner warn">
            {w.teams.length ? (
              <><b>{l.st2.noneFree}</b><span>{l.st2.noneFreeD}</span></>
            ) : (
              <><b>{(l.st2 as unknown as Record<string, string>).noTeamsLoaded}</b><span>{(l.st2 as unknown as Record<string, string>).noTeamsLoadedD}</span></>
            )}
          </div>
        )}
        {j.stage === 0 && j.f.date && w.teams.length > 0 && <div className="mm-hint">{l.st2.availNote(p.city, winTxt(j, lang) || l.st2.anyTime)}</div>}
      </>
    );
  }

  const g = [j.senderOk, !!j.owner, fieldsDone(j), j.teamOk];
  const gl = [l.gateSender, l.gateOwner, l.gateFields, l.gateCleaner];
  const nb = (ok: boolean, n: number) => (ro ? null : <span className={`n${ok ? " ok" : ""}`}>{ok ? "✓" : n}</span>);

  return (
    <div className="jm-rq">
      <Thread j={j} compose={pm.compose} setCompose={(v) => setPm({ compose: v })} ch={pm.ch} setCh={(ch) => setPm({ ch })} onSend={send} />
      <div className="jm-gutter" />
      <div className="jm-rq-right">
        <div className="jm-pane">
          <div className="jm-pt">{nb(g[0], 1)}{l.step1}</div>
          {s1}
        </div>
        <div className="jm-pane">
          <div className="jm-pt">
            {nb(g[2], 2)}
            {l.details}
            {ro && (
              <button className="jm-edit" onClick={() => setPm({ edit: !pm.edit })}>
                <Icon d={EDIT_IC} sw={2} />
                {edit ? l.st2.done : l.st2.edit}
              </button>
            )}
          </div>
          {edit && <div className="jm-banner info" style={{ margin: "0 0 10px" }}><span>{l.st2.editNote}</span></div>}
          {ro && !edit ? <RoDetails j={j} /> : s2}
        </div>
        <div className="jm-pane">
          <div className="jm-pt">{nb(g[3], 3)}{l.cleaner}</div>
          {s3}
        </div>
        {ro ? (
          <ActionFooter
            j={j}
            st={act}
            set={setAct}
            onResult={(r) => {
              if (r.kind === "compose") setPm({ ch: "email", compose: r.text });
              onActResult(r);
            }}
          />
        ) : (
          <div className="jm-pane jm-sticky jm-footrow">
            <div className="jm-gate">
              {gl.map((t, i) => (
                <div key={t} className={g[i] ? "ok" : ""}>
                  <i>{g[i] && <Icon d={P.check} sw={3} />}</i>
                  {t}
                </div>
              ))}
            </div>
            <div className="jm-foot">
              <button className="jm-btn" onClick={closeModal}>{l.closeKeep}</button>
              <button
                className="jm-btn pri"
                disabled={!g.every(Boolean)}
                onClick={() => {
                  schedule(ctx, j.id);
                  closeModal();
                  flash(j.id);
                }}
              >
                {l.scheduleBtn}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
