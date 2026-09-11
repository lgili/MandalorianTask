// Monta o objeto `bancada` que CADA plugin recebe.
//
// Uma instância por plugin, e cada coisa registrada por ela entra na lista de
// descartes daquele plugin. Desligar o plugin é percorrer essa lista — nenhum
// comando órfão na paleta, nenhum ouvinte vazando, nenhum CSS sobrando. É o
// `this.register*` do Obsidian, mas sem o plugin precisar lembrar de chamar.

import { shallowRef } from 'vue';
import * as cmView from '@codemirror/view';
import * as cmState from '@codemirror/state';
import * as cmLanguage from '@codemirror/language';
import type { NotaResumo, Project, SessionCard, TaskCard } from '../types';
import type {
  Bancada, Ligacao, Manifesto, NotaInfo, PainelPlugin, ProjetoInfo, SessaoInfo, TarefaInfo,
} from './tipos';
import { VERSAO_API } from './tipos';
import * as api from '../db';
import * as vault from '../vault';
import { router } from '../../router';
import { abreDetalhe, move, projetos, recarregaTudo, rodando, tarefas } from '../store';
import { criaNota, notaAberta, notas, resolve, salvaNota } from '../notas';
import { executaComando, registraComando } from '../comandos';
import { emite, escuta, type NomeEvento } from '../eventos';
import { registraExtensao } from '../editor/extensoes';
import { dayKey } from '../tempo';
import { toast } from '../toast';

/** Painéis registrados por plugins — a barra lateral e a rota /plugin leem isto. */
export interface PainelRegistrado extends PainelPlugin { plugin: string; nomePlugin: string }
export const paineis = shallowRef<PainelRegistrado[]>([]);

// ── tradução interno -> contrato ───────────────────────────────────────────

const nota = (n: NotaResumo): NotaInfo => ({
  path: n.path, titulo: n.title, editadaEm: n.mtime, projeto: n.project_id, tags: n.tags,
});
const tarefa = (t: TaskCard): TarefaInfo => ({
  id: t.id, titulo: t.title, status: t.status, projeto: t.project_id,
  minutos: t.minutos, prazo: t.due_at, criadaEm: t.created_at,
});
const projeto = (p: Project): ProjetoInfo => ({ id: p.id, nome: p.name, codigo: p.code, cor: p.color });
const sessao = (s: SessionCard): SessaoInfo => ({
  tarefa: s.task_id, titulo: s.title,
  projeto: tarefas.value.find((t) => t.id === s.task_id)?.project_id ?? null,
  inicio: s.started_at, fim: s.ended_at,
});

/** Caminho vindo de plugin: relativo, com '/', sem subir de pasta. */
function caminhoSeguro(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.split('/').some((seg) => seg === '..')) throw new Error(`Caminho inválido: ${path}`);
  return p;
}

export function criaApi(m: Manifesto, descartes: Array<() => void>): Bancada {
  const guarda = (f: () => void) => { descartes.push(f); };
  const pastaDados = `.bancada/plugins/${m.id}/data.json`;

  return {
    versaoApi: VERSAO_API,
    plugin: { id: m.id, nome: m.nome },

    comandos: {
      adiciona(c) {
        guarda(registraComando({ id: `${m.id}:${c.id}`, nome: c.nome, dono: m.nome, executa: c.executa }));
      },
      executa: (id) => executaComando(id),
    },

    eventos: {
      escuta(nome, fn) {
        guarda(escuta(nome as NomeEvento, fn as never));
      },
    },

    notas: {
      lista: () => notas.value.map(nota),
      le: (path) => vault.le(caminhoSeguro(path)),
      escreve: (path, texto) => salvaNota(caminhoSeguro(path), texto),
      cria: (titulo, op) => criaNota(titulo, op),
      existe: (path) => vault.existe(caminhoSeguro(path)),
      abre: (path) => { void router.push({ name: 'notas', query: { n: caminhoSeguro(path) } }); },
      aberta: () => notaAberta.value,
      busca: async (termo) => (await api.buscaNotas(termo, 50)).map((r) => ({ path: r.path, titulo: r.title })),
      async ligacoes(): Promise<Ligacao[]> {
        return (await api.todasAsLigacoes()).map((l) => ({ de: l.src, alvo: l.target, para: resolve(l.target)?.path ?? null }));
      },
      resolve: (alvo) => resolve(alvo)?.path ?? null,
    },

    tarefas: {
      lista: () => tarefas.value.map(tarefa),
      async cria(t) {
        const id = await api.capturaTarefa(t.titulo, t.projeto ?? null, 'trabalho', t.prazo ?? null);
        if (t.status && t.status !== 'backlog') await api.moveTask(id, t.status);
        await recarregaTudo();
        emite('tarefa:criada', { id, titulo: t.titulo, projeto: t.projeto ?? null });
        return id;
      },
      move: (id, para) => move(id, para),
      abre: (id) => abreDetalhe(id),
      rodando: () => (rodando.value ? sessao(rodando.value) : null),
      sessoesDoDia: async (dia) => (await api.sessoesDoDia(dia ?? dayKey())).map(sessao),
    },

    projetos: {
      lista: () => projetos.value.map(projeto),
    },

    editor: {
      registraExtensao(ext) {
        guarda(registraExtensao(m.id, ext as cmState.Extension));
      },
    },

    cm: { view: cmView, state: cmState, language: cmLanguage },

    ui: {
      toast(msg, tom = 'ok') {
        (tom === 'erro' ? toast.erro : tom === 'aviso' ? toast.aviso : toast.ok)(msg);
      },
      adicionaPainel(p) {
        const item: PainelRegistrado = { ...p, plugin: m.id, nomePlugin: m.nome };
        paineis.value = [...paineis.value.filter((x) => !(x.plugin === m.id && x.id === p.id)), item];
        guarda(() => { paineis.value = paineis.value.filter((x) => x !== item); });
      },
      abrePainel(id) {
        void router.push({ name: 'plugin', params: { plugin: m.id, painel: id } });
      },
      adicionaEstilo(css) {
        const el = document.createElement('style');
        el.dataset.plugin = m.id;
        el.textContent = css;
        document.head.appendChild(el);
        guarda(() => el.remove());
      },
    },

    dados: {
      async carrega<T>(): Promise<T | null> {
        const t = await vault.leArquivoInterno(pastaDados);
        if (!t) return null;
        try { return JSON.parse(t) as T; } catch { return null; }
      },
      salva: (d) => vault.escreveArquivoInterno(pastaDados, JSON.stringify(d, null, 2)),
    },

    aoDesligar: guarda,
  };
}
