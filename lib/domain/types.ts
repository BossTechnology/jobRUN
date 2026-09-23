/* Board-side shapes. Field names follow the prototype's objects (PINCH WORLD) so ported logic reads the same;
   the Supabase adapter maps DB columns (supabase/migrations) onto these. */

export const STAGES = ["pending", "scheduled", "in_progress", "complete", "validation"] as const;
export type Stage = (typeof STAGES)[number];
/** Lane index used everywhere on the board: 0 Pending · 1 Scheduled · 2 In Progress · 3 Complete · 4 Validation. */
export type StageIndex = 0 | 1 | 2 | 3 | 4;
export const stageIndex = (s: Stage) => STAGES.indexOf(s) as StageIndex;

export const PROPERTY_TYPES = {
  mf: "multifamily",
  sf: "singlefamily",
  st: "student",
  co: "commercial",
  re: "residential",
} as const;
export type PropertyTypeCode = keyof typeof PROPERTY_TYPES;

/** Service index matches SERVICES / PRICE / EXPECT. */
export const SERVICE_KEYS = ["turnover", "deep_clean", "post_construction", "common_areas", "guest_suite", "porter"] as const;
export const SERVICES = {
  en: ["Turnover", "Deep clean", "Post-construction", "Common areas", "Guest suite", "Porter"],
  es: ["Rotación", "Limpieza profunda", "Post-construcción", "Áreas comunes", "Suite de huéspedes", "Portería"],
};
/** [price, cleaner pay] per service. */
export const PRICE: [number, number][] = [[145, 110], [260, 195], [480, 360], [120, 90], [85, 65], [95, 72]];
/** Expected duration in minutes per service. */
export const EXPECT = [180, 300, 420, 120, 90, 120];

export type Health = "on" | "risk" | "bad" | "crit";
export type IncidentKind = "crit" | "late" | "msg" | "risk";

export interface Customer {
  id: string;
  n: string;
  dom: string;
  contacts: string[];
}

/** [name, phone] */
export type Team = [string, string];

export interface Prop {
  id: string;
  n: string;
  cust: string;
  custName: string;
  type: PropertyTypeCode;
  street: string;
  city: string;
  st: string;
  zip: string;
  lat: number;
  lng: number;
  units: number;
  cleaners: number;
  mgr: string;
  phone: string;
  email: string;
  code: string;
  beds: number;
  /** index into World.teams (default cleaning team) */
  team: number;
}

export interface World {
  customers: Customer[];
  teams: Team[];
  props: Prop[];
}

export interface ThreadMsg {
  dir: "in" | "out" | "note";
  ch: "email" | "sms" | "note";
  who: string;
  text: string;
  t: number;
}

export type RequestKind = "newContact" | "structured" | "known" | "unknown" | "text" | "weak";
export interface JobRequest {
  k: RequestKind;
  prop: string;
  unit: string;
  from: string;
  name: string;
  ch: string;
  subj: string;
  body: { en: string; es: string };
  conf: number;
  svc: number;
  prev?: string;
  time?: string;
  notes?: string;
  unitAi?: boolean;
}

export type FieldKey = "prop" | "unit" | "svc" | "date" | "time" | "time2" | "notes";
export type FieldSource = "ai" | "you";

export interface JobAction {
  t: number;
  who: string;
  key: string;
  label: string;
  reason: string;
}
export interface JobAddon {
  k: string;
  label: string;
  price: number;
  pay: number;
  by: string;
  t: number;
  note: string;
}

export interface Job {
  id: string;
  stage: StageIndex;
  prop: string;
  cust: string;
  unit: string;
  svc: number;
  /** epoch ms the job entered its lane */
  stageAt: number;
  createdAt: number;
  owner: string | null;
  assignedAt: number | null;
  senderOk: boolean;
  senderBy: "ai" | "human" | null;
  propKnown: boolean;
  /** index into World.teams */
  team: number | null;
  teamOk: boolean;
  teamAsked: boolean;
  dateAt: number | null;
  dateEnd?: number | null;
  /** Work App form values: ISO date, HH:MM window, access notes */
  f: { date: string; time: string; time2: string; notes: string };
  fsrc: Partial<Record<FieldKey, FieldSource>>;
  checkin: boolean;
  evidence: number;
  paid: boolean;
  paidAt: number | null;
  zd: string;
  wa: string | null;
  po: "ok" | "missing";
  rating: number;
  pdfSent: boolean;
  thread: ThreadMsg[];
  unread?: boolean;
  flag: boolean;
  qp: boolean;
  delayed?: boolean;
  checkinOffset: [number, number] | null;
  req: JobRequest | null;
  contact?: string;
  email?: string;
  actions?: JobAction[];
  addons?: JobAddon[];
  tArrive?: number;
  tEnd?: number;
  cnote?: string;
}

export interface Operator {
  id: string;
  name: string;
  email: string | null;
}

/** What the server hands the client in live mode (lib/adapters/supabase.ts loadBoard). */
export interface LiveBoard {
  world: World;
  jobs: Job[];
  operators: Operator[];
  /** cleaning_teams ids in World.teams order (the board stores team indexes) */
  teamIds: string[];
  me: Operator;
  /** job_events from the last 6 hours, for the Actions feed */
  recentEvents: { job_id: number; at: string; kind: string; actor_type: string }[];
}
