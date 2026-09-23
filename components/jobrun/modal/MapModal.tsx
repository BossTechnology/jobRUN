"use client";
/* MAP MODAL — a job's property with nearby active jobs and the check-in offset (openMap / renderMap).
   Drawn map, as in the prototype; street-level tiles arrive with Mapbox (INTEGRATION.md §6). */
import { useEffect, useState } from "react";
import { useBoard, useJob, useJobs } from "@/lib/board/context";
import { isBad, miles } from "@/lib/domain/health";
import { Icon, P } from "@/lib/ui/icons";

const W = 600, H = 360, CX = W / 2, CY = H / 2, R = 150;

export function MapModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { w, l, now } = useBoard();
  const j = useJob(id);
  const jobs = useJobs();
  const [radius, setRadius] = useState(10);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!j) return null;

  const p = w.prop(j.prop);
  const sc = R / radius, kx = Math.cos((p.lat * Math.PI) / 180) * 69.17, ky = 69.0;
  const proj = (lat: number, lng: number): [number, number] => [CX + (lng - p.lng) * kx * sc, CY - (lat - p.lat) * ky * sc];
  const near = jobs
    .filter((x) => x.id !== j.id && !(x.stage === 4 && x.paid))
    .map((x) => ({ x, pp: w.prop(x.prop) }))
    .map((o) => ({ ...o, d: miles(p, o.pp) }))
    .filter((o) => o.d <= radius)
    .sort((a, b) => a.d - b.d);
  const seen: Record<string, number> = {};
  const offset = j.stage === 2 && j.checkinOffset ? { lat: p.lat + j.checkinOffset[0], lng: p.lng + j.checkinOffset[1] } : null;

  return (
    <div className="glob-modal-bg open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="glob-modal jm-map" role="dialog" aria-labelledby="mapTitle">
        <div className="glob-modal-head">
          <div className="glob-modal-icon" style={{ background: "var(--gray-bg)" }}><Icon d={P.pin} sw={1.8} /></div>
          <div className="glob-modal-info">
            <h3 id="mapTitle">{p.n} · {j.unit}</h3>
            <p>{p.street}, {p.city}, {p.st} {p.zip}</p>
          </div>
          <button className="glob-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="glob-modal-body">
          <div className="jm-map-ctl">
            <span>{l.radius}</span>
            {[5, 10, 25].map((r) => (
              <button key={r} className={`jm-seg${radius === r ? " on" : ""}`} onClick={() => setRadius(r)}>{r} mi</button>
            ))}
          </div>
          <svg className="jm-mapsvg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={p.n}>
            {Array.from({ length: 13 }, (_, i) => i - 6).map((k) => (
              <g key={k}>
                <line x1={CX + (k * R) / 3} y1={0} x2={CX + (k * R) / 3} y2={H} stroke="#E9ECF1" />
                <line x1={0} y1={CY + (k * R) / 3} x2={W} y2={CY + (k * R) / 3} stroke="#E9ECF1" />
              </g>
            ))}
            <circle cx={CX} cy={CY} r={R} fill="rgba(198,231,255,.28)" stroke="#8FB9DC" strokeDasharray="5 4" />
            <circle cx={CX} cy={CY} r={R / 2} fill="none" stroke="#C9D8E6" strokeDasharray="3 4" />
            <text x={CX + R + 4} y={CY - 4} fontSize={10} fill="#8E96A8">{radius} mi</text>
            <text x={CX + R / 2 + 4} y={CY - 4} fontSize={10} fill="#A6AEBF">{radius / 2}</text>
            <g transform={`translate(${W - 26},22)`}>
              <path d="M0 -10 L5 4 L0 1 L-5 4 Z" fill="#8E96A8" />
              <text y={16} fontSize={9} textAnchor="middle" fill="#8E96A8">N</text>
            </g>
            {near.map((o) => {
              const [x, y] = proj(o.pp.lat, o.pp.lng);
              const off = (seen[o.pp.id] = (seen[o.pp.id] || 0) + 1);
              const ang = off * 2.1, rr = o.d < 0.05 ? 16 + off * 2 : off > 1 ? 7 : 0;
              return (
                <circle key={o.x.id} cx={x + Math.cos(ang) * rr} cy={y + Math.sin(ang) * rr} r={5.5} fill={isBad(o.x, now) ? "#BD4444" : "#4B5260"} stroke="#fff" strokeWidth={1.5}>
                  <title>{o.pp.n} · {l.stages[o.x.stage]}</title>
                </circle>
              );
            })}
            {offset && (() => {
              const [x, y] = proj(offset.lat, offset.lng);
              return (
                <>
                  <line x1={CX} y1={CY} x2={x} y2={y} stroke="#BD4444" strokeDasharray="4 3" />
                  <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill="#fff" stroke="#BD4444" strokeWidth={2} />
                </>
              );
            })()}
            <circle cx={CX} cy={CY} r={11} fill="#111" />
            <circle cx={CX} cy={CY} r={4} fill="#fff" />
            <text x={CX} y={CY + 26} fontSize={11} fontWeight={700} textAnchor="middle" fill="#111">{p.n}</text>
          </svg>
          <div className="jm-legend">
            <span><i style={{ background: "#111" }} />{l.lgProp}</span>
            <span><i style={{ background: "#4B5260" }} />{l.lgJob}</span>
            <span><i style={{ background: "#BD4444" }} />{l.lgBad}</span>
            {offset && <span><i style={{ background: "#fff", border: "2px solid #BD4444", borderRadius: 2 }} />{l.lgCheck}</span>}
          </div>
          {offset && <div className="jm-alertline" style={{ padding: "0 20px 8px" }}>{l.checkinOff(miles(p, offset).toFixed(1))}</div>}
          <div className="glob-modal-section">
            <div className="glob-section-title">{l.nearby(near.length, radius)}</div>
            {near.length ? (
              near.slice(0, 8).map((o) => (
                <div key={o.x.id} className="jm-near">
                  <b>{o.pp.n} · {o.x.unit}</b>
                  <span>{l.stages[o.x.stage]}</span>
                  <span>{o.d.toFixed(1)} mi</span>
                </div>
              ))
            ) : (
              <div className="jm-mail-h">{l.noNearby}</div>
            )}
          </div>
          <div className="glob-modal-note" style={{ borderBottom: "none", borderTop: "1px solid var(--gray-border)" }}>{l.mapNote}</div>
        </div>
      </div>
    </div>
  );
}
