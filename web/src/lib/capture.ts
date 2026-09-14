// Grammar of the capture line.
//
// Three tokens, and none of them has to be memorized: `#` opens a list, and the
// other two show up in the hint below the field. What must never happen is
// forcing someone to take their hands off the keyboard in the middle of a meeting.
//
//   #cf03     project — opens the list; if nothing is picked, the best match wins
//   !thu      due: today | tomorrow | mon..sun | 12/09 | +3d
//   @meeting  type: work (default) | meeting | admin
//
// Non-negotiable rule: there is NEVER a validation error here. A token that
// doesn't match becomes plain text and the task is created anyway. Interrupting
// someone with an error message during a meeting is worse than losing the metadata.

import type { Project, TaskKind } from './types';
import { rankProjects } from './projects';
import { dayKey, parseDayKey } from './time';

export interface ParsedCapture {
  title: string;
  project: Project | null;
  /** UTC ISO at local noon — a due date is a day, not an instant. */
  due: string | null;
  /** 'work' unless someone said otherwise. */
  kind: TaskKind;
  /** Written tokens that matched nothing. Only for subtle feedback. */
  ignored: string[];
}

/** `@meeting`, `@admin`, `@work` — and their initials. */
const KIND_TOKENS: Record<string, TaskKind> = {
  m: 'meeting', meeting: 'meeting',
  a: 'admin', admin: 'admin',
  w: 'work', work: 'work',
};

const WEEKDAYS: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** A due date is a DAY. We store local noon so it doesn't slip across time zones. */
function localNoon(d: Date): string {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString();
}

export function parseDue(token: string, today = new Date()): string | null {
  const t = token.toLowerCase();

  if (t === 'today') return localNoon(today);
  if (t === 'tomorrow') {
    const d = new Date(today); d.setDate(d.getDate() + 1); return localNoon(d);
  }

  // +3d — N days from now
  const rel = t.match(/^\+(\d+)d?$/);
  if (rel) {
    const d = new Date(today); d.setDate(d.getDate() + Number(rel[1])); return localNoon(d);
  }

  // mon..sun — the NEXT occurrence of that weekday (today doesn't count: "fri"
  // on a Friday means next Friday, not now)
  if (t in WEEKDAYS) {
    const target = WEEKDAYS[t];
    const d = new Date(today);
    const delta = ((target - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + delta);
    return localNoon(d);
  }

  // 12/09 or 12/09/2026
  const dayMonth = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (dayMonth) {
    const day = Number(dayMonth[1]), month = Number(dayMonth[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let year = dayMonth[3] ? Number(dayMonth[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const d = parseDayKey(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    // an invalid day like 31/02 rolls over into March — reject it instead of accepting it wrong
    if (d.getMonth() + 1 !== month || d.getDate() !== day) return null;
    // no explicit year and the date has already passed: it means next year
    if (!dayMonth[3] && dayKey(d) < dayKey(today)) d.setFullYear(d.getFullYear() + 1);
    return localNoon(d);
  }

  return null;
}

/**
 * The best match for the token, or null if nothing matches.
 *
 * An ambiguous prefix used to return `null` — the task was born without a
 * project and the only warning was a strikethrough on a 10px chip. Now whoever
 * types `#` sees the list and picks; this function is only the fallback for
 * someone who submitted without looking, and then the best guess is worth more
 * than a silent omission.
 */
export function findProject(token: string, projects: Project[]): Project | null {
  if (!token) return null;
  return rankProjects(token, projects)[0] ?? null;
}

export function parseCapture(line: string, projects: Project[], today = new Date()): ParsedCapture {
  const ignored: string[] = [];
  let project: Project | null = null;
  let due: string | null = null;
  let kind: TaskKind = 'work';

  const words = line.trim().split(/\s+/);
  const remaining: string[] = [];

  for (const w of words) {
    if (w.startsWith('#') && w.length > 1 && !project) {
      const p = findProject(w.slice(1), projects);
      if (p) { project = p; continue; }
      ignored.push(w);
      remaining.push(w);            // no match: it becomes text, it doesn't vanish
      continue;
    }
    if (w.startsWith('@') && w.length > 1) {
      const k = KIND_TOKENS[w.slice(1).toLowerCase()];
      if (k) { kind = k; continue; }
      ignored.push(w);
      remaining.push(w);
      continue;
    }
    if (w.startsWith('!') && w.length > 1 && !due) {
      const d = parseDue(w.slice(1), today);
      if (d) { due = d; continue; }
      ignored.push(w);
      remaining.push(w);
      continue;
    }
    remaining.push(w);
  }

  return { title: remaining.join(' ').trim(), project, due, kind, ignored };
}
