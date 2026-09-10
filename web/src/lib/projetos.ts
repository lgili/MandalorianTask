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
