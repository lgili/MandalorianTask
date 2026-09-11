// Ciclo de vida dos plugins: descobrir, validar, ligar, desligar.
//
// DOIS TIPOS:
//   núcleo      — vêm com o app (Nota do dia, Tarefas da nota, Grafo). Usam
//                 a MESMA API de um plugin de terceiro: se ela não bastasse
//                 para eles, não bastaria para ninguém.
//   comunidade  — pastas em <vault>/.bancada/plugins/<id>/ com manifest.json
//                 e main.js. Rodam com acesso total ao app, como no Obsidian.
//
// SEGURANÇA — onde divergimos do Obsidian de propósito:
// "Confio neste vault" fica gravado NO APP (meta do SQLite, por caminho de
// vault), nunca num arquivo dentro do vault. Se ficasse no vault, um vault
// clonado de alguém chegaria com plugins já ligados e executaria código na
// primeira abertura. Aqui, vault novo = modo restrito, sempre.

import { ref } from 'vue';
import type { DefinicaoPlugin, Manifesto } from './tipos';
import { criaApi } from './api';
import { validaManifesto } from './validacao';
import * as api from '../db';
import * as vault from '../vault';
import { vaultAberto } from '../notas';
import { NUCLEO } from './nucleo';

export interface EstadoPlugin {
  manifesto: Manifesto;
  origem: 'nucleo' | 'comunidade';
  ligado: boolean;
  erro: string | null;
}

export const plugins = ref<EstadoPlugin[]>([]);
/** Modo restrito: plugins da comunidade não carregam. Por vault. */
export const restrito = ref(true);

interface Vivo { descartes: Array<() => void>; inst: DefinicaoPlugin }
const vivos = new Map<string, Vivo>();

// ── configuração ──────────────────────────────────────────────────────────

interface ConfigVault { confia: boolean; ativos: string[] }
let nucleoDesligados = new Set<string>();
let cfgVault: ConfigVault = { confia: false, ativos: [] };

const chaveVault = () => `plugins_vault:${vaultAberto.value ?? ''}`;

async function carregaConfig(): Promise<void> {
  try { nucleoDesligados = new Set(JSON.parse((await api.getMeta('plugins_nucleo_off')) ?? '[]')); } catch { nucleoDesligados = new Set(); }
  try { cfgVault = { confia: false, ativos: [], ...JSON.parse((await api.getMeta(chaveVault())) ?? '{}') }; } catch { cfgVault = { confia: false, ativos: [] }; }
  restrito.value = !cfgVault.confia;
}
const salvaNucleo = () => api.setMeta('plugins_nucleo_off', JSON.stringify([...nucleoDesligados]));
const salvaVault = () => api.setMeta(chaveVault(), JSON.stringify(cfgVault));

// ── ligar e desligar ──────────────────────────────────────────────────────

function estado(id: string): EstadoPlugin | undefined {
  return plugins.value.find((p) => p.manifesto.id === id);
}

function instancia(def: unknown): DefinicaoPlugin {
  // aceita objeto { aoLigar } ou classe cujas instâncias têm aoLigar
  if (typeof def === 'function') return new (def as new () => DefinicaoPlugin)();
  if (def && typeof (def as DefinicaoPlugin).aoLigar === 'function') return def as DefinicaoPlugin;
  throw new Error('main.js precisa exportar default { aoLigar(bancada) { … } }');
}

async function ativa(m: Manifesto, def: unknown, css: string | null): Promise<void> {
  const e = estado(m.id)!;
  const descartes: Array<() => void> = [];
  try {
    const inst = instancia(def);
    const b = criaApi(m, descartes);
    if (css) b.ui.adicionaEstilo(css);
    await inst.aoLigar(b);
    vivos.set(m.id, { descartes, inst });
    e.ligado = true;
    e.erro = null;
  } catch (err) {
    // Plugin que explode no aoLigar não deixa nada registrado para trás.
    for (const f of descartes.reverse()) { try { f(); } catch { /* segue */ } }
    e.ligado = false;
    e.erro = err instanceof Error ? err.message : String(err);
    console.error(`[plugin ${m.id}]`, err);
  }
}

function desativa(id: string): void {
  const v = vivos.get(id);
  const e = estado(id);
  if (e) e.ligado = false;
  if (!v) return;
  try { v.inst.aoDesligar?.(); } catch (err) { console.error(`[plugin ${id}] aoDesligar`, err); }
  for (const f of v.descartes.reverse()) { try { f(); } catch { /* segue */ } }
  vivos.delete(id);
}

/**
 * Carrega o main.js como módulo ES a partir de um Blob. A CSP do app é nula
 * (tauri.conf.json), então `import()` de blob: funciona no WebView.
 */
async function importaDoVault(id: string): Promise<{ def: unknown; css: string | null }> {
  const codigo = await vault.leArquivoInterno(`.bancada/plugins/${id}/main.js`);
  if (!codigo) throw new Error('main.js não encontrado');
  const css = await vault.leArquivoInterno(`.bancada/plugins/${id}/styles.css`);
  const url = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
  try {
    const mod = await import(/* @vite-ignore */ url);
    return { def: mod.default, css };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── descoberta ────────────────────────────────────────────────────────────

async function descobreComunidade(): Promise<void> {
  const achados: EstadoPlugin[] = [];
  for (const pasta of await vault.listaPastasDePlugin()) {
    const bruto = await vault.leArquivoInterno(`.bancada/plugins/${pasta}/manifest.json`);
    let manifesto: Manifesto;
    let erro: string | null = null;
    try {
      manifesto = validaManifesto(JSON.parse(bruto ?? 'null'), pasta);
    } catch (e) {
      manifesto = { id: pasta, nome: pasta, versao: '?' };
      erro = e instanceof Error ? e.message : String(e);
    }
    achados.push({ manifesto, origem: 'comunidade', ligado: false, erro });
  }
  plugins.value = [
    ...plugins.value.filter((p) => p.origem === 'nucleo'),
    ...achados.sort((a, b) => a.manifesto.nome.localeCompare(b.manifesto.nome, 'pt-BR')),
  ];
}

async function ligaComunidade(id: string): Promise<void> {
  const e = estado(id);
  if (!e || e.origem !== 'comunidade' || e.ligado) return;
  if (e.manifesto.versao === '?') return;   // manifesto inválido: o erro já está no estado
  try {
    const { def, css } = await importaDoVault(id);
    await ativa(e.manifesto, def, css);
  } catch (err) {
    e.erro = err instanceof Error ? err.message : String(err);
  }
}

// ── API pública deste módulo ──────────────────────────────────────────────

/** Chamado depois de abrir o vault. Idempotente: pode rodar a cada troca. */
export async function iniciaPlugins(): Promise<void> {
  for (const id of [...vivos.keys()]) desativa(id);
  plugins.value = NUCLEO.map((n) => ({ manifesto: n.manifesto, origem: 'nucleo' as const, ligado: false, erro: null }));
  await carregaConfig();

  for (const n of NUCLEO) {
    if (!nucleoDesligados.has(n.manifesto.id)) await ativa(n.manifesto, n.definicao, null);
  }
  if (!vaultAberto.value) return;
  await descobreComunidade();
  if (!restrito.value) for (const id of cfgVault.ativos) await ligaComunidade(id);
}

export async function alterna(id: string, ligar: boolean): Promise<void> {
  const e = estado(id);
  if (!e) return;
  if (e.origem === 'nucleo') {
    const n = NUCLEO.find((x) => x.manifesto.id === id)!;
    if (ligar) { nucleoDesligados.delete(id); await ativa(n.manifesto, n.definicao, null); }
    else { nucleoDesligados.add(id); desativa(id); }
    await salvaNucleo();
    return;
  }
  if (ligar) {
    if (restrito.value) return;
    await ligaComunidade(id);
    if (estado(id)?.ligado) cfgVault.ativos = [...new Set([...cfgVault.ativos, id])];
  } else {
    desativa(id);
    cfgVault.ativos = cfgVault.ativos.filter((x) => x !== id);
  }
  await salvaVault();
}

/** Sair do modo restrito é confiar ESTE vault — decisão gravada no app. */
export async function defineRestrito(sim: boolean): Promise<void> {
  restrito.value = sim;
  cfgVault.confia = !sim;
  if (sim) for (const p of plugins.value) if (p.origem === 'comunidade') desativa(p.manifesto.id);
  await salvaVault();
}

/** Relê a pasta de plugins (instalou um novo, editou um main.js). */
export async function recarregaComunidade(): Promise<void> {
  for (const p of plugins.value) if (p.origem === 'comunidade') desativa(p.manifesto.id);
  await descobreComunidade();
  if (!restrito.value) for (const id of cfgVault.ativos) await ligaComunidade(id);
}

/** Copia o plugin de exemplo para dentro do vault — o jeito rápido de ver um funcionando. */
export async function instalaExemplo(): Promise<string> {
  const { EXEMPLO } = await import('./exemplo');
  for (const [nome, conteudo] of Object.entries(EXEMPLO.arquivos)) {
    await vault.escreveArquivoInterno(`.bancada/plugins/${EXEMPLO.id}/${nome}`, conteudo);
  }
  await recarregaComunidade();
  return EXEMPLO.id;
}
