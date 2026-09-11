// Leitura de um .md do vault: frontmatter, título, links e tags.
//
// Tudo aqui é puro e testado. O indexador chama isto; a UI nunca faz regex
// sobre markdown por conta própria. Mesma regra de tempo.ts: o lugar onde os
// bugs mentem em silêncio fica num arquivo só.
//
// Compatibilidade com o Obsidian é o critério de desempate em toda decisão:
// o mesmo vault vai ser aberto pelos dois apps.

import { load } from 'js-yaml';

export interface Frontmatter {
  dados: Record<string, unknown>;
  /** Markdown sem o bloco `---`. */
  corpo: string;
  /** Linhas ocupadas pelo frontmatter, para o editor saber onde o corpo começa. */
  linhas: number;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Separa o YAML do corpo. YAML inválido NÃO é erro: vira `dados` vazio e o
 * texto inteiro continua sendo o corpo. Uma nota com frontmatter quebrado
 * ainda é uma nota — recusar abrir seria pior que ignorar os metadados.
 */
export function separaFrontmatter(texto: string): Frontmatter {
  const m = texto.match(FM);
  if (!m) return { dados: {}, corpo: texto, linhas: 0 };
  let dados: Record<string, unknown> = {};
  try {
    const y = load(m[1]);
    if (y && typeof y === 'object' && !Array.isArray(y)) dados = y as Record<string, unknown>;
  } catch {
    return { dados: {}, corpo: texto, linhas: 0 };
  }
  return { dados, corpo: texto.slice(m[0].length), linhas: m[0].split('\n').length - 1 };
}

/** 'Projetos/Flyback rev C.md' -> 'Flyback rev C' */
export function nomeArquivo(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

/**
 * Título da nota. Ordem do Obsidian: frontmatter `title`, depois o primeiro
 * `# ` do corpo, depois o nome do arquivo.
 */
export function tituloDe(path: string, fm: Frontmatter): string {
  const t = fm.dados.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  const h1 = semCodigo(fm.corpo).match(/^#[ \t]+(.+?)[ \t#]*$/m);
  if (h1) return h1[1].trim();
  return nomeArquivo(path);
}

/**
 * Apaga blocos e trechos de código, preservando as quebras de linha.
 * `[[isto]]` dentro de um exemplo de código não é link, e `#include` não é tag.
 */
export function semCodigo(md: string): string {
  return md
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, (b) => ' '.repeat(b.length));
}

/**
 * Forma canônica de um alvo de link — é o que vai para `note_links.target`.
 *   '[[Flyback Rev C.md#Ensaio|o flyback]]' -> 'flyback rev c'
 * Mantém a pasta quando o link a traz: `[[Projetos/Flyback]]` é um alvo
 * diferente de `[[Flyback]]`, e a resolução decide qual arquivo cada um acha.
 */
export function normalizaAlvo(alvo: string): string {
  return alvo
    .split('|')[0]
    .split('#')[0]
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .toLowerCase();
}

export interface Link {
  /** Como foi escrito, sem os colchetes. */
  bruto: string;
  alvo: string;
  /** Texto exibido: o apelido depois de `|`, ou o próprio alvo. */
  rotulo: string;
  embed: boolean;
}

const WIKI = /(!?)\[\[([^\[\]\n]+?)\]\]/g;

export function linksDe(md: string): Link[] {
  const out: Link[] = [];
  for (const m of semCodigo(md).matchAll(WIKI)) {
    const bruto = m[2];
    const alvo = normalizaAlvo(bruto);
    if (!alvo) continue;
    const apelido = bruto.split('|')[1]?.trim();
    out.push({ bruto, alvo, rotulo: apelido || bruto.split('|')[0].split('#')[0].trim(), embed: m[1] === '!' });
  }
  return out;
}

/** Alvos distintos, para gravar no índice. */
export function alvosDe(md: string): string[] {
  return [...new Set(linksDe(md).map((l) => l.alvo))];
}

/**
 * Tags do frontmatter e do corpo, sem '#', minúsculas, sem repetição.
 *
 * Regra do Obsidian: tag precisa de pelo menos um caractere não numérico —
 * `#2026` é um número, não uma tag. E `# Título` (com espaço) é cabeçalho.
 */
export function tagsDe(fm: Frontmatter): string[] {
  const out = new Set<string>();
  const doFm = fm.dados.tags ?? fm.dados.tag;
  const lista = Array.isArray(doFm) ? doFm : typeof doFm === 'string' ? doFm.split(/[,\s]+/) : [];
  for (const t of lista) {
    const s = String(t).replace(/^#/, '').trim().toLowerCase();
    if (s) out.add(s);
  }
  for (const m of semCodigo(fm.corpo).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]+)/gu)) {
    const t = m[1].toLowerCase();
    if (/\p{L}|[_\-/]/u.test(t)) out.add(t);
  }
  return [...out];
}

/** Valor cru de `projeto:` (ou `project:`), para o índice ligar nota a projeto. */
export function projetoDe(fm: Frontmatter): string | null {
  const v = fm.dados.projeto ?? fm.dados.project;
  if (v == null) return null;
  // Obsidian escreve propriedade-link como "[[CF03B04]]": aceita as duas formas.
  const s = String(v).replace(/^\[\[|\]\]$/g, '').trim();
  return s || null;
}

/** Nome de arquivo seguro no Windows, no macOS e no Obsidian. */
export function arquivoPara(titulo: string): string {
  const limpo = titulo
    .replace(/[<>:"/\\|?*#^[\]]/g, ' ')   // proibidos no Windows + os que quebram link
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');               // Windows recusa nome terminado em ponto
  return `${limpo || 'Sem título'}.md`;
}

/** Texto puro para o FTS: sem frontmatter, sem sintaxe de link, sem marcação. */
export function textoParaBusca(fm: Frontmatter): string {
  return fm.corpo
    .replace(WIKI, (_m, _e, b: string) => b.split('|').pop() ?? b)
    .replace(/[*_~`>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trecho em volta da primeira ocorrência de um termo — a linha do resultado de busca. */
export function trecho(texto: string, termo: string, raio = 70): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const i = norm(texto).indexOf(norm(termo.trim()));
  if (i < 0) return texto.slice(0, raio * 2);
  const ini = Math.max(0, i - raio);
  return `${ini > 0 ? '…' : ''}${texto.slice(ini, i + termo.length + raio).trim()}…`;
}

/** Trechos de código como intervalos [início, fim) — link lá dentro é texto. */
function faixasDeCodigo(md: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of md.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm)) out.push([m.index!, m.index! + m[0].length]);
  for (const m of md.matchAll(/`[^`\n]+`/g)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

/**
 * Troca o alvo de todo `[[link]]` que aponta para uma nota renomeada.
 *
 * Preserva `#seção` e `|apelido`, e NÃO toca em link dentro de código. É o
 * que faz renomear uma nota não quebrar as outras — sem isto, cada rename
 * deixaria um rastro de links mortos, que é o motivo nº 1 de gente desistir
 * de linkar notas.
 *
 * `antigos` são alvos normalizados (ver `normalizaAlvo`): o nome do arquivo
 * e o caminho, porque o link pode ter sido escrito de qualquer um dos jeitos.
 */
export function trocaAlvo(md: string, antigos: string[], novo: string): string {
  const codigo = faixasDeCodigo(md);
  const emCodigo = (i: number) => codigo.some(([a, b]) => i >= a && i < b);
  return md.replace(WIKI, (inteiro, embed: string, bruto: string, offset: number) => {
    if (emCodigo(offset)) return inteiro;
    const [alvoSecao, ...apelido] = bruto.split('|');
    const [alvo, ...secao] = alvoSecao.split('#');
    if (!antigos.includes(normalizaAlvo(alvo))) return inteiro;
    const s = secao.length ? `#${secao.join('#')}` : '';
    const a = apelido.length ? `|${apelido.join('|')}` : '';
    return `${embed}[[${novo}${s}${a}]]`;
  });
}
