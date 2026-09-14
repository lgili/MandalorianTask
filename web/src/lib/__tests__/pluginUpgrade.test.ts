import { beforeEach, describe, expect, it, vi } from 'vitest';

// initPlugins() against an in-memory vault. Only the pieces it touches are
// faked: the vault files, the meta table, the open vault path.
const files = new Map<string, string>();
const meta = new Map<string, string>();

vi.mock('../vault', () => ({
  listPluginFolders: async () =>
    [...new Set([...files.keys()].map((p) => p.split('/')[2]))].sort(),
  readInternalFile: async (path: string) => files.get(path) ?? null,
  writeInternalFile: async (path: string, content: string) => { files.set(path, content); },
}));
vi.mock('../db', () => ({
  getMeta: async (key: string) => meta.get(key) ?? null,
  setMeta: async (key: string, value: string) => { meta.set(key, value); },
}));
vi.mock('../notes', async () => {
  const { ref } = await import('vue');
  return { vaultPath: ref('C:/vault') };
});
vi.mock('../plugins/core', () => ({ CORE_PLUGINS: [] }));
vi.mock('../plugins/api', () => ({ createPluginApi: () => ({ ui: { addStyle: () => {} } }) }));

const { initPlugins, plugins } = await import('../plugins');

describe('upgrading a vault that has the pre-English example plugin', () => {
  beforeEach(() => {
    files.clear();
    meta.clear();
    // What commit 0c2ee88's "Install the example plugin" left in the vault…
    files.set('.bancada/plugins/destaca-todo/manifest.json', '{"id":"destaca-todo","nome":"Destaca TODO","versao":"1.0.0"}');
    files.set('.bancada/plugins/destaca-todo/main.js', 'export default { aoLigar() {} }');
    // …and what migration v4 turned its stored settings into.
    meta.set('plugins_vault:C:/vault', '{"trusted":true,"enabled":["highlight-todo"]}');
  });

  it('installs highlight-todo, so the id v4 put in `enabled` exists', async () => {
    await initPlugins();
    expect(files.has('.bancada/plugins/highlight-todo/manifest.json')).toBe(true);
    expect(files.has('.bancada/plugins/highlight-todo/main.js')).toBe(true);
    const row = plugins.value.find((p) => p.manifest.id === 'highlight-todo');
    expect(row?.manifest.version).not.toBe('?');
  });

  it('hides the old folder instead of showing a broken row in Settings', async () => {
    await initPlugins();
    expect(plugins.value.map((p) => p.manifest.id)).not.toContain('destaca-todo');
    expect(files.has('.bancada/plugins/destaca-todo/main.js')).toBe(true);   // the user's files stay
  });

  it("doesn't overwrite a highlight-todo the user already has", async () => {
    files.set('.bancada/plugins/highlight-todo/main.js', '// edited by the user');
    await initPlugins();
    expect(files.get('.bancada/plugins/highlight-todo/main.js')).toBe('// edited by the user');
  });
});
