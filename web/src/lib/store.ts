// Estado compartilhado. Refs de módulo + funções exportadas, sem Pinia.
// O dado real mora no SQLite; isto é só o que a UI precisa lembrar entre telas.

import { computed, ref } from 'vue';
import type { Outcome, Project, SessionCard, TaskCard, TaskStatus, Totais } from './types';
import * as api from './db';
import { codigoAuto } from './projects';
import { dayKey, type DayKey } from './time';
import { toast } from './toast';
import { emite } from './events';

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
    // Sem código o chip de projeto cai no nome inteiro e a coluna do
    // seletor fica vazia. Derivar é melhor que pedir mais um campo.
    const id = await api.createProject(n, codigo ?? codigoAuto(n, projetos.value));
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
/**
 * Anuncia o que um movimento de coluna significou para o TEMPO. Quem entra
 * em 'fazendo' abre sessão (e fecha a que estava aberta); quem sai, fecha.
 * É a mesma regra do moveTask — aqui só vira evento para os plugins.
 */
function anunciaMovimento(id: number, de: TaskStatus | null, para: TaskStatus, rodavaAntes: number | null): void {
  emite('tarefa:movida', { id, de, para });
  if (para === 'fazendo') {
    if (rodavaAntes != null && rodavaAntes !== id) emite('sessao:encerrada', { tarefa: rodavaAntes });
    emite('sessao:iniciada', { tarefa: id, titulo: tarefas.value.find((t) => t.id === id)?.title ?? '' });
  } else if (rodavaAntes === id) {
    emite('sessao:encerrada', { tarefa: id });
  }
}

export async function move(id: number, para: TaskStatus): Promise<void> {
  const de = tarefas.value.find((t) => t.id === id)?.status ?? null;
  const rodavaAntes = rodando.value?.task_id ?? null;
  try {
    await api.moveTask(id, para);
    await Promise.all([carregaQuadro(), carregaDia()]);
    if (de !== para) anunciaMovimento(id, de, para, rodavaAntes);
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
  const de = tarefas.value.find((t) => t.id === id)?.status ?? null;
  const rodavaAntes = rodando.value?.task_id ?? null;
  try {
    await api.concluiTarefa(id, outcome, nota);
    if (de !== 'feito') anunciaMovimento(id, de, 'feito', rodavaAntes);
    await Promise.all([carregaQuadro(), carregaDia()]);
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
}

export async function pausa(): Promise<void> {
  const rodavaAntes = rodando.value?.task_id ?? null;
  try {
    await api.pausa();
    if (rodavaAntes != null) emite('sessao:encerrada', { tarefa: rodavaAntes });
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

/**
 * Card em arrasto agora. Mora no store porque o alvo (a lista de projetos na
 * sidebar) vive em App.vue e a origem (o card) vive no Quadro — soltar um card
 * sobre um projeto é a forma mais direta de reatribuir, e era impossível com
 * o `arrastando` como ref local de Quadro.vue.
 */
export const arrastando = ref<number | null>(null);

export async function soltaEmProjeto(projectId: number | null): Promise<void> {
  const id = arrastando.value;
  arrastando.value = null;
  if (id == null) return;
  try {
    await api.reatribuiProjeto([id], projectId);
    await Promise.all([carregaQuadro(), carregaProjetos()]);
    const p = projetos.value.find((x) => x.id === projectId);
    toast.ok(p ? `Movida para ${p.name}` : 'Movida para a Caixa');
  } catch (e) {
    toast.erro(api.dbErro(e));
  }
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
 * Paleta aberta: 'busca' procura notas, tarefas e projetos (Ctrl+K);
 * 'comandos' lista o que o app e os plugins sabem fazer (Ctrl+P).
 */
export const paleta = ref<null | 'busca' | 'comandos'>(null);

/**
 * Recarrega tudo que uma tarefa nova pode ter mexido.
 * Projetos entram junto porque a contagem da sidebar muda com a captura.
 */
export async function recarregaTudo(): Promise<void> {
  await Promise.all([carregaQuadro(), carregaDia(), carregaProjetos()]);
}
