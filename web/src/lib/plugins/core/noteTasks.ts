// Core plugin: Note tasks.
//
// The meeting minutes have five action `- [ ]` items. One command and they
// become tasks in Bancada, already in the note's project. It's the bridge
// between the two halves of the app: what gets WRITTEN DOWN becomes what gets
// DONE, without retyping.

import type { Bancada, PluginDefinition, PluginManifest } from '../types';

export const manifest: PluginManifest = {
  id: 'note-tasks',
  name: 'Note tasks',
  version: '1.0.0',
  description: 'Turns the open note\'s "- [ ]" checkboxes into tasks, in the note\'s project.',
  author: 'Bancada',
};

const normalizeTitle = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** `[[target|alias]]` -> alias; `[[target]]` -> target. A task title has no brackets. */
const stripLinks = (s: string) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a);

/** The note's OPEN checkboxes, outside code blocks. */
export function extractOpenCheckboxes(md: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { inCode = !inCode; continue; }
    if (inCode) continue;
    const m = line.match(/^\s*[-*+] \[ \] (.+)$/);
    if (m) {
      const t = stripLinks(m[1]).trim();
      if (t) out.push(t);
    }
  }
  return out;
}

export const definition: PluginDefinition = {
  onload(b: Bancada) {
    b.commands.add({
      id: 'create',
      name: "Create tasks from this note's checkboxes",
      async run() {
        const path = b.notes.active();
        if (!path) { b.ui.notice('Open a note first.', 'warning'); return; }
        const checkboxes = extractOpenCheckboxes(await b.notes.read(path));
        if (!checkboxes.length) { b.ui.notice('This note has no open checkboxes.', 'warning'); return; }

        const project = b.notes.list().find((n) => n.path === path)?.project ?? null;
        // Running the command twice must not duplicate: compare against what already exists.
        const existing = new Set(b.tasks.list().map((t) => normalizeTitle(t.title)));
        const fresh = checkboxes.filter((c) => !existing.has(normalizeTitle(c)));
        for (const title of fresh) await b.tasks.create({ title, project });

        const repeated = checkboxes.length - fresh.length;
        if (!fresh.length) b.ui.notice('Every checkbox is already a task.');
        else b.ui.notice(`${fresh.length} ${fresh.length === 1 ? 'task created' : 'tasks created'}`
          + (repeated ? ` · ${repeated} already existed` : ''));
      },
    });
  },
};
