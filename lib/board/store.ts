/* Client-side board state. Jobs are replaced (never mutated in place) so React re-renders only what changed;
   update() hands the caller a copy to edit, which keeps the prototype's mutation-style logic readable. */
import type { Job } from "@/lib/domain/types";

export interface BoardEvent {
  key: string;
  jobId: string;
  stageI: number;
  t: number;
}

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
  /** Actions feed for the header (Action Intelligence); rendered once the header is ported. */
  events: BoardEvent[] = [];

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.jobs;
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
  log(key: string, j: Job, stageI?: number) {
    this.events.push({ key, jobId: j.id, stageI: stageI ?? j.stage, t: Date.now() });
    this.events = this.events.filter((e) => Date.now() - e.t < 6 * 3600000);
  }
}
