// Notas: mantém o arquivo e o índice andando juntos.
//
// É o store.ts das notas. Componente nenhum chama vault.ts ou as funções de
// índice do db.ts direto — passa por aqui, porque toda escrita precisa de três
// coisas na ordem certa (disco, índice, aviso) e esquecer uma delas é o tipo
// de bug que só aparece semanas depois, como uma busca que não acha a nota.

import { ref } from 'vue';
import type { NotaIndice, NotaResumo } from './types';
import * as vault from './vault';
import * as api from './db';
import {
  alvosDe, arquivoPara, nomeArquivo, normalizaAlvo, projetoDe, separaFrontmatter, tagsDe,
  textoParaBusca, tituloDe, trocaAlvo,
} from './markdown';
import { emite } from './eventos';

export const notas = ref<NotaResumo[]>([]);
/** Caminho absoluto da pasta aberta. null = nenhum vault configurado. */
export const vaultAberto = ref<string | null>(null);
export const sincronizando = ref(false);
/** A nota aberta na tela de Notas agora. Plugins perguntam por ela. */
export const notaAberta = ref<string | null>(null);

/** O que o índice guarda sobre um texto. Puro: mesmo texto, mesmo índice. */
export function indiceDe(path: string, texto: string, arq: { mtime: number; size: number }): NotaIndice {
  const fm = separaFrontmatter(texto);
  return {
    path,
    title: tituloDe(path, fm),
    mtime: arq.mtime,
    size: arq.size,
    projeto: projetoDe(fm),
    tags: tagsDe(fm),
    body: textoParaBusca(fm),
    links: alvosDe(fm.corpo),
  };
}

export async function carregaNotas(): Promise<void> {
  notas.value = await api.listaNotas();
}

// ── abrir, sincronizar, observar ──────────────────────────────────────────

let paraDeObservar: (() => void) | null = null;

/** Na abertura do app: se há vault configurado, sincroniza e passa a observar. */
export async function abreVault(): Promise<void> {
  vaultAberto.value = await vault.raiz();
  if (!vaultAberto.value) return;
  await sincroniza();
  paraDeObservar?.();
  try {
    paraDeObservar = await vault.observa((paths) => { void reindexa(paths); });
  } catch (e) {
    // Sem watcher o app funciona; só não vê edição feita por fora até reabrir.
    console.warn('[vault] watcher indisponível', e);
  }
}

/**
 * Compara disco e índice pelo mtime e relê só o que mudou. Na segunda
 * abertura de um vault de 2000 notas, isto lê zero arquivos.
 */
export async function sincroniza(): Promise<{ lidas: number; removidas: number }> {
  sincronizando.value = true;
  try {
    const [disco, indexadas] = await Promise.all([vault.lista(), api.notasIndexadas()]);
    const mtimeNoIndice = new Map(indexadas.map((n) => [n.path, n.mtime]));
    const noDisco = new Set(disco.map((a) => a.path));
    const mudaram = disco.filter((a) => mtimeNoIndice.get(a.path) !== a.mtime);

    // Lotes de 16: disparar 2000 leituras de uma vez afoga o IPC.
    for (let i = 0; i < mudaram.length; i += 16) {
      await Promise.all(mudaram.slice(i, i + 16).map(async (a) => {
        try {
          await api.indexaNota(indiceDe(a.path, await vault.le(a.path), a));
        } catch (e) {
          // Uma nota ilegível (encoding estranho, permissão) não trava o vault.
          console.warn('[vault] não indexou', a.path, e);
        }
      }));
    }

    const sumiram = indexadas.filter((n) => !noDisco.has(n.path));
    for (const n of sumiram) await api.desindexaNota(n.path);

    await carregaNotas();
    emite('vault:sincronizado', { total: disco.length });
    return { lidas: mudaram.length, removidas: sumiram.length };
  } finally {
    sincronizando.value = false;
  }
}

/**
 * mtime do último save FEITO PELO APP, por arquivo. O watcher também dispara
 * para as nossas próprias escritas; sem isto cada save (a cada pausa na
 * digitação) viraria uma reindexação a mais e um "mudou por fora" falso.
 */
const ecos = new Map<string, number>();

async function reindexa(paths: string[]): Promise<void> {
  const externos: string[] = [];
  for (const p of new Set(paths)) {
    try {
      if (!(await vault.existe(p))) {
        await api.desindexaNota(p);
        externos.push(p);
        continue;
      }
      const a = await vault.info(p);
      if (ecos.get(p) === a.mtime) continue;
      await api.indexaNota(indiceDe(p, await vault.le(p), a));
      externos.push(p);
    } catch (e) {
      console.warn('[vault] reindexação falhou', p, e);
    }
  }
  if (!externos.length) return;
  await carregaNotas();
  for (const p of externos) emite('nota:externa', { path: p });
}

// ── ler e escrever ────────────────────────────────────────────────────────

export async function leNota(path: string): Promise<string> {
  return vault.le(path);
}

export async function salvaNota(path: string, texto: string): Promise<void> {
  const a = await vault.escreve(path, texto);
  ecos.set(path, a.mtime);
  await api.indexaNota(indiceDe(path, texto, a));
  await carregaNotas();
  emite('nota:salva', { path, texto });
}

/** YAML sem aspas quando dá, com aspas quando precisa — como o Obsidian grava. */
function valorYaml(v: string): string {
  return /^[\p{L}\p{N} _.\-]+$/u.test(v) ? v : JSON.stringify(v);
}

/**
 * Cria a nota e devolve o caminho. Nome repetido ganha sufixo em vez de
 * sobrescrever: criar nunca pode destruir o que já existe.
 *
 * O título é o NOME DO ARQUIVO, sem `# ` repetindo no corpo — convenção do
 * Obsidian ("inline title"). Um título só, num lugar só: renomear o arquivo
 * renomeia a nota.
 */
export async function criaNota(
  titulo: string,
  op: { pasta?: string; projeto?: string | null; corpo?: string } = {},
): Promise<string> {
  const base = arquivoPara(titulo).replace(/\.md$/, '');
  const pasta = op.pasta ? `${op.pasta.replace(/\/+$/, '')}/` : '';
  let path = `${pasta}${base}.md`;
  for (let i = 2; await vault.existe(path); i++) path = `${pasta}${base} ${i}.md`;

  const fm = op.projeto ? `---\nprojeto: ${valorYaml(op.projeto)}\n---\n` : '';
  await salvaNota(path, `${fm}${op.corpo ?? ''}`);
  emite('nota:criada', { path });
  return path;
}

/**
 * Apagar MOVE para `.trash/` dentro do vault — é o que o Obsidian faz por
 * padrão, e a pasta é ignorada pelo índice. Apagar de verdade uma nota que
 * alguém escreveu é irreversível demais para um clique.
 */
export async function apagaNota(path: string): Promise<void> {
  let destino = `.trash/${nomeArquivo(path)}.md`;
  for (let i = 2; await vault.existe(destino); i++) destino = `.trash/${nomeArquivo(path)} ${i}.md`;
  await vault.renomeia(path, destino);
  await api.desindexaNota(path);
  await carregaNotas();
  emite('nota:apagada', { path });
}

/**
 * Renomeia o arquivo E reescreve os `[[links]]` que apontavam para ele.
 * Sem a segunda parte, cada rename deixa um rastro de links mortos.
 */
export async function renomeiaNota(path: string, novoNome: string): Promise<string> {
  const pasta = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
  const novo = `${pasta}${arquivoPara(novoNome)}`;
  if (novo === path) return path;
  if (novo.toLowerCase() !== path.toLowerCase() && await vault.existe(novo)) {
    throw new Error(`Já existe uma nota chamada ${nomeArquivo(novo)}.`);
  }

  // Quem aponta para o nome ANTIGO — tem que ser perguntado antes de mexer.
  const antigos = [normalizaAlvo(nomeArquivo(path)), normalizaAlvo(path)];
  const quemAponta = await api.backlinks(path, antigos[0], antigos[1]);

  await vault.renomeia(path, novo);
  await api.renomeiaNoIndice(path, novo);
  const a = await vault.info(novo);
  ecos.set(novo, a.mtime);
  // Reindexa a própria nota: sem `# ` no corpo, o título É o nome do arquivo,
  // e o índice ficaria mostrando o nome antigo.
  await api.indexaNota(indiceDe(novo, await vault.le(novo), a));

  const alvoNovo = nomeArquivo(novo);
  for (const n of quemAponta) {
    const texto = await vault.le(n.path);
    const trocado = trocaAlvo(texto, antigos, alvoNovo);
    if (trocado !== texto) await salvaNota(n.path, trocado);
  }

  await carregaNotas();
  emite('nota:renomeada', { de: path, para: novo });
  return novo;
}

// ── links ─────────────────────────────────────────────────────────────────

/**
 * Para qual nota um `[[alvo]]` aponta. Mesma regra do Obsidian: caminho
 * completo primeiro; senão, nome do arquivo em qualquer pasta — e, havendo
 * dois com o mesmo nome, o mais perto da raiz.
 */
export function resolve(alvo: string): NotaResumo | null {
  const a = normalizaAlvo(alvo);
  if (!a) return null;
  const porCaminho = notas.value.find((n) => n.path.replace(/\.md$/i, '').toLowerCase() === a);
  if (porCaminho) return porCaminho;
  return notas.value
    .filter((n) => nomeArquivo(n.path).toLowerCase() === a)
    .sort((x, y) => x.path.length - y.path.length)[0] ?? null;
}

export async function linksPara(path: string): Promise<NotaResumo[]> {
  return api.backlinks(path, normalizaAlvo(nomeArquivo(path)), normalizaAlvo(path));
}

/**
 * Segue um link: abre a nota se existe; se não, CRIA — é assim que o Obsidian
 * torna barato escrever `[[Ideia nova]]` antes de a nota existir.
 */
export async function segueLink(alvo: string, pastaDaOrigem = ''): Promise<string> {
  const achada = resolve(alvo);
  if (achada) return achada.path;
  const nome = alvo.split('|')[0].split('#')[0].trim();
  const temPasta = nome.includes('/');
  return criaNota(temPasta ? nomeArquivo(nome) : nome, {
    pasta: temPasta ? nome.slice(0, nome.lastIndexOf('/')) : pastaDaOrigem,
  });
}

// ── vault ─────────────────────────────────────────────────────────────────

const BOAS_VINDAS = `Este é o seu vault. Cada nota é um arquivo \`.md\` nesta pasta — dá para
abrir com o Obsidian, versionar com git, sincronizar com a nuvem.

## Linkar
Escreva [[Minha primeira nota]] — o link já existe antes da nota. Clique nele
e ela é criada. Quem aponta para uma nota aparece embaixo dela.

## Ligar a um projeto
Crie a nota pela tela do projeto, ou escreva no topo:

\`\`\`
---
projeto: CÓDIGO
---
\`\`\`

## Buscar
**Ctrl+K** procura em notas, tarefas e projetos ao mesmo tempo.
`;

/** Troca de pasta: o índice do vault anterior não vale nada no novo. */
async function passaPara(caminho: string | null, antes: string | null): Promise<boolean> {
  if (!caminho) return false;
  if (caminho !== antes) await api.limpaIndice();
  await abreVault();
  return true;
}

export async function escolheVault(): Promise<boolean> {
  const antes = vaultAberto.value;
  return passaPara(await vault.escolhePasta(), antes);
}

export async function criaVaultPadrao(): Promise<boolean> {
  const antes = vaultAberto.value;
  const ok = await passaPara(await vault.criaVaultPadrao(), antes);
  if (ok && !notas.value.length) await criaNota('Bem-vindo', { corpo: BOAS_VINDAS });
  return ok;
}
