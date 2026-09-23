"use client";
/* MAP MODE — ported from the prototype's Leaflet map onto MapLibre GL (INTEGRATION.md §6).
   Base map: OpenFreeMap "positron" (free, no key; light palette like mapbox light-v11) with 3D buildings from z14.
   Traffic: TomTom flow tiles through /api/map/traffic when TOMTOM_TRAFFIC_KEY is set, simulated interstates otherwise.
   Weather: OpenWeather through /api/map/weather when OPENWEATHER_KEY is set, simulated otherwise.
   Pins, clusters, list, incident chips and cards, tour and payout orb keep the prototype's markup and CSS. */
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, LngLatBounds, Map as MLMap, Marker } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard, useJobs, useLiveEvents } from "@/lib/board/context";
import { health, incKind, isBad, priceOf } from "@/lib/domain/health";
import { jobNo, money } from "@/lib/domain/time";
import type { Job, Prop } from "@/lib/domain/types";
import { ROADS_US, US_STATES } from "@/lib/map/geo-data";
import {
  allMapJobs, clusterHealth, clusters, driftWeather, HCOL, INC_COL, indexByProp, mapJobs, propHealth, propMatches,
  segLevel, simWeather, TCOL, tourList, W_COND, WX_FILL, type Cluster, type IncKind, type PropHealth, type Weather,
} from "@/lib/map/model";
import { speak, stopSpeaking } from "@/lib/ui/speech";
import { Icon, P } from "@/lib/ui/icons";
import { Card } from "./Board";

const STYLE = "https://tiles.openfreemap.org/styles/positron";
const US_BOUNDS: [[number, number], [number, number]] = [[-123.5, 25.5], [-67.5, 48.5]];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** MetaMAP-style target pin (targetSVG), copied verbatim. */
function targetSVG(h: PropHealth, msg: boolean) {
  const c = HCOL[h], o = h === "none" ? "#E6E9EE" : msg ? "#4A9FE0" : c;
  return `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
    <circle cx="16" cy="16" r="14.2" fill="#fff" stroke="#111" stroke-width="2.4"/>
    <circle cx="16" cy="16" r="10.2" fill="none" stroke="${c}" stroke-width="${h === "none" ? 2.2 : 3.6}"/>
    <circle cx="16" cy="16" r="12.1" fill="none" stroke="#C3C9D3" stroke-width=".7"/>
    <circle cx="16" cy="16" r="8.3" fill="none" stroke="#C3C9D3" stroke-width=".7"/>
    <circle cx="16" cy="16" r="6" fill="${o}" stroke="#111" stroke-width="1.1"/>
    ${msg ? '<circle cx="16" cy="16" r="7.6" fill="none" stroke="#4A9FE0" stroke-width="1.4"/>' : ""}</svg>`;
}

const SEGMENTS = ROADS_US.flatMap(([name, pts]) =>
  pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1];
    return { name, a, b, base: ((a[0] * 13 + b[1] * 7) % 1 + 1) % 1 * 0.3, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
  }),
);

type Sel = { prop: string; label: string; jobs: string[] } | null;

export function MapMode() {
  const { w, l, lang, now, filters, matches, mapF, setMapF, openJob, toast } = useBoard();
  const jobs = useJobs();
  const live = useLiveEvents();

  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markerEls = useRef<Map<string, HTMLElement>>(new Map());
  const markers = useRef<Marker[]>([]);
  const wxMarkers = useRef<Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cam, setCam] = useState<{ zoom: number; bounds: LngLatBounds | null }>({ zoom: 3, bounds: null });
  const [sel, setSel] = useState<Sel>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [tour, setTour] = useState(false);
  const [idx, setIdx] = useState(0);
  const [audio, setAudio] = useState(false);
  const [traffic, setTraffic] = useState(false);
  const [weather, setWeather] = useState(false);
  const [wx, setWx] = useState<Weather | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [caps, setCaps] = useState({ traffic: false, weather: false });
  const [feed, setFeed] = useState<{ id: string; kind: IncKind; t: number }[]>([]);

  /* ── derived data (allMapJobs / mapJobs / matchedProps / clusters / tourList) ── */
  const all = useMemo(() => allMapJobs(jobs, matches), [jobs, matches]);
  const mj = useMemo(() => mapJobs(jobs, matches, mapF, now), [jobs, matches, mapF, now]);
  const byProp = useMemo(() => indexByProp(mj), [mj]);
  const matched = useMemo(() => w.props.filter((p) => propMatches(filters, mapF, byProp, p, now)), [w, filters, mapF, byProp, now]);
  const inView = useMemo(() => (p: Prop) => !cam.bounds || cam.bounds.contains([p.lng, p.lat]), [cam.bounds]);
  const cl = useMemo(() => clusters(w, matched, byProp, cam.zoom, inView), [w, matched, byProp, cam.zoom, inView]);
  const tl = useMemo(() => tourList(all, now), [all, now]);
  const latest = useRef({ tl, mj, jobs, lang, audio });
  useEffect(() => {
    latest.current = { tl, mj, jobs, lang, audio };
  });

  /* ── map setup ── */
  useEffect(() => {
    let map: MLMap | null = null, cancelled = false;
    fetch("/api/map/capabilities").then((r) => r.json()).then((c) => !cancelled && setCaps(c)).catch(() => {});
    import("maplibre-gl").then((lib) => {
      if (cancelled || !elRef.current) return;
      libRef.current = lib;
      lib.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      map = new lib.Map({ container: elRef.current, style: STYLE, bounds: US_BOUNDS, fitBoundsOptions: { padding: 20 }, minZoom: 2, maxZoom: 17, attributionControl: { compact: true } });
      mapRef.current = map;
      map.on("load", () => {
        const m = map!;
        const firstSymbol = m.getStyle().layers.find((x) => x.type === "symbol")?.id;
        m.addSource("jr-states", { type: "geojson", data: US_STATES });
        m.addLayer({ id: "jr-wx", type: "fill", source: "jr-states", paint: { "fill-color": "#E9ECF1", "fill-opacity": 0 } }, firstSymbol);
        m.addLayer({
          id: "jr-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
          paint: {
            "fill-extrusion-color": "#DDE1E8",
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, ["coalesce", ["get", "render_height"], 8]],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.8,
          },
        });
        m.addSource("jr-roads", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "jr-roads", type: "line", source: "jr-roads", layout: { visibility: "none", "line-cap": "round" },
          paint: { "line-color": ["match", ["get", "lvl"], 0, TCOL[0], 1, TCOL[1], 2, TCOL[2], TCOL[3]], "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.4, 6, 3, 10, 5], "line-opacity": 0.95 },
        }, firstSymbol);
        m.addSource("jr-inc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "jr-inc", type: "circle", source: "jr-inc",
          paint: {
            "circle-color": ["case", ["get", "crit"], "#8E2F2F", "#BD4444"],
            "circle-opacity": ["case", ["get", "crit"], 0.07, 0.04],
            "circle-stroke-color": ["case", ["get", "crit"], "#8E2F2F", "#BD4444"],
            "circle-stroke-width": ["case", ["get", "crit"], 1.8, 1.2],
            "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 3, ["case", ["get", "crit"], 3, 2], 10, ["case", ["get", "crit"], 110, 75], 14, ["case", ["get", "crit"], 1700, 1150]],
          },
        });
        setCam({ zoom: m.getZoom(), bounds: m.getBounds() });
        setLoaded(true);
      });
      map.on("moveend", () => setCam({ zoom: map!.getZoom(), bounds: map!.getBounds() }));
    });
    return () => {
      cancelled = true;
      stopSpeaking();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  /* TomTom tiles once the server says traffic is configured. */
  useEffect(() => {
    const m = mapRef.current;
    if (!loaded || !m || !caps.traffic || m.getSource("jr-tomtom")) return;
    m.addSource("jr-tomtom", { type: "raster", tiles: [`${location.origin}/api/map/traffic/{z}/{x}/{y}`], tileSize: 256 });
    m.addLayer({ id: "jr-tomtom", type: "raster", source: "jr-tomtom", layout: { visibility: "none" } }, "jr-inc");
  }, [loaded, caps.traffic]);

  /* ── incident rings ── */
  useEffect(() => {
    const src = mapRef.current?.getSource("jr-inc") as GeoJSONSource | undefined;
    if (!loaded || !src) return;
    const seen = new Set<string>();
    const features = mj.filter((j) => isBad(j, now)).flatMap((j) => {
      if (seen.has(j.prop)) return [];
      seen.add(j.prop);
      const p = w.prop(j.prop);
      return [{ type: "Feature" as const, properties: { crit: health(j, now) === "crit" }, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } }];
    });
    src.setData({ type: "FeatureCollection", features });
  }, [loaded, mj, now, w]);

  /* ── traffic ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!loaded || !m) return;
    const useTiles = caps.traffic;
    if (m.getLayer("jr-tomtom")) m.setLayoutProperty("jr-tomtom", "visibility", traffic && useTiles ? "visible" : "none");
    m.setLayoutProperty("jr-roads", "visibility", traffic && !useTiles ? "visible" : "none");
    if (!traffic || useTiles) return;
    const late = jobs.filter((j) => j.stage === 2 && isBad(j, now)).map((j) => w.prop(j.prop));
    (m.getSource("jr-roads") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: SEGMENTS.map((s) => ({ type: "Feature", properties: { lvl: segLevel(s, late, wx, now) }, geometry: { type: "LineString", coordinates: [[s.a[1], s.a[0]], [s.b[1], s.b[0]]] } })),
    });
  }, [loaded, traffic, caps.traffic, jobs, now, wx, w]);

  /* ── weather: tint + chips ── */
  useEffect(() => {
    if (!weather || wx) return;
    const states = w.states.filter((st) => w.stateC[st][2] >= 3 && (w.stateC[st][0] || w.stateC[st][1]));
    if (caps.weather) {
      const at = states.map((st) => `${st}:${w.stateC[st][0].toFixed(2)},${w.stateC[st][1].toFixed(2)}`).join("|");
      fetch(`/api/map/weather?at=${encodeURIComponent(at)}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setWx).catch(() => setWx(simWeather(w.states)));
    } else queueMicrotask(() => setWx(simWeather(w.states)));
  }, [weather, wx, caps.weather, w]);
  useEffect(() => {
    if (caps.weather || !wx) return;
    const t = setInterval(() => setWx((x) => (x ? driftWeather(x) : x)), 60000);
    return () => clearInterval(t);
  }, [caps.weather, wx]);
  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!loaded || !m || !lib) return;
    wxMarkers.current.forEach((mk) => mk.remove());
    wxMarkers.current = [];
    if (!weather || !wx) { m.setPaintProperty("jr-wx", "fill-opacity", 0); return; }
    const match: unknown[] = ["match", ["get", "st"]];
    Object.entries(wx).forEach(([st, v]) => match.push(st, WX_FILL[v.cond]));
    match.push("#E9ECF1");
    m.setPaintProperty("jr-wx", "fill-color", match as never);
    // State tint reads at country/region scale; fade it out before street level.
    m.setPaintProperty("jr-wx", "fill-opacity", ["interpolate", ["linear"], ["zoom"], 6, 0.75, 9, 0]);
    w.states.forEach((st) => {
      const c = w.stateC[st], v = wx[st];
      if (!c || !v || c[2] < 3) return;
      const el = document.createElement("div");
      el.className = "jm-wx";
      el.innerHTML = `<span>${W_COND[v.cond][2]}</span><b>${Math.round(v.temp)}°</b>`;
      el.style.pointerEvents = "none";
      wxMarkers.current.push(new lib.Marker({ element: el }).setLngLat([c[1], c[0]]).addTo(m));
    });
  }, [loaded, weather, wx, w]);

  /* ── pins and clusters (paintMarkers) ── */
  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!loaded || !m || !lib) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    markerEls.current.clear();
    const host = elRef.current!;
    cl.forEach((c: Cluster) => {
      const att = c.jobs.filter((j) => isBad(j, now)).length, msg = c.jobs.some((j) => j.unread);
      const el = document.createElement("div");
      if (!c.cluster) {
        const p = c.props[0], h = propHealth(byProp[p.id], now);
        el.className = `jm-pin h-${h}${checked.has(p.id) ? " chk" : ""}`;
        el.style.cssText = "width:30px;height:30px;position:relative;cursor:pointer";
        el.innerHTML = targetSVG(h, msg) + (att ? `<i class="jm-pin-b">${att}</i>` : "") + (cam.zoom >= 10 ? `<span class="jm-pin-l">${esc(c.label)}</span>` : "");
      } else {
        const h = clusterHealth(c.jobs, now), size = Math.min(56, 30 + Math.round(Math.log2(c.props.length + 1) * 7)), nmsg = c.jobs.filter((j) => j.unread).length;
        el.className = `jm-cluster h-${h}`;
        el.style.cssText = `width:${size}px;height:${size}px;cursor:pointer`;
        el.innerHTML = `<b style="width:${size}px;height:${size}px">${c.props.length}${nmsg ? `<u>${nmsg}</u>` : ""}</b>${att ? `<i>${att}</i>` : ""}`;
      }
      el.addEventListener("mouseenter", () => { host.classList.add("dimming"); el.classList.add("hov"); });
      el.addEventListener("mouseleave", () => { host.classList.remove("dimming"); el.classList.remove("hov"); });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (c.cluster) { m.flyTo({ center: [c.lng, c.lat], zoom: m.getZoom() < 5.2 ? 6.5 : 10.5, duration: 1600 }); setSel(null); }
        else openProp(c.props[0].id);
      });
      markerEls.current.set(c.k, el);
      markers.current.push(new lib.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(m));
    });
    // openProp is stable enough for listeners created here; clusters re-render whenever the data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, cl, checked, now]);

  /* Highlight the pin of the focused job (hover/tour). */
  useEffect(() => {
    markerEls.current.forEach((el) => el.classList.remove("hov"));
    const j = focus ? jobs.find((x) => x.id === focus) : null;
    if (j) markerEls.current.get(j.prop)?.classList.add("hov");
  }, [focus, cl, jobs]);

  /* ── payout orb on QuickBooks payments ── */
  const seenOrbs = useRef<Set<number> | null>(null);
  useEffect(() => {
    const m = mapRef.current, lib = libRef.current;
    if (!seenOrbs.current) { seenOrbs.current = new Set(live.map((e) => e.id)); return; }
    if (!loaded || !m || !lib) return;
    live.filter((e) => e.key === "paidQB" && !seenOrbs.current!.has(e.id)).forEach((e) => {
      seenOrbs.current!.add(e.id);
      const j = latest.current.jobs.find((x) => x.id === e.p.jobId);
      if (!j) return;
      const p = w.prop(j.prop);
      const el = document.createElement("div");
      el.className = "jm-orb";
      el.style.pointerEvents = "none";
      el.innerHTML = `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M16.5 7.5c-.7-1.4-2.4-2.2-4.5-2.2-2.6 0-4.4 1.3-4.4 3.2s1.9 2.7 4.4 3.3 4.5 1.4 4.5 3.4-1.8 3.3-4.5 3.3c-2.2 0-3.9-.9-4.6-2.4"/></svg><b>${esc(l.mp.paidOrb)} · ${esc(money(priceOf(j, p).pay))}</b><i>${esc(p.n)}</i></span>`;
      const mk = new lib.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
      el.animate([{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "scale(1)", offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 6000, easing: "ease-out" });
      setTimeout(() => mk.remove(), 6000);
    });
  }, [live, loaded, w, l]);

  /* ── incident fly-in cards (scanIncidents, 10 s each) ── */
  const seenInc = useRef<Record<string, number>>({});
  useEffect(() => {
    const scan = () => {
      const t = Date.now();
      const fresh: { id: string; kind: IncKind; t: number }[] = [];
      latest.current.mj.forEach((j) => {
        const k = incKind(j, t);
        if (k === "risk") return;
        const key = j.id + "|" + k;
        if (seenInc.current[key]) return;
        seenInc.current[key] = t;
        fresh.push({ id: j.id, kind: k, t });
      });
      seenInc.current = Object.fromEntries(Object.entries(seenInc.current).filter(([, s]) => t - s < 600000));
      setFeed((f) => [...fresh, ...f].filter((x) => t - x.t < 10000).slice(0, 3));
    };
    const first = setTimeout(scan, 800);
    const iv = setInterval(scan, 5000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, []);

  /* ── camera helpers ── */
  const flyToJob = (j: Job, zoom = 12.5) => {
    const p = w.prop(j.prop);
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom, duration: 2600 });
  };
  function openProp(pid: string) {
    const p = w.prop(pid), js = byProp[pid] ?? [];
    setSel({ prop: pid, label: p.n, jobs: js.map((j) => j.id) });
    setFocus(js[0]?.id ?? null);
    const m = mapRef.current;
    m?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 12), duration: 1400 });
  }
  const focusJob = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    if (focus === id) { openJob(id); return; }
    setFocus(id);
    if (tour) setIdx(Math.max(0, tl.findIndex((x) => x.id === id)));
    flyToJob(j);
  };
  const resetMap = () => {
    mapRef.current?.fitBounds(US_BOUNDS, { duration: 1600, padding: 20 });
    setFocus(null);
  };
  const zoomBy = (d: number) => (d > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut());

  /* ── tour (13 s per stop, worst first, optional narration) ── */
  const tourLine = (j: Job) => {
    const p = w.prop(j.prop);
    const why = j.unread && !isBad(j, Date.now()) ? l.mp.hasMsg : (l.alertWhy as Record<string, string>)[j.stage] || l.mp.needs;
    return `${p.n}. ${p.city}, ${p.st}. ${l.stages[j.stage]}. ${why}.`;
  };
  const tourLineRef = useRef(tourLine);
  useEffect(() => {
    tourLineRef.current = tourLine;
  });
  useEffect(() => {
    if (!tour) return;
    let i = -1;
    const next = () => {
      const { tl: list, lang: lg, audio: au } = latest.current;
      if (!list.length) { setTour(false); return; }
      i = (i + 1) % list.length;
      const j = list[i];
      setSel(null);
      setIdx(i);
      setFocus(j.id);
      const p = w.prop(j.prop);
      mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 12.5, duration: 2600 });
      if (au) speak(tourLineRef.current(j), lg);
    };
    next();
    const t = setInterval(next, 13000);
    return () => { clearInterval(t); stopSpeaking(); };
  }, [tour, w]);
  const toggleTour = () => {
    if (!tour && !tl.length) { toast(l.mp.nothing); return; }
    setTour((t) => !t);
  };

  /* ── map-only filters ── */
  const toggleKind = (k: IncKind) => {
    const on = mapF.kind !== k;
    setMapF((m) => ({ ...m, hfilter: null, kind: on ? k : null, attn: on }));
    toast(on ? l.mp.chip[k] : l.mp.attnOff);
  };
  const toggleAttn = () => {
    const on = !mapF.attn;
    setMapF((m) => ({ ...m, kind: null, attn: on }));
    toast(on ? l.mp.attnOn : l.mp.attnOff);
  };
  const toggleHealth = (k: PropHealth) => setMapF((m) => ({ ...m, hfilter: m.hfilter === k ? null : k }));

  /* ── selection (checkboxes in the list) ── */
  const toggleCheck = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    const m = mapRef.current, lib = libRef.current;
    if (!m || !lib || !next.size) return;
    const pts = [...next].map((x) => w.prop(x)).filter(Boolean);
    if (pts.length === 1) m.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: 13, duration: 1400 });
    else {
      const b = new lib.LngLatBounds();
      pts.forEach((p) => b.extend([p.lng, p.lat]));
      m.fitBounds(b, { padding: 80, maxZoom: 13, duration: 1600 });
    }
  };
  const clearChecked = () => { setChecked(new Set()); resetMap(); };

  /* ── render ── */
  const bad = all.filter((j) => isBad(j, now)).length, msgs = all.filter((j) => j.unread).length;
  const kinds: [IncKind, string, number][] = [
    ["crit", P.flag, all.filter((j) => health(j, now) === "crit").length],
    ["late", P.bolt, all.filter((j) => health(j, now) === "bad").length],
    ["msg", P.chat, msgs],
    ["risk", P.pin, all.filter((j) => health(j, now) === "risk").length],
  ];

  const vis = matched.filter(inView);
  const ph = (p: Prop) => propHealth(byProp[p.id], now);
  const crit = vis.filter((p) => ph(p) === "crit").length, badN = vis.filter((p) => ph(p) === "bad").length, risk = vis.filter((p) => ph(p) === "risk").length;
  const withJobs = vis.filter((p) => byProp[p.id]?.length).sort((a, b) => byProp[b.id].filter((j) => isBad(j, now)).length - byProp[a.id].filter((j) => isBad(j, now)).length || byProp[b.id].length - byProp[a.id].length);
  const selOut = [...checked].map((id) => w.prop(id)).filter((p) => p && !vis.includes(p));
  const sorted = [...selOut, ...withJobs, ...vis.filter((p) => !byProp[p.id]?.length)].sort((a, b) => Number(!checked.has(a.id)) - Number(!checked.has(b.id)));
  const hidden = [...checked].filter((id) => { const p = w.prop(id); return !p || !propMatches(filters, mapF, byProp, p, now); }).length;
  const dot = (k: PropHealth, col: string, n: number, brd = false) => (
    <button key={k} className={`d${mapF.hfilter === k ? " on" : ""}`} onClick={() => toggleHealth(k)} title={l.mp.dotT[k as keyof typeof l.mp.dotT]}>
      <i style={{ background: col, border: brd ? "1px solid #C9CED8" : undefined }} />
      {n}
    </button>
  );

  const selJobs = sel ? sel.jobs.map((id) => jobs.find((x) => x.id === id)).filter((x): x is Job => !!x) : [];
  const selProp = sel ? w.prop(sel.prop) : null;
  const cardIdx = tour ? idx : focus ? Math.max(0, tl.findIndex((x) => x.id === focus)) : 0;
  const show = tl.length ? [0, 1, 2].map((k) => tl[(cardIdx + k) % tl.length]).filter((x, k, a) => x && a.indexOf(x) === k) : [];
  const cardUp = !!sel || tour;

  return (
    <main className="jm-board ismap" aria-label="Map">
      <div className="jm-mapmode">
        <aside className="jm-maplist">
          <div className="jm-lc-top"><b>{vis.length.toLocaleString()}</b><span>{l.mp.locations} {l.mp.inView}</span></div>
          <div className="jm-lc-dots">
            {dot("crit", "#8E2F2F", crit)}
            {dot("bad", "#BD4444", badN)}
            {dot("risk", "#E39A9A", risk)}
            {dot("none", "#fff", vis.length - crit - badN - risk, true)}
          </div>
          {checked.size > 0 && (
            <div className="jm-selbar">
              <b>{checked.size}</b> {l.mp.selected}
              {hidden > 0 && <em> ({l.mp.hiddenBy(hidden)})</em>}
              <button onClick={clearChecked}>{l.mp.clearSel}</button>
            </div>
          )}
          <div className="jm-lc-list">
            {sorted.slice(0, 60).map((p) => {
              const js = byProp[p.id] ?? [], h = ph(p), att = js.filter((j) => isBad(j, now)).length, msg = js.filter((j) => j.unread).length;
              return (
                <div
                  key={p.id}
                  className={`jm-lc h-${h}${checked.has(p.id) ? " chk" : ""}`}
                  onClick={() => openProp(p.id)}
                  onMouseEnter={() => markerEls.current.get(p.id)?.classList.add("hov")}
                  onMouseLeave={() => markerEls.current.get(p.id)?.classList.remove("hov")}
                >
                  <div className="jm-lc-h">
                    <input type="checkbox" className="jm-lc-cb" checked={checked.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(p.id)} />
                    <b>{p.n}</b>
                  </div>
                  <div className="jm-lc-s">{p.custName} · {l.types[p.type as keyof typeof l.types]} · {p.city}, {p.st}</div>
                  <div className="jm-lc-m">
                    {p.units > 0 && <span>{p.units} {l.mp.units}</span>}
                    {p.cleaners > 0 && <span>{p.cleaners} {l.mp.cleaners}</span>}
                    {p.mgr && <span>{p.mgr}</span>}
                  </div>
                  <div className="jm-lc-f">
                    {att > 0 && <span className="jm-lc-c r">{l.mp.attN(att)}</span>}
                    {msg > 0 && <span className="jm-lc-c b">{l.mp.msgN(msg)}</span>}
                    <span className="jm-lc-n">{js.length ? l.mp.jobsHere(js.length) : l.mp.noJobs}</span>
                  </div>
                </div>
              );
            })}
            {sorted.length > 60 && <div className="jm-lc-more">{l.mp.more(sorted.length - 60)}</div>}
          </div>
        </aside>
        <div id="lmap" ref={elRef} className={checked.size ? "has-checked" : ""} />
        <div className="jm-maptop">
          <div className="jm-mapstats">
            <button className={`jm-stat${mapF.attn ? "" : " on"}`} onClick={() => mapF.attn && toggleAttn()}><b>{all.length}</b> {l.mp.jobs}</button>
            <button className={`jm-stat bad${mapF.attn ? " on" : ""}`} onClick={() => !mapF.attn && toggleAttn()}><b>{bad + msgs}</b> {l.mp.attention}</button>
          </div>
          <div className="jm-incbar">
            {kinds.filter((k) => k[2]).map(([k, ic, n]) => (
              <button key={k} className={`jm-incchip${mapF.kind === k ? " on" : ""}`} title={l.mp.chip[k]} style={{ color: INC_COL[k] }} onClick={() => toggleKind(k)}>
                <Icon d={ic} sw={2} />
                <b>{n}</b>
              </button>
            ))}
          </div>
          <button className={`jm-mbtn big${traffic ? " on" : ""}`} onClick={() => setTraffic((t) => !t)} title={l.mp.traffic}>
            <Icon d='<path d="M5 16.5h14M6.5 16.5v2M17.5 16.5v2M4.6 12.4l1.7-4.6A2 2 0 0 1 8.2 6.5h7.6a2 2 0 0 1 1.9 1.3l1.7 4.6M4.6 12.4h14.8v4.1H4.6zM7.4 14.4h.01M16.6 14.4h.01"/>' />
          </button>
          <button className={`jm-mbtn big${weather ? " on" : ""}`} onClick={() => setWeather((x) => !x)} title={l.mp.weather}>
            <Icon d='<path d="M16.2 9.4a5 5 0 0 0-9.3 1.3A3.3 3.3 0 0 0 7.5 17h8.7a3.8 3.8 0 0 0 0-7.6z"/><path d="M14.5 6.2A3.5 3.5 0 0 1 19 4.4"/>' />
          </button>
        </div>
        <div className="jm-mapctl">
          <button className="jm-flag" onClick={resetMap} title={l.mp.reset}>
            <svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#fff" /><g fill="#BD4444"><rect width="24" height="2" /><rect y="4" width="24" height="2" /><rect y="8" width="24" height="2" /><rect y="12" width="24" height="2" /></g><rect width="10" height="8" fill="#2A3B66" /></svg>
          </button>
          <button className={`jm-mbtn${tour ? " on" : ""}`} id="mapPlay" onClick={toggleTour} title={l.mp.play}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{tour ? <><rect x="7" y="6" width="3.5" height="12" rx="1" /><rect x="13.5" y="6" width="3.5" height="12" rx="1" /></> : <path d="M8 5.5l10 6.5-10 6.5z" />}</svg>
          </button>
          <button className={`jm-mbtn${audio ? " on" : ""}`} onClick={() => { setAudio((a) => !a); if (audio) stopSpeaking(); toast(!audio ? l.mp.audioOn : l.mp.audioOff); }} title={l.mp.audio}>
            <Icon d={'<path d="M4 9v6h4l5 4V5L8 9z"/>' + (audio ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>')} sw={1.8} />
          </button>
          <button className="jm-mbtn" onClick={() => zoomBy(1)} title="+"><Icon d='<path d="M12 5v14M5 12h14"/>' sw={2} /></button>
          <button className="jm-mbtn" onClick={() => zoomBy(-1)} title="−"><Icon d='<path d="M5 12h14"/>' sw={2} /></button>
        </div>
        <div className="jm-maplegend">
          {([["#8E2F2F", l.critical], ["#BD4444", l.mp.past], ["#E39A9A", l.hRisk], ["#4B5260", l.hOn], ["#4A9FE0", l.mp.msgs]] as [string, string][]).map(([c, t]) => (
            <span key={t}><i style={{ background: c }} />{t}</span>
          ))}
        </div>
        <div className={`jm-incfeed${cardUp || show.length ? " up" : ""}`}>
          {!tour && !sel && feed.map((x) => {
            const j = jobs.find((y) => y.id === x.id);
            if (!j) return null;
            const p = w.prop(j.prop), col = INC_COL[x.kind];
            const why = x.kind === "msg" ? l.mp.hasMsg : (l.alertWhy as Record<string, string>)[j.stage] || l.mp.needs;
            return (
              <div key={x.id + x.kind} className="jm-inccard" style={{ borderLeftColor: col }} onClick={() => focusJob(j.id)}>
                <div className="jm-inccard-t" style={{ color: col }}>{l.mp.chip[x.kind]} · {l.stages[j.stage]}</div>
                <b>{p.n} · {j.unit}</b>
                <div className="jm-inccard-s">{p.city}, {p.st} · {why}</div>
                <div className="jm-inccard-m">{jobNo(j)}</div>
              </div>
            );
          })}
        </div>
        {sel ? (
          <div className="jm-mapcard show">
            <div className="jm-mcards-h">
              <div style={{ minWidth: 0 }}>
                <b style={{ display: "block", textTransform: "none", fontSize: 12.5 }}>{sel.label}</b>
                <span style={{ margin: 0, fontSize: 10.5, textTransform: "none", letterSpacing: 0 }}>{selProp ? `${selProp.city}, ${selProp.st}` : ""} · {selJobs.length} {l.mp.jobsWord}</span>
              </div>
              <button className="jm-btn sm" style={{ marginLeft: "auto" }} onClick={() => setSel(null)}>{l.mp.closePanel}</button>
            </div>
            <div className="jm-mcards scroll">
              {selJobs.map((x) => <div key={x.id} className="jm-mcw cur"><Card j={x} /></div>)}
            </div>
          </div>
        ) : (tour || focus) && show.length ? (
          <div className="jm-mapcard show">
            <div className="jm-mcards-h">
              <b>{l.mp.attentionT}</b>
              <span>{Math.min(cardIdx + 1, tl.length)} / {tl.length}</span>
            </div>
            <div className="jm-mcards">
              {show.map((x, k) => (
                <div key={x.id} className={`jm-mcw${k === 0 ? " cur" : ""}`} onClickCapture={(e) => { if (k !== 0) { e.stopPropagation(); focusJob(x.id); } }}>
                  <Card j={x} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
