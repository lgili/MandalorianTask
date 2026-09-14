# Bancada

A local-first work log: where the hours went, which meetings came from the calendar,
and your work notes in a markdown vault.

**It is not a productivity app — it is a measuring instrument.** You don't track time,
you confirm the day the app has already put together.

## Status

`v0.3` — Projects, unified capture, Board (kanban), Today (timeline), weekly report,
and **Notes**: an Obsidian-compatible markdown vault, with `[[links]]`, backlinks and search.
Google Calendar is still slated for v0.2.

## How tasks get added

A single creation surface, callable from any screen with **`n`**. In the line:

| token | does |
|---|---|
| `#` | opens the project list — and its last row **creates** the project you typed |
| `!` | due: `today` · `thu` · `12/09` · `+3d` |
| `@` | type: `meeting` · `admin` |

`enter` adds · `ctrl+enter` adds and sends to the queue. Inside a project, being on its screen
**is** the assignment — the capture line starts out linked to it.

A new project asks only for the name. The color is picked automatically from the palette (the least used among active projects),
because asking for a color in the middle of a meeting is the friction that leaves the field empty forever.

## Running

Prerequisites: Node 20+, pnpm 9+, stable Rust (`rustup`), and Tauri 2's native dependencies
(Windows: WebView2 + VS Build Tools; macOS: Xcode CLT).

```bash
pnpm install
pnpm dev            # vite + tauri dev
```

Windows (PowerShell):

```powershell
pnpm install
.\scripts\dev.ps1
```

## Native build

```bash
pnpm tauri icon app-icon.png   # once, generates src-tauri/icons/
pnpm build                     # macOS: .app + .dmg   |   Windows: -setup.exe (NSIS)
```

CI: a `v*` tag triggers `.github/workflows/build.yml`, which builds macOS and Windows and attaches
the installers to the Release.

## Notes

A vault is a folder of `.md` files — the same one Obsidian opens. **The file is the source of truth**:
SQLite keeps only an index (tables `notes`, `notes_fts`, `note_links`) that can be deleted and
rebuilt. Nothing the app shows about a note comes from anywhere but the file itself.

| in the editor | does |
|---|---|
| `[[` | lists the notes; the link can point to a note that doesn't exist yet — clicking creates it |
| `#tag` | becomes a pill; clicking searches for the tag |
| `- [ ]` | becomes a clickable checkbox |
| `project: CODE` in the frontmatter | links the note to the project — it shows up on that project's screen (the legacy key `projeto:`, written by older versions, is still read) |

**Ctrl+K** searches notes, projects and tasks at once. **Ctrl+P** lists the commands.

The editor is CodeMirror 6 in *live preview* mode: the syntax disappears outside the cursor's line, but the
text on disk is never rewritten for display. Renaming a note rewrites the `[[links]]` that
pointed to it. Deleting moves it to `.trash/` inside the vault, like Obsidian does.

## Plugins

Folders in `<vault>/.bancada/plugins/<id>/` with `manifest.json` and `main.js`, as in Obsidian.
A plugin registers commands (Ctrl+P), panels, editor extensions and styles, and listens to events —
including **time** events (`session:started`, `session:stopped`), which no notes app has.

Three ship with the app and use only the public API, the same one a third party gets:

| plugin | does |
|---|---|
| **Daily note** | opens `Daily/YYYY-MM-DD.md`, pre-filled with the sessions the board measured today |
| **Note tasks** | the open note's `- [ ]` checkboxes become tasks in the note's project, without duplicates |
| **Graph** | every note and link, colored by project; a link to a missing note becomes a ghost node |

Community plugins start in **restricted mode**, and trust is per vault, stored in the app —
a vault cloned from someone else never arrives with a plugin enabled. Full guide for plugin authors:
**[docs/PLUGINS.md](docs/PLUGINS.md)**. Ready-made example: [`examples/plugins/highlight-todo/`](examples/plugins/highlight-todo/).

## Where the data lives

| What | Where |
|---|---|
| Database | `%APPDATA%\com.lgili.bancada\bancada.db` · `~/Library/Application Support/com.lgili.bancada/bancada.db` |
| Notes | the folder you choose — it can be your Obsidian vault. The path is kept in `meta.vault_path` |
| Google token (v0.2) | a `0600` file in the same appdata — never in `localStorage` |

The database is a file. Backup is copying the file.

## Conventions

- **No component writes SQL.** Everything goes through `src/lib/db.ts`, the only layer
  that talks to the database — the same role `lib/api.ts` plays in the eBOM generator.
- **No component touches files.** Everything goes through `src/lib/vault.ts`; and anything that writes a note
  goes through `src/lib/notes.ts`, which keeps disk, index and events moving together. In
  `dev:mock` both (`db` and `vault`) become in-memory versions through the same Vite alias.
- **`web/src/lib/plugins/types.ts` is a public contract.** It imports nothing from inside the app and
  exposes its own DTOs. Changing anything there that breaks plugins requires bumping the major number of
  `API_VERSION`. Core plugins may only use what is in it — if the API isn't enough for
  them, it isn't enough for anyone.
- **No component runs regex over markdown.** Frontmatter, title, links and tags come from
  `src/lib/markdown.ts`, which is tested — including against a link inside a code block.
- **No component does date arithmetic.** Everything goes through `src/lib/time.ts`, which is
  tested. Time zones, day rollover and overlaps are where bugs lie silently.
- Timestamps are stored in **UTC ISO-8601**; the day boundary is computed in the local time zone.
- Routes in `routes/`, everything else in `components/`. A route file past ~300
  lines means a component should have been extracted.
- **No screen creates a task on its own.** Everything goes through `components/CaptureLine.vue`.
  There used to be four creation surfaces with different grammars — the most prominent button
  in the app created nothing, and the Board's field produced orphan tasks.
- **Font size comes from the scale**, the eight steps in `style.css` (`--t-micro` to `--t-display`).
  There were 22 sizes, twelve of them between 9 and 15px: a 0.5px step is neither visible nor renderable.
- **`projects.color` stores the token `p1`..`p6`**, not hex — the color has to change with the theme.
  (The v1 migration comment says "hex without '#'"; it has been wrong since day one and the
  migration cannot be edited.)
- **A progress bar only exists if you can say the denominator out loud.** If you can't,
  it's a number, not a chart.
