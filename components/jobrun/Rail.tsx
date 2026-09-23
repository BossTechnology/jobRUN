"use client";
/* RAIL + flyout — Observe, Geo, Incidents, Activity, focus chip, map and Rosie entry points.
   Ported from the rail markup, toggleFly() / renderFly() / feed() and FILTERS (suggest / tagKey / paintChips / paintBands). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard, useEventScope, useJobs } from "@/lib/board/context";
import { ago, evText, SEV_C, type LiveEvent } from "@/lib/board/events";
import { catalog, hasFilters, suggestions, type HealthBand, type Tag } from "@/lib/board/filters";
import { fmtDate, jobNo } from "@/lib/domain/time";
import { SERVICES } from "@/lib/domain/types";
import { indexByProp, mapFiltersOn, mapJobs, propMatches } from "@/lib/map/model";
import { Icon, P } from "@/lib/ui/icons";
import { RosiePanel } from "./Rosie";

export type FlySection = "observe" | "geo" | "incidents" | "activity" | "bobee";

const IC = {
  observe: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  geo: '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  incidents: '<path d="M13.2 8.6a2.8 2.8 0 015.6 0v1.4h-5.6z"/><path d="M12 10h8M16 2.2v1.3M11.3 4.2l.9.9M20.7 4.2l-.9.9M9.6 7.4h1.2M21.2 7.4h1.2"/><rect x="7" y="7.6" width="3.2" height="3.6" rx=".6"/><rect x="21.8" y="7.6" width="3.2" height="3.6" rx=".6"/><rect x="3.5" y="11.2" width="25" height="4.6" rx=".6"/><rect x="3.5" y="18.4" width="25" height="4.6" rx=".6"/><path d="M7.4 15.8l3-4.6M12.4 15.8l3-4.6M17.4 15.8l3-4.6M22.4 15.8l3-4.6M7.4 23l3-4.6M12.4 23l3-4.6M17.4 23l3-4.6M22.4 23l3-4.6"/><path d="M7.6 15.8v2.6M9.6 15.8v2.6M22.4 15.8v2.6M24.4 15.8v2.6M7.6 23v3.6M9.6 23v3.6M22.4 23v3.6M24.4 23v3.6"/><path d="M5.8 26.6h5.6v1.8H5.8zM20.6 26.6h5.6v1.8h-5.6zM2.5 29.4h27"/>',
  activity: '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>',
  map: '<path d="M9 4.5L3 7v13l6-2.5 6 2.5 6-2.5V10"/><path d="M9 4.5v13M15 10v10"/><path d="M9 4.5l3.2 1.3"/><path d="M18.5 2.5c1.9 0 3.5 1.6 3.5 3.5 0 2.3-3.5 5.6-3.5 5.6S15 8.3 15 6c0-1.9 1.6-3.5 3.5-3.5z"/><circle cx="18.5" cy="6" r="1.2"/>',
};

function RailIcon({ d, big = false }: { d: string; big?: boolean }) {
  return (
    <svg viewBox={big ? "0 0 32 32" : "0 0 24 24"} fill="none" stroke="currentColor" strokeWidth={big ? 1.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
  );
}

/** Tag input with the grouped suggestion dropdown (suggest / pickSug / tagKey / removeTag). */
function TagInput({ sec, tall, placeholder }: { sec: "observe" | "geo"; tall?: boolean; placeholder: string }) {
  const { w, l, lang, filters, setFilters } = useBoard();
  const jobs = useJobs();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);
  const tags = filters[sec];
  const all = useMemo(() => (open ? catalog(sec, w, jobs, lang) : []), [open, sec, w, jobs, lang]);
  const groups = open ? suggestions(sec, q, tags, all) : [];
  const flat = groups.flatMap((g) => g.items);

  const setTags = (next: Tag[]) => setFilters((f) => ({ ...f, [sec]: next }));
  const show = () => {
    setRect(boxRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
    setIdx(0);
  };
  const pick = (t: Tag) => {
    setTags([...tags, t]);
    setQ("");
    setIdx(0);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setIdx((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[idx] && (q.trim() === "" || flat.length)) pick(flat[idx]);
      else if (sec === "observe" && q.trim()) pick({ kind: "keyword", v: q.trim(), label: q.trim() });
    } else if (e.key === "Backspace" && !q && tags.length) setTags(tags.slice(0, -1));
    else if (e.key === "Escape") setOpen(false);
  };

  const starts = groups.reduce<number[]>((acc, g, i) => [...acc, i ? acc[i - 1] + groups[i - 1].items.length : 0], []);
  return (
    <>
      <div className={`mm-tagbox jm-tb${tall ? " jm-tb-tall" : ""}`} ref={boxRef} onClick={(e) => e.target === e.currentTarget && inRef.current?.focus()}>
        <span className="mm-chips">
          {tags.map((t, i) => (
            <span key={t.kind + ":" + t.v} className="mm-chip" title={(l.sg as Record<string, string>)[t.kind] ?? ""}>
              <Icon d={t.ic || P.search} sw={2} />
              <span className="mm-chip-lbl">{t.label}</span>
              <button className="mm-chip-x" onClick={() => setTags(tags.filter((_, k) => k !== i))} aria-label="Remove">×</button>
            </span>
          ))}
        </span>
        <input
          ref={inRef}
          className="mm-taginput"
          type="text"
          autoComplete="off"
          placeholder={placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); show(); }}
          onFocus={show}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
      </div>
      {open && rect && (
        <div className="mm-suggest open" role="listbox" style={{ left: rect.left, top: rect.bottom + 4, width: rect.width, maxHeight: window.innerHeight - rect.bottom - 20 }}>
          {!flat.length ? (
            <div className="mm-sg-foot">{l.noMatch}</div>
          ) : (
            <>
              {groups.map((g, gi) => (
                <div key={g.kind}>
                  <div className="mm-sg-hd">{(l.sg as Record<string, string>)[g.kind]}</div>
                  {g.items.map((i, ii) => {
                    const k = starts[gi] + ii;
                    return (
                      <div key={i.kind + ":" + i.v} className={`mm-sg-item${k === idx ? " active" : ""}`} onMouseDown={(e) => { e.preventDefault(); pick(i); }}>
                        <span className="mm-sg-ic"><Icon d={i.ic ?? P.search} sw={2} /></span>
                        <span className="mm-sg-main">
                          <span className="mm-sg-lbl">{i.label}</span>
                          {i.sub && <span className="mm-sg-sub">{i.sub}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {sec === "observe" && <div className="mm-sg-foot">{l.sgFoot}</div>}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Feed({ e }: { e: LiveEvent }) {
  const { w, l, lang, tf, now, jumpTo } = useBoard();
  const jobs = useJobs();
  const [t] = evText(e, lang);
  const j = jobs.find((x) => x.id === e.p.jobId);
  const pn = j && j.propKnown ? w.prop(j.prop).n : e.p.property;
  return (
    <div className="jm-feed" role="button" tabIndex={0} onClick={() => jumpTo(e.p.jobId)} onKeyDown={(k) => k.key === "Enter" && jumpTo(e.p.jobId)}>
      <span className="jm-feed-dot" style={{ background: SEV_C[e.sev] }} />
      <div style={{ minWidth: 0 }}>
        <div>
          <span className="jm-feed-p">{pn}</span>
          <span className="jm-feed-s">{SERVICES[lang][e.p.svc] || ""}{j ? " · " + jobNo(j) : ""}</span>
        </div>
        <div className="jm-feed-t" style={{ fontWeight: 600, fontSize: 11.5, marginTop: 2 }}>{t}</div>
        <div className="jm-feed-m">{tf === "now" ? ago(lang, e, now) : fmtDate(e.t, lang)} · {l.stages[e.stageIdx]}</div>
      </div>
    </div>
  );
}

function ObservePanel() {
  const { l, filters, setFilters, matches } = useBoard();
  const jobs = useJobs();
  const bands: [HealthBand, string, string][] = [["on", "green", l.hOn], ["risk", "amber", l.hRisk], ["bad", "red", l.hBad]];
  const toggle = (k: HealthBand) =>
    setFilters((f) => {
      const health = new Set(f.health);
      if (health.has(k)) health.delete(k);
      else health.add(k);
      return { ...f, health };
    });
  return (
    <div className="mm-sec-body">
      <div className="mm-st-top"><span className="mm-st-lbl">{l.health}</span></div>
      <div className="mm-bands mm-bands-fly" style={{ marginTop: 8 }}>
        {bands.map(([k, c, t]) => (
          <button key={k} className={`mm-band ${c}${filters.health.has(k) ? " on" : ""}`} onClick={() => toggle(k)}>
            <i />
            {t}
          </button>
        ))}
      </div>
      <div className="mm-hint">{filters.health.size ? l.healthHint(jobs.filter(matches).length) : ""}</div>
      <div className="mm-sec-split" />
      <TagInput sec="observe" tall placeholder={l.observePh} />
      <div className="mm-hint">{l.observeHint}</div>
    </div>
  );
}

function GeoPanel() {
  const { l, filters, setFilters } = useBoard();
  const toggleType = (k: string) =>
    setFilters((f) => {
      const types = new Set(f.types);
      if (types.has(k)) types.delete(k);
      else types.add(k);
      return { ...f, types };
    });
  return (
    <div className="mm-sec-body">
      <label className="mm-sublbl">{l.places}</label>
      <TagInput sec="geo" placeholder={l.geoPh} />
      <label className="mm-sublbl" style={{ marginTop: 12 }}>{l.radius}</label>
      <div className="jm-radius">
        {[5, 10, 25, 50].map((r) => (
          <button key={r} className={`jm-seg${filters.radius === r ? " on" : ""}`} onClick={() => setFilters((f) => ({ ...f, radius: r }))}>{r} mi</button>
        ))}
      </div>
      <div className="mm-hint">{l.radiusHint}</div>
      <label className="mm-sublbl" style={{ marginTop: 12 }}>{l.ptype}</label>
      <div className="mm-bands mm-bands-fly" style={{ marginTop: 0 }}>
        {Object.entries(l.types as Record<string, string>).map(([k, t]) => {
          const on = filters.types.has(k);
          return (
            <button key={k} className={`mm-band grey${on ? " on" : ""}`} onClick={() => toggleType(k)} style={on ? { background: "var(--black)", borderColor: "var(--black)", color: "#fff" } : undefined}>
              <i />
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Rail({ fly, setFly }: { fly: FlySection | null; setFly: (s: FlySection | null) => void }) {
  const { w, l, filters, clearFilters, matches, tf, now, mapF, setMapF } = useBoard();
  const jobs = useJobs();
  /* In map mode the focus chip counts locations, like the prototype's applyFocusChip(). */
  const mapScope = useMemo(() => {
    if (!mapF.on) return null;
    const byProp = indexByProp(mapJobs(jobs, matches, mapF, now));
    return { n: w.props.filter((p) => propMatches(filters, mapF, byProp, p, now)).length, of: w.props.length };
  }, [mapF, jobs, matches, now, w, filters]);
  const scope = useEventScope();
  const railRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const prevFly = useRef<FlySection | null>(null);

  useEffect(() => {
    if (!fly && prevFly.current) railRef.current[prevFly.current]?.focus({ preventScroll: true });
    prevFly.current = fly;
    if (!fly) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".mm-suggest.open") && setFly(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fly, setFly]);

  const ev = [...scope].sort((a, b) => b.t - a.t);
  const badge: Record<string, number> = {
    observe: filters.observe.length + filters.health.size,
    geo: filters.geo.length + filters.types.size,
    activity: tf === "now" ? scope.filter((e) => now - e.t < 600000).length : 0,
  };
  const filt = hasFilters(filters) || (mapF.on && mapFiltersOn(mapF));
  const rb = (s: FlySection, title: string, d: string, big = false) => (
    <button
      key={s}
      ref={(el) => { railRef.current[s] = el; }}
      className={`mm-rb${fly === s ? " open" : ""}`}
      title={title}
      aria-label={title}
      aria-expanded={fly === s}
      aria-controls="mmFly"
      onClick={() => setFly(fly === s ? null : s)}
    >
      <span className="mm-rb-ic">
        <RailIcon d={d} big={big} />
        <b className={`mm-rb-badge${badge[s] ? " show" : ""}`}>{badge[s] || ""}</b>
      </span>
    </button>
  );
  const titles: Record<FlySection, string> = { observe: l.rObserve, geo: l.rGeo, incidents: l.rIncidents, activity: l.rActivity, bobee: "Rosie" };

  return (
    <>
      <nav className="mm-rail" aria-label="Filters">
        {rb("observe", l.rObserve, IC.observe)}
        {rb("geo", l.rGeo, IC.geo)}
        {rb("incidents", l.rIncidents, IC.incidents, true)}
        {rb("activity", l.rActivity, IC.activity)}
        <button
          className={`mm-rb${mapF.on ? " open" : ""}`}
          title={l.mapMode}
          aria-label={l.mapMode}
          aria-pressed={mapF.on}
          onClick={() => setMapF((m) => ({ ...m, on: !m.on }))}
        >
          <span className="mm-rb-ic"><RailIcon d={IC.map} /></span>
        </button>
        <div className="mm-rail-gap" />
        <div className={`mm-focus${filt ? " show" : ""}`} role="status">
          <span className="mm-focus-lbl">{l.focus}</span>
          <strong>{(mapScope ? mapScope.n : jobs.filter(matches).length).toLocaleString()}</strong>
          <span className="mm-focus-of">{l.of} {(mapScope ? mapScope.of : jobs.length).toLocaleString()}</span>
          <button className="mm-focus-x" onClick={clearFilters} aria-label={l.clearAll}>×</button>
        </div>
        <div className="mm-rail-gap" />
        <button
          ref={(el) => { railRef.current.bobee = el; }}
          className={`mm-rb${fly === "bobee" ? " open" : ""}`}
          title="Rosie"
          aria-label="Rosie"
          aria-expanded={fly === "bobee"}
          onClick={() => setFly(fly === "bobee" ? null : "bobee")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Rosie avatar from the prototype */}
          <span className="mm-rb-ic"><img className="rosie" src="/icons/rosie.png" alt="" /></span>
        </button>
      </nav>
      <div className={`mm-fly-backdrop${fly ? " open" : ""}`} onClick={() => setFly(null)} aria-hidden="true" />
      <aside className={`mm-fly${fly ? " open" : ""}`} id="mmFly" tabIndex={-1}>
        {fly && fly !== "bobee" && (
          <section className="mm-sec active">
            <div className="mm-fly-hd">
              <div className="mm-fly-title">{titles[fly]}</div>
              <button className="mm-fly-x" onClick={() => setFly(null)} aria-label="Close">×</button>
            </div>
            {fly === "observe" && <ObservePanel />}
            {fly === "geo" && <GeoPanel />}
            {fly === "incidents" && (
              <div className="mm-sec-body">
                {(() => {
                  const inc = ev.filter((e) => e.type === "alarms" && (tf !== "now" || e.open));
                  return inc.length ? inc.map((e) => <Feed key={e.id} e={e} />) : <div className="jm-empty">{l.noIncidents}</div>;
                })()}
              </div>
            )}
            {fly === "activity" && (
              <div className="mm-sec-body">
                {ev.length ? ev.slice(0, 25).map((e) => <Feed key={e.id} e={e} />) : <div className="jm-empty">{l.noActivity}</div>}
              </div>
            )}
          </section>
        )}
        {/* Rosie stays mounted so the conversation survives closing the panel. */}
        <RosiePanel open={fly === "bobee"} onClose={() => setFly(null)} />
      </aside>
    </>
  );
}
