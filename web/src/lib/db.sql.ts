// The ONLY layer that speaks SQL. No component writes a query; they call the
// functions in here. Same role lib/api.ts plays in the eBOM generator.
//
// The schema is created by the migrations in src-tauri/src/migrations.rs.

import Database from '@tauri-apps/plugin-sql';
import type {
  NoteIndexEntry, NoteSummary, Outcome, Project, SearchResult, Session, SessionCard, Task, TaskCard,
  TaskKind, TaskStatus, Totals, Transition,
} from './types';
import { nowIso, dayRangeUtc, currentTz, type DayKey } from './time';

let _db: Database | null = null;

export async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:bancada.db');
  return _db;
}

/** A database error turned into a message fit to show. */
export function dbError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // SQLite names the COLUMN in this message, not the unique index
  // (`UNIQUE constraint failed: sessions.is_open`). The index name is checked
  // too, in case a driver ever reports it instead.
  if (m.includes('sessions.is_open') || m.includes('idx_one_open_session')) {
    return 'A task is already running. Stop it before starting another.';
  }
  if (m.includes('UNIQUE constraint failed: projects.name')) {
    return 'A project with that name already exists.';
  }
  if (m.includes('FOREIGN KEY constraint failed')) {
    return 'Invalid reference — the project or task no longer exists.';
  }
  // SQLite quotes the failing expression, so the session-time CHECK can be
  // told apart from the value CHECKs (status, kind, outcome, source) — which a
  // community plugin can hit by passing a status the app doesn't know.
  if (m.includes('CHECK constraint failed') && m.includes('ended_at')) {
    return 'Invalid time: the end must be after the start.';
  }
  if (m.includes('CHECK constraint failed')) {
    return 'Invalid value — the status, kind or outcome is not one the app knows.';
  }
  return m;
}

// ──────────────────────────────── projects ────────────────────────────────

export async function listProjects(includeArchived = false): Promise<Project[]> {
  const d = await db();
  return d.select<Project[]>(
    `SELECT * FROM projects ${includeArchived ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY name COLLATE NOCASE`,
  );
}

/**
 * Closed palette of project colors.
 *
 * The column stores the token NAME ('p1'..'p6'), not a hex: the color has to
 * change along with the theme, and only CSS knows how to do that. (Migration v1
 * calls the column "hex without '#'" — that comment has been wrong since day
 * one; the front end always read var(--pN). The migration can't be edited, so
 * the truth lives here.)
 */
export const PROJECT_COLORS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type ProjectColor = typeof PROJECT_COLORS[number];

/**
 * The least-used color among live projects.
 *
 * Nobody picks a color when creating a project. Asking that in the middle of a
 * meeting is the friction that leaves the field empty forever — and an empty
 * color was the reason EVERY real project was born grey while the mock was
 * colorful.
 */
export async function pickNextColor(): Promise<ProjectColor> {
  const d = await db();
  const rows = await d.select<Array<{ color: string; n: number }>>(
    `SELECT color, COUNT(*) AS n FROM projects
      WHERE archived_at IS NULL AND color IS NOT NULL GROUP BY color`,
  );
  const usage = new Map(rows.map((r) => [r.color, r.n]));
  return PROJECT_COLORS.reduce((a, b) => ((usage.get(a) ?? 0) <= (usage.get(b) ?? 0) ? a : b));
}

export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO projects (name, code, color, created_at) VALUES ($1,$2,$3,$4)`,
    [name.trim(), code?.trim() || null, color ?? await pickNextColor(), nowIso()],
  );
  return r.lastInsertId as number;
}

export async function updateProject(
  id: number, patch: Partial<Pick<Project, 'name' | 'code' | 'color' | 'archived_at'>>,
): Promise<void> {
  await patchRow('projects', id, patch);
}

/**
 * Deletes the project. Its tasks SURVIVE and go back to the Inbox — that is
 * the ON DELETE SET NULL from migration v1. Deleting a project must never
 * take measured work down with it.
 */
export async function deleteProject(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM projects WHERE id = $1`, [id]);
}

/**
 * Gives a color to projects created before colors existed. Runs at startup,
 * once per uncolored project, and stays quiet: it is a data fix, not news.
 */
export async function backfillProjectColors(): Promise<number> {
  const d = await db();
  const uncolored = await d.select<Array<{ id: number }>>(
    `SELECT id FROM projects WHERE color IS NULL ORDER BY id`);
  for (const p of uncolored) {
    await d.execute(`UPDATE projects SET color = $1 WHERE id = $2`, [await pickNextColor(), p.id]);
  }
  return uncolored.length;
}

/** Project + what the list and the header need to show alongside it. */
export interface ProjectSummary extends Project {
  open_count: number;
  doing_count: number;
  done_count: number;
  total_count: number;
  /** Minutes of closed sessions across ALL of the project's tasks. */
  minutes: number;
  /** Last sign of life: a task capture or a session. NULL = empty project. */
  last_activity_at: string | null;
}

/**
 * The project list, with numbers.
 *
 * Sorted by ACTIVITY, not by name: in a picker or a sidebar, what was touched
 * yesterday has to come before what has been asleep for three months. A
 * project with no activity at all goes to the end; it doesn't disappear.
 */
export async function listProjectSummaries(includeArchived = false): Promise<ProjectSummary[]> {
  const d = await db();
  const rows = await d.select<ProjectSummary[]>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.archived_at IS NULL AND t.status <> 'done')                        AS open_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.archived_at IS NULL AND t.status = 'doing')                        AS doing_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.status = 'done')                                                   AS done_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id)                    AS total_count,
       COALESCE((SELECT SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440)
                   FROM sessions s JOIN tasks t ON t.id = s.task_id
                  WHERE t.project_id = p.id AND s.ended_at IS NOT NULL), 0)        AS minutes,
       (SELECT MAX(at) FROM (
          SELECT MAX(t.created_at) AS at FROM tasks t WHERE t.project_id = p.id
          UNION ALL
          SELECT MAX(s.started_at) FROM sessions s JOIN tasks t ON t.id = s.task_id
           WHERE t.project_id = p.id
       ))                                                                          AS last_activity_at
     FROM projects p
     ${includeArchived ? '' : 'WHERE p.archived_at IS NULL'}
     ORDER BY (last_activity_at IS NULL), last_activity_at DESC, p.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

// ───────────────────────────────── tasks ─────────────────────────────────

const TASK_SELECT = `
  SELECT t.*,
         p.name  AS project_name,
         p.code  AS project_code,
         p.color AS project_color,
         COALESCE((SELECT SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440)
                     FROM sessions s
                    WHERE s.task_id = t.id AND s.ended_at IS NOT NULL), 0) AS minutes,
         COALESCE((SELECT COUNT(*) FROM sessions s WHERE s.task_id = t.id), 0) AS session_count,
         o.title AS origin_title,
         o.kind  AS origin_kind
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks    o ON o.id = t.origin_id`;

/** Everything on the board (backlog included). */
export async function boardTasks(): Promise<TaskCard[]> {
  const d = await db();
  const rows = await d.select<TaskCard[]>(
    `${TASK_SELECT} WHERE t.archived_at IS NULL ORDER BY t.pos, t.created_at DESC`,
  );
  // SUM over julianday returns a float; the UI only deals in whole minutes.
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

/**
 * The tasks of ONE project — the question the whole app couldn't answer.
 * `projectId === null` returns the Inbox: what was captured without a project.
 *
 * Includes archived tasks by default, unlike the board: the project screen is
 * its history, and hiding what was delivered 20 days ago empties out exactly
 * the part that answers "did this project pay off?".
 */
export async function listProjectTasks(
  projectId: number | null, includeArchived = true,
): Promise<TaskCard[]> {
  const d = await db();
  const rows = await d.select<TaskCard[]>(
    `${TASK_SELECT}
      WHERE ${projectId == null ? 't.project_id IS NULL' : 't.project_id = $1'}
        ${includeArchived ? '' : 'AND t.archived_at IS NULL'}
      ORDER BY t.pos, t.created_at DESC`,
    projectId == null ? [] : [projectId],
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

/**
 * Drops N tasks into a project at once. Reclassifying ten tasks used to cost
 * ten drawer openings and ~40 clicks; here it is one call.
 */
export async function reassignTasks(ids: number[], projectId: number | null): Promise<void> {
  if (!ids.length) return;
  const d = await db();
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  await d.execute(
    `UPDATE tasks SET project_id = $1 WHERE id IN (${placeholders})`, [projectId, ...ids],
  );
}

/**
 * Quick capture. It is the app's most-used operation — during a meeting — so
 * only the title is required. It goes to the top of the backlog.
 */
export async function captureTask(
  title: string, project_id: number | null = null, kind: TaskKind = 'work',
  due_at: string | null = null,
): Promise<number> {
  const d = await db();
  // Capture context: whatever was running at this instant. Nobody types this.
  const openSession = await d.select<Array<{ task_id: number }>>(
    `SELECT task_id FROM sessions WHERE ended_at IS NULL LIMIT 1`);
  const origin = openSession[0]?.task_id ?? null;
  const min = await d.select<Array<{ m: number | null }>>(
    `SELECT MIN(pos) AS m FROM tasks WHERE status = 'backlog' AND archived_at IS NULL`,
  );
  const pos = (min[0]?.m ?? 0) - 1;   // top of the column
  const now = nowIso();
  const r = await d.execute(
    `INSERT INTO tasks (project_id, title, kind, status, pos, created_at, due_at, origin_id)
     VALUES ($1,$2,$3,'backlog',$4,$5,$6,$7)`,
    [project_id, title.trim(), kind, pos, now, due_at, origin],
  );
  const id = r.lastInsertId as number;
  await d.execute(`INSERT INTO transitions (task_id, from_status, to_status, at) VALUES ($1,NULL,'backlog',$2)`,
    [id, now]);
  return id;
}

export async function updateTask(
  id: number,
  patch: Partial<Pick<Task, 'title' | 'project_id' | 'kind' | 'due_at' | 'notes' | 'pos' | 'archived_at'
                           | 'outcome' | 'outcome_note'>>,
): Promise<void> {
  await patchRow('tasks', id, patch);
}

/** Complete with an outcome: moves to 'done' and records HOW it ended. */
export async function completeTask(id: number, outcome: Outcome, note: string | null = null): Promise<void> {
  await moveTask(id, 'done');
  await patchRow('tasks', id, { outcome, outcome_note: note });
}

export async function listTransitions(taskId: number): Promise<Transition[]> {
  const d = await db();
  return d.select<Transition[]>(`SELECT * FROM transitions WHERE task_id = $1 ORDER BY at`, [taskId]);
}

export async function listTaskSessions(taskId: number): Promise<Session[]> {
  const d = await db();
  return d.select<Session[]>(`SELECT * FROM sessions WHERE task_id = $1 ORDER BY started_at DESC`, [taskId]);
}

/** Outcomes in the period, for "How they ended". */
export async function countOutcomes(fromUtc: string, toUtc: string): Promise<Array<{ outcome: Outcome | null; n: number }>> {
  const d = await db();
  return d.select(`SELECT outcome, COUNT(*) AS n FROM tasks
                    WHERE done_at IS NOT NULL AND done_at >= $1 AND done_at < $2
                    GROUP BY outcome ORDER BY n DESC`, [fromUtc, toUtc]);
}

/** Completed per day (last N days), for the sidebar sparkline. */
export async function countCompletedByDay(days: number): Promise<Array<{ day: string; n: number }>> {
  const d = await db();
  return d.select(`SELECT date(done_at,'localtime') AS day, COUNT(*) AS n FROM tasks
                    WHERE done_at IS NOT NULL AND julianday('now') - julianday(done_at) < $1
                    GROUP BY day ORDER BY day`, [days]);
}

export async function deleteTask(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM tasks WHERE id = $1`, [id]);   // sessions go with it (CASCADE)
}

/**
 * Moves the task to another column — and THIS is what produces time.
 *
 * Entering 'doing' opens a session; leaving closes it. The user never presses
 * "start timer": the timer is a consequence of the board.
 *
 * Order matters: we close BEFORE opening, always. That way, if the app dies
 * halfway, the worst case is no open session — never two, which would be time
 * counted twice. (The unique index in the database would block it too, but
 * it is better not to rely on that.)
 */
export async function moveTask(id: number, to: TaskStatus): Promise<void> {
  const d = await db();
  const current = await d.select<Array<{ status: TaskStatus; started_at: string | null }>>(
    `SELECT status, started_at FROM tasks WHERE id = $1`, [id]);
  if (!current.length) return;
  const from = current[0].status;
  if (from === to) return;
  const now = nowIso();

  // 1. Close ANY open session (this task's or another's).
  await d.execute(`UPDATE sessions SET ended_at = $1 WHERE ended_at IS NULL`, [now]);

  // 2. Open a new one only if entering 'doing'.
  if (to === 'doing') {
    await d.execute(
      `INSERT INTO sessions (task_id, started_at, tz, source, created_at)
       VALUES ($1,$2,$3,'auto',$4)`,
      [id, now, currentTz(), now],
    );
  }

  // 3. Timestamps. started_at keeps only the FIRST time in 'doing'.
  await d.execute(
    `UPDATE tasks SET
       status     = $1,
       queued_at  = CASE WHEN $1 = 'queued' AND queued_at  IS NULL THEN $2 ELSE queued_at  END,
       started_at = CASE WHEN $1 = 'doing'  AND started_at IS NULL THEN $2 ELSE started_at END,
       done_at    = CASE WHEN $1 = 'done' THEN $2 ELSE NULL END,
       outcome    = CASE WHEN $1 = 'done' THEN outcome ELSE NULL END,
       outcome_note = CASE WHEN $1 = 'done' THEN outcome_note ELSE NULL END
     WHERE id = $3`,
    [to, now, id],
  );

  await d.execute(`INSERT INTO transitions (task_id, from_status, to_status, at) VALUES ($1,$2,$3,$4)`,
    [id, from, to, now]);
}

/** Reorders within the column: pos becomes the average of its neighbors, without rewriting the list. */
export async function reorderTask(id: number, prev: number | null, next: number | null): Promise<void> {
  const pos = prev != null && next != null ? (prev + next) / 2
    : prev != null ? prev + 1
    : next != null ? next - 1
    : 0;
  await patchRow('tasks', id, { pos });
}

/** Takes off the board what has been 'done' for more than N days. Reports still see it. */
export async function archiveDoneTasks(days = 14): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `UPDATE tasks SET archived_at = $1
      WHERE status = 'done' AND archived_at IS NULL AND done_at IS NOT NULL
        AND julianday($1) - julianday(done_at) > $2`,
    [nowIso(), days],
  );
  return r.rowsAffected;
}

// ──────────────────────────────── sessions ────────────────────────────────

const SESSION_SELECT = `
  SELECT s.*, t.title, t.kind, p.name AS project_name, p.code AS project_code, p.color AS project_color
    FROM sessions s
    JOIN tasks t     ON t.id = s.task_id
    LEFT JOIN projects p ON p.id = t.project_id`;

/** The session running right now, if any. */
export async function getOpenSession(): Promise<SessionCard | null> {
  const d = await db();
  const r = await d.select<SessionCard[]>(`${SESSION_SELECT} WHERE s.ended_at IS NULL LIMIT 1`);
  return r[0] ?? null;
}

/** Closes the open session without touching the task's status (the "pause" button). */
export async function pauseSession(): Promise<void> {
  const d = await db();
  await d.execute(`UPDATE sessions SET ended_at = $1 WHERE ended_at IS NULL`, [nowIso()]);
}

export async function listDaySessions(key: DayKey): Promise<SessionCard[]> {
  const d = await db();
  const { from, to } = dayRangeUtc(key);
  // Takes whatever STARTED on the day: a session that crosses midnight belongs
  // to the day it started on, which is how people think about their own day.
  return d.select<SessionCard[]>(
    `${SESSION_SELECT} WHERE s.started_at >= $1 AND s.started_at < $2 ORDER BY s.started_at`,
    [from, to],
  );
}

export async function getDayTotals(key: DayKey): Promise<Totals> {
  const sessions = await listDaySessions(key);
  const t: Totals = { total: 0, work: 0, meeting: 0, admin: 0 };
  for (const s of sessions) {
    if (!s.ended_at) continue;   // the running one is counted live in the UI
    const min = Math.round(
      (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
    t.total += min;
    t[s.kind] += min;
  }
  return t;
}

/** A session entered by hand — "I forgot to move the card". */
export async function createSession(
  task_id: number, started_at: string, ended_at: string, note: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO sessions (task_id, started_at, ended_at, tz, source, note, created_at)
     VALUES ($1,$2,$3,$4,'manual',$5,$6)`,
    [task_id, started_at, ended_at, currentTz(), note, nowIso()],
  );
  return r.lastInsertId as number;
}

export async function updateSession(
  id: number, patch: Partial<Pick<Session, 'started_at' | 'ended_at' | 'task_id' | 'note'>>,
): Promise<void> {
  await patchRow('sessions', id, patch);
}

export async function deleteSession(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM sessions WHERE id = $1`, [id]);
}

// ──────────────────────────────── reports ────────────────────────────────

export interface ProjectTimeRow {
  project_id: number | null;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  minutes: number;
}

export async function sumTimeByProject(fromUtc: string, toUtc: string): Promise<ProjectTimeRow[]> {
  const d = await db();
  const rows = await d.select<ProjectTimeRow[]>(
    `SELECT p.id AS project_id, p.name AS project_name, p.code AS project_code,
            p.color AS project_color,
            SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440) AS minutes
       FROM sessions s
       JOIN tasks t ON t.id = s.task_id
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE s.ended_at IS NOT NULL AND s.started_at >= $1 AND s.started_at < $2
      GROUP BY p.id ORDER BY minutes DESC`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

export interface DayTimeRow { day: string; kind: TaskKind; minutes: number }

export async function sumTimeByDay(fromUtc: string, toUtc: string): Promise<DayTimeRow[]> {
  const d = await db();
  const rows = await d.select<DayTimeRow[]>(
    `SELECT date(s.started_at, 'localtime') AS day, t.kind AS kind,
            SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440) AS minutes
       FROM sessions s JOIN tasks t ON t.id = s.task_id
      WHERE s.ended_at IS NOT NULL AND s.started_at >= $1 AND s.started_at < $2
      GROUP BY day, kind ORDER BY day`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

/** Lead time (capture -> done) and cycle time (started -> done), in hours. */
export interface TaskFlow { task_id: number; title: string; lead_h: number; cycle_h: number | null }

export async function listCompletedFlows(fromUtc: string, toUtc: string): Promise<TaskFlow[]> {
  const d = await db();
  const rows = await d.select<TaskFlow[]>(
    `SELECT id AS task_id, title,
            (julianday(done_at) - julianday(created_at)) * 24 AS lead_h,
            CASE WHEN started_at IS NULL THEN NULL
                 ELSE (julianday(done_at) - julianday(started_at)) * 24 END AS cycle_h
       FROM tasks
      WHERE done_at IS NOT NULL AND done_at >= $1 AND done_at < $2
      ORDER BY done_at DESC`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({
    ...r,
    lead_h: Math.round(r.lead_h * 10) / 10,
    cycle_h: r.cycle_h == null ? null : Math.round(r.cycle_h * 10) / 10,
  }));
}

// ───────────────────────────────── notes ─────────────────────────────────
// Only the INDEX. The indexer (lib/notes.ts) writes here; the UI reads.

/**
 * Note + the project resolved from the raw frontmatter value.
 *
 * Code beats name: if one project is NAMED "CF03B04" and another has that as
 * its CODE, `project: CF03B04` means the second. That is what the COALESCE
 * does — and not an ORDER BY, because SQLite rejects a correlated column in
 * the ORDER BY of a scalar subquery ("no such column: n.project_ref"), even
 * though it accepts one in the WHERE.
 */
const NOTE_SELECT = `
  SELECT x.*, p.name AS project_name, p.color AS project_color FROM (
    SELECT n.path, n.title, n.mtime, n.project_ref, n.tags,
           COALESCE(
             (SELECT q.id FROM projects q WHERE q.code = n.project_ref COLLATE NOCASE LIMIT 1),
             (SELECT q.id FROM projects q WHERE q.name = n.project_ref COLLATE NOCASE LIMIT 1)
           ) AS project_id
      FROM notes n) x
  LEFT JOIN projects p ON p.id = x.project_id`;

type NoteRow = Omit<NoteSummary, 'tags'> & { tags: string | null };
const toNoteSummary = (r: NoteRow): NoteSummary => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] });

export async function listIndexedNotes(): Promise<Array<{ path: string; mtime: number }>> {
  const d = await db();
  return d.select(`SELECT path, mtime FROM notes`);
}

/**
 * Writes a note to the index. Three tables, no transaction: plugin-sql does
 * not guarantee the same connection across calls, and a half-written index
 * gets fixed on the next scan — that is exactly why it is rebuildable.
 */
export async function indexNote(n: NoteIndexEntry): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO notes (path, title, mtime, size, project_ref, tags, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title, mtime = excluded.mtime, size = excluded.size,
       project_ref = excluded.project_ref, tags = excluded.tags, indexed_at = excluded.indexed_at`,
    [n.path, n.title, n.mtime, n.size, n.project_ref, JSON.stringify(n.tags), nowIso()],
  );
  await d.execute(`DELETE FROM notes_fts WHERE path = $1`, [n.path]);
  await d.execute(`INSERT INTO notes_fts (path, title, body) VALUES ($1,$2,$3)`, [n.path, n.title, n.body]);
  await d.execute(`DELETE FROM note_links WHERE src = $1`, [n.path]);
  if (n.links.length) {
    const vals = n.links.map((_, i) => `($1, $${i + 2})`).join(',');
    await d.execute(`INSERT OR IGNORE INTO note_links (src, target) VALUES ${vals}`, [n.path, ...n.links]);
  }
}

export async function unindexNote(path: string): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM notes WHERE path = $1`, [path]);   // links go with it (CASCADE)
  await d.execute(`DELETE FROM notes_fts WHERE path = $1`, [path]);
}

export async function renameInIndex(from: string, to: string): Promise<void> {
  const d = await db();
  await d.execute(`UPDATE notes SET path = $2 WHERE path = $1`, [from, to]);   // links: ON UPDATE CASCADE
  await d.execute(`UPDATE notes_fts SET path = $2 WHERE path = $1`, [from, to]);
}

/** Switching vaults starts from scratch: the previous vault's index is worthless here. */
export async function clearIndex(): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM notes`);
  await d.execute(`DELETE FROM notes_fts`);
}

export async function listNotes(): Promise<NoteSummary[]> {
  const d = await db();
  return (await d.select<NoteRow[]>(`${NOTE_SELECT} ORDER BY x.mtime DESC`)).map(toNoteSummary);
}

export async function listProjectNotes(projectId: number): Promise<NoteSummary[]> {
  const d = await db();
  const r = await d.select<NoteRow[]>(`SELECT * FROM (${NOTE_SELECT}) WHERE project_id = $1 ORDER BY mtime DESC`,
    [projectId]);
  return r.map(toNoteSummary);
}

/**
 * Who links to this note. The link may have been written by file name
 * (`[[RCD snubber]]`) or by path (`[[Technical/RCD snubber]]`) — Obsidian
 * accepts both, so both count.
 */
export async function backlinks(path: string, nameNorm: string, pathNorm: string): Promise<NoteSummary[]> {
  const d = await db();
  const r = await d.select<NoteRow[]>(
    `SELECT * FROM (${NOTE_SELECT})
      WHERE path IN (SELECT src FROM note_links WHERE target IN ($1, $2))
        AND path <> $3
      ORDER BY mtime DESC`,
    [nameNorm, pathNorm, path],
  );
  return r.map(toNoteSummary);
}

/** Every `[[link]]` in the vault, raw. Resolving target -> note is lib/notes.ts's job. */
export async function listAllLinks(): Promise<Array<{ src: string; target: string }>> {
  const d = await db();
  return d.select(`SELECT src, target FROM note_links`);
}

/**
 * Text search. Each word becomes a quoted prefix — "meet" finds "meeting",
 * and the quotes neutralize FTS5 operators (AND, NEAR, -), which in a user's
 * search box only ever produce syntax errors.
 * Title weighs 5× the body: a hit in the name is almost always what was wanted.
 */
export async function searchNotes(q: string, limit = 30): Promise<SearchResult[]> {
  const terms = q.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
  const d = await db();
  return d.select<SearchResult[]>(
    `SELECT path, title, snippet(notes_fts, 2, char(2), char(3), '…', 14) AS snippet
       FROM notes_fts WHERE notes_fts MATCH $1
      ORDER BY bm25(notes_fts, 0, 5.0, 1.0) LIMIT $2`,
    [match, limit],
  );
}

// ──────────────────────────────── meta ────────────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  const d = await db();
  const r = await d.select<Array<{ value: string }>>(`SELECT value FROM meta WHERE key = $1`, [key]);
  return r.length ? r[0].value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO meta (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]);
}

// ──────────────────────────────── internal ────────────────────────────────

/**
 * Partial UPDATE. The keys come from TS types, but TS doesn't exist at runtime —
 * so we check them against an allowlist before interpolating into the SQL.
 */
const COLUMNS: Record<string, ReadonlySet<string>> = {
  projects: new Set(['name', 'code', 'color', 'archived_at']),
  tasks: new Set(['title', 'project_id', 'kind', 'status', 'due_at', 'notes', 'pos', 'archived_at', 'outcome', 'outcome_note']),
  sessions: new Set(['started_at', 'ended_at', 'task_id', 'note']),
};

async function patchRow(table: keyof typeof COLUMNS, id: number, patch: object): Promise<void> {
  const fields = Object.keys(patch).filter((c) => COLUMNS[table].has(c));
  if (!fields.length) return;
  const d = await db();
  const set = fields.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await d.execute(
    `UPDATE ${table} SET ${set} WHERE id = $${fields.length + 1}`,
    [...fields.map((c) => (patch as Record<string, unknown>)[c]), id],
  );
}
