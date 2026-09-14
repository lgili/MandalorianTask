// Plugin lifecycle: discover, validate, enable, disable.
//
// TWO KINDS:
//   core        — ship with the app (Daily note, Note tasks, Graph). They use
//                 the SAME API as a third-party plugin: if it were not enough
//                 for them, it would not be enough for anyone.
//   community   — folders in <vault>/.bancada/plugins/<id>/ with manifest.json
//                 and main.js. They run with full access to the app, as in Obsidian.
//
// SECURITY — where we diverge from Obsidian on purpose:
// "Trust this vault" is saved IN THE APP (SQLite meta, per vault path),
// never in a file inside the vault. If it lived in the vault, a vault cloned
// from someone else would arrive with plugins already enabled and run code on
// the first open. Here, new vault = restricted mode, always.

import { ref } from 'vue';
import type { PluginDefinition, PluginManifest } from './types';
import { createPluginApi } from './api';
import { validateManifest } from './validation';
import * as api from '../db';
import * as vault from '../vault';
import { vaultPath } from '../notes';
import { CORE_PLUGINS } from './core';

export interface PluginState {
  manifest: PluginManifest;
  origin: 'core' | 'community';
  enabled: boolean;
  error: string | null;
}

export const plugins = ref<PluginState[]>([]);
/** Restricted mode: community plugins do not load. Per vault. */
export const restricted = ref(true);

interface LivePlugin { disposers: Array<() => void>; instance: PluginDefinition }
const live = new Map<string, LivePlugin>();

// ── configuration ─────────────────────────────────────────────────────────

interface VaultConfig { trusted: boolean; enabled: string[] }
let coreDisabled = new Set<string>();
let vaultConfig: VaultConfig = { trusted: false, enabled: [] };

const vaultKey = () => `plugins_vault:${vaultPath.value ?? ''}`;

async function loadConfig(): Promise<void> {
  try { coreDisabled = new Set(JSON.parse((await api.getMeta('plugins_core_off')) ?? '[]')); } catch { coreDisabled = new Set(); }
  try { vaultConfig = { trusted: false, enabled: [], ...JSON.parse((await api.getMeta(vaultKey())) ?? '{}') }; } catch { vaultConfig = { trusted: false, enabled: [] }; }
  restricted.value = !vaultConfig.trusted;
}
const saveCoreConfig = () => api.setMeta('plugins_core_off', JSON.stringify([...coreDisabled]));
const saveVaultConfig = () => api.setMeta(vaultKey(), JSON.stringify(vaultConfig));

// ── enable and disable ────────────────────────────────────────────────────

function stateOf(id: string): PluginState | undefined {
  return plugins.value.find((p) => p.manifest.id === id);
}

function instantiate(def: unknown): PluginDefinition {
  // accepts an object { onload } or a class whose instances have onload
  if (typeof def === 'function') return new (def as new () => PluginDefinition)();
  if (def && typeof (def as PluginDefinition).onload === 'function') return def as PluginDefinition;
  throw new Error('main.js must export default { onload(bancada) { … } }');
}

async function activate(m: PluginManifest, def: unknown, css: string | null): Promise<void> {
  const s = stateOf(m.id)!;
  const disposers: Array<() => void> = [];
  try {
    const instance = instantiate(def);
    const b = createPluginApi(m, disposers);
    if (css) b.ui.addStyle(css);
    await instance.onload(b);
    live.set(m.id, { disposers, instance });
    s.enabled = true;
    s.error = null;
  } catch (err) {
    // A plugin that blows up in onload leaves nothing registered behind.
    for (const f of disposers.reverse()) { try { f(); } catch { /* keep going */ } }
    s.enabled = false;
    s.error = err instanceof Error ? err.message : String(err);
    console.error(`[plugin ${m.id}]`, err);
  }
}

function deactivate(id: string): void {
  const l = live.get(id);
  const s = stateOf(id);
  if (s) s.enabled = false;
  if (!l) return;
  try { l.instance.onunload?.(); } catch (err) { console.error(`[plugin ${id}] onunload`, err); }
  for (const f of l.disposers.reverse()) { try { f(); } catch { /* keep going */ } }
  live.delete(id);
}

/**
 * Loads main.js as an ES module from a Blob. The app's CSP is null
 * (tauri.conf.json), so `import()` of a blob: URL works in the WebView.
 */
async function importFromVault(id: string): Promise<{ def: unknown; css: string | null }> {
  const code = await vault.readInternalFile(`.bancada/plugins/${id}/main.js`);
  if (!code) throw new Error('main.js not found');
  const css = await vault.readInternalFile(`.bancada/plugins/${id}/styles.css`);
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    return { def: mod.default, css };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── discovery ─────────────────────────────────────────────────────────────

/**
 * The example plugin used to be `destaca-todo`, with a Portuguese manifest
 * (`nome`/`versao`) that the current validator rejects. Migration v4 already
 * renamed the id in the vault's `enabled` list; this puts the matching folder
 * in place, so a vault that had the example enabled keeps it working. The old
 * folder is left on disk (it's the user's vault) and ignored by discovery.
 */
const LEGACY_EXAMPLE_FOLDER = 'destaca-todo';

async function upgradeLegacyExample(): Promise<void> {
  const folders = await vault.listPluginFolders();
  const { EXAMPLE_PLUGIN } = await import('./example');
  if (!folders.includes(LEGACY_EXAMPLE_FOLDER) || folders.includes(EXAMPLE_PLUGIN.id)) return;
  for (const [name, content] of Object.entries(EXAMPLE_PLUGIN.files)) {
    await vault.writeInternalFile(`.bancada/plugins/${EXAMPLE_PLUGIN.id}/${name}`, content);
  }
}

async function discoverCommunity(): Promise<void> {
  const found: PluginState[] = [];
  for (const folder of await vault.listPluginFolders()) {
    if (folder === LEGACY_EXAMPLE_FOLDER) continue;
    const raw = await vault.readInternalFile(`.bancada/plugins/${folder}/manifest.json`);
    let manifest: PluginManifest;
    let error: string | null = null;
    try {
      manifest = validateManifest(JSON.parse(raw ?? 'null'), folder);
    } catch (e) {
      manifest = { id: folder, name: folder, version: '?' };
      error = e instanceof Error ? e.message : String(e);
    }
    found.push({ manifest, origin: 'community', enabled: false, error });
  }
  plugins.value = [
    ...plugins.value.filter((p) => p.origin === 'core'),
    ...found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'en')),
  ];
}

async function enableCommunity(id: string): Promise<void> {
  const s = stateOf(id);
  if (!s || s.origin !== 'community' || s.enabled) return;
  if (s.manifest.version === '?') return;   // invalid manifest: the error is already in the state
  try {
    const { def, css } = await importFromVault(id);
    await activate(s.manifest, def, css);
  } catch (err) {
    s.error = err instanceof Error ? err.message : String(err);
  }
}

// ── this module's public API ──────────────────────────────────────────────

/** Called after the vault opens. Idempotent: can run on every switch. */
export async function initPlugins(): Promise<void> {
  for (const id of [...live.keys()]) deactivate(id);
  plugins.value = CORE_PLUGINS.map((c) => ({ manifest: c.manifest, origin: 'core' as const, enabled: false, error: null }));
  await loadConfig();

  for (const c of CORE_PLUGINS) {
    if (!coreDisabled.has(c.manifest.id)) await activate(c.manifest, c.definition, null);
  }
  if (!vaultPath.value) return;
  await upgradeLegacyExample();
  await discoverCommunity();
  if (!restricted.value) for (const id of vaultConfig.enabled) await enableCommunity(id);
}

export async function setPluginEnabled(id: string, enable: boolean): Promise<void> {
  const s = stateOf(id);
  if (!s) return;
  if (s.origin === 'core') {
    const c = CORE_PLUGINS.find((x) => x.manifest.id === id)!;
    if (enable) { coreDisabled.delete(id); await activate(c.manifest, c.definition, null); }
    else { coreDisabled.add(id); deactivate(id); }
    await saveCoreConfig();
    return;
  }
  if (enable) {
    if (restricted.value) return;
    await enableCommunity(id);
    if (stateOf(id)?.enabled) vaultConfig.enabled = [...new Set([...vaultConfig.enabled, id])];
  } else {
    deactivate(id);
    vaultConfig.enabled = vaultConfig.enabled.filter((x) => x !== id);
  }
  await saveVaultConfig();
}

/** Leaving restricted mode means trusting THIS vault — a decision saved in the app. */
export async function setRestricted(on: boolean): Promise<void> {
  restricted.value = on;
  vaultConfig.trusted = !on;
  if (on) for (const p of plugins.value) if (p.origin === 'community') deactivate(p.manifest.id);
  await saveVaultConfig();
}

/** Re-reads the plugins folder (installed a new one, edited a main.js). */
export async function reloadCommunityPlugins(): Promise<void> {
  for (const p of plugins.value) if (p.origin === 'community') deactivate(p.manifest.id);
  await discoverCommunity();
  if (!restricted.value) for (const id of vaultConfig.enabled) await enableCommunity(id);
}

/** Copies the example plugin into the vault — the quick way to see one working. */
export async function installExamplePlugin(): Promise<string> {
  const { EXAMPLE_PLUGIN } = await import('./example');
  for (const [name, content] of Object.entries(EXAMPLE_PLUGIN.files)) {
    await vault.writeInternalFile(`.bancada/plugins/${EXAMPLE_PLUGIN.id}/${name}`, content);
  }
  await reloadCommunityPlugins();
  return EXAMPLE_PLUGIN.id;
}
