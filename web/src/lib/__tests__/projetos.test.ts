import { describe, expect, it } from 'vitest';
import { pontua, podeCriar, ranqueia } from '../projetos';
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
