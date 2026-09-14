// Shared state. Module refs + exported functions, no Pinia.
// The real data lives in SQLite; this is only what the UI needs to remember between screens.

import { computed, ref } from 'vue';
import type { Outcome, Project, SessionCard, TaskCard, TaskStatus, Totals } from './types';
import * as api from './db';
import { deriveProjectCode } from './projects';
import { dayKey, type DayKey } from './time';
import { toast } from './toast';
import { emitEvent } from './events';

/**
 * Live projects, already with counts and hours. It is `ProjectSummary`, which extends
 * `Project` — code that only needs id/name/color keeps working.
 */
export const projects = ref<api.ProjectSummary[]>([]);
/** Includes archived ones. Only Settings and resolving an old name need it. */
export const archivedProjects = ref<Project[]>([]);
export const tasks = ref<TaskCard[]>([]);
export const running = ref<SessionCard | null>(null);
export const currentDay = ref<DayKey>(dayKey());
export const daySessions = ref<SessionCard[]>([]);
export const dayTotals = ref<Totals>({ total: 0, work: 0, meeting: 0, admin: 0 });
export const loading = ref(false);
/** Task open in the detail panel (null = closed). */
export const detailTaskId = ref<number | null>(null);
export const openTaskDetail = (id: number | null) => { detailTaskId.value = id; };

export const tasksByStatus = (s: TaskStatus) => computed(() =>
  tasks.value.filter((t) => t.status === s));

export const backlog = computed(() => tasks.value.filter((t) => t.status === 'backlog'));

export async function loadProjects(): Promise<void> {
  const [live, all] = await Promise.all([api.listProjectSummaries(), api.listProjects(true)]);
  projects.value = live;
  archivedProjects.value = all.filter((p) => p.archived_at);
}

/**
 * Creates the project and returns it ready for immediate use.
 *
 * Returns the object, not the id: whoever creates a project in the middle of a capture
 * needs the name and the color on the same keystroke, to paint the pill without waiting
 * for another round-trip.
 */
export async function createProject(name: string, code: string | null = null): Promise<Project | null> {
  const n = name.trim();
  if (!n) return null;
  try {
    // Without a code the project chip falls back to the whole name and the
    // picker's column is left empty. Deriving one beats asking for another field.
    const id = await api.createProject(n, code ?? deriveProjectCode(n, projects.value));
    await loadProjects();
    return projects.value.find((p) => p.id === id) ?? null;
  } catch (e) {
    toast.error(api.dbError(e));
    return null;
  }
}

/**
 * Reloads the board + the active session together.
 * They are always read as a pair because moving a card changes both — splitting them leaves
 * the screen showing a card in "Doing" and no timer, or the other way around.
 */
export async function loadBoard(): Promise<void> {
  loading.value = true;
  try {
    const [t, s] = await Promise.all([api.boardTasks(), api.getOpenSession()]);
    tasks.value = t;
    running.value = s;
  } catch (e) {
    toast.error(api.dbError(e));
  } finally {
    loading.value = false;
  }
}

/** Sequence of the last requested load: a late response for an old day is discarded. */
let daySeq = 0;

export async function loadDay(key: DayKey = currentDay.value): Promise<void> {
  const mine = ++daySeq;
  currentDay.value = key;
  try {
    const [s, t] = await Promise.all([api.listDaySessions(key), api.getDayTotals(key)]);
    if (mine !== daySeq) return;
    daySessions.value = s;
    dayTotals.value = t;
  } catch (e) {
    if (mine === daySeq) toast.error(api.dbError(e));
  }
}

/** Moves the card and reloads. It is the operation that produces time. */
/**
 * Announces what a column move meant for TIME. A task entering
 * 'doing' opens a session (and closes the one that was open); a task leaving it closes it.
 * It is the same rule as moveTask — here it just becomes an event for plugins.
 */
function announceMove(id: number, from: TaskStatus | null, to: TaskStatus, runningBefore: number | null): void {
  emitEvent('task:moved', { id, from, to });
  if (to === 'doing') {
    if (runningBefore != null && runningBefore !== id) emitEvent('session:stopped', { task: runningBefore });
    emitEvent('session:started', { task: id, title: tasks.value.find((t) => t.id === id)?.title ?? '' });
  } else if (runningBefore === id) {
    emitEvent('session:stopped', { task: id });
  }
}

export async function move(id: number, to: TaskStatus): Promise<void> {
  const from = tasks.value.find((t) => t.id === id)?.status ?? null;
  const runningBefore = running.value?.task_id ?? null;
  try {
    await api.moveTask(id, to);
    await Promise.all([loadBoard(), loadDay()]);
    if (from !== to) announceMove(id, from, to, runningBefore);
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

export async function capture(
  title: string, projectId: number | null, kind: TaskCard['kind'] = 'work',
): Promise<void> {
  try {
    await api.captureTask(title, projectId, kind);
    await loadBoard();
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

export async function complete(id: number, outcome: Outcome, note: string | null): Promise<void> {
  const from = tasks.value.find((t) => t.id === id)?.status ?? null;
  const runningBefore = running.value?.task_id ?? null;
  try {
    await api.completeTask(id, outcome, note);
    if (from !== 'done') announceMove(id, from, 'done', runningBefore);
    await Promise.all([loadBoard(), loadDay()]);
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

export async function pause(): Promise<void> {
  const runningBefore = running.value?.task_id ?? null;
  try {
    await api.pauseSession();
    if (runningBefore != null) emitEvent('session:stopped', { task: runningBefore });
    await Promise.all([loadBoard(), loadDay()]);
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

export function getProject(id: number | null): Project | undefined {
  if (id == null) return undefined;
  return projects.value.find((p) => p.id === id)
    ?? archivedProjects.value.find((p) => p.id === id);
}

/**
 * Card being dragged right now. It lives in the store because the target (the project list
 * in the sidebar) lives in App.vue and the source (the card) lives on the Board — dropping a card
 * on a project is the most direct way to reassign it, and that was impossible with
 * `draggingTaskId` as a local ref of Board.vue.
 */
export const draggingTaskId = ref<number | null>(null);

export async function dropOnProject(projectId: number | null): Promise<void> {
  const id = draggingTaskId.value;
  draggingTaskId.value = null;
  if (id == null) return;
  try {
    await api.reassignTasks([id], projectId);
    await Promise.all([loadBoard(), loadProjects()]);
    const p = projects.value.find((x) => x.id === projectId);
    toast.ok(p ? `Moved to ${p.name}` : 'Moved to the Inbox');
  } catch (e) {
    toast.error(api.dbError(e));
  }
}

// ── global capture ────────────────────────────────────────────────────────
// A single creation surface, callable from any screen. It used to be four
// buttons that disagreed with each other — and the most prominent of them created nothing.

/** Open = object with the context; null = closed. */
export const quickAdd = ref<{ projectId: number | null; status: TaskStatus } | null>(null);

export function openQuickAdd(projectId: number | null = null, status: TaskStatus = 'backlog'): void {
  quickAdd.value = { projectId, status };
}
export function closeQuickAdd(): void { quickAdd.value = null; }

/**
 * Open palette: 'search' looks through notes, tasks and projects (Ctrl+K);
 * 'commands' lists what the app and the plugins know how to do (Ctrl+P).
 */
export const palette = ref<null | 'search' | 'commands'>(null);

/**
 * Reloads everything a new task may have touched.
 * Projects come along because the sidebar count changes with the capture.
 */
export async function reloadAll(): Promise<void> {
  await Promise.all([loadBoard(), loadDay(), loadProjects()]);
}
