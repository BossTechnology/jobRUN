/* Client-side board state. Jobs are replaced (never mutated in place) so React re-renders only what changed;
   update() hands the caller a copy to edit, which keeps the prototype's mutation-style logic readable. */
import type { Job } from "@/lib/domain/types";
import type { LiveEvent } from "./events";

function cloneJob(j: Job): Job {
  return {
    ...j,
    f: { ...j.f },
    fsrc: { ...j.fsrc },
    thread: [...j.thread],
    actions: j.actions && [...j.actions],
    addons: j.addons && [...j.addons],
  };
}

export class BoardStore {
  private jobs: Job[] = [];
  private listeners = new Set<() => void>();
  private live: LiveEvent[] = [];
  /** Builds the Action Intelligence event for log(); set by the app once the world is known. */
  private logHook: ((key: string, j: Job, stageI?: number) => LiveEvent) | null = null;
  setLogHook(fn: (key: string, j: Job, stageI?: number) => LiveEvent) {
    this.logHook = fn;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.jobs;
  getEvents = () => this.live;
  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  set(jobs: Job[]) {
    this.jobs = jobs;
    this.emit();
  }
  get(id: string) {
    return this.jobs.find((j) => j.id === id);
  }
  all() {
    return this.jobs;
  }
  update(id: string, fn: (draft: Job) => void) {
    const cur = this.get(id);
    if (!cur) return;
    const next = cloneJob(cur);
    fn(next);
    this.jobs = this.jobs.map((j) => (j.id === id ? next : j));
    this.emit();
  }
  add(job: Job) {
    this.jobs = [...this.jobs, job];
    this.emit();
  }
  remove(id: string) {
    this.jobs = this.jobs.filter((j) => j.id !== id);
    this.emit();
  }
  setEvents(live: LiveEvent[]) {
    this.live = live;
    this.emit();
  }
  /** Records an automatic action (Zendesk update, Work App write, text sent…) in the actions feed. */
  log(key: string, j: Job, stageI?: number) {
    if (!this.logHook) return;
    this.live = [...this.live, this.logHook(key, j, stageI)];
    this.emit();
  }
}
