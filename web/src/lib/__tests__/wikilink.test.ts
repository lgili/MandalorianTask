import { describe, expect, it } from 'vitest';
import { parser as base, GFM } from '@lezer/markdown';
import { WikiLink } from '../editor/wikilink';

const parser = base.configure([GFM, WikiLink]);

/** [nome, texto] de cada nó WikiLink e das marcas dele. */
function nos(md: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  parser.parse(md).iterate({
    enter(n) {
      if (n.name === 'WikiLink' || n.name === 'WikiLinkMark') out.push([n.name, md.slice(n.from, n.to)]);
    },
  });
  return out;
}

describe('gramática do [[link]]', () => {
  it('reconhece o link e as duas marcas', () => {
    expect(nos('ver [[Snubber RCD]] hoje')).toEqual([
      ['WikiLink', '[[Snubber RCD]]'],
      ['WikiLinkMark', '[['],
      ['WikiLinkMark', ']]'],
    ]);
  });

  it('apelido e seção ficam dentro do mesmo nó', () => {
    expect(nos('[[Snubber#Dimensionamento|o snubber]]')[0]).toEqual(['WikiLink', '[[Snubber#Dimensionamento|o snubber]]']);
  });

  it('embed com ! entra no nó, e a marca de abertura inclui o !', () => {
    const r = nos('![[diagrama.png]]');
    expect(r[0]).toEqual(['WikiLink', '![[diagrama.png]]']);
    expect(r[1]).toEqual(['WikiLinkMark', '![[']);
  });

  it('dois links na mesma linha são dois nós', () => {
    expect(nos('[[A]] e [[B]]').filter(([n]) => n === 'WikiLink').map(([, t]) => t)).toEqual(['[[A]]', '[[B]]']);
  });

  it('não reconhece vazio, nem link que atravessa linha', () => {
    expect(nos('[[]]')).toEqual([]);
    expect(nos('[[começa\ntermina]]')).toEqual([]);
  });

  it('não sequestra link markdown comum', () => {
    const tipos: string[] = [];
    parser.parse('[texto](http://x.com)').iterate({ enter(n) { tipos.push(n.name); } });
    expect(tipos).toContain('Link');
    expect(tipos).not.toContain('WikiLink');
  });

  it('dentro de código não é link', () => {
    expect(nos('`[[falso]]`')).toEqual([]);
  });
});
