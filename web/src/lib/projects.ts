// Busca de projeto para o seletor.
//
// Substitui o casamento por prefixo cego de captura.ts, que devolvia `null`
// quando o texto era ambíguo — e ambiguidade silenciosa é o pior desfecho
// possível: a tarefa nascia sem projeto e ninguém era avisado.
//
// Aqui a ambiguidade vira duas linhas na lista. Quem decide é o olho, não a
// heurística.

import type { Project } from './types';

/** Ordem importa: é a prioridade de casamento, do mais forte ao mais fraco. */
const PESO = {
  codigoExato: 100,
  codigoPrefixo: 80,
  nomePrefixo: 60,
  iniciais: 50,
  subsequencia: 30,
} as const;

const norm = (s: string): string => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');   // "Térmico" casa com "termico"

/** Iniciais das palavras: "cf" casa com "Carro Forte". */
function iniciais(nome: string): string {
  return nome.split(/[\s\-_/]+/).filter(Boolean).map((p) => p[0]).join('');
}

/** `alvo` contém as letras de `q` na ordem, não necessariamente juntas. */
function subsequencia(q: string, alvo: string): boolean {
  let i = 0;
  for (const c of alvo) if (c === q[i] && ++i === q.length) return true;
  return false;
}

export function pontua(consulta: string, p: Project): number {
  const q = norm(consulta);
  if (!q) return 1;                       // sem consulta, todo mundo passa
  const code = norm(p.code ?? '');
  const name = norm(p.name);

  if (code && code === q) return PESO.codigoExato;
  if (code && code.startsWith(q)) return PESO.codigoPrefixo;
  if (name.startsWith(q)) return PESO.nomePrefixo;
  if (iniciais(name).startsWith(q)) return PESO.iniciais;
  if (subsequencia(q, name)) return PESO.subsequencia;
  return 0;
}

/**
 * Filtra e ordena. A lista de entrada JÁ vem por atividade recente
 * (resumoProjetos ordena assim), e empate preserva essa ordem — frequência
 * ganha de alfabético num seletor.
 */
export function ranqueia<T extends Project>(consulta: string, projetos: T[]): T[] {
  return projetos
    .map((p, i) => ({ p, s: pontua(consulta, p), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/**
 * A linha "criar" só aparece quando faz sentido: há texto, e nenhum projeto
 * já se chama exatamente isso. Sem essa guarda, dá para criar duplicata só
 * digitando rápido demais.
 */
export function podeCriar<T extends Project>(consulta: string, projetos: T[]): boolean {
  const q = norm(consulta.trim());
  if (!q) return false;
  return !projetos.some((p) => norm(p.name) === q || norm(p.code ?? '') === q);
}

/** Mesma paleta de db.ts, repetida aqui para o módulo continuar puro. */
const CORES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;

/**
 * A cor que o próximo projeto vai receber — a menos usada entre os ativos.
 * Serve para acender o ponto ANTES de confirmar a criação; quem grava de
 * verdade é `proximaCor()` no db, que conta no banco.
 */
export function corPrevista<T extends Project>(projetos: T[]): string {
  const uso = new Map<string, number>();
  for (const p of projetos) if (!p.archived_at && p.color) uso.set(p.color, (uso.get(p.color) ?? 0) + 1);
  return CORES.reduce((a, b) => ((uso.get(a) ?? 0) <= (uso.get(b) ?? 0) ? a : b));
}

/**
 * Código curto derivado do nome.
 *
 * Existe porque TODO chip de projeto da UI mostra o código, e projeto criado
 * pelo fluxo rápido não tem um — o chip caía no nome inteiro e a coluna de
 * código do seletor ficava vazia. Pedir o código na criação era o caminho
 * oposto: mais um campo entre a ideia e o registro.
 *
 * Regra: quatro primeiros alfanuméricos da primeira palavra, em caixa alta.
 * Previsível, curto, e editável depois na tela do projeto.
 */
export function codigoAuto<T extends Project>(nome: string, projetos: T[]): string | null {
  // `norm` já tira acento e caixa — não duplicar a regex de diacrítico aqui.
  const base = norm(nome.trim().split(/\s+/)[0] ?? '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  if (!base) return null;
  const usados = new Set(projetos.map((p) => (p.code ?? '').toUpperCase()));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const c = `${base}${i}`;
    if (!usados.has(c)) return c;
  }
  return null;
}
