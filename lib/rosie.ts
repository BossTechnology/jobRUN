/* Rosie prompts and board snapshot, from the prototype's askRosie() / loadInsight() / boardSnapshot().
   Shared: /api/rosie builds the snapshot from Supabase; in simulation the browser builds it from its own board. */
import { health } from "@/lib/domain/health";
import { SERVICES, type Job, type Prop, type Team } from "@/lib/domain/types";

export type RosieMode = "situation" | "recommendation" | "prediction";
export type RosieScope = "focus" | "global";

const STAGE_NAMES = ["Pending", "Scheduled", "In Progress", "Complete", "Validation"];
const TYPE_NAMES: Record<string, string> = { mf: "Multifamily", sf: "Single family", st: "Student", co: "Commercial", re: "Residential" };
const HEALTH_TXT = { on: "on track", risk: "approaching limit", bad: "past limit", crit: "critical" } as const;

export const INSIGHT_ASK: Record<RosieMode, string> = {
  situation:
    "In 2–3 short sentences, describe the current situation: what is past its limit or critical, what is unassigned, what is waiting on unanswered messages, and where problems concentrate (operator, market, stage).",
  recommendation:
    "List the 3 most important next actions for the operator, in priority order, one short line each, each citing the job numbers involved.",
  prediction:
    "In 2–4 short lines, predict what is likely to slip in the next few hours: jobs approaching their limits, scheduled jobs soon without cleaner confirmation, in-progress jobs running long. Cite job numbers.",
};

export function chatSystem(mode: RosieMode, lang: "en" | "es") {
  return `You are Rosie, the assistant inside jobRUN, an operations board PINCH uses to run cleaning jobs for property managers. The operator is in ${mode} mode (situation = what is happening, recommendation = what to do, prediction = what will happen). Answer using ONLY the board data provided. Be concise and practical: a short answer, then at most a few bullet points. Always cite jobs by number in the form #10402 so they become clickable. If the data doesn't answer the question, say so plainly. Reply in ${lang === "es" ? "Spanish" : "English"}.`;
}

export function insightSystem(mode: RosieMode, lang: "en" | "es") {
  return `You are Rosie, the assistant inside jobRUN, the board PINCH operators use to run cleaning jobs. ${INSIGHT_ASK[mode]} Use ONLY the board data provided. Plain text, no markdown headings. Always cite jobs as #10402. Reply in ${lang === "es" ? "Spanish" : "English"}.`;
}

function dur(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

const fmtET = (ms: number, tz: string) =>
  new Date(ms).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Same columns as the prototype's boardSnapshot(), capped at 140 rows. */
export function boardSnapshot(opts: { jobs: Job[]; total: number; prop: (id: string) => Prop | undefined; teams: Team[]; operator: string; scope: RosieScope; tz: string; now?: number; filters?: string[] }) {
  const now = opts.now ?? Date.now();
  const rows = opts.jobs.slice(0, 140).map((j) => {
    const p = j.propKnown ? opts.prop(j.prop) : undefined;
    const ref = j.stage === 0 && j.owner ? (j.assignedAt ?? j.stageAt) : j.stageAt;
    return [
      "#" + j.id.replace(/^J/, ""),
      p?.n ?? `(unknown property; sender ${j.req?.from ?? ""})`,
      p ? `${p.city}, ${p.st}` : "",
      STAGE_NAMES[j.stage],
      SERVICES.en[j.svc],
      p ? TYPE_NAMES[p.type] : "",
      j.owner ?? "Unassigned",
      j.stage === 1 && j.dateAt ? "scheduled " + fmtET(j.dateAt, opts.tz) : "in stage " + dur(now - ref),
      j.delayed ? "marked delayed" : HEALTH_TXT[health(j, now)],
      j.unread ? "UNANSWERED MESSAGE" : "",
      j.paid ? "paid" : "",
      j.team != null ? opts.teams[j.team]?.[0] ?? "" : "",
      j.teamOk ? "cleaner confirmed" : "cleaner not confirmed",
    ].join(" | ");
  });
  return `Logged-in operator: ${opts.operator}. Current time (ET): ${fmtET(now, opts.tz)}. Scope: ${
    opts.scope === "global" ? "GLOBAL — every job in the operation, board filters ignored" : "FOCUSED — only what is visible on the board; filters: " + (opts.filters?.length ? opts.filters.join("; ") : "none")
  }. Jobs in scope: ${opts.jobs.length} of ${opts.total}.
Columns: job | property | city | stage | service | property type | owner | timing | health | messages | payment | cleaning team | cleaner status
${rows.join("\n")}`;
}
