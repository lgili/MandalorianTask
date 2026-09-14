// THE BANCADA PLUGIN CONTRACT.
//
// This file is the public API: it is what a plugin author reads, and what the
// app promises not to break. That is why it imports nothing from inside the
// app — the types here are their own DTOs (NoteInfo, TaskInfo…), not the
// database's internal types. The app can reorganize whatever it wants inside;
// as long as this file does not change, no plugin breaks.
//
// Plugin author: copy this file as `bancada.d.ts` into your project.
// Documentation and example: docs/PLUGINS.md.

/** Contract version. Changing the first number = breaks old plugins. */
export const API_VERSION = '1.0.0';

export interface PluginManifest {
  /** Unique; only lowercase letters, digits and hyphens. It is the folder name. */
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  /** Minimum API version (API_VERSION) the plugin requires. */
  minApiVersion?: string;
}

// ── data the plugin sees ───────────────────────────────────────────────────

export interface NoteInfo {
  /** Path relative to the vault, always with '/'. E.g.: 'Technical/RCD snubber.md' */
  path: string;
  title: string;
  /** ms since the epoch. */
  modifiedAt: number;
  /** id of the project linked through the `project:` frontmatter, if any. */
  project: number | null;
  tags: string[];
}

export type Status = 'backlog' | 'queued' | 'doing' | 'done';

export interface TaskInfo {
  id: number;
  title: string;
  status: Status;
  project: number | null;
  /** Minutes measured in closed sessions. */
  minutes: number;
  /** ISO, or null. */
  due: string | null;
  createdAt: string;
}

export interface ProjectInfo {
  id: number;
  name: string;
  code: string | null;
  /** Color token: 'p1'..'p6'. Use `rgb(var(--p1))` in CSS. */
  color: string | null;
}

export interface SessionInfo {
  task: number;
  title: string;
  project: number | null;
  start: string;
  /** null = running right now. */
  end: string | null;
}

export interface Link {
  /** Note the link comes from. */
  from: string;
  /** Note it points to, or null if the link points to a note that does not exist. */
  to: string | null;
  /** The target as it was written (normalized). */
  target: string;
}

// ── events ─────────────────────────────────────────────────────────────────

export interface PluginEvents {
  'note:opened': { path: string };
  'note:saved': { path: string; text: string };
  'note:created': { path: string };
  'note:deleted': { path: string };
  'note:renamed': { from: string; to: string };
  'note:external': { path: string };
  'vault:synced': { total: number };
  'task:created': { id: number; title: string; project: number | null };
  'task:moved': { id: number; from: string | null; to: string };
  /** Only Bancada has this: the moment work starts and stops. */
  'session:started': { task: number; title: string };
  'session:stopped': { task: number | null };
}

// ── what the plugin registers ──────────────────────────────────────────────

export interface PluginCommand {
  /** Unique within the plugin — the app prefixes it with the plugin id. */
  id: string;
  name: string;
  run: () => void | Promise<void>;
}

export interface PluginPanel {
  /** Unique within the plugin. Becomes the route /plugin/<plugin>/<id>. */
  id: string;
  title: string;
  /**
   * Mounts the panel inside `el` (plain DOM — use whatever framework you like).
   * May return a cleanup function, called when the panel closes.
   */
  mount: (el: HTMLElement) => void | (() => void);
}

// ── the API ────────────────────────────────────────────────────────────────

export interface Bancada {
  readonly apiVersion: string;
  readonly plugin: { id: string; name: string };

  commands: {
    /** Shows up in the palette (Ctrl+P). Removed on its own when the plugin is disabled. */
    add(c: PluginCommand): void;
    /** Runs a command from the app or from another plugin by its full id. */
    run(id: string): Promise<void>;
  };

  events: {
    /** Unsubscribed automatically when the plugin is disabled. */
    on<K extends keyof PluginEvents>(name: K, fn: (data: PluginEvents[K]) => void): void;
  };

  notes: {
    list(): NoteInfo[];
    read(path: string): Promise<string>;
    /** Writes and reindexes. Creates the folder if needed. */
    write(path: string, text: string): Promise<void>;
    /** Creates with a unique name and returns the path. */
    create(title: string, options?: { folder?: string; project?: string; body?: string }): Promise<string>;
    exists(path: string): Promise<boolean>;
    /** Opens the note on the Notes screen. */
    open(path: string): void;
    /** The note open right now on the Notes screen, if any. */
    active(): string | null;
    search(term: string): Promise<Array<{ path: string; title: string }>>;
    /** Every [[link]] in the vault. For a graph, an index, analysis. */
    links(): Promise<Link[]>;
    /** Which note a `[[target]]` points to (Obsidian's rule). */
    resolve(target: string): string | null;
  };

  tasks: {
    list(): TaskInfo[];
    create(t: { title: string; project?: number | null; due?: string | null; status?: Status }): Promise<number>;
    move(id: number, to: Status): Promise<void>;
    open(id: number): void;
    /** The session running right now, if any. */
    running(): SessionInfo | null;
    /** Sessions of a local day ('YYYY-MM-DD'; default: today). */
    sessionsOn(day?: string): Promise<SessionInfo[]>;
  };

  projects: {
    list(): ProjectInfo[];
  };

  editor: {
    /**
     * CodeMirror 6 extension for the note editor. Use the classes from
     * `bancada.cm` — a loaded plugin cannot import CodeMirror on its own,
     * and two copies of it do not talk to each other.
     */
    registerExtension(ext: unknown): void;
  };

  /** The CodeMirror 6 modules the app uses: `view`, `state`, `language`. */
  readonly cm: { view: unknown; state: unknown; language: unknown };

  ui: {
    notice(message: string, tone?: 'ok' | 'warning' | 'error'): void;
    /** A panel of its own, listed in the sidebar. */
    addPanel(p: PluginPanel): void;
    /** Navigates to a panel of this plugin. */
    openPanel(id: string): void;
    /** CSS injected for as long as the plugin is enabled. */
    addStyle(css: string): void;
  };

  /** Plugin settings, saved in .bancada/plugins/<id>/data.json. */
  data: {
    load<T = unknown>(): Promise<T | null>;
    save(data: unknown): Promise<void>;
  };

  /** Registers any extra cleanup for when the plugin is disabled. */
  onUnload(fn: () => void): void;
}

/**
 * What `main.js` exports as default: an object with `onload`, or a class
 * whose instances have `onload`. `onunload` is optional — everything that
 * was registered through the API is undone on its own.
 */
export interface PluginDefinition {
  onload(bancada: Bancada): void | Promise<void>;
  onunload?(): void;
}
