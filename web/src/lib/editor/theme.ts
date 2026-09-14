// Editor look. Everything comes from the SAME CSS variables as the app (style.css),
// so switching the theme in Settings switches the editor with it — no second theme
// to maintain.

import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const v = (name: string, a?: number) => (a == null ? `rgb(var(--${name}))` : `rgb(var(--${name}) / ${a})`);

const SANS = '"Instrument Sans Variable", "Instrument Sans", system-ui, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Consolas, monospace';

export const editorTheme = EditorView.theme({
  '&': { color: v('fg'), backgroundColor: 'transparent', fontSize: '16px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: SANS, lineHeight: '1.7', overflow: 'visible' },
  // The scroll slack lives on the PAGE, after the backlinks — placed here it
  // pushed "Links to this note" off the screen.
  '.cm-content': { padding: '4px 0 24px', caretColor: v('accent') },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: v('accent'), borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: `${v('accent', 0.22)} !important`,
  },
  '.cm-placeholder': { color: v('fg-subtle'), fontStyle: 'normal' },

  // headings — sans, weights and sizes from the app's scale
  '.cm-h': { fontWeight: '600', letterSpacing: '-0.01em', color: v('fg') },
  '.cm-h1': { fontSize: '1.5em', lineHeight: '1.3', paddingTop: '0.6em !important' },
  '.cm-h2': { fontSize: '1.25em', lineHeight: '1.35', paddingTop: '0.5em !important' },
  '.cm-h3': { fontSize: '1.1em', paddingTop: '0.35em !important' },
  '.cm-h4, .cm-h5, .cm-h6': { fontSize: '1em', color: v('fg-muted') },

  '.cm-strong': { fontWeight: '650' },
  '.cm-italic': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: v('fg-muted') },
  '.cm-code': {
    fontFamily: MONO, fontSize: '0.86em', padding: '1px 5px', borderRadius: '4px',
    backgroundColor: v('surface-3', 0.7),
  },

  '.cm-codeblock': { fontFamily: MONO, fontSize: '0.86em', backgroundColor: v('surface-2'), padding: '0 14px !important' },
  '.cm-codeblock-start': { borderTopLeftRadius: '8px', borderTopRightRadius: '8px', paddingTop: '6px !important' },
  '.cm-codeblock-end': { borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', paddingBottom: '6px !important' },

  '.cm-quote': { borderLeft: `3px solid ${v('rule-strong')}`, paddingLeft: '14px !important', color: v('fg-muted') },

  '.cm-link': { color: v('accent-ink') },
  '.cm-wikilink': {
    color: v('accent-ink'), cursor: 'pointer',
    textDecoration: `underline ${v('accent-ink', 0.35)}`, textUnderlineOffset: '3px',
  },
  '.cm-wikilink:hover': { textDecorationColor: v('accent-ink') },
  // note that doesn't exist yet: muted and dashed — clicking creates it
  '.cm-wikilink-broken': { color: v('fg-muted'), textDecorationStyle: 'dashed' },

  '.cm-tag': {
    color: v('accent-ink'), backgroundColor: v('accent', 0.12),
    borderRadius: '999px', padding: '0 7px', fontSize: '0.88em',
  },

  '.cm-checkbox': {
    width: '15px', height: '15px', margin: '0 8px 0 2px', verticalAlign: '-2px',
    accentColor: v('accent'), cursor: 'pointer',
  },
  '.cm-done': { color: v('fg-subtle'), textDecoration: 'line-through' },
  '.cm-bullet': { color: v('fg-subtle'), display: 'inline-block', width: '0.9em' },
  '.cm-hr': { display: 'inline-block', width: '100%', borderTop: `1px solid ${v('rule-strong')}`, verticalAlign: 'middle' },

  // frontmatter: the note's "properties", kept low-key
  '.cm-fm': { fontFamily: MONO, fontSize: '0.8em', color: v('fg-subtle'), backgroundColor: v('surface-2', 0.6), padding: '0 12px !important' },
  '.cm-fm-start': { borderTopLeftRadius: '8px', borderTopRightRadius: '8px', paddingTop: '4px !important' },
  '.cm-fm-end': { borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', paddingBottom: '4px !important', marginBottom: '10px' },

  // [[ autocomplete
  '.cm-tooltip': {
    backgroundColor: v('surface'), border: `1px solid ${v('rule-strong')}`, borderRadius: '10px',
    boxShadow: `0 16px 40px -16px ${v('shadow', 0.45)}`, overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': { fontFamily: SANS, maxHeight: '280px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '5px 12px !important', fontSize: '14px', color: v('fg') },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: v('surface-3'), color: v('fg') },
  '.cm-completionDetail': { color: v('fg-subtle'), fontStyle: 'normal', fontSize: '12px', marginLeft: '8px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: v('accent-ink'), fontWeight: '600' },
  '.cm-completionIcon': { display: 'none' },
});   // no `dark: true`: the app has a light theme, and every color above already comes from the variables

/**
 * Color of the RAW syntax — what shows on the cursor line, where the live preview
 * reveals the `#`, `**` and `[[`. Markup is muted; the text is not.
 */
export const editorHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: t.processingInstruction, color: v('fg-subtle') },
  { tag: t.meta, color: v('fg-subtle') },
  { tag: t.url, color: v('fg-subtle') },
  { tag: t.heading, fontWeight: '600' },
  { tag: t.strong, fontWeight: '650' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: v('accent-ink') },
  { tag: t.monospace, fontFamily: MONO },
  { tag: t.quote, color: v('fg-muted') },
]));
