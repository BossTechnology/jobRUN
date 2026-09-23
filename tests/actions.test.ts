/* Job actions: the Scheduled rule (changes that break "defined + confirmed" go back to Pending), actions with
   reasons, review outcomes, and the change hook live mode uses to persist edits. */
import { describe, expect, it } from "vitest";
import { approveJob, assignTo, doAct, schedule, sendMsg, setField } from "@/lib/board/actions";
import { etToEpoch } from "@/lib/domain/time";
import { ctxWith, job } from "./helpers";

const ready = () =>
  job({ owner: "Jake", senderOk: true, teamOk: true, teamAsked: true, f: { date: "2026-10-01", time: "09:00", time2: "11:00", notes: "" } });

describe("pending → scheduled", () => {
  it("schedule sets the window and moves the job", () => {
    const { store, ctx } = ctxWith([ready()]);
    schedule(ctx, "J1");
    const j = store.get("J1")!;
    expect(j.stage).toBe(1);
    expect(j.dateAt).toBe(etToEpoch("2026-10-01", "09:00"));
    expect(j.dateEnd).toBe(etToEpoch("2026-10-01", "11:00"));
  });

  it("changing the date of a scheduled job sends it back to Pending with a note", () => {
    const { store, ctx } = ctxWith([ready()]);
    schedule(ctx, "J1");
    expect(setField(ctx, "J1", "date", "2026-10-02")).toBe(true);
    const j = store.get("J1")!;
    expect(j.stage).toBe(0);
    expect(j.teamOk).toBe(false);
    expect(j.thread.at(-1)?.dir).toBe("note");
  });

  it("changing only access notes keeps it scheduled", () => {
    const { store, ctx } = ctxWith([ready()]);
    schedule(ctx, "J1");
    expect(setField(ctx, "J1", "notes", "Lockbox 1234")).toBe(false);
    expect(store.get("J1")!.stage).toBe(1);
  });

  it("an end time before the start is corrected to start + 2h", () => {
    const { store, ctx, toasts } = ctxWith([ready()]);
    setField(ctx, "J1", "time2", "08:00");
    expect(store.get("J1")!.f.time2).toBe("11:00");
    expect(toasts.length).toBe(1);
  });
});

describe("actions menu", () => {
  it("reschedule records the reason and clears the date", () => {
    const { store, ctx } = ctxWith([ready()]);
    schedule(ctx, "J1");
    expect(doAct(ctx, "J1", "reschedule", "Tenant moved in late")).toEqual({ kind: "pending" });
    const j = store.get("J1")!;
    expect(j.stage).toBe(0);
    expect(j.f.date).toBe("");
    expect(j.actions?.[0]).toMatchObject({ key: "reschedule", reason: "Tenant moved in late" });
  });

  it("add-on raises price inputs and texts the cleaner before completion", () => {
    const { store, ctx } = ctxWith([job({ stage: 2, team: 0 })]);
    doAct(ctx, "J1", "addon", "PM asked by phone", "oven");
    const j = store.get("J1")!;
    expect(j.addons?.[0]).toMatchObject({ k: "oven", price: 40, pay: 30 });
    expect(j.thread.some((m) => m.ch === "sms")).toBe(true);
  });

  it("cancel removes the job from the board", () => {
    const { store, ctx } = ctxWith([ready()]);
    expect(doAct(ctx, "J1", "cancel", "Duplicate request")).toEqual({ kind: "closed" });
    expect(store.get("J1")).toBeUndefined();
  });

  it("approve seals the job into Validation, noting missing evidence", () => {
    const { store, ctx } = ctxWith([job({ stage: 3, evidence: 0, flag: true })]);
    approveJob(ctx, "J1");
    const j = store.get("J1")!;
    expect(j).toMatchObject({ stage: 4, flag: false, pdfSent: true });
    expect(j.thread.at(-1)?.dir).toBe("note");
  });
});

describe("messages and assignment", () => {
  it("sending a reply clears the unread indicator; notes don't", () => {
    const { store, ctx } = ctxWith([job({ unread: true })]);
    sendMsg(ctx, "J1", "note", "internal");
    expect(store.get("J1")!.unread).toBe(true);
    sendMsg(ctx, "J1", "email", "On it");
    expect(store.get("J1")!.unread).toBe(false);
  });

  it("texting needs a team", () => {
    const { ctx, toasts } = ctxWith([job({ team: null })]);
    expect(sendMsg(ctx, "J1", "sms", "hi")).toBe(false);
    expect(toasts).toHaveLength(1);
  });

  it("the change hook sees before/after for every edit (live-mode persistence)", () => {
    const { store, ctx } = ctxWith([job()]);
    const seen: [string | null, string | null][] = [];
    store.setChangeHook((prev, next) => seen.push([prev.owner, next?.owner ?? null]));
    assignTo(ctx, "J1", "Priya");
    expect(seen).toEqual([[null, "Priya"]]);
  });
});

describe("live data edge cases", () => {
  it("team options are empty when there are no cleaning teams or no property", async () => {
    const { teamOptions } = await import("@/lib/board/actions");
    const { ctx } = ctxWith([job()]);
    expect(teamOptions({ ...ctx, w: { ...ctx.w, teams: [] } }, job())).toEqual([]);
    expect(teamOptions(ctx, job({ prop: "missing" }))).toEqual([]);
    expect(teamOptions(ctx, job()).length).toBeGreaterThan(0);
  });
});
