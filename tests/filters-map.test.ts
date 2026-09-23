/* Board filters, map property filters and clustering, header event counts, and the DB ↔ board mapping. */
import { describe, expect, it } from "vitest";
import { countFor, makeEvent } from "@/lib/board/events";
import { emptyFilters, filterText, hasFilters, matches } from "@/lib/board/filters";
import { jobColumns, mapJob, type MapCtx } from "@/lib/adapters/supabase";
import { clusters, indexByProp, MAP_OFF, propMatches } from "@/lib/map/model";
import { etToEpoch } from "@/lib/domain/time";
import { job, minutesAgo, world } from "./helpers";

describe("board filters", () => {
  it("empty filters match everything", () => {
    const F = emptyFilters();
    expect(hasFilters(F)).toBe(false);
    expect(matches(F, world, job())).toBe(true);
  });

  it("health bands treat critical as breached", () => {
    const F = { ...emptyFilters(), health: new Set(["bad" as const]) };
    expect(matches(F, world, job({ stageAt: minutesAgo(90) }))).toBe(true);
    expect(matches(F, world, job())).toBe(false);
    expect(filterText(F)).toEqual(["health=bad"]);
  });

  it("operators filter keeps unassigned via __un", () => {
    const F = { ...emptyFilters(), ops: new Set(["Priya"]) };
    expect(matches(F, world, job({ owner: "Priya" }))).toBe(true);
    expect(matches(F, world, job())).toBe(false);
  });

  it("keyword searches property, city, customer and job number", () => {
    const j = job({ id: "J10402" });
    const p = world.prop(j.prop);
    const kw = (v: string) => ({ ...emptyFilters(), observe: [{ kind: "keyword" as const, v, label: v }] });
    expect(matches(kw(p.city.toLowerCase()), world, j)).toBe(true);
    expect(matches(kw("#10402"), world, j)).toBe(true);
    expect(matches(kw("zzzz-no-match"), world, j)).toBe(false);
  });

  it("geo: state tag, and city radius", () => {
    const j = job(), p = world.prop(j.prop);
    expect(matches({ ...emptyFilters(), geo: [{ kind: "state", v: p.st, label: p.st }] }, world, j)).toBe(true);
    const far = { kind: "city" as const, v: "x", label: "x", lat: p.lat + 5, lng: p.lng };
    expect(matches({ ...emptyFilters(), geo: [far] }, world, j)).toBe(false);
  });
});

describe("map", () => {
  it("clusters by state when zoomed out, pins when close", () => {
    const byProp = indexByProp([]);
    const props = world.props.filter((p) => p.lat).slice(0, 40);
    const states = new Set(props.map((p) => p.st)).size;
    expect(clusters(world, props, byProp, 3, () => true)).toHaveLength(states);
    expect(clusters(world, props, byProp, 12, () => true).every((c) => !c.cluster)).toBe(true);
  });

  it("property filter follows the map's health dot", () => {
    const j = job({ stageAt: minutesAgo(90) }), byProp = indexByProp([j]);
    const p = world.prop(j.prop);
    expect(propMatches(emptyFilters(), { ...MAP_OFF, on: true, hfilter: "crit" }, byProp, p, Date.now())).toBe(true);
    expect(propMatches(emptyFilters(), { ...MAP_OFF, on: true, hfilter: "risk" }, byProp, p, Date.now())).toBe(false);
  });
});

describe("header events", () => {
  it("counts open incidents now and everything in a past timeframe", () => {
    const jobs = [job({ stage: 2 })];
    const a = makeEvent(world, jobs, "alarms", Date.now()), b = { ...makeEvent(world, jobs, "alarms", Date.now()), open: false };
    expect(countFor([a, b], "alarms", "now")).toBe(1);
    expect(countFor([a, b], "alarms", "week")).toBe(2);
  });
});

describe("DB ↔ board mapping", () => {
  const ctx: MapCtx = {
    opName: new Map([["op-1", "Priya"]]), teamIdx: new Map([["team-a", 0]]), threads: new Map(), unread: new Set(["42"]),
    tracker: new Map([["42", { arrived_at: "2026-10-01T13:05:00Z", ended_at: null, cleaner_notes: "ok" }]]), evidence: new Map([["42", 3]]),
  };
  const row = {
    id: 42, stage: "in_progress", stage_at: "2026-10-01T13:10:00Z", created_at: "2026-09-30T12:00:00Z", property_id: "prop-1", customer_id: "cust-1",
    unit: "4B", service: "deep_clean", owner_id: "op-1", assigned_at: "2026-09-30T12:10:00Z", sender_confirmed: true, sender_confirmed_by: "ai",
    team_id: "team-a", team_confirmed: true, team_asked_at: "2026-09-30T13:00:00Z", window_date: "2026-10-01", window_start: "09:00:00", window_end: "11:00:00",
    access_notes: "Lockbox", quick_pay: false, flagged: false, delayed: false, paid: false, paid_at: null, po_status: "ok", rating_pinch: null,
    evidence_pdf_sent: false, zendesk_ticket: "123", workapp_id: null, request_subject: "Clean 4B", request_body: "Please", request_channel: "Gmail",
    request_from: "pm@x.com", request_name: "Pat", ai_confidence: 91, field_sources: { unit: "ai" },
  };

  it("maps a row onto the board shape", () => {
    const j = mapJob(row, ctx);
    expect(j).toMatchObject({ id: "J42", stage: 2, svc: 1, owner: "Priya", team: 0, unread: true, evidence: 3, checkin: true, cnote: "ok" });
    expect(j.dateAt).toBe(etToEpoch("2026-10-01", "09:00"));
    expect(j.req).toMatchObject({ from: "pm@x.com", name: "Pat", subj: "Clean 4B" });
  });

  it("round-trips back to columns", () => {
    const cols = jobColumns(mapJob(row, ctx), { opId: (n) => (n === "Priya" ? "op-1" : null), teamId: (i) => (i === 0 ? "team-a" : null) });
    expect(cols).toMatchObject({ stage: "in_progress", service: "deep_clean", owner_id: "op-1", team_id: "team-a", window_date: "2026-10-01", window_start: "09:00", window_end: "11:00", unit: "4B" });
  });
});
