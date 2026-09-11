import { describe, expect, it } from 'vitest';
import { compativel, validaManifesto } from '../plugins/validation';
import { caixasAbertas } from '../plugins/core/noteTasks';
import { blocoDoTrabalho } from '../plugins/core/dailyNote';

describe('compatibilidade de versão da API', () => {
  it('sem exigência, qualquer plugin serve', () => {
    expect(compativel(undefined, '1.0.0')).toBe(true);
  });
  it('mesmo número principal e não maior: serve', () => {
    expect(compativel('1.0.0', '1.3.2')).toBe(true);
    expect(compativel('1.3.2', '1.3.2')).toBe(true);
  });
  it('plugin pedindo API mais nova que a do app: recusa', () => {
    expect(compativel('1.4.0', '1.3.2')).toBe(false);
    expect(compativel('1.3.3', '1.3.2')).toBe(false);
  });
  it('número principal diferente é quebra de contrato, nos dois sentidos', () => {
    expect(compativel('2.0.0', '1.9.0')).toBe(false);
    expect(compativel('1.0.0', '2.0.0')).toBe(false);
  });
  it('versão ilegível: recusa em vez de adivinhar', () => {
    expect(compativel('abc', '1.0.0')).toBe(false);
  });
});

describe('manifesto', () => {
  const ok = { id: 'destaca-todo', nome: 'Destaca TODO', versao: '1.0.0' };

  it('aceita o manifesto mínimo', () => {
    expect(validaManifesto(ok, 'destaca-todo').nome).toBe('Destaca TODO');
  });

  it('recusa id que viraria caminho fora da pasta', () => {
    for (const id of ['../fora', 'a/b', 'Maiuscula', '-comeca-com-hifen', 'x']) {
      expect(() => validaManifesto({ ...ok, id }, id)).toThrow(/id inválido/);
    }
  });

  it('id tem que ser o nome da pasta — senão dados.json de um cai na pasta de outro', () => {
    expect(() => validaManifesto(ok, 'outra-pasta')).toThrow(/não bate/);
  });

  it('recusa sem nome, sem versão, ou que não é objeto', () => {
    expect(() => validaManifesto({ ...ok, nome: '  ' }, 'destaca-todo')).toThrow(/nome/);
    expect(() => validaManifesto({ id: 'destaca-todo', nome: 'X' }, 'destaca-todo')).toThrow(/versao/);
    expect(() => validaManifesto(null, 'x')).toThrow(/objeto/);
    expect(() => validaManifesto([ok], 'destaca-todo')).toThrow(/objeto/);
  });

  it('recusa quem exige API mais nova', () => {
    expect(() => validaManifesto({ ...ok, apiMinima: '1.9.0' }, 'destaca-todo', '1.0.0')).toThrow(/precisa da API/);
  });
});

describe('Tarefas da nota: caixas abertas', () => {
  it('pega só as caixas abertas, com qualquer marcador de lista', () => {
    const md = '- [ ] medir ripple\n* [ ] cotar indutor\n+ [x] já feita\n- item comum\n  - [ ] aninhada';
    expect(caixasAbertas(md)).toEqual(['medir ripple', 'cotar indutor', 'aninhada']);
  });

  it('troca [[link]] pelo texto — título de tarefa não tem colchete', () => {
    expect(caixasAbertas('- [ ] revisar [[Snubber RCD]] e [[Derating|o derating]]'))
      .toEqual(['revisar Snubber RCD e o derating']);
  });

  it('ignora caixa dentro de bloco de código', () => {
    expect(caixasAbertas('```\n- [ ] exemplo\n```\n- [ ] de verdade')).toEqual(['de verdade']);
  });

  it('aceita CRLF', () => {
    expect(caixasAbertas('- [ ] a\r\n- [ ] b')).toEqual(['a', 'b']);
  });
});

describe('Nota do dia: bloco do trabalho', () => {
  const projetos = [{ id: 1, nome: 'Flyback rev C', codigo: 'CF03B04', cor: 'p1' }];
  const em = (h: number, m: number) => new Date(2026, 8, 11, h, m).toISOString();

  it('uma linha por sessão, com projeto e duração', () => {
    const b = blocoDoTrabalho([
      { tarefa: 1, titulo: 'Ensaio térmico', projeto: 1, inicio: em(9, 0), fim: em(10, 15) },
      { tarefa: 2, titulo: 'Daily', projeto: null, inicio: em(10, 30), fim: em(10, 45) },
    ], projetos);
    expect(b.split('\n')).toEqual([
      '- 09:00–10:15 · Ensaio térmico · CF03B04 (1h15)',
      '- 10:30–10:45 · Daily (15 min)',
    ]);
  });

  it('sessão aberta aparece como "agora", medida até o instante dado', () => {
    const b = blocoDoTrabalho([{ tarefa: 1, titulo: 'X', projeto: null, inicio: em(14, 0), fim: null }],
      projetos, new Date(2026, 8, 11, 14, 40));
    expect(b).toBe('- 14:00–agora · X (40 min)');
  });

  it('dia sem sessão diz isso, em vez de lista vazia', () => {
    expect(blocoDoTrabalho([], projetos)).toMatch(/Nenhuma sessão/);
  });
});
