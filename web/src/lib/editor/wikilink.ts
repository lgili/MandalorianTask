// `[[link]]` na gramática do parser de markdown.
//
// O CommonMark não conhece wikilink: sem isto, `[[Nota]]` vira um link de
// referência vazio e o live preview não tem nó nenhum para decorar. Roda
// ANTES do parser de Link, que também começa em '['.

import type { InlineContext, MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const ABRE = 91;   // [
const FECHA = 93;  // ]
const BANG = 33;   // !
const QUEBRA = 10; // \n

export const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: 'WikiLink', style: t.link },
    { name: 'WikiLinkMark', style: t.processingInstruction },
  ],
  parseInline: [{
    name: 'WikiLink',
    before: 'Link',
    parse(cx: InlineContext, next: number, pos: number): number {
      const ini = pos;
      let dentro = pos;
      if (next === BANG) {
        if (cx.char(pos + 1) !== ABRE || cx.char(pos + 2) !== ABRE) return -1;
        dentro = pos + 3;
      } else {
        if (next !== ABRE || cx.char(pos + 1) !== ABRE) return -1;
        dentro = pos + 2;
      }
      for (let i = dentro; i < cx.end - 1; i++) {
        const c = cx.char(i);
        if (c === QUEBRA || c === ABRE) return -1;
        if (c === FECHA && cx.char(i + 1) === FECHA) {
          if (i === dentro) return -1;   // `[[]]` não é link
          return cx.addElement(cx.elt('WikiLink', ini, i + 2, [
            cx.elt('WikiLinkMark', ini, dentro),
            cx.elt('WikiLinkMark', i, i + 2),
          ]));
        }
      }
      return -1;
    },
  }],
};
