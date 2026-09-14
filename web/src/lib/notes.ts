// Notes: keeps the file and the index moving together.
//
// This is the store.ts of notes. No component calls vault.ts or the index
// functions in db.ts directly — they go through here, because every write needs
// three things in the right order (disk, index, event) and forgetting one of them
// is the kind of bug that only shows up weeks later, like a search that can't find the note.

import { ref } from 'vue';
import type { NoteIndexEntry, NoteSummary } from './types';
import * as vault from './vault';
import * as api from './db';
import {
  extractProjectRef, extractTags, extractTargets, extractTitle, noteName, normalizeTarget,
  retargetLinks, splitFrontmatter, toFileName, toSearchText,
} from './markdown';
import { emitEvent } from './events';

export const notes = ref<NoteSummary[]>([]);
/** Absolute path of the open folder. null = no vault configured. */
export const vaultPath = ref<string | null>(null);
export const syncing = ref(false);
/** The note open on the Notes screen right now. Plugins ask for it. */
export const activeNote = ref<string | null>(null);

/** What the index stores about a text. Pure: same text, same index. */
export function buildIndexEntry(path: string, text: string, file: { mtime: number; size: number }): NoteIndexEntry {
  const fm = splitFrontmatter(text);
  return {
    path,
    title: extractTitle(path, fm),
    mtime: file.mtime,
    size: file.size,
    project_ref: extractProjectRef(fm),
    tags: extractTags(fm),
    body: toSearchText(fm),
    links: extractTargets(fm.body),
  };
}

export async function loadNotes(): Promise<void> {
  notes.value = await api.listNotes();
}

// ── open, sync, watch ─────────────────────────────────────────────────────

let stopWatching: (() => void) | null = null;

/** On app start: if a vault is configured, sync it and start watching. */
export async function openVault(): Promise<void> {
  vaultPath.value = await vault.getRoot();
  if (!vaultPath.value) return;
  await syncVault();
  stopWatching?.();
  try {
    stopWatching = await vault.watchVault((paths) => { void reindex(paths); });
  } catch (e) {
    // Without a watcher the app still works; it just doesn't see outside edits until reopened.
    console.warn('[vault] watcher unavailable', e);
  }
}

/**
 * Compares disk and index by mtime and re-reads only what changed. The second
 * time a 2000-note vault is opened, this reads zero files.
 */
export async function syncVault(): Promise<{ reread: number; removed: number }> {
  syncing.value = true;
  try {
    const [onDisk, indexed] = await Promise.all([vault.listFiles(), api.listIndexedNotes()]);
    const indexedMtime = new Map(indexed.map((n) => [n.path, n.mtime]));
    const diskPaths = new Set(onDisk.map((a) => a.path));
    const changed = onDisk.filter((a) => indexedMtime.get(a.path) !== a.mtime);

    // Batches of 16: firing 2000 reads at once floods the IPC.
    for (let i = 0; i < changed.length; i += 16) {
      await Promise.all(changed.slice(i, i + 16).map(async (a) => {
        try {
          await api.indexNote(buildIndexEntry(a.path, await vault.readFile(a.path), a));
        } catch (e) {
          // One unreadable note (odd encoding, permissions) doesn't block the vault.
          console.warn('[vault] failed to index', a.path, e);
        }
      }));
    }

    const gone = indexed.filter((n) => !diskPaths.has(n.path));
    for (const n of gone) await api.unindexNote(n.path);

    await loadNotes();
    emitEvent('vault:synced', { total: onDisk.length });
    return { reread: changed.length, removed: gone.length };
  } finally {
    syncing.value = false;
  }
}

/**
 * mtime of the last save MADE BY THE APP, per file. The watcher also fires
 * for our own writes; without this every save (at every pause in typing)
 * would turn into one extra reindex and a false "changed outside".
 */
const echoes = new Map<string, number>();

async function reindex(paths: string[]): Promise<void> {
  const external: string[] = [];
  for (const p of new Set(paths)) {
    try {
      if (!(await vault.fileExists(p))) {
        await api.unindexNote(p);
        external.push(p);
        continue;
      }
      const a = await vault.info(p);
      if (echoes.get(p) === a.mtime) continue;
      await api.indexNote(buildIndexEntry(p, await vault.readFile(p), a));
      external.push(p);
    } catch (e) {
      console.warn('[vault] reindex failed', p, e);
    }
  }
  if (!external.length) return;
  await loadNotes();
  for (const p of external) emitEvent('note:external', { path: p });
}

// ── read and write ────────────────────────────────────────────────────────

export async function readNote(path: string): Promise<string> {
  return vault.readFile(path);
}

export async function saveNote(path: string, text: string): Promise<void> {
  const a = await vault.writeFile(path, text);
  echoes.set(path, a.mtime);
  await api.indexNote(buildIndexEntry(path, text, a));
  await loadNotes();
  emitEvent('note:saved', { path, text });
}

/** Unquoted YAML when possible, quoted when needed — the way Obsidian writes it. */
function yamlValue(v: string): string {
  return /^[\p{L}\p{N} _.\-]+$/u.test(v) ? v : JSON.stringify(v);
}

/**
 * Creates the note and returns its path. A repeated name gets a suffix instead
 * of overwriting: creating must never destroy what already exists.
 *
 * The title is the FILE NAME, with no `# ` repeating it in the body — Obsidian's
 * convention ("inline title"). One title, in one place: renaming the file
 * renames the note.
 */
export async function createNote(
  title: string,
  opts: { folder?: string; project?: string | null; body?: string } = {},
): Promise<string> {
  const base = toFileName(title).replace(/\.md$/, '');
  const folder = opts.folder ? `${opts.folder.replace(/\/+$/, '')}/` : '';
  let path = `${folder}${base}.md`;
  for (let i = 2; await vault.fileExists(path); i++) path = `${folder}${base} ${i}.md`;

  const fm = opts.project ? `---\nproject: ${yamlValue(opts.project)}\n---\n` : '';
  await saveNote(path, `${fm}${opts.body ?? ''}`);
  emitEvent('note:created', { path });
  return path;
}

/**
 * Deleting MOVES the note to `.trash/` inside the vault — it's what Obsidian does
 * by default, and the index ignores that folder. Truly deleting a note someone
 * wrote is too irreversible for a single click.
 */
export async function deleteNote(path: string): Promise<void> {
  let dest = `.trash/${noteName(path)}.md`;
  for (let i = 2; await vault.fileExists(dest); i++) dest = `.trash/${noteName(path)} ${i}.md`;
  await vault.renameFile(path, dest);
  await api.unindexNote(path);
  await loadNotes();
  emitEvent('note:deleted', { path });
}

/**
 * Renames the file AND rewrites the `[[links]]` that pointed to it.
 * Without the second part, every rename leaves a trail of dead links.
 */
export async function renameNote(path: string, newName: string): Promise<string> {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const newPath = `${folder}${toFileName(newName)}`;
  if (newPath === path) return path;
  if (newPath.toLowerCase() !== path.toLowerCase() && await vault.fileExists(newPath)) {
    throw new Error(`A note named ${noteName(newPath)} already exists.`);
  }

  // Who links to the OLD name — this has to be asked before anything moves.
  const oldTargets = [normalizeTarget(noteName(path)), normalizeTarget(path)];
  const linkers = await api.backlinks(path, oldTargets[0], oldTargets[1]);

  await vault.renameFile(path, newPath);
  await api.renameInIndex(path, newPath);
  const a = await vault.info(newPath);
  echoes.set(newPath, a.mtime);
  // Reindex the note itself: with no `# ` in the body, the title IS the file name,
  // and the index would keep showing the old name.
  await api.indexNote(buildIndexEntry(newPath, await vault.readFile(newPath), a));

  const newTarget = noteName(newPath);
  for (const n of linkers) {
    const text = await vault.readFile(n.path);
    const rewritten = retargetLinks(text, oldTargets, newTarget);
    if (rewritten !== text) await saveNote(n.path, rewritten);
  }

  await loadNotes();
  emitEvent('note:renamed', { from: path, to: newPath });
  return newPath;
}

// ── links ─────────────────────────────────────────────────────────────────

/**
 * Which note a `[[target]]` points to. Same rule as Obsidian: full path
 * first; otherwise, the file name in any folder — and, if two share the
 * same name, the one closest to the root.
 */
export function resolve(target: string): NoteSummary | null {
  const t = normalizeTarget(target);
  if (!t) return null;
  const byPath = notes.value.find((n) => n.path.replace(/\.md$/i, '').toLowerCase() === t);
  if (byPath) return byPath;
  return notes.value
    .filter((n) => noteName(n.path).toLowerCase() === t)
    .sort((x, y) => x.path.length - y.path.length)[0] ?? null;
}

export async function listBacklinks(path: string): Promise<NoteSummary[]> {
  return api.backlinks(path, normalizeTarget(noteName(path)), normalizeTarget(path));
}

/**
 * Follows a link: opens the note if it exists; if not, CREATES it — that's how
 * Obsidian makes it cheap to write `[[New idea]]` before the note exists.
 */
export async function followLink(target: string, sourceFolder = ''): Promise<string> {
  const found = resolve(target);
  if (found) return found.path;
  const name = target.split('|')[0].split('#')[0].trim();
  const hasFolder = name.includes('/');
  return createNote(hasFolder ? noteName(name) : name, {
    folder: hasFolder ? name.slice(0, name.lastIndexOf('/')) : sourceFolder,
  });
}

// ── vault ─────────────────────────────────────────────────────────────────

const WELCOME = `This is your vault. Each note is a \`.md\` file in this folder — you can
open it with Obsidian, version it with git, sync it to the cloud.

## Linking
Write [[My first note]] — the link exists before the note does. Click it
and the note is created. Notes that link to a note show up below it.

## Linking to a project
Create the note from the project's screen, or write at the top:

\`\`\`
---
project: CODE
---
\`\`\`

## Search
**Ctrl+K** searches notes, tasks and projects at the same time.
`;

/** Switching folders: the previous vault's index is worthless in the new one. */
async function switchTo(path: string | null, previous: string | null): Promise<boolean> {
  if (!path) return false;
  if (path !== previous) await api.clearIndex();
  await openVault();
  return true;
}

export async function pickVault(): Promise<boolean> {
  const previous = vaultPath.value;
  return switchTo(await vault.pickFolder(), previous);
}

export async function createDefaultVault(): Promise<boolean> {
  const previous = vaultPath.value;
  const ok = await switchTo(await vault.createDefaultVault(), previous);
  if (ok && !notes.value.length) await createNote('Welcome', { body: WELCOME });
  return ok;
}
