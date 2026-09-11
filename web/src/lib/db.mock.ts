// Espelho de db.ts em memória, para rodar a UI no navegador sem Tauri.
//
// Existe por um motivo prático: ajustar visual recompilando o binário Rust a
// cada mudança é lento demais, e olhar a tela é a única forma honesta de
// avaliar design. `pnpm dev:mock` abre o app no navegador com estes dados.
//
// A API é idêntica à de db.ts — o Vite troca um pelo outro por alias.

import type {
  NotaIndice, NotaResumo, Outcome, Project, ResultadoBusca, Session, SessionCard, Task, TaskCard,
  TaskKind, TaskStatus, Totais, Transition,
} from './types';
import { dayRangeUtc, type DayKey } from './tempo';

export interface LinhaProjeto {
  project_id: number | null; project_name: string | null; project_code: string | null;
  project_color: string | null; minutos: number;
}
export interface LinhaDia { dia: string; kind: TaskKind; minutos: number }
export interface Fluxo { task_id: number; title: string; lead_h: number; cycle_h: number | null }

const AGORA = new Date();
const em = (dias: number, h: number, m = 0) => {
  const d = new Date(AGORA); d.setDate(d.getDate() - dias); d.setHours(h, m, 0, 0); return d;
};
const iso = (d: Date) => d.toISOString();

const projetos: Project[] = [
  { id: 1, name: 'Flyback rev C', code: 'CF03B04', color: 'p1', archived_at: null, created_at: iso(em(60, 9)) },
  { id: 2, name: 'NACQ 2026', code: 'NACQ', color: 'p2', archived_at: null, created_at: iso(em(60, 9)) },
  { id: 3, name: 'Bancada e infra', code: 'INFRA', color: 'p3', archived_at: null, created_at: iso(em(60, 9)) },
];

let seqT = 0;
const T = (o: Partial<Task> & { title: string }): Task => ({
  id: ++seqT, project_id: null, kind: 'trabalho', status: 'backlog', pos: seqT,
  due_at: null, notes: null, created_at: iso(em(5, 10)), origem_id: null,
  queued_at: null, started_at: null, done_at: null, archived_at: null,
  outcome: null, outcome_note: null, ...o,
});

const dfmea = T({ title: 'Revisão DFMEA — Flyback rev C', kind: 'reuniao', project_id: 1,
  status: 'feito', created_at: iso(em(9, 8, 30)), done_at: iso(em(9, 15)) });
const compras = T({ title: 'Alinhamento semanal com compras', kind: 'reuniao', project_id: 2,
  status: 'feito', created_at: iso(em(2, 9)), done_at: iso(em(2, 11, 40)) });

const tarefas: Task[] = [
  dfmea, compras,
  T({ title: 'medir ripple no barramento 400 V com ponteira diferencial', project_id: 1,
      created_at: iso(em(9, 14, 22)), origem_id: dfmea.id }),
  T({ title: 'conferir derating do capacitor de saída a 85 °C', project_id: 1,
      created_at: iso(em(9, 14, 31)), origem_id: dfmea.id }),
  T({ title: 'adicionar teste de continuidade do snubber no ATE', project_id: 1,
      created_at: iso(em(9, 14, 44)), origem_id: dfmea.id }),
  T({ title: 'pedir amostra do driver isolado UCC21540', project_id: 2,
      created_at: iso(em(2, 11, 18)), origem_id: compras.id }),
  T({ title: 'cotar indutor alternativo de 47 µH', project_id: 2,
      created_at: iso(em(2, 11, 29)), origem_id: compras.id }),
  T({ title: 'estudar topologia LLC para a próxima geração', created_at: iso(em(6, 17, 40)) }),
  T({ title: 'migrar planilha de perdas para script', project_id: 3, created_at: iso(em(4, 18)) }),
  T({ title: 'recalibrar a ponteira diferencial (venceu em maio)', project_id: 3,
      created_at: iso(em(1, 9, 15)) }),

  T({ title: 'Fechar eBOM CF03B04 rev C', project_id: 1, status: 'fila',
      created_at: iso(em(7, 10)), queued_at: iso(em(1, 9)), due_at: iso(em(-2, 12)) }),
  T({ title: 'Refazer DFMEA da malha de corrente', project_id: 2, status: 'fila',
      created_at: iso(em(5, 15)), queued_at: iso(em(1, 9)), due_at: iso(em(-9, 12)) }),
  T({ title: 'Trocar o ventilador da carga eletrônica', project_id: 3, status: 'fila',
      created_at: iso(em(3, 16)), queued_at: iso(em(1, 9)) }),

  T({ title: 'Ensaio térmico — 3 pontos de carga', project_id: 1, status: 'fazendo',
      created_at: iso(em(8, 16)), queued_at: iso(em(3, 9)), started_at: iso(em(3, 10, 30)) }),
  T({ title: 'Revisar layout do snubber RCD', project_id: 1, status: 'fazendo',
      created_at: iso(em(10, 11)), queued_at: iso(em(4, 9)), started_at: iso(em(4, 13)) }),

  T({ title: 'Ensaio EMC pré-compliance', project_id: 1, status: 'feito', outcome: 'entregue',
      created_at: iso(em(12, 9)), started_at: iso(em(12, 9)), done_at: iso(em(6, 17)) }),
  T({ title: 'Simulação do snubber no LTspice', project_id: 1, status: 'feito', outcome: 'entregue',
      created_at: iso(em(14, 9)), started_at: iso(em(11, 9)), done_at: iso(em(10, 17)) }),
  T({ title: 'Cotação de conectores AC', project_id: 2, status: 'feito', outcome: 'repassada',
      created_at: iso(em(8, 9)), started_at: iso(em(6, 16)), done_at: iso(em(5, 17)) }),
  T({ title: 'Organizar datasheets da bancada 2', project_id: 3, kind: 'admin', status: 'feito', outcome: 'descartada',
      created_at: iso(em(7, 9)), started_at: iso(em(5, 17)), done_at: iso(em(5, 18)) }),
  T({ title: 'Daily do time de hardware', kind: 'reuniao', status: 'feito',
      created_at: iso(em(1, 8)), started_at: iso(em(1, 9)), done_at: iso(em(1, 9, 20)) }),
  T({ title: 'Revisão de projeto — CF03B04', kind: 'reuniao', project_id: 1, status: 'feito',
      created_at: iso(em(1, 8)), started_at: iso(em(1, 10)), done_at: iso(em(1, 11, 15)) }),
];

const termico = tarefas.find((t) => t.title.startsWith('Ensaio térmico'))!;
const snubber = tarefas.find((t) => t.title.startsWith('Revisar layout'))!;

let seqS = 0;
const S = (task_id: number, ini: Date, min: number | null): Session => ({
  id: ++seqS, task_id, started_at: iso(ini),
  ended_at: min == null ? null : iso(new Date(ini.getTime() + min * 60000)),
  tz: 'America/Sao_Paulo', source: 'auto', note: null, created_at: iso(ini),
});

const sessoes: Session[] = [];
// ruído realista dos últimos 14 dias úteis
let semente = 4242;
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let d = 14; d >= 0; d--) {   // inclui HOJE: sem isso a tela Hoje abre vazia
  const dia = em(d, 9);
  if (dia.getDay() === 0 || dia.getDay() === 6) continue;
  const alvo = rnd() > 0.5 ? termico : snubber;
  const reuniao = tarefas.filter((t) => t.kind === 'reuniao')[Math.floor(rnd() * 2)];
  if (d > 0) {
    sessoes.push(S(alvo.id, em(d, 10, Math.floor(rnd() * 40)), 70 + Math.floor(rnd() * 60)));
    sessoes.push(S(alvo.id, em(d, 14, Math.floor(rnd() * 30)), 80 + Math.floor(rnd() * 60)));
    sessoes.push(S(reuniao.id, em(d, 9), 25 + Math.floor(rnd() * 55)));
    if (rnd() > 0.6) sessoes.push(S(tarefas.find((t) => t.kind === 'admin')!.id, em(d, 17), 30));
  } else {
    // hoje: encaixa antes de AGORA, qualquer que seja a hora
    const antes = (minAtras: number) => new Date(AGORA.getTime() - minAtras * 60000);
    sessoes.push(S(reuniao.id, antes(230), 40));
    sessoes.push(S(alvo.id, antes(180), 95));
    sessoes.push(S(snubber.id, antes(75), 25));
  }
}
// Toda tarefa já trabalhada precisa de tempo: uma coluna inteira de "0h00"
// faz o card parecer quebrado, e esconde justamente o número que é a tese.
for (const t of tarefas) {
  if (t.status === 'backlog') continue;
  if (sessoes.some((s) => s.task_id === t.id)) continue;
  const base = t.status === 'feito' ? 3 : 2;
  for (let i = 0; i < base; i++) {
    sessoes.push(S(t.id, em(4 + i * 2, 9 + Math.floor(rnd() * 6)), 45 + Math.floor(rnd() * 150)));
  }
}

// a sessão aberta
sessoes.push(S(termico.id, new Date(AGORA.getTime() - 47 * 60000), null));

// ── API ────────────────────────────────────────────────────────────────────
const proj = (id: number | null) => projetos.find((p) => p.id === id);
const min = (s: Session) => s.ended_at
  ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000) : 0;

export async function db(): Promise<never> { throw new Error('mock'); }
export function dbErro(e: unknown): string { return e instanceof Error ? e.message : String(e); }

export const PALETA = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type Cor = typeof PALETA[number];

export async function proximaCor(): Promise<Cor> {
  const uso = new Map<string, number>();
  for (const p of projetos) if (!p.archived_at && p.color) uso.set(p.color, (uso.get(p.color) ?? 0) + 1);
  return PALETA.reduce((a, b) => ((uso.get(a) ?? 0) <= (uso.get(b) ?? 0) ? a : b));
}

export async function listProjects(incluirArquivados = false): Promise<Project[]> {
  return projetos.filter((p) => incluirArquivados || !p.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

let seqP = 100;
export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const nome = name.trim();
  if (projetos.some((p) => p.name.toLowerCase() === nome.toLowerCase())) {
    throw new Error('UNIQUE constraint failed: projects.name');
  }
  const p: Project = {
    id: ++seqP, name: nome, code: code?.trim() || null,
    color: color ?? await proximaCor(), archived_at: null, created_at: new Date().toISOString(),
  };
  projetos.push(p);
  return p.id;
}

export async function updateProject(id: number, patch: Partial<Project>): Promise<void> {
  const p = projetos.find((x) => x.id === id); if (p) Object.assign(p, patch);
}

export async function deleteProject(id: number): Promise<void> {
  const i = projetos.findIndex((p) => p.id === id);
  if (i < 0) return;
  projetos.splice(i, 1);
  for (const t of tarefas) if (t.project_id === id) t.project_id = null;
}

export async function pintaProjetosSemCor(): Promise<number> {
  let n = 0;
  for (const p of projetos) if (!p.color) { p.color = await proximaCor(); n++; }
  return n;
}

export interface ProjetoResumo extends Project {
  abertas: number; fazendo: number; feitas: number; total: number;
  minutos: number; ultima_at: string | null;
}

export async function resumoProjetos(incluirArquivados = false): Promise<ProjetoResumo[]> {
  const out = projetos.filter((p) => incluirArquivados || !p.archived_at).map((p) => {
    const suas = tarefas.filter((t) => t.project_id === p.id);
    const ids = new Set(suas.map((t) => t.id));
    const sess = sessoes.filter((s) => ids.has(s.task_id));
    const quandos = [...suas.map((t) => t.created_at), ...sess.map((s) => s.started_at)].sort();
    return {
      ...p,
      abertas: suas.filter((t) => !t.archived_at && t.status !== 'feito').length,
      fazendo: suas.filter((t) => !t.archived_at && t.status === 'fazendo').length,
      feitas: suas.filter((t) => t.status === 'feito').length,
      total: suas.length,
      minutos: sess.reduce((a, x) => a + min(x), 0),
      ultima_at: quandos.length ? quandos[quandos.length - 1] : null,
    };
  });
  return out.sort((a, b) => (a.ultima_at ? 0 : 1) - (b.ultima_at ? 0 : 1)
    || (b.ultima_at ?? '').localeCompare(a.ultima_at ?? '')
    || a.name.localeCompare(b.name));
}

export async function tarefasDoProjeto(
  projectId: number | null, incluirArquivadas = true,
): Promise<TaskCard[]> {
  return tarefas
    .filter((t) => t.project_id === projectId && (incluirArquivadas || !t.archived_at))
    .map(card);
}

export async function reatribuiProjeto(ids: number[], projectId: number | null): Promise<void> {
  for (const t of tarefas) if (ids.includes(t.id)) t.project_id = projectId;
}

function card(t: Task): TaskCard {
  const p = proj(t.project_id);
  const s = sessoes.filter((x) => x.task_id === t.id);
  const o = tarefas.find((x) => x.id === t.origem_id);
  return {
    ...t,
    project_name: p?.name ?? null, project_code: p?.code ?? null, project_color: p?.color ?? null,
    minutos: s.reduce((a, x) => a + min(x), 0), sessoes: s.length,
    origem_title: o?.title ?? null, origem_kind: o?.kind ?? null,
  };
}

export async function boardTasks(): Promise<TaskCard[]> {
  return tarefas.filter((t) => !t.archived_at).map(card);
}
export async function capturaTarefa(title: string, project_id: number | null = null,
  kind: TaskKind = 'trabalho', due_at: string | null = null): Promise<number> {
  const t = T({ title, project_id, kind, due_at, created_at: new Date().toISOString(),
    origem_id: sessoes.find((s) => !s.ended_at)?.task_id ?? null });
  tarefas.unshift(t);
  return t.id;
}
export async function updateTask(id: number, patch: Partial<Task>): Promise<void> {
  const t = tarefas.find((x) => x.id === id); if (t) Object.assign(t, patch);
}
export async function concluiTarefa(id: number, outcome: Outcome, nota: string | null = null): Promise<void> {
  await moveTask(id, 'feito');
  const t = tarefas.find((x) => x.id === id); if (t) { t.outcome = outcome; t.outcome_note = nota; }
}
export async function transicoes(taskId: number): Promise<Transition[]> {
  const t = tarefas.find((x) => x.id === taskId); if (!t) return [];
  const out: Transition[] = [{ id: 1, task_id: taskId, de: null, para: 'backlog', at: t.created_at }];
  if (t.queued_at) out.push({ id: 2, task_id: taskId, de: 'backlog', para: 'fila', at: t.queued_at });
  if (t.started_at) out.push({ id: 3, task_id: taskId, de: 'fila', para: 'fazendo', at: t.started_at });
  if (t.done_at) out.push({ id: 4, task_id: taskId, de: 'fazendo', para: 'feito', at: t.done_at });
  return out;
}
export async function sessoesDaTarefa(taskId: number): Promise<Session[]> {
  return sessoes.filter((s) => s.task_id === taskId).sort((a, b) => b.started_at.localeCompare(a.started_at));
}
export async function desfechos(fromUtc: string, toUtc: string): Promise<Array<{ outcome: Outcome | null; n: number }>> {
  const acc = new Map<Outcome | null, number>();
  for (const t of tarefas) if (t.done_at && t.done_at >= fromUtc && t.done_at < toUtc)
    acc.set(t.outcome, (acc.get(t.outcome) ?? 0) + 1);
  return [...acc].map(([outcome, n]) => ({ outcome, n })).sort((a, b) => b.n - a.n);
}
export async function concluidasPorDia(dias: number): Promise<Array<{ dia: string; n: number }>> {
  const acc = new Map<string, number>();
  const lim = new Date(AGORA.getTime() - dias * 86400000).toISOString();
  for (const t of tarefas) if (t.done_at && t.done_at >= lim) {
    const d = new Date(t.done_at);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    acc.set(k, (acc.get(k) ?? 0) + 1);
  }
  return [...acc].map(([dia, n]) => ({ dia, n })).sort((a, b) => a.dia.localeCompare(b.dia));
}
export async function deleteTask(id: number): Promise<void> {
  const i = tarefas.findIndex((t) => t.id === id);
  if (i >= 0) tarefas.splice(i, 1);
}
export async function moveTask(id: number, para: TaskStatus): Promise<void> {
  const t = tarefas.find((x) => x.id === id);
  if (!t || t.status === para) return;
  const agora = new Date();
  for (const s of sessoes) if (!s.ended_at) s.ended_at = iso(agora);
  if (para === 'fazendo') sessoes.push(S(id, agora, null));
  t.status = para;
  if (para === 'feito') t.done_at = iso(agora); else t.done_at = null;
  if (para === 'fazendo' && !t.started_at) t.started_at = iso(agora);
}
export async function reordena(): Promise<void> {}
export async function arquivaFeitos(): Promise<number> { return 0; }

function sessCard(s: Session): SessionCard {
  const t = tarefas.find((x) => x.id === s.task_id)!;
  const p = proj(t.project_id);
  return { ...s, title: t.title, kind: t.kind, project_name: p?.name ?? null,
    project_code: p?.code ?? null, project_color: p?.color ?? null };
}

export async function sessaoAberta(): Promise<SessionCard | null> {
  const s = sessoes.find((x) => !x.ended_at);
  return s ? sessCard(s) : null;
}
export async function pausa(): Promise<void> {
  for (const s of sessoes) if (!s.ended_at) s.ended_at = new Date().toISOString();
}
export async function sessoesDoDia(key: DayKey): Promise<SessionCard[]> {
  const { from, to } = dayRangeUtc(key);
  return sessoes.filter((s) => s.started_at >= from && s.started_at < to)
    .sort((a, b) => a.started_at.localeCompare(b.started_at)).map(sessCard);
}
export async function totaisDoDia(key: DayKey): Promise<Totais> {
  const t: Totais = { total: 0, trabalho: 0, reuniao: 0, admin: 0 };
  for (const s of await sessoesDoDia(key)) {
    if (!s.ended_at) continue;
    const m = min(s); t.total += m; t[s.kind] += m;
  }
  return t;
}
export async function criaSessao(): Promise<number> { return 0; }
export async function updateSession(id: number, patch: Partial<Session>): Promise<void> {
  const s = sessoes.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
}
export async function deleteSession(id: number): Promise<void> {
  const i = sessoes.findIndex((s) => s.id === id);
  if (i >= 0) sessoes.splice(i, 1);
}

export async function horasPorProjeto(fromUtc: string, toUtc: string): Promise<LinhaProjeto[]> {
  const acc = new Map<number | null, LinhaProjeto>();
  for (const s of sessoes) {
    if (!s.ended_at || s.started_at < fromUtc || s.started_at >= toUtc) continue;
    const t = tarefas.find((x) => x.id === s.task_id)!;
    const p = proj(t.project_id);
    const k = p?.id ?? null;
    if (!acc.has(k)) acc.set(k, { project_id: k, project_name: p?.name ?? null,
      project_code: p?.code ?? null, project_color: p?.color ?? null, minutos: 0 });
    acc.get(k)!.minutos += min(s);
  }
  return [...acc.values()].sort((a, b) => b.minutos - a.minutos);
}
export async function minutosPorDia(fromUtc: string, toUtc: string): Promise<LinhaDia[]> {
  const acc = new Map<string, LinhaDia>();
  for (const s of sessoes) {
    if (!s.ended_at || s.started_at < fromUtc || s.started_at >= toUtc) continue;
    const t = tarefas.find((x) => x.id === s.task_id)!;
    const d = new Date(s.started_at);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const k = `${dia}|${t.kind}`;
    if (!acc.has(k)) acc.set(k, { dia, kind: t.kind, minutos: 0 });
    acc.get(k)!.minutos += min(s);
  }
  return [...acc.values()];
}
export async function fluxoConcluidas(fromUtc: string, toUtc: string): Promise<Fluxo[]> {
  return tarefas.filter((t) => t.done_at && t.done_at >= fromUtc && t.done_at < toUtc).map((t) => ({
    task_id: t.id, title: t.title,
    lead_h: Math.round((new Date(t.done_at!).getTime() - new Date(t.created_at).getTime()) / 360000) / 10,
    cycle_h: t.started_at
      ? Math.round((new Date(t.done_at!).getTime() - new Date(t.started_at).getTime()) / 360000) / 10 : null,
  }));
}
export async function getMeta(): Promise<string | null> { return null; }
export async function setMeta(): Promise<void> {}

// ── notas (índice) ─────────────────────────────────────────────────────────
const indice = new Map<string, NotaIndice>();
const semAcento = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function resumo(n: NotaIndice): NotaResumo {
  const ref = n.projeto?.toLowerCase();
  const p = ref ? (projetos.find((x) => x.code?.toLowerCase() === ref)
    ?? projetos.find((x) => x.name.toLowerCase() === ref)) : undefined;
  return {
    path: n.path, title: n.title, mtime: n.mtime, projeto: n.projeto, tags: n.tags,
    project_id: p?.id ?? null, project_name: p?.name ?? null, project_color: p?.color ?? null,
  };
}

export async function notasIndexadas(): Promise<Array<{ path: string; mtime: number }>> {
  return [...indice.values()].map((n) => ({ path: n.path, mtime: n.mtime }));
}
export async function indexaNota(n: NotaIndice): Promise<void> { indice.set(n.path, n); }
export async function desindexaNota(path: string): Promise<void> { indice.delete(path); }
export async function renomeiaNoIndice(de: string, para: string): Promise<void> {
  const n = indice.get(de); if (!n) return;
  indice.delete(de); indice.set(para, { ...n, path: para });
}
export async function limpaIndice(): Promise<void> { indice.clear(); }
export async function listaNotas(): Promise<NotaResumo[]> {
  return [...indice.values()].sort((a, b) => b.mtime - a.mtime).map(resumo);
}
export async function notasDoProjeto(projectId: number): Promise<NotaResumo[]> {
  return (await listaNotas()).filter((n) => n.project_id === projectId);
}
export async function backlinks(path: string, nomeNorm: string, pathNorm: string): Promise<NotaResumo[]> {
  return [...indice.values()]
    .filter((n) => n.path !== path && (n.links.includes(nomeNorm) || n.links.includes(pathNorm)))
    .sort((a, b) => b.mtime - a.mtime).map(resumo);
}
export async function todasAsLigacoes(): Promise<Array<{ src: string; target: string }>> {
  return [...indice.values()].flatMap((n) => n.links.map((target) => ({ src: n.path, target })));
}
export async function buscaNotas(q: string, limite = 30): Promise<ResultadoBusca[]> {
  const termos = q.trim().split(/\s+/).filter(Boolean).map(semAcento);
  if (!termos.length) return [];
  const out: Array<ResultadoBusca & { s: number }> = [];
  for (const n of indice.values()) {
    const t = semAcento(n.title); const b = semAcento(n.body);
    // cada termo é prefixo de alguma palavra, como o `"x"*` do FTS5
    const casa = (alvo: string, termo: string) => alvo.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(termo));
    if (!termos.every((x) => casa(t, x) || casa(b, x))) continue;
    const s = termos.reduce((acc, x) => acc + (casa(t, x) ? 5 : 0) + (casa(b, x) ? 1 : 0), 0);
    const i = b.indexOf(termos[0]);
    const ini = Math.max(0, i - 60);
    const pedaco = i < 0 ? n.body.slice(0, 120)
      : `${ini ? '…' : ''}${n.body.slice(ini, i)}\u0002${n.body.slice(i, i + termos[0].length)}\u0003${n.body.slice(i + termos[0].length, i + 90)}…`;
    out.push({ path: n.path, title: n.title, trecho: pedaco, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, limite).map(({ s: _s, ...r }) => r);
}
