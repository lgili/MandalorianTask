// All of the app's time arithmetic lives here, and only here.
//
// Rules:
//  - We ALWAYS persist UTC ISO-8601 ("2026-09-08T12:00:00.000Z").
//  - The day boundary is LOCAL. The app runs on the user's machine, so the
//    system time zone is the right answer — including during daylight saving time, which
//    the native Date already handles.
//  - Granularity is 15 min. Rounding is a product decision, not a detail.

export const GRAIN_MIN = 15;
/** Window drawn on the timeline (local hour). */
export const DAY_START_H = 7;
export const DAY_END_H = 20;

export type DayKey = string; // 'YYYY-MM-DD' in the local time zone

const p2 = (n: number) => String(n).padStart(2, '0');

export function currentTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Local date -> 'YYYY-MM-DD'. Never use toISOString here: it converts to UTC. */
export function dayKey(d: Date = new Date()): DayKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/**
 * UTC range matching the local day. Local midnight -> local midnight
 * of the next day. On a daylight saving changeover day that gives 23h or 25h, which
 * is exactly right.
 */
export function dayRangeUtc(key: DayKey): { from: string; to: string } {
  const start = parseDayKey(key);
  const end = parseDayKey(key);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Minutes since LOCAL midnight of the instant's own day. */
export function minutesOfDay(utcIso: string): number {
  const d = new Date(utcIso);
  return d.getHours() * 60 + d.getMinutes();
}

/** Local 'HH:MM'. */
export function hhmm(utcIso: string): string {
  const d = new Date(utcIso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Local day + minutes since midnight -> UTC ISO. */
export function toUtc(key: DayKey, minutes: number): string {
  const d = parseDayKey(key);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function durationMin(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

/** Rounds minutes to the grain. Halfway rounds up. */
export function roundToGrain(minutes: number, grain = GRAIN_MIN): number {
  return Math.round(minutes / grain) * grain;
}

/** '6h15' — for totals. Always with the hour, even below 1h ('0h45'). */
export function fmtHM(minutes: number): string {
  const neg = minutes < 0;
  const m = Math.abs(Math.round(minutes));
  return `${neg ? '-' : ''}${Math.floor(m / 60)}h${p2(m % 60)}`;
}

/** '45 min' below one hour, '1h30' above — for the duration of a block. */
export function fmtDur(minutes: number): string {
  const m = Math.round(minutes);
  return m < 60 ? `${m} min` : fmtHM(m);
}

/** Real overlap of two intervals. Touching is not overlapping. */
export function overlaps(
  a: { started_at: string; ended_at: string },
  b: { started_at: string; ended_at: string },
): boolean {
  return a.started_at < b.ended_at && b.started_at < a.ended_at;
}

/** Minutes in common between two intervals (0 if they don't touch). */
export function overlapMinutes(
  a: { started_at: string; ended_at: string },
  b: { started_at: string; ended_at: string },
): number {
  const start = a.started_at > b.started_at ? a.started_at : b.started_at;
  const end = a.ended_at < b.ended_at ? a.ended_at : b.ended_at;
  const d = durationMin(start, end);
  return d > 0 ? d : 0;
}

/**
 * Gaps between consecutive blocks, in local minutes-of-day.
 * Only between the first and the last block: before starting and after finishing
 * is not a gap, it is the day not having started yet.
 */
export function findGaps(
  blocks: Array<{ started_at: string; ended_at: string }>,
  minGapMin = GRAIN_MIN,
): Array<{ from: number; to: number }> {
  const sorted = [...blocks].sort((x, y) => x.started_at.localeCompare(y.started_at));
  const out: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = minutesOfDay(sorted[i].ended_at);
    const start = minutesOfDay(sorted[i + 1].started_at);
    if (start - end >= minGapMin) out.push({ from: end, to: start });
  }
  return out;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'Tue, 08 Sep' */
export function fmtDay(key: DayKey): string {
  const d = parseDayKey(key);
  return `${DAYS[d.getDay()]}, ${p2(d.getDate())} ${MONTHS[d.getMonth()]}`;
}

/** Monday of that day's week. */
export function startOfWeek(key: DayKey): DayKey {
  const d = parseDayKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

export function nowIso(): string {
  return new Date().toISOString();
}

const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** 'Thursday, 10 September' */
export function fmtDayLong(d: Date = new Date()): string {
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** Whole days between two instants (positive = b after a). */
export function daysBetween(aIso: string, b: Date = new Date()): number {
  return Math.floor((b.getTime() - new Date(aIso).getTime()) / 86400000);
}

/** '2h ago', 'yesterday', '6d ago' */
export function fmtRelative(iso: string, now: Date = new Date()): string {
  const min = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
