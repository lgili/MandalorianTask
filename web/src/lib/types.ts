// TS mirrors of the tables. Kept by hand: the schema is small, and a generator
// would be one more part to maintain rather than a saving.

export type TaskStatus = 'backlog' | 'queued' | 'doing' | 'done';
export type TaskKind = 'work' | 'meeting' | 'admin';
export type SessionSource = 'auto' | 'manual';
export type Outcome = 'delivered' | 'dropped' | 'handed_off' | 'reverted';

export const OUTCOMES: Array<{ id: Outcome; label: string; desc: string }> = [
  { id: 'delivered',  label: 'Delivered',  desc: 'came out the way it should' },
  { id: 'dropped',    label: 'Dropped',    desc: 'not worth the cost' },
  { id: 'handed_off', label: 'Handed off', desc: 'someone else took it over' },
  { id: 'reverted',   label: 'Reverted',   desc: 'rolled back, needs rethinking' },
];

export const STATUS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'queued', label: 'Queue' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];

export const KINDS: Array<{ id: TaskKind; label: string }> = [
  { id: 'work', label: 'Work' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'admin', label: 'Admin' },
];

export interface Project {
  id: number;
  name: string;
  code: string | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number | null;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  pos: number;
  due_at: string | null;
  notes: string | null;
  /** When it was captured — usually in the middle of a meeting. */
  created_at: string;
  /** The task that was running when this one was captured. */
  origin_id: number | null;
  queued_at: string | null;
  /** FIRST time it entered 'doing'. The basis of cycle time. */
  started_at: string | null;
  done_at: string | null;
  archived_at: string | null;
  outcome: Outcome | null;
  outcome_note: string | null;
}

export interface Transition { id: number; task_id: number; from_status: TaskStatus | null; to_status: TaskStatus; at: string }

/** Task plus what the UI needs alongside it: project and accumulated time. */
export interface TaskCard extends Task {
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  /** Minutes from CLOSED sessions. The open one is counted live in the UI. */
  minutes: number;
  /** How many times it has been worked on. Exposes the task that keeps getting picked back up. */
  session_count: number;
  /** Title of what was running at capture time — usually the meeting. */
  origin_title: string | null;
  origin_kind: TaskKind | null;
}

export interface Session {
  id: number;
  task_id: number;
  started_at: string;
  /** NULL = running now. */
  ended_at: string | null;
  tz: string;
  source: SessionSource;
  note: string | null;
  created_at: string;
}

/** Session with its task's context, for the timeline and the footer. */
export interface SessionCard extends Session {
  title: string;
  kind: TaskKind;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
}

export interface Totals {
  /** Closed minutes, within the period. */
  total: number;
  work: number;
  meeting: number;
  admin: number;
}

// ── notes ──────────────────────────────────────────────────────────────────
// The .md on disk is the source of truth; these types describe only its INDEX.

/** What the indexer writes for a note. */
export interface NoteIndexEntry {
  path: string;
  title: string;
  mtime: number;
  size: number;
  /** Raw value of `project:` in the frontmatter. */
  project_ref: string | null;
  tags: string[];
  /** Cleaned-up text for search. */
  body: string;
  /** [[link]] targets, already normalized. */
  links: string[];
}

/** Note with its project resolved — what lists and headers show. */
export interface NoteSummary {
  path: string;
  title: string;
  mtime: number;
  project_ref: string | null;
  tags: string[];
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
}

export interface SearchResult {
  path: string;
  title: string;
  /** Snippet with the matched terms between the control chars 0x02 and 0x03, for the UI to highlight. */
  snippet: string;
}
