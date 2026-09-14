// `[[link]]` in the markdown parser's grammar.
//
// CommonMark knows nothing about wikilinks: without this, `[[Note]]` becomes an
// empty reference link and the live preview has no node to decorate. Runs
// BEFORE the Link parser, which also starts at '['.

import type { InlineContext, MarkdownConfig } from '@lezer/markdown';
import { tags as t } from '@lezer/highlight';

const OPEN = 91;     // [
const CLOSE = 93;    // ]
const BANG = 33;     // !
const NEWLINE = 10;  // \n

export const WikiLink: MarkdownConfig = {
  defineNodes: [
    { name: 'WikiLink', style: t.link },
    { name: 'WikiLinkMark', style: t.processingInstruction },
  ],
  parseInline: [{
    name: 'WikiLink',
    before: 'Link',
    parse(cx: InlineContext, next: number, pos: number): number {
      const start = pos;
      let inner = pos;
      if (next === BANG) {
        if (cx.char(pos + 1) !== OPEN || cx.char(pos + 2) !== OPEN) return -1;
        inner = pos + 3;
      } else {
        if (next !== OPEN || cx.char(pos + 1) !== OPEN) return -1;
        inner = pos + 2;
      }
      for (let i = inner; i < cx.end - 1; i++) {
        const c = cx.char(i);
        if (c === NEWLINE || c === OPEN) return -1;
        if (c === CLOSE && cx.char(i + 1) === CLOSE) {
          if (i === inner) return -1;   // `[[]]` is not a link
          return cx.addElement(cx.elt('WikiLink', start, i + 2, [
            cx.elt('WikiLinkMark', start, inner),
            cx.elt('WikiLinkMark', i, i + 2),
          ]));
        }
      }
      return -1;
    },
  }],
};
