import { describe, expect, it } from 'vitest';
import { codigoAuto, corPrevista, pontua, podeCriar, ranqueia } from '../projects';
import type { Project } from '../types';

const P = (id: number, name: string, code: string | null = null): Project =>
  ({ id, name, code, color: 'p1', archived_at: null, created_at: '' });

const FLYBACK = P(1, 'Flyback rev C', 'CF03B04');
const NACQ = P(2, 'NACQ 2026', 'NACQ');
const INFRA = P(3, 'Bancada e infra', 'INFRA');
const TERMICO = P(4, 'Ensaio térmico', null);

describe('pontua', () => {
  it('código exato ganha de tudo', () => {
    expect(pontua('nacq', NACQ)).toBeGreaterThan(pontua('nacq', P(9, 'NACQ outro')));
  });

  it('prefixo de código ganha de prefixo de nome', () => {
    expect(pontua('cf03', FLYBACK)).toBeGreaterThan(pontua('flyb', FLYBACK));
  });

  it('casa por iniciais das palavras', () => {
    expect(pontua('bei', INFRA)).toBeGreaterThan(0);
  });

  it('ignora acento nos dois lados', () => {
    expect(pontua('termico', TERMICO)).toBeGreaterThan(0);
    expect(pontua('térmico', TERMICO)).toBeGreaterThan(0);
  });

  it('consulta vazia deixa todo mundo passar', () => {
    expect(pontua('', FLYBACK)).toBeGreaterThan(0);
  });

  it('não casa o que não tem nada a ver', () => {
    expect(pontua('zzz', FLYBACK)).toBe(0);
  });
});

describe('ranqueia', () => {
  const todos = [FLYBACK, NACQ, INFRA, TERMICO];

  it('ambiguidade devolve os dois, em vez de null', () => {
    const r = ranqueia('n', [NACQ, P(5, 'Nova bancada', 'NB')]);
    expect(r).toHaveLength(2);
  });

  it('preserva a ordem de entrada no empate', () => {
    const a = P(6, 'Alfa projeto', null);
    const b = P(7, 'Alfa outro', null);
    expect(ranqueia('alfa', [b, a]).map((p) => p.id)).toEqual([7, 6]);
  });

  it('consulta vazia devolve a lista inteira na ordem original', () => {
    expect(ranqueia('', todos)).toEqual(todos);
  });
});

describe('podeCriar', () => {
  const todos = [FLYBACK, NACQ];

  it('oferece criar quando não existe nada com esse nome', () => {
    expect(podeCriar('Retrofit linha 4', todos)).toBe(true);
  });

  it('não oferece criar duplicata de nome, ignorando caixa e acento', () => {
    expect(podeCriar('flyback rev c', todos)).toBe(false);
  });

  it('não oferece criar quando o texto é um código existente', () => {
    expect(podeCriar('NACQ', todos)).toBe(false);
  });

  it('não oferece criar com texto vazio', () => {
    expect(podeCriar('   ', todos)).toBe(false);
  });
});

describe('codigoAuto', () => {
  const todos = [FLYBACK, NACQ];

  it('deriva das quatro primeiras letras da primeira palavra', () => {
    expect(codigoAuto('Retrofit linha 4', todos)).toBe('RETR');
    expect(codigoAuto('Bancada e infra', todos)).toBe('BANC');
  });

  it('tira acento', () => {
    expect(codigoAuto('Térmico', todos)).toBe('TERM');
  });

  it('não colide com código existente', () => {
    const comNacq = [...todos, P(9, 'Nacq outro', 'NACQ')];
    expect(codigoAuto('NACQ 2027', comNacq)).toBe('NACQ2');
  });

  it('nome sem alfanumérico devolve null em vez de código vazio', () => {
    expect(codigoAuto('!!!', todos)).toBeNull();
  });
});

describe('corPrevista', () => {
  it('devolve a cor menos usada entre os ativos', () => {
    const usados = [
      { ...P(1, 'a'), color: 'p1' }, { ...P(2, 'b'), color: 'p1' },
      { ...P(3, 'c'), color: 'p2' },
    ];
    expect(corPrevista(usados)).toBe('p3');
  });

  it('ignora projeto arquivado na contagem', () => {
    const usados = [
      { ...P(1, 'a'), color: 'p1', archived_at: '2026-01-01' },
      { ...P(2, 'b'), color: 'p2' }, { ...P(3, 'c'), color: 'p3' },
      { ...P(4, 'd'), color: 'p4' }, { ...P(5, 'e'), color: 'p5' },
      { ...P(6, 'f'), color: 'p6' },
    ];
    expect(corPrevista(usados)).toBe('p1');
  });
});
