// Builds the `bancada` object that EACH plugin receives.
//
// One instance per plugin, and everything registered through it goes into
// that plugin's list of disposers. Disabling the plugin is walking that list —
// no orphan command in the palette, no leaking listener, no leftover CSS. It is
// Obsidian's `this.register*`, but without the plugin having to remember to call it.

import { shallowRef } from 'vue';
import * as cmView from '@codemirror/view';
import * as cmState from '@codemirror/state';
import * as cmLanguage from '@codemirror/language';
import type { NoteSummary, Project, SessionCard, TaskCard } from '../types';
import type {
  Bancada, Link, NoteInfo, PluginManifest, PluginPanel, ProjectInfo, SessionInfo, TaskInfo,
} from './types';
import { API_VERSION } from './types';
import * as api from '../db';
import * as vault from '../vault';
import { router } from '../../router';
import { move, openTaskDetail, projects, reloadAll, running, tasks } from '../store';
import { activeNote, createNote, notes, resolve, saveNote } from '../notes';
import { registerCommand, runCommand } from '../commands';
import { emitEvent, onEvent, type EventName } from '../events';
import { registerExtension } from '../editor/extensions';
import { dayKey } from '../time';
import { toast } from '../toast';

/** Panels registered by plugins — the sidebar and the /plugin route read this. */
export interface RegisteredPanel extends PluginPanel { plugin: string; pluginName: string }
export const panels = shallowRef<RegisteredPanel[]>([]);

// ── translation internal -> contract ───────────────────────────────────────

const toNoteInfo = (n: NoteSummary): NoteInfo => ({
  path: n.path, title: n.title, modifiedAt: n.mtime, project: n.project_id, tags: n.tags,
});
const toTaskInfo = (t: TaskCard): TaskInfo => ({
  id: t.id, title: t.title, status: t.status, project: t.project_id,
  minutes: t.minutes, due: t.due_at, createdAt: t.created_at,
});
const toProjectInfo = (p: Project): ProjectInfo => ({ id: p.id, name: p.name, code: p.code, color: p.color });
const toSessionInfo = (s: SessionCard): SessionInfo => ({
  task: s.task_id, title: s.title,
  project: tasks.value.find((t) => t.id === s.task_id)?.project_id ?? null,
  start: s.started_at, end: s.ended_at,
});

/** Path coming from a plugin: relative, with '/', never climbing out of a folder. */
function safePath(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.split('/').some((seg) => seg === '..')) throw new Error(`Invalid path: ${path}`);
  return p;
}

export function createPluginApi(m: PluginManifest, disposers: Array<() => void>): Bancada {
  const track = (f: () => void) => { disposers.push(f); };
  const dataFile = `.bancada/plugins/${m.id}/data.json`;

  return {
    apiVersion: API_VERSION,
    plugin: { id: m.id, name: m.name },

    commands: {
      add(c) {
        track(registerCommand({ id: `${m.id}:${c.id}`, name: c.name, owner: m.name, run: c.run }));
      },
      run: (id) => runCommand(id),
    },

    events: {
      on(name, fn) {
        track(onEvent(name as EventName, fn as never));
      },
    },

    notes: {
      list: () => notes.value.map(toNoteInfo),
      read: (path) => vault.readFile(safePath(path)),
      write: (path, text) => saveNote(safePath(path), text),
      create: (title, options) => createNote(title, options),
      exists: (path) => vault.fileExists(safePath(path)),
      open: (path) => { void router.push({ name: 'notes', query: { note: safePath(path) } }); },
      active: () => activeNote.value,
      search: async (term) => (await api.searchNotes(term, 50)).map((r) => ({ path: r.path, title: r.title })),
      async links(): Promise<Link[]> {
        return (await api.listAllLinks()).map((l) => ({ from: l.src, target: l.target, to: resolve(l.target)?.path ?? null }));
      },
      resolve: (target) => resolve(target)?.path ?? null,
    },

    tasks: {
      list: () => tasks.value.map(toTaskInfo),
      async create(t) {
        const id = await api.captureTask(t.title, t.project ?? null, 'work', t.due ?? null);
        if (t.status && t.status !== 'backlog') await api.moveTask(id, t.status);
        await reloadAll();
        emitEvent('task:created', { id, title: t.title, project: t.project ?? null });
        return id;
      },
      move: (id, to) => move(id, to),
      open: (id) => openTaskDetail(id),
      running: () => (running.value ? toSessionInfo(running.value) : null),
      sessionsOn: async (day) => (await api.listDaySessions(day ?? dayKey())).map(toSessionInfo),
    },

    projects: {
      list: () => projects.value.map(toProjectInfo),
    },

    editor: {
      registerExtension(ext) {
        track(registerExtension(m.id, ext as cmState.Extension));
      },
    },

    cm: { view: cmView, state: cmState, language: cmLanguage },

    ui: {
      notice(msg, tone = 'ok') {
        (tone === 'error' ? toast.error : tone === 'warning' ? toast.warning : toast.ok)(msg);
      },
      addPanel(p) {
        const item: RegisteredPanel = { ...p, plugin: m.id, pluginName: m.name };
        panels.value = [...panels.value.filter((x) => !(x.plugin === m.id && x.id === p.id)), item];
        track(() => { panels.value = panels.value.filter((x) => x !== item); });
      },
      openPanel(id) {
        void router.push({ name: 'plugin', params: { plugin: m.id, panel: id } });
      },
      addStyle(css) {
        const el = document.createElement('style');
        el.dataset.plugin = m.id;
        el.textContent = css;
        document.head.appendChild(el);
        track(() => el.remove());
      },
    },

    data: {
      async load<T>(): Promise<T | null> {
        const t = await vault.readInternalFile(dataFile);
        if (!t) return null;
        try { return JSON.parse(t) as T; } catch { return null; }
      },
      save: (d) => vault.writeInternalFile(dataFile, JSON.stringify(d, null, 2)),
    },

    onUnload: track,
  };
}
