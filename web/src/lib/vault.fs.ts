// The ONLY layer that touches files. Same role db.sql.ts has for SQL: no
// component imports @tauri-apps/plugin-fs. Paths going in and out of here are
// RELATIVE to the vault root and always use '/', on any OS.
//
// The folder is picked in the system dialog. The dialog plugin grants access
// to it in the fs scope (plugins-workspace, dialog/src/commands.rs:
// `s.allow_directory(&path, options.recursive)`), and persisted-scope keeps
// that across restarts. Without `recursive: true` in open(), only the root
// folder would be allowed and no subfolder would open.

import {
  exists, mkdir, readDir, readTextFile, remove, rename, stat, watch, writeTextFile,
} from '@tauri-apps/plugin-fs';
import { documentDir, sep } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { getMeta, setMeta } from './db';

export interface VaultFile {
  path: string;
  /** ms since the epoch. */
  mtime: number;
  size: number;
}

/**
 * Folders that never enter the index. `.obsidian` and `.bancada` are app
 * config; `.trash` is Obsidian's trash — a note in there was deleted.
 */
const IGNORED_DIRS = new Set(['.obsidian', '.bancada', '.git', '.trash', 'node_modules', '.stfolder']);

let _root: string | null = null;

export async function getRoot(): Promise<string | null> {
  if (_root === null) _root = await getMeta('vault_path');
  return _root;
}

async function setRoot(abs: string): Promise<void> {
  _root = abs;
  await setMeta('vault_path', abs);
}

/** Asks the OS for the folder. It's the only way to grant access to an arbitrary folder. */
export async function pickFolder(): Promise<string | null> {
  const p = await open({ directory: true, recursive: true, title: 'Vault folder' });
  if (typeof p !== 'string') return null;
  await setRoot(p);
  return p;
}

/**
 * New vault in Documents/Bancada. It exists for people without Obsidian: that
 * folder is allowed out of the box in capabilities/default.json, so it works
 * without going through the dialog.
 */
export async function createDefaultVault(): Promise<string> {
  const abs = `${await documentDir()}${sep()}Bancada`;
  if (!(await exists(abs))) await mkdir(abs, { recursive: true });
  await setRoot(abs);
  return abs;
}

function abs(r: string, rel: string): string {
  return `${r}${sep()}${rel.split('/').join(sep())}`;
}

async function requireRoot(): Promise<string> {
  const r = await getRoot();
  if (!r) throw new Error('No vault open.');
  return r;
}

/** Every .md in the vault, recursively. Folders are read in parallel. */
export async function listFiles(): Promise<VaultFile[]> {
  const r = await requireRoot();
  const out: VaultFile[] = [];

  async function walk(rel: string): Promise<void> {
    const entries = await readDir(rel ? abs(r, rel) : r);
    await Promise.all(entries.map(async (e) => {
      // A hidden folder is some app's config (Obsidian ignores them too).
      if (e.name.startsWith('.') || IGNORED_DIRS.has(e.name)) return;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) return walk(child);
      if (!e.isFile || !/\.md$/i.test(e.name)) return;
      const s = await stat(abs(r, child));
      out.push({ path: child, mtime: s.mtime ? new Date(s.mtime).getTime() : 0, size: s.size });
    }));
  }

  await walk('');
  return out;
}

export async function readFile(path: string): Promise<string> {
  return readTextFile(abs(await requireRoot(), path));
}

export async function info(path: string): Promise<VaultFile> {
  const s = await stat(abs(await requireRoot(), path));
  return { path, mtime: s.mtime ? new Date(s.mtime).getTime() : Date.now(), size: s.size };
}

export async function writeFile(path: string, text: string): Promise<VaultFile> {
  const r = await requireRoot();
  const dir = path.split('/').slice(0, -1).join('/');
  if (dir && !(await exists(abs(r, dir)))) await mkdir(abs(r, dir), { recursive: true });
  await writeTextFile(abs(r, path), text);
  return info(path);
}

export async function fileExists(path: string): Promise<boolean> {
  return exists(abs(await requireRoot(), path));
}

export async function deleteFile(path: string): Promise<void> {
  await remove(abs(await requireRoot(), path));
}

export async function renameFile(from: string, to: string): Promise<void> {
  const r = await requireRoot();
  const dir = to.split('/').slice(0, -1).join('/');
  if (dir && !(await exists(abs(r, dir)))) await mkdir(abs(r, dir), { recursive: true });
  await rename(abs(r, from), abs(r, to));
}

/**
 * Notifies when a .md changes FROM OUTSIDE — Obsidian, git pull, Dropbox. The
 * plugin itself batches bursts (`delayMs`): a `git checkout` that touches 300
 * files becomes one event, not 300.
 */
export async function watchVault(cb: (paths: string[]) => void): Promise<() => void> {
  const r = await requireRoot();
  const prefix = r.endsWith(sep()) ? r : r + sep();
  return watch(r, (ev) => {
    const rels = ev.paths
      .filter((p) => p.startsWith(prefix) && /\.md$/i.test(p))
      .map((p) => p.slice(prefix.length).split(sep()).join('/'))
      .filter((p) => !p.split('/').some((seg) => IGNORED_DIRS.has(seg)));
    if (rels.length) cb(rels);
  }, { recursive: true, delayMs: 400 });
}

// ── plugin files ───────────────────────────────────────────────────────────
// Plugins live INSIDE the vault, in .bancada/plugins/<id>/ — the same design
// as .obsidian/plugins/. That way they travel with the notes through git/cloud.

export async function listPluginFolders(): Promise<string[]> {
  const r = await getRoot();
  if (!r) return [];
  const base = abs(r, '.bancada/plugins');
  if (!(await exists(base))) return [];
  return (await readDir(base)).filter((e) => e.isDirectory).map((e) => e.name);
}

export async function readInternalFile(rel: string): Promise<string | null> {
  const r = await getRoot();
  if (!r) return null;
  const p = abs(r, rel);
  return (await exists(p)) ? readTextFile(p) : null;
}

export async function writeInternalFile(rel: string, text: string): Promise<void> {
  const r = await requireRoot();
  const dir = rel.split('/').slice(0, -1).join('/');
  if (dir && !(await exists(abs(r, dir)))) await mkdir(abs(r, dir), { recursive: true });
  await writeTextFile(abs(r, rel), text);
}
