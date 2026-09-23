/* Rules ported from the prototype: thresholds, health, card class, incident kind, sort orders, pricing, time. */
import { describe, expect, it } from "vitest";
import { fieldsDone, health, incKind, isBad, jobCls, lowConf, priceOf, sortLane, thresholdFor } from "@/lib/domain/health";
import { epochToET, etToEpoch, plus2, winTxt } from "@/lib/domain/time";
import { job, minutesAgo, world } from "./helpers";

describe("thresholds and health", () => {
  it("unassigned requests go at risk at 21 min, bad at 30, critical at 60", () => {
    expect(thresholdFor(job())).toEqual([30, 60]);
    expect(health(job({ stageAt: minutesAgo(10) }))).toBe("on");
    expect(health(job({ stageAt: minutesAgo(22) }))).toBe("risk");
    expect(health(job({ stageAt: minutesAgo(31) }))).toBe("bad");
    expect(health(job({ stageAt: minutesAgo(61) }))).toBe("crit");
  });

  it("owned pending jobs count from assignment against 4h / 8h", () => {
    const j = job({ owner: "Jake", stageAt: minutesAgo(600), assignedAt: minutesAgo(60) });
    expect(thresholdFor(j)).toEqual([240, 480]);
    expect(health(j)).toBe("on");
  });

  it("scheduled jobs have no clock; in progress uses 3h / 5h", () => {
    expect(thresholdFor(job({ stage: 1 }))).toBeNull();
    expect(health(job({ stage: 2, stageAt: minutesAgo(200) }))).toBe("bad");
  });

  it("complete jobs without evidence or flagged are bad; delayed jobs are never escalated", () => {
    expect(health(job({ stage: 3, evidence: 0 }))).toBe("bad");
    expect(health(job({ stage: 3, evidence: 5, flag: true }))).toBe("bad");
    expect(health(job({ stage: 2, stageAt: minutesAgo(999), delayed: true }))).toBe("on");
  });

  it("validation uses the quick-pay clock (24h / 48h) or 3d / 6d, none once paid", () => {
    expect(thresholdFor(job({ stage: 4, qp: true }))).toEqual([1440, 2880]);
    expect(thresholdFor(job({ stage: 4 }))).toEqual([4320, 8640]);
    expect(thresholdFor(job({ stage: 4, paid: true }))).toBeNull();
    expect(jobCls(job({ stage: 4, paid: true }))).toBe("paid");
  });

  it("incident kind ranks critical, late, unanswered message, risk", () => {
    expect(incKind(job({ stageAt: minutesAgo(61) }))).toBe("crit");
    expect(incKind(job({ stageAt: minutesAgo(40) }))).toBe("late");
    expect(incKind(job({ unread: true }))).toBe("msg");
    expect(isBad(job())).toBe(false);
  });
});

describe("lanes", () => {
  it("Pending shows unassigned first, then oldest; Scheduled by date", () => {
    const a = job({ id: "J1", owner: "Jake", stageAt: minutesAgo(90) });
    const b = job({ id: "J2", stageAt: minutesAgo(10) });
    const c = job({ id: "J3", stageAt: minutesAgo(50) });
    expect(sortLane(0, [a, b, c]).map((j) => j.id)).toEqual(["J3", "J2", "J1"]);
    const d = job({ id: "J4", stage: 1, dateAt: Date.now() + 2e7 }), e = job({ id: "J5", stage: 1, dateAt: Date.now() + 1e7 });
    expect(sortLane(1, [d, e]).map((j) => j.id)).toEqual(["J5", "J4"]);
  });

  it("gates: required fields and low-confidence senders", () => {
    expect(fieldsDone(job())).toBe(false);
    expect(fieldsDone(job({ f: { date: "2026-10-01", time: "09:00", time2: "11:00", notes: "" } }))).toBe(true);
    expect(lowConf(job({ req: { k: "unknown", prop: "", unit: "", from: "", name: "", ch: "Gmail", subj: "", body: { en: "", es: "" }, conf: 90, svc: 0 } }))).toBe(true);
  });
});

describe("pricing", () => {
  it("adds 30% for commercial/residential and sums add-ons", () => {
    const co = world.props.find((p) => p.type === "co")!;
    expect(priceOf(job({ svc: 0 }), { ...co, type: "mf" }).price).toBe(145);
    expect(priceOf(job({ svc: 0 }), co).price).toBeCloseTo(188.5);
    const withAddon = job({ svc: 0, addons: [{ k: "oven", label: "Oven", price: 40, pay: 30, by: "x", t: 0, note: "" }] });
    expect(priceOf(withAddon, { ...co, type: "mf" })).toMatchObject({ price: 185, pay: 140 });
  });
});

describe("Eastern time", () => {
  it("converts wall clock both ways across DST", () => {
    expect(new Date(etToEpoch("2026-07-15", "09:00")).toISOString()).toBe("2026-07-15T13:00:00.000Z");
    expect(new Date(etToEpoch("2026-12-15", "09:00")).toISOString()).toBe("2026-12-15T14:00:00.000Z");
    expect(epochToET(etToEpoch("2026-12-15", "17:30"))).toEqual(["2026-12-15", "17:30"]);
  });

  it("window text and +2h default end", () => {
    expect(plus2("09:30")).toBe("11:30");
    expect(plus2("23:00")).toBe("23:00");
    const j = { dateAt: etToEpoch("2026-10-01", "09:00"), dateEnd: etToEpoch("2026-10-01", "11:00") };
    expect(winTxt(j, "en")).toBe("9–11 AM");
    expect(winTxt({ dateAt: etToEpoch("2026-10-01", "11:00"), dateEnd: etToEpoch("2026-10-01", "13:00") }, "en")).toBe("11 AM–1 PM");
  });
});
