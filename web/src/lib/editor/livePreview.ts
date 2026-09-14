// Live preview: markdown shows up formatted, and the syntax only comes back on the
// line where the cursor is. It is Obsidian's default mode, and it is what makes a
// plain-text editor feel like a document editor without ever touching the file.
//
// One rule: TEXT IS NEVER CHANGED for display. Everything here is decoration —
// hide, mark, swap for a widget on screen. The file on disk stays byte for byte
// what the person typed, and Obsidian opens it the same.

import {
  Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { StateEffect, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** The component fires this when the note list changes (a broken link lights up). */
export const redraw = StateEffect.define<null>();

export interface LivePreviewOptions {
  /** Does the linked note exist? A link to a missing note shows muted. */
  noteExists: (target: string) => boolean;
}

// ── widgets ────────────────────────────────────────────────────────────────

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) { super(); }
  eq(o: CheckboxWidget): boolean { return o.checked === this.checked && o.pos === this.pos; }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = this.checked;
    el.className = 'cm-checkbox';
    el.setAttribute('aria-label', this.checked ? 'Uncheck' : 'Check');
    // mousedown must not move the cursor to the line — otherwise the syntax
    // shows up right at the click and the checkbox vanishes under the finger.
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

class BulletWidget extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-bullet';
    el.textContent = '•';
    return el;
  }
}

class RuleWidget extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-hr';
    return el;
  }
}

const hideDeco = Decoration.replace({});
const mark = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs });
const line = (cls: string) => Decoration.line({ class: cls });

// ── active lines ───────────────────────────────────────────────────────────

/**
 * Lines where the syntax shows raw: the ones touched by any selection. Without
 * focus, none — an idle editor shows the whole document formatted.
 */
function activeLines(view: EditorView): Set<number> {
  const s = new Set<number>();
  if (!view.hasFocus) return s;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) s.add(i);
  }
  return s;
}

/** End of the frontmatter (offset), or 0. The parser sees `---` as setext/hr. */
function frontmatterEnd(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text !== '---') return 0;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) {
    if (doc.line(i).text === '---') return doc.line(i).to;
  }
  return 0;
}

interface Build {
  all: DecorationSet;
  /**
   * Only what was HIDDEN or swapped for a widget. This is what becomes an atomic
   * range for the cursor — if the marks went in here, a whole bold word would
   * become a block the cursor jumps over in one go.
   */
  hidden: DecorationSet;
}

function build(view: EditorView, opts: LivePreviewOptions): Build {
  const active = activeLines(view);
  const doc = view.state.doc;
  const onActiveLine = (pos: number) => active.has(doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  const gone: Range<Decoration>[] = [];
  const fmEnd = frontmatterEnd(view);
  const hide = (start: number, end: number) => {
    if (start >= end) return;
    const r = hideDeco.range(start, end);
    out.push(r); gone.push(r);
  };
  const replaceWith = (w: WidgetType, start: number, end: number) => {
    const r = Decoration.replace({ widget: w }).range(start, end);
    out.push(r); gone.push(r);
  };

  // Frontmatter: a muted, monospaced block — the note's properties.
  if (fmEnd) {
    for (let i = 1; doc.line(i).to <= fmEnd; i++) {
      const l = doc.line(i);
      out.push(line(i === 1 ? 'cm-fm cm-fm-start' : l.to === fmEnd ? 'cm-fm cm-fm-end' : 'cm-fm').range(l.from));
      if (l.to === fmEnd) break;
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(n) {
        if (n.from < fmEnd) return n.to <= fmEnd ? false : undefined;
        const name = n.name;

        // headings: the line gets the class; the `#` disappear away from the cursor
        const h = name.match(/^(?:ATX|Setext)Heading(\d)$/);
        if (h) { out.push(line(`cm-h cm-h${h[1]}`).range(doc.lineAt(n.from).from)); return; }
        if (name === 'HeaderMark') {
          if (onActiveLine(n.from)) return;
          const markEnd = doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to;
          if (n.from !== markEnd) hide(n.from, markEnd);
          return;
        }

        if (name === 'StrongEmphasis') { out.push(mark('cm-strong').range(n.from, n.to)); return; }
        if (name === 'Emphasis') { out.push(mark('cm-italic').range(n.from, n.to)); return; }
        if (name === 'Strikethrough') { out.push(mark('cm-strike').range(n.from, n.to)); return; }
        if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
          if (!onActiveLine(n.from)) hide(n.from, n.to);
          return;
        }

        if (name === 'InlineCode') { out.push(mark('cm-code').range(n.from, n.to)); return; }
        if (name === 'CodeMark') {
          // Only the inline-code backtick disappears; the ``` fence of a block stays.
          if (n.node.parent?.name === 'InlineCode' && !onActiveLine(n.from)) hide(n.from, n.to);
          return;
        }
        if (name === 'FencedCode' || name === 'CodeBlock') {
          const a = doc.lineAt(n.from).number;
          const b = doc.lineAt(n.to).number;
          for (let i = a; i <= b; i++) {
            const cls = i === a ? 'cm-codeblock cm-codeblock-start' : i === b ? 'cm-codeblock cm-codeblock-end' : 'cm-codeblock';
            out.push(line(cls).range(doc.line(i).from));
          }
          return false;   // no decorating markdown inside code
        }

        if (name === 'Blockquote') {
          const a = doc.lineAt(n.from).number;
          const b = doc.lineAt(n.to).number;
          for (let i = a; i <= b; i++) out.push(line('cm-quote').range(doc.line(i).from));
          return;
        }
        if (name === 'QuoteMark') {
          if (!onActiveLine(n.from)) {
            const end = doc.sliceString(n.to, n.to + 1) === ' ' ? n.to + 1 : n.to;
            hide(n.from, end);
          }
          return;
        }

        if (name === 'HorizontalRule') {
          if (!onActiveLine(n.from)) replaceWith(new RuleWidget(), n.from, n.to);
          return;
        }

        if (name === 'TaskMarker') {
          const txt = doc.sliceString(n.from, n.to);
          const cursorInside = view.state.selection.ranges.some((r) => r.from > n.from && r.from < n.to);
          if (!cursorInside) {
            replaceWith(new CheckboxWidget(/x/i.test(txt), n.from), n.from, n.to);
          }
          if (/x/i.test(txt)) {
            const l = doc.lineAt(n.from);
            if (n.to < l.to) out.push(mark('cm-done').range(n.to, l.to));
          }
          return;
        }
        if (name === 'ListMark') {
          if (onActiveLine(n.from)) return;
          const markText = doc.sliceString(n.from, n.to);
          if (!/^[-*+]$/.test(markText)) return;   // a numbered list keeps its number
          const after = doc.sliceString(n.to, n.to + 4);
          // task item: the `- ` disappears, only the checkbox is left (like in Obsidian)
          if (/^ \[[ xX]\]/.test(after)) hide(n.from, n.to + 1);
          else replaceWith(new BulletWidget(), n.from, n.to);
          return;
        }

        if (name === 'Link') {
          out.push(mark('cm-link').range(n.from, n.to));
          if (onActiveLine(n.from)) return;
          // [text](url): the `[` disappears, and everything from `](` to `)`
          const marks: Array<{ from: number; to: number }> = [];
          for (let c = n.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'LinkMark' || c.name === 'URL' || c.name === 'LinkTitle') marks.push({ from: c.from, to: c.to });
          }
          if (marks.length >= 2 && doc.sliceString(marks[0].from, marks[0].to) === '[') {
            hide(marks[0].from, marks[0].to);
            const close = marks.find((m, i) => i > 0 && doc.sliceString(m.from, m.to) === ']');
            if (close && close.from < n.to) hide(close.from, n.to);
          }
          return false;
        }

        if (name === 'WikiLink') {
          const raw = doc.sliceString(n.from, n.to);
          const embed = raw.startsWith('!');
          const inner = raw.slice(embed ? 3 : 2, -2);
          const target = inner.split('|')[0].split('#')[0].trim();
          const exists = opts.noteExists(target);
          out.push(mark(exists ? 'cm-wikilink' : 'cm-wikilink cm-wikilink-broken', { 'data-target': target }).range(n.from, n.to));
          if (onActiveLine(n.from)) return false;
          const start = n.from + (embed ? 3 : 2);
          const pipe = inner.indexOf('|');
          // `[[target|alias]]`: show only the alias
          hide(n.from, pipe >= 0 ? start + pipe + 1 : start);
          hide(n.to - 2, n.to);
          return false;
        }
        return undefined;
      },
    });
  }

  return { all: Decoration.set(out, true), hidden: Decoration.set(gone, true) };
}

export function livePreview(opts: LivePreviewOptions) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    hidden: DecorationSet;
    constructor(view: EditorView) {
      const b = build(view, opts);
      this.decorations = b.all; this.hidden = b.hidden;
    }
    update(u: ViewUpdate): void {
      const requested = u.transactions.some((tr) => tr.effects.some((e) => e.is(redraw)));
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || requested
          || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        const b = build(u.view, opts);
        this.decorations = b.all; this.hidden = b.hidden;
      }
    }
  }, {
    decorations: (v) => v.decorations,
    // Hidden syntax becomes an atomic range: without this the cursor "enters" an
    // invisible `**` and seems to get stuck for one keystroke.
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.hidden ?? Decoration.none),
  });
}

// ── #tags ──────────────────────────────────────────────────────────────────
// Not a grammar node (CommonMark has no tags), so it goes through a regex.
// Same rule as markdown.ts: it needs at least one letter.

const tagDeco = new MatchDecorator({
  regexp: /(?<=^|[\s(])#(?=[\p{L}\p{N}_\-/]*[\p{L}_\-/])[\p{L}\p{N}_\-/]+/gu,
  decoration: (m) => mark('cm-tag', { 'data-tag': m[0].slice(1) }),
});

export const tags = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = tagDeco.createDeco(view); }
  update(u: ViewUpdate): void { this.decorations = tagDeco.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });
