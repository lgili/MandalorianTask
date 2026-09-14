// In-memory mirror of db.ts, to run the UI in the browser without Tauri.
//
// It exists for a practical reason: tuning visuals by recompiling the Rust
// binary on every change is far too slow, and looking at the screen is the only
// honest way to judge design. `pnpm dev:mock` opens the app in the browser with this data.
//
// The API is identical to db.ts — Vite swaps one for the other via alias.

import type {
  NoteIndexEntry, NoteSummary, Outcome, Project, SearchResult, Session, SessionCard, Task, TaskCard,
  TaskKind, TaskStatus, Totals, Transition,
} from './types';
import { dayRangeUtc, type DayKey } from './time';

export interface ProjectTimeRow {
  project_id: number | null; project_name: string | null; project_code: string | null;
  project_color: string | null; minutes: number;
}
export interface DayTimeRow { day: string; kind: TaskKind; minutes: number }
export interface TaskFlow { task_id: number; title: string; lead_h: number; cycle_h: number | null }

const NOW = new Date();
const daysAgo = (days: number, h: number, m = 0) => {
  const d = new Date(NOW); d.setDate(d.getDate() - days); d.setHours(h, m, 0, 0); return d;
};
const iso = (d: Date) => d.toISOString();

const projects: Project[] = [
  { id: 1, name: 'Flyback rev C', code: 'CF03B04', color: 'p1', archived_at: null, created_at: iso(daysAgo(60, 9)) },
  { id: 2, name: 'NACQ 2026', code: 'NACQ', color: 'p2', archived_at: null, created_at: iso(daysAgo(60, 9)) },
  { id: 3, name: 'Lab bench and infra', code: 'INFRA', color: 'p3', archived_at: null, created_at: iso(daysAgo(60, 9)) },
];

let taskSeq = 0;
const T = (o: Partial<Task> & { title: string }): Task => ({
  id: ++taskSeq, project_id: null, kind: 'work', status: 'backlog', pos: taskSeq,
  due_at: null, notes: null, created_at: iso(daysAgo(5, 10)), origin_id: null,
  queued_at: null, started_at: null, done_at: null, archived_at: null,
  outcome: null, outcome_note: null, ...o,
});

const dfmea = T({ title: 'DFMEA review — Flyback rev C', kind: 'meeting', project_id: 1,
  status: 'done', created_at: iso(daysAgo(9, 8, 30)), done_at: iso(daysAgo(9, 15)) });
const purchasing = T({ title: 'Weekly sync with purchasing', kind: 'meeting', project_id: 2,
  status: 'done', created_at: iso(daysAgo(2, 9)), done_at: iso(daysAgo(2, 11, 40)) });

const tasks: Task[] = [
  dfmea, purchasing,
  T({ title: 'measure ripple on the 400 V bus with a differential probe', project_id: 1,
      created_at: iso(daysAgo(9, 14, 22)), origin_id: dfmea.id }),
  T({ title: 'check output capacitor derating at 85 °C', project_id: 1,
      created_at: iso(daysAgo(9, 14, 31)), origin_id: dfmea.id }),
  T({ title: 'add a snubber continuity test to the ATE', project_id: 1,
      created_at: iso(daysAgo(9, 14, 44)), origin_id: dfmea.id }),
  T({ title: 'request a sample of the UCC21540 isolated driver', project_id: 2,
      created_at: iso(daysAgo(2, 11, 18)), origin_id: purchasing.id }),
  T({ title: 'quote an alternative 47 µH inductor', project_id: 2,
      created_at: iso(daysAgo(2, 11, 29)), origin_id: purchasing.id }),
  T({ title: 'study LLC topology for the next generation', created_at: iso(daysAgo(6, 17, 40)) }),
  T({ title: 'migrate the loss spreadsheet to a script', project_id: 3, created_at: iso(daysAgo(4, 18)) }),
  T({ title: 'recalibrate the differential probe (expired in May)', project_id: 3,
      created_at: iso(daysAgo(1, 9, 15)) }),

  T({ title: 'Close eBOM CF03B04 rev C', project_id: 1, status: 'queued',
      created_at: iso(daysAgo(7, 10)), queued_at: iso(daysAgo(1, 9)), due_at: iso(daysAgo(-2, 12)) }),
  T({ title: 'Redo the current-loop DFMEA', project_id: 2, status: 'queued',
      created_at: iso(daysAgo(5, 15)), queued_at: iso(daysAgo(1, 9)), due_at: iso(daysAgo(-9, 12)) }),
  T({ title: 'Replace the electronic load fan', project_id: 3, status: 'queued',
      created_at: iso(daysAgo(3, 16)), queued_at: iso(daysAgo(1, 9)) }),

  T({ title: 'Thermal test — 3 load points', project_id: 1, status: 'doing',
      created_at: iso(daysAgo(8, 16)), queued_at: iso(daysAgo(3, 9)), started_at: iso(daysAgo(3, 10, 30)) }),
  T({ title: 'Review RCD snubber layout', project_id: 1, status: 'doing',
      created_at: iso(daysAgo(10, 11)), queued_at: iso(daysAgo(4, 9)), started_at: iso(daysAgo(4, 13)) }),

  T({ title: 'EMC pre-compliance test', project_id: 1, status: 'done', outcome: 'delivered',
      created_at: iso(daysAgo(12, 9)), started_at: iso(daysAgo(12, 9)), done_at: iso(daysAgo(6, 17)) }),
  T({ title: 'Snubber simulation in LTspice', project_id: 1, status: 'done', outcome: 'delivered',
      created_at: iso(daysAgo(14, 9)), started_at: iso(daysAgo(11, 9)), done_at: iso(daysAgo(10, 17)) }),
  T({ title: 'AC connector quote', project_id: 2, status: 'done', outcome: 'handed_off',
      created_at: iso(daysAgo(8, 9)), started_at: iso(daysAgo(6, 16)), done_at: iso(daysAgo(5, 17)) }),
  T({ title: 'Organize bench 2 datasheets', project_id: 3, kind: 'admin', status: 'done', outcome: 'dropped',
      created_at: iso(daysAgo(7, 9)), started_at: iso(daysAgo(5, 17)), done_at: iso(daysAgo(5, 18)) }),
  T({ title: 'Hardware team daily', kind: 'meeting', status: 'done',
      created_at: iso(daysAgo(1, 8)), started_at: iso(daysAgo(1, 9)), done_at: iso(daysAgo(1, 9, 20)) }),
  T({ title: 'Design review — CF03B04', kind: 'meeting', project_id: 1, status: 'done',
      created_at: iso(daysAgo(1, 8)), started_at: iso(daysAgo(1, 10)), done_at: iso(daysAgo(1, 11, 15)) }),
];

const thermal = tasks.find((t) => t.title.startsWith('Thermal test'))!;
const snubber = tasks.find((t) => t.title.startsWith('Review RCD'))!;

let sessionSeq = 0;
const S = (task_id: number, start: Date, min: number | null): Session => ({
  id: ++sessionSeq, task_id, started_at: iso(start),
  ended_at: min == null ? null : iso(new Date(start.getTime() + min * 60000)),
  tz: 'America/Sao_Paulo', source: 'auto', note: null, created_at: iso(start),
});

const sessions: Session[] = [];
// realistic noise over the last 14 working days
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let d = 14; d >= 0; d--) {   // includes TODAY: without it the Today screen opens empty
  const day = daysAgo(d, 9);
  if (day.getDay() === 0 || day.getDay() === 6) continue;
  const target = rnd() > 0.5 ? thermal : snubber;
  const meeting = tasks.filter((t) => t.kind === 'meeting')[Math.floor(rnd() * 2)];
  if (d > 0) {
    sessions.push(S(target.id, daysAgo(d, 10, Math.floor(rnd() * 40)), 70 + Math.floor(rnd() * 60)));
    sessions.push(S(target.id, daysAgo(d, 14, Math.floor(rnd() * 30)), 80 + Math.floor(rnd() * 60)));
    sessions.push(S(meeting.id, daysAgo(d, 9), 25 + Math.floor(rnd() * 55)));
    if (rnd() > 0.6) sessions.push(S(tasks.find((t) => t.kind === 'admin')!.id, daysAgo(d, 17), 30));
  } else {
    // today: fit everything before NOW, whatever time it is
    const before = (minAgo: number) => new Date(NOW.getTime() - minAgo * 60000);
    sessions.push(S(meeting.id, before(230), 40));
    sessions.push(S(target.id, before(180), 95));
    sessions.push(S(snubber.id, before(75), 25));
  }
}
// Every task that has been worked on needs time: a whole column of "0h00"
// makes the card look broken, and hides exactly the number that is the point.
for (const t of tasks) {
  if (t.status === 'backlog') continue;
  if (sessions.some((s) => s.task_id === t.id)) continue;
  const base = t.status === 'done' ? 3 : 2;
  for (let i = 0; i < base; i++) {
    sessions.push(S(t.id, daysAgo(4 + i * 2, 9 + Math.floor(rnd() * 6)), 45 + Math.floor(rnd() * 150)));
  }
}

// the open session
sessions.push(S(thermal.id, new Date(NOW.getTime() - 47 * 60000), null));

// ── API ────────────────────────────────────────────────────────────────────
const proj = (id: number | null) => projects.find((p) => p.id === id);
const min = (s: Session) => s.ended_at
  ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000) : 0;

export async function db(): Promise<never> { throw new Error('mock'); }
export function dbError(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export const PROJECT_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type ProjectColor = typeof PROJECT_COLORS[number];

export async function pickNextColor(): Promise<ProjectColor> {
  const usage = new Map<string, number>();
  for (const p of projects) if (!p.archived_at && p.color) usage.set(p.color, (usage.get(p.color) ?? 0) + 1);
  return PROJECT_COLORS.reduce((a, b) => ((usage.get(a) ?? 0) <= (usage.get(b) ?? 0) ? a : b));
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  return projects.filter((p) => includeArchived || !p.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

let projectSeq = 100;
export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const trimmed = name.trim();
  if (projects.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('UNIQUE constraint failed: projects.name');
  }
  const p: Project = {
    id: ++projectSeq, name: trimmed, code: code?.trim() || null,
    color: color ?? await pickNextColor(), archived_at: null, created_at: new Date().toISOString(),
  };
  projects.push(p);
  return p.id;
}

export async function updateProject(id: number, patch: Partial<Project>): Promise<void> {
  const p = projects.find((x) => x.id === id); if (p) Object.assign(p, patch);
}

export async function deleteProject(id: number): Promise<void> {
  const i = projects.findIndex((p) => p.id === id);
  if (i < 0) return;
  projects.splice(i, 1);
  for (const t of tasks) if (t.project_id === id) t.project_id = null;
}

export async function backfillProjectColors(): Promise<number> {
  let n = 0;
  for (const p of projects) if (!p.color) { p.color = await pickNextColor(); n++; }
  return n;
}

export interface ProjectSummary extends Project {
  open_count: number; doing_count: number; done_count: number; total_count: number;
  minutes: number; last_activity_at: string | null;
}

export async function listProjectSummaries(includeArchived = false): Promise<ProjectSummary[]> {
  const out = projects.filter((p) => includeArchived || !p.archived_at).map((p) => {
    const own = tasks.filter((t) => t.project_id === p.id);
    const ids = new Set(own.map((t) => t.id));
    const sess = sessions.filter((s) => ids.has(s.task_id));
    const times = [...own.map((t) => t.created_at), ...sess.map((s) => s.started_at)].sort();
    return {
      ...p,
      open_count: own.filter((t) => !t.archived_at && t.status !== 'done').length,
      doing_count: own.filter((t) => !t.archived_at && t.status === 'doing').length,
      done_count: own.filter((t) => t.status === 'done').length,
      total_count: own.length,
      minutes: sess.reduce((a, x) => a + min(x), 0),
      last_activity_at: times.length ? times[times.length - 1] : null,
    };
  });
  return out.sort((a, b) => (a.last_activity_at ? 0 : 1) - (b.last_activity_at ? 0 : 1)
    || (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? '')
    || a.name.localeCompare(b.name));
}

export async function listProjectTasks(
  projectId: number | null, includeArchived = true,
): Promise<TaskCard[]> {
  return tasks
    .filter((t) => t.project_id === projectId && (includeArchived || !t.archived_at))
    .map(card);
}

export async function reassignTasks(ids: number[], projectId: number | null): Promise<void> {
  for (const t of tasks) if (ids.includes(t.id)) t.project_id = projectId;
}

function card(t: Task): TaskCard {
  const p = proj(t.project_id);
  const s = sessions.filter((x) => x.task_id === t.id);
  const o = tasks.find((x) => x.id === t.origin_id);
  return {
    ...t,
    project_name: p?.name ?? null, project_code: p?.code ?? null, project_color: p?.color ?? null,
    minutes: s.reduce((a, x) => a + min(x), 0), session_count: s.length,
    origin_title: o?.title ?? null, origin_kind: o?.kind ?? null,
  };
}

export async function boardTasks(): Promise<TaskCard[]> {
  return tasks.filter((t) => !t.archived_at).map(card);
}
export async function captureTask(title: string, project_id: number | null = null,
  kind: TaskKind = 'work', due_at: string | null = null): Promise<number> {
  const t = T({ title, project_id, kind, due_at, created_at: new Date().toISOString(),
    origin_id: sessions.find((s) => !s.ended_at)?.task_id ?? null });
  tasks.unshift(t);
  return t.id;
}
export async function updateTask(id: number, patch: Partial<Task>): Promise<void> {
  const t = tasks.find((x) => x.id === id); if (t) Object.assign(t, patch);
}
export async function completeTask(id: number, outcome: Outcome, note: string | null = null): Promise<void> {
  await moveTask(id, 'done');
  const t = tasks.find((x) => x.id === id); if (t) { t.outcome = outcome; t.outcome_note = note; }
}
export async function listTransitions(taskId: number): Promise<Transition[]> {
  const t = tasks.find((x) => x.id === taskId); if (!t) return [];
  const out: Transition[] = [{ id: 1, task_id: taskId, from_status: null, to_status: 'backlog', at: t.created_at }];
  if (t.queued_at) out.push({ id: 2, task_id: taskId, from_status: 'backlog', to_status: 'queued', at: t.queued_at });
  if (t.started_at) out.push({ id: 3, task_id: taskId, from_status: 'queued', to_status: 'doing', at: t.started_at });
  if (t.done_at) out.push({ id: 4, task_id: taskId, from_status: 'doing', to_status: 'done', at: t.done_at });
  return out;
}
export async function listTaskSessions(taskId: number): Promise<Session[]> {
  return sessions.filter((s) => s.task_id === taskId).sort((a, b) => b.started_at.localeCompare(a.started_at));
}
export async function countOutcomes(fromUtc: string, toUtc: string): Promise<Array<{ outcome: Outcome | null; n: number }>> {
  const acc = new Map<Outcome | null, number>();
  for (const t of tasks) if (t.done_at && t.done_at >= fromUtc && t.done_at < toUtc)
    acc.set(t.outcome, (acc.get(t.outcome) ?? 0) + 1);
  return [...acc].map(([outcome, n]) => ({ outcome, n })).sort((a, b) => b.n - a.n);
}
export async function countCompletedByDay(days: number): Promise<Array<{ day: string; n: number }>> {
  const acc = new Map<string, number>();
  const since = new Date(NOW.getTime() - days * 86400000).toISOString();
  for (const t of tasks) if (t.done_at && t.done_at >= since) {
    const d = new Date(t.done_at);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return [...acc].map(([day, n]) => ({ day, n })).sort((a, b) => a.day.localeCompare(b.day));
}
export async function deleteTask(id: number): Promise<void> {
  const i = tasks.findIndex((t) => t.id === id);
  if (i >= 0) tasks.splice(i, 1);
}
export async function moveTask(id: number, to: TaskStatus): Promise<void> {
  const t = tasks.find((x) => x.id === id);
  if (!t || t.status === to) return;
  const now = new Date();
  for (const s of sessions) if (!s.ended_at) s.ended_at = iso(now);
  if (to === 'doing') sessions.push(S(id, now, null));
  t.status = to;
  if (to === 'done') t.done_at = iso(now); else t.done_at = null;
  if (to === 'doing' && !t.started_at) t.started_at = iso(now);
  // Same as db.sql.ts: first entry into the queue is stamped, and leaving
  // Done forgets how the task ended.
  if (to === 'queued' && !t.queued_at) t.queued_at = iso(now);
  if (to !== 'done') { t.outcome = null; t.outcome_note = null; }
}
export async function reorderTask(): Promise<void> {}
export async function archiveDoneTasks(): Promise<number> { return 0; }

function sessionCard(s: Session): SessionCard {
  const t = tasks.find((x) => x.id === s.task_id)!;
  const p = proj(t.project_id);
  return { ...s, title: t.title, kind: t.kind, project_name: p?.name ?? null,
    project_code: p?.code ?? null, project_color: p?.color ?? null };
}

export async function getOpenSession(): Promise<SessionCard | null> {
  const s = sessions.find((x) => !x.ended_at);
  return s ? sessionCard(s) : null;
}
export async function pauseSession(): Promise<void> {
  for (const s of sessions) if (!s.ended_at) s.ended_at = new Date().toISOString();
}
export async function listDaySessions(key: DayKey): Promise<SessionCard[]> {
  const { from, to } = dayRangeUtc(key);
  return sessions.filter((s) => s.started_at >= from && s.started_at < to)
    .sort((a, b) => a.started_at.localeCompare(b.started_at)).map(sessionCard);
}
export async function getDayTotals(key: DayKey): Promise<Totals> {
  const t: Totals = { total: 0, work: 0, meeting: 0, admin: 0 };
  for (const s of await listDaySessions(key)) {
    if (!s.ended_at) continue;
    const m = min(s); t.total += m; t[s.kind] += m;
  }
  return t;
}
export async function createSession(): Promise<number> { return 0; }
export async function updateSession(id: number, patch: Partial<Session>): Promise<void> {
  const s = sessions.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
}
export async function deleteSession(id: number): Promise<void> {
  const i = sessions.findIndex((s) => s.id === id);
  if (i >= 0) sessions.splice(i, 1);
}

export async function sumTimeByProject(fromUtc: string, toUtc: string): Promise<ProjectTimeRow[]> {
  const acc = new Map<number | null, ProjectTimeRow>();
  for (const s of sessions) {
    if (!s.ended_at || s.started_at < fromUtc || s.started_at >= toUtc) continue;
    const t = tasks.find((x) => x.id === s.task_id)!;
    const p = proj(t.project_id);
    const k = p?.id ?? null;
    if (!acc.has(k)) acc.set(k, { project_id: k, project_name: p?.name ?? null,
      project_code: p?.code ?? null, project_color: p?.color ?? null, minutes: 0 });
    acc.get(k)!.minutes += min(s);
  }
  return [...acc.values()].sort((a, b) => b.minutes - a.minutes);
}
export async function sumTimeByDay(fromUtc: string, toUtc: string): Promise<DayTimeRow[]> {
  const acc = new Map<string, DayTimeRow>();
  for (const s of sessions) {
    if (!s.ended_at || s.started_at < fromUtc || s.started_at >= toUtc) continue;
    const t = tasks.find((x) => x.id === s.task_id)!;
    const d = new Date(s.started_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const k = `${day}|${t.kind}`;
    if (!acc.has(k)) acc.set(k, { day, kind: t.kind, minutes: 0 });
    acc.get(k)!.minutes += min(s);
  }
  return [...acc.values()];
}
export async function listCompletedFlows(fromUtc: string, toUtc: string): Promise<TaskFlow[]> {
  return tasks.filter((t) => t.done_at && t.done_at >= fromUtc && t.done_at < toUtc).map((t) => ({
    task_id: t.id, title: t.title,
    lead_h: Math.round((new Date(t.done_at!).getTime() - new Date(t.created_at).getTime()) / 360000) / 10,
    cycle_h: t.started_at
      ? Math.round((new Date(t.done_at!).getTime() - new Date(t.started_at).getTime()) / 360000) / 10 : null,
  }));
}
export async function getMeta(): Promise<string | null> { return null; }
export async function setMeta(): Promise<void> {}

// ── notes (index) ──────────────────────────────────────────────────────────
const index = new Map<string, NoteIndexEntry>();
const stripAccents = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// Snippet markers, same as the char(2)/char(3) that db.sql.ts asks FTS5 for.
const MARK_START = String.fromCharCode(2);
const MARK_END = String.fromCharCode(3);

function toSummary(n: NoteIndexEntry): NoteSummary {
  const ref = n.project_ref?.toLowerCase();
  const p = ref ? (projects.find((x) => x.code?.toLowerCase() === ref)
    ?? projects.find((x) => x.name.toLowerCase() === ref)) : undefined;
  return {
    path: n.path, title: n.title, mtime: n.mtime, project_ref: n.project_ref, tags: n.tags,
    project_id: p?.id ?? null, project_name: p?.name ?? null, project_color: p?.color ?? null,
  };
}

export async function listIndexedNotes(): Promise<Array<{ path: string; mtime: number }>> {
  return [...index.values()].map((n) => ({ path: n.path, mtime: n.mtime }));
}
export async function indexNote(n: NoteIndexEntry): Promise<void> { index.set(n.path, n); }
export async function unindexNote(path: string): Promise<void> { index.delete(path); }
export async function renameInIndex(from: string, to: string): Promise<void> {
  const n = index.get(from); if (!n) return;
  index.delete(from); index.set(to, { ...n, path: to });
}
export async function clearIndex(): Promise<void> { index.clear(); }
export async function listNotes(): Promise<NoteSummary[]> {
  return [...index.values()].sort((a, b) => b.mtime - a.mtime).map(toSummary);
}
export async function listProjectNotes(projectId: number): Promise<NoteSummary[]> {
  return (await listNotes()).filter((n) => n.project_id === projectId);
}
export async function backlinks(path: string, nameNorm: string, pathNorm: string): Promise<NoteSummary[]> {
  return [...index.values()]
    .filter((n) => n.path !== path && (n.links.includes(nameNorm) || n.links.includes(pathNorm)))
    .sort((a, b) => b.mtime - a.mtime).map(toSummary);
}
export async function listAllLinks(): Promise<Array<{ src: string; target: string }>> {
  return [...index.values()].flatMap((n) => n.links.map((target) => ({ src: n.path, target })));
}
export async function searchNotes(q: string, limit = 30): Promise<SearchResult[]> {
  const terms = q.trim().split(/\s+/).filter(Boolean).map(stripAccents);
  if (!terms.length) return [];
  const out: Array<SearchResult & { s: number }> = [];
  for (const n of index.values()) {
    const t = stripAccents(n.title); const b = stripAccents(n.body);
    // each term is a prefix of some word, like FTS5's `"x"*`
    const matches = (text: string, term: string) => text.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(term));
    if (!terms.every((x) => matches(t, x) || matches(b, x))) continue;
    const s = terms.reduce((acc, x) => acc + (matches(t, x) ? 5 : 0) + (matches(b, x) ? 1 : 0), 0);
    const i = b.indexOf(terms[0]);
    const start = Math.max(0, i - 60);
    const snippet = i < 0 ? n.body.slice(0, 120)
      : `${start ? '…' : ''}${n.body.slice(start, i)}${MARK_START}${n.body.slice(i, i + terms[0].length)}${MARK_END}${n.body.slice(i + terms[0].length, i + 90)}…`;
    out.push({ path: n.path, title: n.title, snippet, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limit).map(({ s: _s, ...r }) => r);
}
