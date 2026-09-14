// Highlight TODO — an example Bancada plugin.
//
// Shows the three most-used entry points of the API, in ~50 lines:
//   1. an editor extension (CodeMirror 6, through the classes in bancada.cm)
//   2. a command in the palette (Ctrl+P)
//   3. reading and writing notes
//
// To install by hand: copy this whole folder into <your vault>/.bancada/plugins/
// and enable it in Settings > Plugins. Full contract: docs/PLUGINS.md.
//
// It's plain JavaScript, an ES module, no imports: everything the plugin needs
// arrives through the `bancada` object. Want TypeScript? Write it in TS with the
// types from web/src/lib/plugins/types.ts and compile it to a main.js.

const KEYWORDS = /\b(TODO|FIXME|QUESTION)\b/g;
const HAS_KEYWORD = /\b(TODO|FIXME|QUESTION)\b/;

export default {
  onload(bancada) {
    // ── 1. editor: paint the words ──────────────────────────────────────
    const { MatchDecorator, ViewPlugin, Decoration } = bancada.cm.view;
    const painter = new MatchDecorator({
      regexp: KEYWORDS,
      decoration: (m) => Decoration.mark({ class: 'highlight-todo highlight-todo-' + m[1].toLowerCase() }),
    });
    bancada.editor.registerExtension(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = painter.createDeco(view); }
      update(u) { this.decorations = painter.updateDeco(u, this.decorations); }
    }, { decorations: (v) => v.decorations }));

    // ── 2 and 3. a command that reads the vault and writes a note ───────
    bancada.commands.add({
      id: 'list',
      name: "List the vault's TODOs in a note",
      async run() {
        const items = [];
        for (const note of bancada.notes.list()) {
          if (note.path === 'Open items.md') continue;
          const text = await bancada.notes.read(note.path);
          for (const line of text.split('\n')) {
            if (!HAS_KEYWORD.test(line)) continue;
            const clean = line.replace(/^\s*[-*+]\s*(\[.\]\s*)?/, '').trim();
            items.push('- ' + clean + ' — [[' + note.path.replace(/\.md$/, '') + ']]');
          }
        }
        const body = items.length ? items.join('\n') : '_No TODOs in the vault._';
        await bancada.notes.write('Open items.md', '## Open items\n\n' + body + '\n');
        bancada.notes.open('Open items.md');
        bancada.ui.notice(items.length + (items.length === 1 ? ' open item' : ' open items'));
      },
    });
  },

  // Optional. Everything registered through the API is already undone on its own.
  onunload() {},
};
