/* First cut of the BOARD section: five lanes, prototype sort orders and card states.
   Still to port from public/prototype.html: icons, filters/rail, modals, map mode, Rosie, header feeds, live ticking. */
import { health, isBad, jobCls, sortLane } from "@/lib/domain/health";
import type { Job, Property } from "@/lib/domain/types";
import s from "./board.module.css";

const LANES = ["Pending", "Scheduled", "In Progress", "Complete", "Validation"];

function clock(j: Job, now: number) {
  if (j.stage === 1 && j.dateAt)
    return new Date(j.dateAt).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  if (j.stage === 4 && j.paid) return "Paid";
  const ref = j.stage === 0 && j.owner ? (j.assignedAt ?? j.stageAt) : j.stageAt;
  const m = Math.max(0, Math.floor((now - ref) / 60000));
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function Board({ jobs, props, now }: { jobs: Job[]; props: Map<string, Property>; now: number }) {
  return (
    <main className={s.board}>
      {LANES.map((name, i) => {
        const list = sortLane(i, jobs.filter((j) => j.stage === i));
        const nbad = list.filter((j) => isBad(j, now)).length;
        return (
          <section key={name} className={s.col} aria-label={name}>
            <div className={s.colHd}>
              <span className={s.nm}>{name}</span>
              <span className={s.ct}>
                {list.length}
                {nbad > 0 && <em>({nbad})</em>}
              </span>
            </div>
            <div className={s.colBody}>
              {list.map((j) => {
                const p = j.prop ? props.get(j.prop) : undefined;
                const h = health(j, now);
                const cls = [s.card, ...jobCls(j, now).split(" ").filter(Boolean).map((c) => s[c]), j.stage === 0 && !j.owner && h !== "crit" ? s.low : ""];
                return (
                  <article key={j.id} className={cls.join(" ")}>
                    <div className={s.top}>
                      <b className={s.name}>{p?.name ?? "— — — —"}</b>
                      <span className={s.num}>#{j.id.replace(/^J/, "")}</span>
                    </div>
                    <div className={s.row2}>
                      <span>{p ? `${p.city}, ${p.state}` : ""}</span>
                      <span className={`${s.clock} ${h === "risk" ? s.risk : h === "bad" || h === "crit" ? s.bad : ""}`}>{clock(j, now)}</span>
                    </div>
                    {j.unread && <div className={s.msg}>New reply</div>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
