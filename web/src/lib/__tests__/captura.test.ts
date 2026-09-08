import { describe, it, expect } from 'vitest';
import { analisa, analisaPrazo, achaProjeto } from '../captura';
import type { Project } from '../types';

const proj = (id: number, name: string, code: string | null): Project => ({
  id, name, code, color: null, archived_at: null, created_at: '2026-01-01T00:00:00Z',
});
const PROJETOS = [
  proj(1, 'Flyback rev C', 'CF03B04'),
  proj(2, 'NACQ', 'NACQ'),
  proj(3, 'Cotações', null),
];
// 2026-09-08 é uma terça
const TERCA = new Date(2026, 8, 8, 10, 0, 0);
const dia = (iso: string | null) => (iso ? new Date(iso).toDateString() : null);

describe('projeto por prefixo', () => {
  it('casa pelo código', () => {
    expect(achaProjeto('cf03', PROJETOS)?.id).toBe(1);
  });
  it('casa pelo nome quando não há código', () => {
    expect(achaProjeto('cota', PROJETOS)?.id).toBe(3);
  });
  it('prefixo ambíguo não casa — errar por não marcar é melhor que marcar errado', () => {
    const ambiguos = [proj(1, 'Alfa', 'AA1'), proj(2, 'Alfa 2', 'AA2')];
    expect(achaProjeto('aa', ambiguos)).toBeNull();
  });
  it('sem match devolve null em vez de estourar', () => {
    expect(achaProjeto('zzz', PROJETOS)).toBeNull();
  });
});

describe('prazo', () => {
  it('hoje e amanhã', () => {
    expect(dia(analisaPrazo('hoje', TERCA))).toBe(new Date(2026, 8, 8).toDateString());
    expect(dia(analisaPrazo('amanha', TERCA))).toBe(new Date(2026, 8, 9).toDateString());
  });
  it('dia da semana aponta para o PRÓXIMO, nunca hoje', () => {
    // "ter" numa terça significa a terça que vem
    expect(dia(analisaPrazo('ter', TERCA))).toBe(new Date(2026, 8, 15).toDateString());
    expect(dia(analisaPrazo('sex', TERCA))).toBe(new Date(2026, 8, 11).toDateString());
  });
  it('+Nd', () => {
    expect(dia(analisaPrazo('+3d', TERCA))).toBe(new Date(2026, 8, 11).toDateString());
    expect(dia(analisaPrazo('+10', TERCA))).toBe(new Date(2026, 8, 18).toDateString());
  });
  it('dd/mm', () => {
    expect(dia(analisaPrazo('22/09', TERCA))).toBe(new Date(2026, 8, 22).toDateString());
  });
  it('data já passada sem ano vai para o ano seguinte', () => {
    expect(dia(analisaPrazo('05/03', TERCA))).toBe(new Date(2027, 2, 5).toDateString());
  });
  it('data impossível é recusada em vez de rolar para o mês seguinte', () => {
    expect(analisaPrazo('31/02', TERCA)).toBeNull();
  });
  it('lixo devolve null', () => {
    expect(analisaPrazo('quinta-feira-que-vem', TERCA)).toBeNull();
  });
  it('guarda meio-dia local — prazo é dia, não instante', () => {
    expect(new Date(analisaPrazo('hoje', TERCA)!).getHours()).toBe(12);
  });
});

describe('linha completa', () => {
  it('extrai título, projeto e prazo', () => {
    const a = analisa('medir ripple no barramento 400 V #cf03 !qui', PROJETOS, TERCA);
    expect(a.titulo).toBe('medir ripple no barramento 400 V');
    expect(a.projeto?.id).toBe(1);
    expect(dia(a.prazo)).toBe(new Date(2026, 8, 10).toDateString());
  });

  it('tokens no meio da frase também valem', () => {
    const a = analisa('#nacq fechar BOM !sex rev C', PROJETOS, TERCA);
    expect(a.titulo).toBe('fechar BOM rev C');
    expect(a.projeto?.id).toBe(2);
  });

  it('NUNCA falha: token que não casa vira texto comum', () => {
    const a = analisa('conferir #inexistente e !nadaissoaqui', PROJETOS, TERCA);
    // a tarefa continua sendo criada, com o texto inteiro preservado
    expect(a.titulo).toBe('conferir #inexistente e !nadaissoaqui');
    expect(a.projeto).toBeNull();
    expect(a.prazo).toBeNull();
    expect(a.ignorados).toEqual(['#inexistente', '!nadaissoaqui']);
  });

  it('linha sem token nenhum é tarefa válida', () => {
    const a = analisa('pedir amostra do driver isolado', PROJETOS, TERCA);
    expect(a.titulo).toBe('pedir amostra do driver isolado');
    expect(a.ignorados).toEqual([]);
  });

  it('só o primeiro token de cada tipo conta', () => {
    const a = analisa('teste #cf03 #nacq', PROJETOS, TERCA);
    expect(a.projeto?.id).toBe(1);
    expect(a.titulo).toBe('teste #nacq');   // o segundo vira texto
  });

  it('# solto não é token', () => {
    expect(analisa('usar # como comentário', PROJETOS, TERCA).titulo)
      .toBe('usar # como comentário');
  });

  it('espaços extras não viram título torto', () => {
    expect(analisa('   revisar    eBOM   #nacq  ', PROJETOS, TERCA).titulo).toBe('revisar eBOM');
  });
});
