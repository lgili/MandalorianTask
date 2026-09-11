// A ÚNICA camada que toca arquivo. Mesmo papel que db.sql.ts tem para o SQL:
// nenhum componente importa @tauri-apps/plugin-fs. Os paths que entram e saem
// daqui são RELATIVOS à raiz do vault e sempre com '/', em qualquer sistema.
//
// A pasta é escolhida no diálogo do sistema. O plugin de diálogo libera o
// acesso a ela no escopo do fs (plugins-workspace, dialog/src/commands.rs:
// `s.allow_directory(&path, options.recursive)`), e o persisted-scope guarda
// isso entre reinícios. Sem `recursive: true` no open(), só a pasta raiz
// ficaria liberada e nenhuma subpasta abriria.

import {
  exists, mkdir, readDir, readTextFile, remove, rename, stat, watch, writeTextFile,
} from '@tauri-apps/plugin-fs';
import { documentDir, sep } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { getMeta, setMeta } from './db';

export interface Arquivo {
  path: string;
  /** ms desde a época. */
  mtime: number;
  size: number;
}

/**
 * Pastas que nunca entram no índice. `.obsidian` e `.bancada` são config de
 * app; `.trash` é a lixeira do Obsidian — nota lá dentro foi apagada.
 */
const IGNORADAS = new Set(['.obsidian', '.bancada', '.git', '.trash', 'node_modules', '.stfolder']);

let _raiz: string | null = null;

export async function raiz(): Promise<string | null> {
  if (_raiz === null) _raiz = await getMeta('vault_path');
  return _raiz;
}

async function defineRaiz(abs: string): Promise<void> {
  _raiz = abs;
  await setMeta('vault_path', abs);
}

/** Pede a pasta ao sistema. É o único jeito de liberar uma pasta arbitrária. */
export async function escolhePasta(): Promise<string | null> {
  const p = await open({ directory: true, recursive: true, title: 'Pasta do vault' });
  if (typeof p !== 'string') return null;
  await defineRaiz(p);
  return p;
}

/**
 * Vault novo em Documentos/Bancada. Existe para quem não tem Obsidian: essa
 * pasta está liberada de fábrica em capabilities/default.json, então funciona
 * sem passar pelo diálogo.
 */
export async function criaVaultPadrao(): Promise<string> {
  const abs = `${await documentDir()}${sep()}Bancada`;
  if (!(await exists(abs))) await mkdir(abs, { recursive: true });
  await defineRaiz(abs);
  return abs;
}

function abs(r: string, rel: string): string {
  return `${r}${sep()}${rel.split('/').join(sep())}`;
}

async function precisaRaiz(): Promise<string> {
  const r = await raiz();
  if (!r) throw new Error('Nenhum vault aberto.');
  return r;
}

/** Todo .md do vault, recursivo. As pastas são lidas em paralelo. */
export async function lista(): Promise<Arquivo[]> {
  const r = await precisaRaiz();
  const out: Arquivo[] = [];

  async function desce(rel: string): Promise<void> {
    const entradas = await readDir(rel ? abs(r, rel) : r);
    await Promise.all(entradas.map(async (e) => {
      // Pasta oculta é config de algum app (o Obsidian também ignora).
      if (e.name.startsWith('.') || IGNORADAS.has(e.name)) return;
      const filho = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory) return desce(filho);
      if (!e.isFile || !/\.md$/i.test(e.name)) return;
      const s = await stat(abs(r, filho));
      out.push({ path: filho, mtime: s.mtime ? new Date(s.mtime).getTime() : 0, size: s.size });
    }));
  }

  await desce('');
  return out;
}

export async function le(path: string): Promise<string> {
  return readTextFile(abs(await precisaRaiz(), path));
}

export async function info(path: string): Promise<Arquivo> {
  const s = await stat(abs(await precisaRaiz(), path));
  return { path, mtime: s.mtime ? new Date(s.mtime).getTime() : Date.now(), size: s.size };
}

export async function escreve(path: string, texto: string): Promise<Arquivo> {
  const r = await precisaRaiz();
  const pasta = path.split('/').slice(0, -1).join('/');
  if (pasta && !(await exists(abs(r, pasta)))) await mkdir(abs(r, pasta), { recursive: true });
  await writeTextFile(abs(r, path), texto);
  return info(path);
}

export async function existe(path: string): Promise<boolean> {
  return exists(abs(await precisaRaiz(), path));
}

export async function apaga(path: string): Promise<void> {
  await remove(abs(await precisaRaiz(), path));
}

export async function renomeia(de: string, para: string): Promise<void> {
  const r = await precisaRaiz();
  const pasta = para.split('/').slice(0, -1).join('/');
  if (pasta && !(await exists(abs(r, pasta)))) await mkdir(abs(r, pasta), { recursive: true });
  await rename(abs(r, de), abs(r, para));
}

/**
 * Avisa quando um .md muda POR FORA — Obsidian, git pull, Dropbox. O próprio
 * plugin agrupa rajadas (`delayMs`): um `git checkout` que mexe em 300
 * arquivos vira um evento, não 300.
 */
export async function observa(cb: (paths: string[]) => void): Promise<() => void> {
  const r = await precisaRaiz();
  const prefixo = r.endsWith(sep()) ? r : r + sep();
  return watch(r, (ev) => {
    const rels = ev.paths
      .filter((p) => p.startsWith(prefixo) && /\.md$/i.test(p))
      .map((p) => p.slice(prefixo.length).split(sep()).join('/'))
      .filter((p) => !p.split('/').some((seg) => IGNORADAS.has(seg)));
    if (rels.length) cb(rels);
  }, { recursive: true, delayMs: 400 });
}

// ── arquivos de plugin ─────────────────────────────────────────────────────
// Plugins moram DENTRO do vault, em .bancada/plugins/<id>/ — o mesmo desenho
// do .obsidian/plugins/. Assim eles viajam junto com as notas no git/nuvem.

export async function listaPastasDePlugin(): Promise<string[]> {
  const r = await raiz();
  if (!r) return [];
  const base = abs(r, '.bancada/plugins');
  if (!(await exists(base))) return [];
  return (await readDir(base)).filter((e) => e.isDirectory).map((e) => e.name);
}

export async function leArquivoInterno(rel: string): Promise<string | null> {
  const r = await raiz();
  if (!r) return null;
  const p = abs(r, rel);
  return (await exists(p)) ? readTextFile(p) : null;
}

export async function escreveArquivoInterno(rel: string, texto: string): Promise<void> {
  const r = await precisaRaiz();
  const pasta = rel.split('/').slice(0, -1).join('/');
  if (pasta && !(await exists(abs(r, pasta)))) await mkdir(abs(r, pasta), { recursive: true });
  await writeTextFile(abs(r, rel), texto);
}
