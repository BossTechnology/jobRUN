import { connection } from "next/server";
import { Board } from "@/components/Board";
import { loadJobs, loadProperties } from "@/lib/adapters";
import { CONFIG } from "@/lib/config";
import s from "@/components/board.module.css";

async function loadBoard() {
  await connection(); // board is live data; render per request
  const [jobs, props] = await Promise.all([loadJobs(), loadProperties()]);
  return { jobs, props: new Map(props.map((p) => [p.id, p])), now: Date.now() };
}

export default async function Home() {
  const { jobs, props, now } = await loadBoard();
  return (
    <>
      <header className={s.header}>
        <span className={s.logo}>jobRUN</span>
        <span className={s.mode}>{CONFIG.SIMULATE ? "Simulation" : "Live"}</span>
        <span className={s.spacer} />
        <a className={s.link} href="/prototype.html" target="_blank">
          Prototype (spec)
        </a>
      </header>
      <Board jobs={jobs} props={props} now={now} />
    </>
  );
}
