// Project search for the picker.
//
// Replaces the blind prefix matching in capture.ts, which returned `null`
// when the text was ambiguous — and silent ambiguity is the worst possible
// outcome: the task was born without a project and nobody was told.
//
// Here ambiguity becomes two rows in the list. The eye decides, not the
// heuristic.

import type { Project } from './types';

/** Order matters: it is the match priority, from strongest to weakest. */
const WEIGHT = {
  exactCode: 100,
  codePrefix: 80,
  namePrefix: 60,
  initials: 50,
  subsequence: 30,
} as const;

const norm = (s: string): string => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // "Résumé" matches "resume"

/** Word initials: "cf" matches "Cooling Fan". */
function initials(name: string): string {
  return name.split(/[\s\-_/]+/).filter(Boolean).map((w) => w[0]).join('');
}

/** `target` contains the letters of `q` in order, not necessarily adjacent. */
function isSubsequence(q: string, target: string): boolean {
  let i = 0;
  for (const c of target) if (c === q[i] && ++i === q.length) return true;
  return false;
}

export function scoreProject(query: string, p: Project): number {
  const q = norm(query);
  if (!q) return 1;                       // no query, everyone passes
  const code = norm(p.code ?? '');
  const name = norm(p.name);

  if (code && code === q) return WEIGHT.exactCode;
  if (code && code.startsWith(q)) return WEIGHT.codePrefix;
  if (name.startsWith(q)) return WEIGHT.namePrefix;
  if (initials(name).startsWith(q)) return WEIGHT.initials;
  if (isSubsequence(q, name)) return WEIGHT.subsequence;
  return 0;
}

/**
 * Filters and sorts. The input list ALREADY comes ordered by recent activity
 * (listProjectSummaries sorts it that way), and a tie keeps that order —
 * frequency beats alphabetical in a picker.
 */
export function rankProjects<T extends Project>(query: string, projects: T[]): T[] {
  return projects
    .map((p, i) => ({ p, s: scoreProject(query, p), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/**
 * The "create" row only shows up when it makes sense: there is text, and no
 * project is already called exactly that. Without this guard, you can create
 * a duplicate just by typing too fast.
 */
export function canCreateProject<T extends Project>(query: string, projects: T[]): boolean {
  const q = norm(query.trim());
  if (!q) return false;
  return !projects.some((p) => norm(p.name) === q || norm(p.code ?? '') === q);
}

/** Same palette as db.ts, repeated here so the module stays pure. */
const COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

/**
 * The color the next project will get — the least used among active ones.
 * It lights up the dot BEFORE the creation is confirmed; what actually writes
 * it is `pickNextColor()` in db, which counts in the database.
 */
export function predictNextColor<T extends Project>(projects: T[]): string {
  const usage = new Map<string, number>();
  for (const p of projects) if (!p.archived_at && p.color) usage.set(p.color, (usage.get(p.color) ?? 0) + 1);
  return COLORS.reduce((a, b) => ((usage.get(a) ?? 0) <= (usage.get(b) ?? 0) ? a : b));
}

/**
 * Short code derived from the name.
 *
 * It exists because EVERY project chip in the UI shows the code, and a project
 * created through the quick flow doesn't have one — the chip fell back to the
 * full name and the picker's code column stayed empty. Asking for the code at
 * creation was the opposite path: one more field between the idea and the record.
 *
 * Rule: the first four alphanumerics of the first word, uppercased.
 * Predictable, short, and editable later on the project screen.
 */
export function deriveProjectCode<T extends Project>(name: string, projects: T[]): string | null {
  // `norm` already strips accents and case — don't duplicate the diacritic regex here.
  const base = norm(name.trim().split(/\s+/)[0] ?? '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  if (!base) return null;
  const taken = new Set(projects.map((p) => (p.code ?? '').toUpperCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base}${i}`;
    if (!taken.has(c)) return c;
  }
  return null;
}
