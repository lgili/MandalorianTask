// Estado compartilhado. Refs de módulo + funções exportadas, sem Pinia.
// O dado real mora no SQLite; isto é só o que a UI precisa lembrar entre telas.

import { computed, ref } from 'vue';
import type { Outcome, Project, SessionCard, TaskCard, TaskStatus, Totais } from './types';
import * as api from './db';
import { dayKey, type DayKey } from './tempo';
import { toast } from './toast';

/**
 * Projetos vivos, já com contagem e horas. É `ProjetoResumo`, que estende
 * `Project` — quem só precisa de id/nome/cor continua funcionando.
 */
export const projetos = ref<api.ProjetoResumo[]>([]);
/** Inclui arquivados. Só Ajustes e a resolução de nome antigo precisam. */
export const projetosArquivados = ref<Project[]>([]);
export const tarefas = ref<TaskCard[]>([]);
export const rodando = ref<SessionCard | null>(null);
export const diaAtual = ref<DayKey>(dayKey());
export const sessoesDia = ref<SessionCard[]>([]);
export const totaisDia = ref<Totais>({ total: 0, trabalho: 0, reuniao: 0, admin: 0 });
export const carregando = ref(false);
/** Tarefa aberta no painel de detalhe (null = fechado). */
export const detalheId = ref<number | null>(null);
export const abreDetalhe = (id: number | null) => { detalheId.value = id; };

export const porStatus = (s: TaskStatus) => computed(() =>
  tarefas.value.filter((t) => t.status === s));

export const backlog = computed(() => tarefas.value.filter((t) => t.status === 'backlog'));

export async function carregaProjetos(): Promise<void> {
  const [vivos, todos] = await Promise.all([api.resumoProjetos(), api.listProjects(true)]);
  projetos.value = vivos;
  projetosArquivados.value = todos.filter((p) => p.archived_at);
}

/**
 * Cria e devolve o projeto pronto para uso imediato.
 *
 * Devolve o objeto, não o id: quem cria um projeto no meio de uma captura
 * precisa do nome e da cor na mesma tecla, para pintar o pill sem esperar
 * outro round-trip.
 */
export async function criaProjeto(nome: string, codigo: string | null = null): Promise<Project | null> {
  const n = nome.trim();
  if (!n) return null;
  try {
    const id = await api.createProject(n, codigo);
    await carregaProjetos();
    return projetos.value.find((p) => p.id === id) ?? null;
  } catch (e) {
    toast.erro(api.dbErro(e));
    return null;
  }
}

/**
 * Recarrega quadro + sessão ativa juntos.
 * São sempre lidos em par porque mover um card muda os dois — separá-los deixa
 * a tela mostrando um card em "Fazendo" e nenhum cronômetro, ou o contrário.
 */
export async function carregaQuadro(): Promise<void> {
  carregando.value = true;
  try {
    const [t, s] = await Promise.all([api.boardTasks(), api.sessaoAberta()]);
    tarefas.value = t;
    rodando.value = s;
  } catch (e) {
    toast.erro(api.dbErro(e));
  } finally {
    carregando.value = false;
  }
}

/** Sequência da última carga pedida: resposta atrasada de um dia antigo é descartada. */
let seqDia = 0;

export async function carregaDia(key: DayKey = diaAtual.value): Promise<void> {
  const meu = ++seqDia;
  diaAtual.value = key;
  try {
    const [s, t] = await Promise.all([api.sessoesDoDia(key), api.totaisDoDia(key)]);
    if (meu !== seqDia) return;
    sessoesDia.value = s;
    totaisDia.value = t;
  } catch (e) {
    if (meu === seqDia) toast.erro(api.dbErro(e));
  }
}

/** Move o card e recarrega. É a operação que produz o tempo. */
export async function move(id: number, para: TaskStatus): Promise<void> {
  try {
    await api.moveTask(id, para);
    await Promise.all([carregaQuadro(), carregaDia()]);
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

export async function captura(
  titulo: string, projeto: number | null, kind: TaskCard['kind'] = 'trabalho',
): Promise<void> {
  try {
    await api.capturaTarefa(titulo, projeto, kind);
    await carregaQuadro();
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

export async function conclui(id: number, outcome: Outcome, nota: string | null): Promise<void> {
  try {
    await api.concluiTarefa(id, outcome, nota);
    await Promise.all([carregaQuadro(), carregaDia()]);
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

export async function pausa(): Promise<void> {
  try {
    await api.pausa();
    await Promise.all([carregaQuadro(), carregaDia()]);
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

export function projetoDe(id: number | null): Project | undefined {
  if (id == null) return undefined;
  return projetos.value.find((p) => p.id === id)
    ?? projetosArquivados.value.find((p) => p.id === id);
}

// ── captura global ────────────────────────────────────────────────────────
// Uma superfície de criação só, chamável de qualquer tela. Antes eram quatro
// botões que discordavam entre si — e o mais destacado deles não criava nada.

/** Aberta = objeto com o contexto; null = fechada. */
export const quickAdd = ref<{ projeto: number | null; status: TaskStatus } | null>(null);

export function abreQuickAdd(projeto: number | null = null, status: TaskStatus = 'backlog'): void {
  quickAdd.value = { projeto, status };
}
export function fechaQuickAdd(): void { quickAdd.value = null; }

/**
 * Recarrega tudo que uma tarefa nova pode ter mexido.
 * Projetos entram junto porque a contagem da sidebar muda com a captura.
 */
export async function recarregaTudo(): Promise<void> {
  await Promise.all([carregaQuadro(), carregaDia(), carregaProjetos()]);
}
