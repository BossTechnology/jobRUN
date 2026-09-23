/* Date helpers from the prototype. The business runs on Eastern time (BUSINESS_TZ). */
import { locale, type Lang } from "@/lib/i18n";
import type { Job } from "./types";

const TZ = "America/New_York";

export function fmtTime(d: number, lang: Lang) {
  return new Date(d).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
}
export function fmtDay(d: number, lang: Lang) {
  return new Date(d).toLocaleDateString(locale(lang), { month: "short", day: "numeric", timeZone: TZ });
}
export const fmtDate = (d: number, lang: Lang) => fmtDay(d, lang) + " · " + fmtTime(d, lang);

export function dur(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 48) return h + "h " + (m % 60) + "m";
  return Math.floor(h / 24) + "d " + (h % 24) + "h";
}

/** Clock split used on cards: ["3h", "12m"]. */
export function clockParts(ms: number): [string, string] {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 60) return [m + "m", ""];
  const h = Math.floor(m / 60);
  if (h < 48) return [h + "h", (m % 60) + "m"];
  return [Math.floor(h / 24) + "d", (h % 24) + "h"];
}

function etParts(d = new Date()) {
  const o: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hour12: false })
    .formatToParts(d)
    .forEach((p) => (o[p.type] = p.value));
  return o;
}

/** Today (ET) plus offsetDays, as YYYY-MM-DD. */
export function etISO(offsetDays = 0) {
  const p = etParts();
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offsetDays)).toISOString().slice(0, 10);
}

/** Next given weekday (0 = Sunday) in ET, never today. */
export function nextDow(dow: number) {
  const p = etParts();
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  let add = (dow - wd + 7) % 7;
  if (add === 0) add = 7;
  return etISO(add);
}

/** "09:30" + 2h → "11:30" (capped at 23h). */
export function plus2(t: string, h = 2) {
  if (!t) return "";
  const [a, b] = t.split(":").map(Number);
  return String(Math.min(23, a + h)).padStart(2, "0") + ":" + String(b).padStart(2, "0");
}

/** Offset of America/New_York from UTC, in minutes, at a given instant (−240 in summer, −300 in winter). */
function etOffsetMin(at: number) {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(at))
    .forEach((x) => (p[x.type] = x.value));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - at) / 60000;
}

/** ET wall-clock date + time → epoch ms (DST-aware; the prototype assumed UTC−4 all year). */
export function etToEpoch(date: string, time?: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = (time || "09:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const first = guess - etOffsetMin(guess) * 60000;
  return guess - etOffsetMin(first) * 60000;
}

/** Epoch ms → ET wall-clock ["YYYY-MM-DD", "HH:MM"] for the DB's zone-less window columns. */
export function epochToET(at: number): [string, string] {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(at))
    .forEach((x) => (p[x.type] = x.value));
  return [`${p.year}-${p.month}-${p.day}`, `${p.hour}:${p.minute}`];
}

export function sameETDay(a: number, b: number) {
  const f = (d: number) => new Date(d).toLocaleDateString("en-US", { timeZone: TZ });
  return f(a) === f(b);
}

/** Time window text for a scheduled job: "9–11 AM" or "11 AM–1 PM". */
export function winTxt(j: Pick<Job, "dateAt" | "dateEnd">, lang: Lang) {
  if (!j.dateAt) return "";
  const a = fmtTime(j.dateAt, lang), b = j.dateEnd ? fmtTime(j.dateEnd, lang) : "";
  if (!b) return a;
  const strip = (x: string) => x.replace(/\s?(AM|PM|a\.?\s?m\.?|p\.?\s?m\.?)$/i, "");
  const sameH = a.slice(-2) === b.slice(-2);
  return (sameH ? strip(a) : a) + "–" + b;
}

export const jobNo = (j: Pick<Job, "id">) => "#" + j.id.slice(1);
export const money = (n: number) => "$" + n.toFixed(2);
