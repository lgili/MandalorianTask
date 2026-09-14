// `[[` autocomplete: the list of notes shows up while the link is being typed.
//
// This is what makes linking cheaper than not linking. Without it, writing a link
// means remembering the exact file name — and nobody does, so nobody links,
// and the vault turns into a pile of orphan notes.

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

export interface LinkOption {
  /** What goes inside the `[[ ]]` — the file name, the way Obsidian writes it. */
  target: string;
  /** Folder, to tell apart two files with the same name. */
  folder: string;
}

export function completeLinks(source: () => LinkOption[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!m) return null;
    const from = m.from + 2;
    const options: Completion[] = source().map((o) => ({
      label: o.target,
      detail: o.folder || undefined,
      type: 'text',
      apply: (view: EditorView, c: Completion, f: number, t: number) => {
        // closeBrackets already put `]]` after the cursor when `[[` was typed —
        // closing again would give `[[Note]]]]`.
        const alreadyClosed = view.state.sliceDoc(t, t + 2) === ']]';
        const text = c.label + (alreadyClosed ? '' : ']]');
        view.dispatch({
          changes: { from: f, to: t, insert: text },
          selection: { anchor: f + c.label.length + 2 },
        });
      },
    }));
    return { from, options, validFor: /^[^[\]|#\n]*$/ };
  };
}
