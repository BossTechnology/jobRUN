/* Board-side shapes. Field names follow the prototype's job object so ported logic stays readable;
   the Supabase adapter maps DB columns (supabase/migrations) onto these. */

export const STAGES = ["pending", "scheduled", "in_progress", "complete", "validation"] as const;
export type Stage = (typeof STAGES)[number];
/** Prototype uses the lane index (0–4) as `stage`. */
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
export type PropertyType = (typeof PROPERTY_TYPES)[PropertyTypeCode];

/** Service index matches SERVICES / PRICE / EXPECT in the prototype. */
export const SERVICES = ["turnover", "deep_clean", "post_construction", "common_areas", "guest_suite", "porter"] as const;
export type Service = (typeof SERVICES)[number];

export type Health = "on" | "risk" | "bad" | "crit";
export type IncidentKind = "crit" | "late" | "msg" | "risk";

export interface Property {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  type: PropertyTypeCode;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  units: number;
  cleaners: number;
  manager: string | null;
  phone: string | null;
  email: string | null;
}

export interface Job {
  id: string;
  stage: StageIndex;
  /** epoch ms */
  stageAt: number;
  createdAt: number;
  prop: string | null;
  cust: string | null;
  unit: string;
  svc: number | null;
  owner: string | null;
  assignedAt: number | null;
  senderOk: boolean;
  teamOk: boolean;
  /** scheduled window start, epoch ms */
  dateAt: number | null;
  dateEnd: number | null;
  evidence: number;
  flag: boolean;
  delayed: boolean;
  paid: boolean;
  qp: boolean;
  unread: boolean;
  subject: string;
}
