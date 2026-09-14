import { describe, expect, it } from 'vitest';
import { parser as base, GFM } from '@lezer/markdown';
import { WikiLink } from '../editor/wikilink';

const parser = base.configure([GFM, WikiLink]);

/** [name, text] of each WikiLink node and its marks. */
function nodes(md: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  parser.parse(md).iterate({
    enter(n) {
      if (n.name === 'WikiLink' || n.name === 'WikiLinkMark') out.push([n.name, md.slice(n.from, n.to)]);
    },
  });
  return out;
}

describe('[[link]] grammar', () => {
  it('recognizes the link and both marks', () => {
    expect(nodes('see [[RCD snubber]] today')).toEqual([
      ['WikiLink', '[[RCD snubber]]'],
      ['WikiLinkMark', '[['],
      ['WikiLinkMark', ']]'],
    ]);
  });

  it('alias and section stay inside the same node', () => {
    expect(nodes('[[Snubber#Sizing|the snubber]]')[0]).toEqual(['WikiLink', '[[Snubber#Sizing|the snubber]]']);
  });

  it('an embed with ! is part of the node, and the opening mark includes the !', () => {
    const r = nodes('![[diagram.png]]');
    expect(r[0]).toEqual(['WikiLink', '![[diagram.png]]']);
    expect(r[1]).toEqual(['WikiLinkMark', '![[']);
  });

  it('two links on the same line are two nodes', () => {
    expect(nodes('[[A]] and [[B]]').filter(([n]) => n === 'WikiLink').map(([, t]) => t)).toEqual(['[[A]]', '[[B]]']);
  });

  it('does not recognize an empty link, nor a link that spans lines', () => {
    expect(nodes('[[]]')).toEqual([]);
    expect(nodes('[[starts\nends]]')).toEqual([]);
  });

  it('does not hijack a regular markdown link', () => {
    const types: string[] = [];
    parser.parse('[text](http://x.com)').iterate({ enter(n) { types.push(n.name); } });
    expect(types).toContain('Link');
    expect(types).not.toContain('WikiLink');
  });

  it('inside code it is not a link', () => {
    expect(nodes('`[[fake]]`')).toEqual([]);
  });
});
