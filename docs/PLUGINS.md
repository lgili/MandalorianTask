# Bancada plugins

A plugin is a folder with two files. It gets access to your notes, your tasks, the
board and — something no Obsidian plugin has — **time**: it knows when a task moves
into *Doing* and when the work session stops.

- [In 5 minutes](#in-5-minutes)
- [Structure](#structure)
- [The API](#the-api)
- [Events](#events)
- [Editor extension](#editor-extension)
- [Panels](#panels)
- [Styles](#styles)
- [Security](#security)
- [Version and compatibility](#version-and-compatibility)
- [TypeScript](#typescript)
- [Debugging](#debugging)

---

## In 5 minutes

1. In the vault, create `.bancada/plugins/hello/`.
2. Inside it, `manifest.json`:

   ```json
   { "id": "hello", "name": "Hello", "version": "1.0.0" }
   ```

3. And `main.js`:

   ```js
   export default {
     onload(bancada) {
       bancada.commands.add({
         id: 'say-hello',
         name: 'Say hello',
         run() {
           const n = bancada.tasks.list().filter((t) => t.status === 'doing').length;
           bancada.ui.notice(`Hello! ${n} task(s) in progress.`);
         },
       });
     },
   };
   ```

4. **Settings → Plugins → Turn off restricted mode → Scan again**, and enable *Hello*.
5. **Ctrl+P** → "Say hello".

A complete example — editor extension, command, reading and writing notes, CSS — is in
[`examples/plugins/highlight-todo/`](../examples/plugins/highlight-todo/). Settings has a button that
installs it into your vault.

---

## Structure

```
<vault>/.bancada/plugins/<id>/
├── manifest.json   required
├── main.js         required — ES module
├── styles.css      optional — injected while the plugin is enabled
└── data.json       created by the plugin itself via bancada.data
```

Plugins live **inside the vault**, like Obsidian's in `.obsidian/plugins/`: they travel with
the notes to git, the cloud, the other computer.

### manifest.json

| field | required | |
|---|---|---|
| `id` | yes | lowercase letters, digits and hyphens, 2 to 49 characters. **Same as the folder name.** |
| `name` | yes | what shows up in Settings and in the palette |
| `version` | yes | your plugin's version |
| `description` | no | one line |
| `author` | no | |
| `minApiVersion` | no | the API version the plugin requires — see [compatibility](#version-and-compatibility) |

### main.js

An ES module, **with no `import`** — everything arrives through the `bancada` object. Export as `default` an
object with `onload`, or a class whose instances have `onload`:

```js
export default {
  async onload(bancada) { /* register whatever you need */ },
  onunload() { /* optional */ },
};
```

**You don't need to undo anything in `onunload`.** Every command, listener, panel, extension and
style registered through the API is removed on its own when the plugin is disabled. `onunload` exists for
what you did *outside* the API (a `setInterval`, for example) — and for that there is also
`bancada.onUnload(fn)`.

If `onload` throws, the plugin is not enabled, whatever it had already registered is undone, and the
message shows up in Settings → Plugins.

---

## The API

The full contract, with documentation for every field, is in
[`web/src/lib/plugins/types.ts`](../web/src/lib/plugins/types.ts). The data a plugin receives
are **the API's own types** (`NoteInfo`, `TaskInfo`…), not the database's internal types — the app
can change inside without breaking plugins.

| area | what it has |
|---|---|
| `bancada.commands` | `add({ id, name, run })` · `run(id)` |
| `bancada.events` | `on(name, fn)` — see [events](#events) |
| `bancada.notes` | `list()` · `read(path)` · `write(path, text)` · `create(title, { folder, project, body })` · `exists(path)` · `open(path)` · `active()` · `search(term)` · `links()` · `resolve(target)` |
| `bancada.tasks` | `list()` · `create({ title, project, due, status })` · `move(id, to)` · `open(id)` · `running()` · `sessionsOn(day?)` |
| `bancada.projects` | `list()` |
| `bancada.editor` | `registerExtension(ext)` — see [editor extension](#editor-extension) |
| `bancada.cm` | the app's CodeMirror 6 modules: `view`, `state`, `language` |
| `bancada.ui` | `notice(message, tone)` · `addPanel({ id, title, mount })` · `openPanel(id)` · `addStyle(css)` |
| `bancada.data` | `load()` · `save(obj)` — stored in `data.json` in the plugin folder |
| `bancada.onUnload(fn)` | extra cleanup |

Note paths are **relative to the vault, always with `/`**: `'Technical/RCD snubber.md'`.
A path with `..` is refused.

`notes.write` writes the file **and** reindexes — search and backlinks already see the change.
If the note is open in the editor, the editor adopts the new text.

---

## Events

```js
bancada.events.on('session:started', ({ task, title }) => {
  bancada.ui.notice(`Focus on: ${title}`);
});
```

| event | payload |
|---|---|
| `note:opened` | `{ path }` |
| `note:saved` | `{ path, text }` |
| `note:created` · `note:deleted` | `{ path }` |
| `note:renamed` | `{ from, to }` |
| `note:external` | `{ path }` — changed **outside** the app (Obsidian, git, Dropbox) |
| `vault:synced` | `{ total }` |
| `task:created` | `{ id, title, project }` |
| `task:moved` | `{ id, from, to }` |
| **`session:started`** | `{ task, title }` — work started |
| **`session:stopped`** | `{ task }` — it stopped (pause, completion, or another task started) |

The two session events are the reason for a plugin to live here and not in Obsidian: with them you can
build a pomodoro that respects the board, calendar integration, automatic "do not disturb",
a focus report.

A listener that throws neither brings the app down nor silences the other listeners.

---

## Editor extension

The notes editor is CodeMirror 6. A plugin **cannot import CodeMirror** (there is no
module resolution for a file loaded from the vault) — and even if it could, two copies
of CodeMirror don't talk to each other. That is why the classes arrive in `bancada.cm`:

```js
const { ViewPlugin, Decoration, MatchDecorator } = bancada.cm.view;

const painter = new MatchDecorator({
  regexp: /\bURGENT\b/g,
  decoration: () => Decoration.mark({ class: 'my-urgent' }),
});

bancada.editor.registerExtension(ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = painter.createDeco(view); }
  update(u) { this.decorations = painter.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations }));
```

Enabling or disabling the plugin reconfigures the open editor right away, without reloading the note.

**Golden rule of the Bancada editor:** a decoration never changes the text. The file on disk has
to stay byte for byte what the person typed — Obsidian opens the same vault.

---

## Panels

A panel is a full screen of the plugin, listed in the sidebar. You get an empty element
and do whatever you want inside it: plain DOM, canvas, or your own framework bundled along.

```js
bancada.ui.addPanel({
  id: 'summary',
  title: 'Weekly summary',
  mount(el) {
    el.innerHTML = '<h2 style="padding:24px">Loading…</h2>';
    const t = setInterval(() => { /* … */ }, 1000);
    return () => clearInterval(t);   // cleanup when leaving the panel
  },
});
```

The **Graph** core plugin ([`web/src/lib/plugins/core/graph.ts`](../web/src/lib/plugins/core/graph.ts))
is a panel written with the public API only — SVG and DOM, no library.

---

## Styles

Use the app's color variables and the plugin follows all three themes on its own:

```css
.my-urgent { color: rgb(var(--danger)); background: rgb(var(--danger) / .12); }
```

| variable | role |
|---|---|
| `--fg` · `--fg-muted` · `--fg-subtle` | text |
| `--surface-1` · `--surface-2` · `--surface` · `--surface-3` | backgrounds, from the base to hover |
| `--rule` · `--rule-strong` | borders |
| `--accent` · `--accent-ink` | primary action (`-ink` is for text) |
| `--ok` · `--warn` · `--danger` | states |
| `--p1` … `--p6` | project colors (the `color` of `ProjectInfo`) |

The values are RGB triplets — always `rgb(var(--x))` or `rgb(var(--x) / .2)`.

---

## Security

**A plugin runs with full access to the app**: it reads and writes notes, creates and moves tasks, and lives on the
same page as the database. It is the same model as Obsidian's. Only install what you trust.

What Bancada does to make this a conscious choice:

- **Restricted mode is the default.** Community plugins don't load until you turn it off — with an
  explicit warning in front of you.
- **Trust is per vault and stored in the app**, not in a file in the vault. Here we diverge
  from Obsidian on purpose: if it lived in the vault, a vault cloned from someone else would arrive with plugins
  already enabled and would run code the first time it was opened. In Bancada, a new vault opens restricted, always.
- A plugin that fails to enable is not left half registered: everything it had already done is undone.
- The manifest `id` is validated (no `/`, no `..`) and must be the folder name.

---

## Version and compatibility

The API has a version (`bancada.apiVersion`, currently **1.0.0**). The rule:

- same **major number** = compatible; a plugin built for 1.x runs on any 1.y with y ≥ x;
- a changed major number = the contract broke; an old plugin is refused with a clear message.

Declare in the manifest the lowest version you use: `"minApiVersion": "1.0.0"`.

---

## TypeScript

Copy [`web/src/lib/plugins/types.ts`](../web/src/lib/plugins/types.ts) into your project as
`bancada.d.ts`, write the plugin in TS and compile it to an ES module `main.js`:

```ts
import type { Bancada, PluginDefinition } from './bancada';

const plugin: PluginDefinition = {
  onload(b: Bancada) {
    b.events.on('task:moved', ({ id, to }) => { /* … */ });
  },
};
export default plugin;
```

`types.ts` imports nothing from inside the app on purpose — it is the contract, on its own.

---

## Debugging

- The error of a plugin that won't enable shows up in **Settings → Plugins**, under its name.
- In `pnpm dev`, the WebView DevTools open with right-click → *Inspect*; the plugin's `console.log`
  shows up there.
- Edited `main.js`? **Settings → Plugins → Scan again** reloads it without restarting the app.
- To iterate without Tauri: `pnpm dev:mock` runs the app in the browser with an in-memory sample
  vault, and the *Install the example plugin* button works there too.
