// Core plugin: Daily note.
//
// Obsidian's daily note, plus what only Bancada knows: the work the board
// MEASURED today goes into the note on its own. Written only against the public
// API — no imports from inside the app. It's the proof that the API is enough.

import type { Bancada, PluginDefinition, PluginManifest, ProjectInfo, SessionInfo } from '../types';

export const manifest: PluginManifest = {
  id: 'daily-note',
  name: 'Daily note',
  version: '1.0.0',
  description: 'One note per day in Daily/, pre-filled with the work sessions the board measured.',
  author: 'Bancada',
};

const p2 = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const hhmm = (iso: string) => { const d = new Date(iso); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
function duration(start: string, end: string): string {
  const m = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${p2(m % 60)}`;
}

/** One line per session: time, task, project and duration. */
export function formatWorkBlock(sessions: SessionInfo[], projects: ProjectInfo[], now = new Date()): string {
  if (!sessions.length) return '_No sessions measured yet today._';
  return sessions.map((s) => {
    const p = projects.find((x) => x.id === s.project);
    const end = s.end ?? now.toISOString();
    const proj = p ? ` · ${p.code ?? p.name}` : '';
    return `- ${hhmm(s.start)}–${s.end ? hhmm(s.end) : 'now'} · ${s.title}${proj} (${duration(s.start, end)})`;
  }).join('\n');
}

export const definition: PluginDefinition = {
  onload(b: Bancada) {
    b.commands.add({
      id: 'open',
      name: "Open today's note",
      async run() {
        const path = `Daily/${today()}.md`;
        if (!(await b.notes.exists(path))) {
          const sessions = await b.tasks.sessionsOn();
          await b.notes.write(path, `## Today's work\n${formatWorkBlock(sessions, b.projects.list())}\n\n## Notes\n\n`);
        }
        b.notes.open(path);
      },
    });

    b.commands.add({
      id: 'insert-work',
      name: "Insert today's work into the open note",
      async run() {
        const path = b.notes.active();
        if (!path) { b.ui.notice('Open a note first.', 'warning'); return; }
        const text = await b.notes.read(path);
        const sessions = await b.tasks.sessionsOn();
        const block = formatWorkBlock(sessions, b.projects.list());
        await b.notes.write(path, `${text.replace(/\s*$/, '')}\n\n## Today's work\n${block}\n`);
        b.ui.notice(`${sessions.length} ${sessions.length === 1 ? 'session inserted' : 'sessions inserted'}`);
      },
    });
  },
};
