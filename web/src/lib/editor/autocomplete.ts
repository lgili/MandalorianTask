// Autocomplete de `[[`: a lista de notas aparece enquanto se digita o link.
//
// É o que torna linkar mais barato que não linkar. Sem isto, escrever um link
// exige lembrar o nome exato do arquivo — e ninguém lembra, então ninguém
// linka, e o vault vira uma pilha de notas soltas.

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

export interface OpcaoLink {
  /** O que vai dentro do `[[ ]]` — o nome do arquivo, como o Obsidian grava. */
  alvo: string;
  /** Pasta, para desambiguar dois arquivos de mesmo nome. */
  pasta: string;
}

export function completaLinks(fonte: () => OpcaoLink[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!m) return null;
    const from = m.from + 2;
    const opcoes: Completion[] = fonte().map((o) => ({
      label: o.alvo,
      detail: o.pasta || undefined,
      type: 'text',
      apply: (view: EditorView, c: Completion, f: number, t: number) => {
        // O closeBrackets já pôs `]]` depois do cursor ao digitar `[[` —
        // fechar de novo daria `[[Nota]]]]`.
        const jaFecha = view.state.sliceDoc(t, t + 2) === ']]';
        const texto = c.label + (jaFecha ? '' : ']]');
        view.dispatch({
          changes: { from: f, to: t, insert: texto },
          selection: { anchor: f + c.label.length + 2 },
        });
      },
    }));
    return { from, options: opcoes, validFor: /^[^[\]|#\n]*$/ };
  };
}
