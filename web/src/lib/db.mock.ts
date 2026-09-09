// Espelho de db.ts em memória, para rodar a UI no navegador sem Tauri.
//
// Existe por um motivo prático: ajustar visual recompilando o binário Rust a
// cada mudança é lento demais, e olhar a tela é a única forma honesta de
// avaliar design. `pnpm dev:mock` abre o app no navegador com estes dados.
//
// A API é idêntica à de db.ts — o Vite troca um pelo outro por alias.

import type {
  Project, Session, SessionCard, Task, TaskCard, TaskKind, TaskStatus, Totais,
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
  queued_at: null, started_at: null, done_at: null, archived_at: null, ...o,
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

  T({ title: 'Ensaio EMC pré-compliance', project_id: 1, status: 'feito',
      created_at: iso(em(12, 9)), started_at: iso(em(12, 9)), done_at: iso(em(6, 17)) }),
  T({ title: 'Simulação do snubber no LTspice', project_id: 1, status: 'feito',
      created_at: iso(em(14, 9)), started_at: iso(em(11, 9)), done_at: iso(em(10, 17)) }),
  T({ title: 'Cotação de conectores AC', project_id: 2, status: 'feito',
      created_at: iso(em(8, 9)), started_at: iso(em(6, 16)), done_at: iso(em(5, 17)) }),
  T({ title: 'Organizar datasheets da bancada 2', project_id: 3, kind: 'admin', status: 'feito',
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
  const cabe = (h: number) => d > 0 || h < AGORA.getHours() - 1;
  if (cabe(11)) sessoes.push(S(alvo.id, em(d, 10, Math.floor(rnd() * 40)), 70 + Math.floor(rnd() * 60)));
  if (cabe(15)) sessoes.push(S(alvo.id, em(d, 14, Math.floor(rnd() * 30)), 80 + Math.floor(rnd() * 60)));
  const reuniao = tarefas.filter((t) => t.kind === 'reuniao')[Math.floor(rnd() * 2)];
  if (cabe(10)) sessoes.push(S(reuniao.id, em(d, 9), 25 + Math.floor(rnd() * 55)));
  if (rnd() > 0.6 && cabe(18)) sessoes.push(S(tarefas.find((t) => t.kind === 'admin')!.id, em(d, 17), 30));
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

export async function listProjects(): Promise<Project[]> { return projetos; }
export async function createProject(): Promise<number> { return 0; }
export async function updateProject(): Promise<void> {}

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
export async function updateTask(): Promise<void> {}
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
