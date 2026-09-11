// Espelhos TS das tabelas. Mantidos à mão: o schema é pequeno e um gerador
// seria mais peça para manter do que economia.

export type TaskStatus = 'backlog' | 'fila' | 'fazendo' | 'feito';
export type TaskKind = 'trabalho' | 'reuniao' | 'admin';
export type SessionSource = 'auto' | 'manual';
export type Outcome = 'entregue' | 'descartada' | 'repassada' | 'revertida';

export const OUTCOMES: Array<{ id: Outcome; label: string; desc: string }> = [
  { id: 'entregue',   label: 'Entregue',   desc: 'saiu do jeito que devia' },
  { id: 'descartada', label: 'Descartada', desc: 'não valia o custo' },
  { id: 'repassada',  label: 'Repassada',  desc: 'outra pessoa assumiu' },
  { id: 'revertida',  label: 'Revertida',  desc: 'voltou atrás, precisa repensar' },
];

export const STATUS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'fila', label: 'Fila' },
  { id: 'fazendo', label: 'Fazendo' },
  { id: 'feito', label: 'Feito' },
];

export const KINDS: Array<{ id: TaskKind; label: string }> = [
  { id: 'trabalho', label: 'Trabalho' },
  { id: 'reuniao', label: 'Reunião' },
  { id: 'admin', label: 'Admin' },
];

export interface Project {
  id: number;
  name: string;
  code: string | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number | null;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  pos: number;
  due_at: string | null;
  notes: string | null;
  /** Quando foi capturada — em geral, no meio de uma reunião. */
  created_at: string;
  /** Tarefa que estava rodando quando esta foi capturada. */
  origem_id: number | null;
  queued_at: string | null;
  /** PRIMEIRA vez que entrou em 'fazendo'. Base do cycle time. */
  started_at: string | null;
  done_at: string | null;
  archived_at: string | null;
  outcome: Outcome | null;
  outcome_note: string | null;
}

export interface Transition { id: number; task_id: number; de: TaskStatus | null; para: TaskStatus; at: string }

/** Tarefa com o que a UI precisa junto: projeto e tempo acumulado. */
export interface TaskCard extends Task {
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  /** Minutos de sessões FECHADAS. A aberta é contada ao vivo na UI. */
  minutos: number;
  /** Quantas vezes já foi trabalhada. Revela tarefa que vive sendo retomada. */
  sessoes: number;
  /** Título do que estava rodando na captura — em geral, a reunião. */
  origem_title: string | null;
  origem_kind: TaskKind | null;
}

export interface Session {
  id: number;
  task_id: number;
  started_at: string;
  /** NULL = rodando agora. */
  ended_at: string | null;
  tz: string;
  source: SessionSource;
  note: string | null;
  created_at: string;
}

/** Sessão com o contexto da tarefa, para a timeline e o rodapé. */
export interface SessionCard extends Session {
  title: string;
  kind: TaskKind;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
}

export interface Totais {
  /** Minutos fechados, no período. */
  total: number;
  trabalho: number;
  reuniao: number;
  admin: number;
}

// ── notas ──────────────────────────────────────────────────────────────────
// O .md no disco é a verdade; estes tipos descrevem só o ÍNDICE dele.

/** O que o indexador grava para uma nota. */
export interface NotaIndice {
  path: string;
  title: string;
  mtime: number;
  size: number;
  /** Valor cru de `projeto:` no frontmatter. */
  projeto: string | null;
  tags: string[];
  /** Texto limpo para a busca. */
  body: string;
  /** Alvos de [[link]] já normalizados. */
  links: string[];
}

/** Nota com o projeto resolvido — o que listas e cabeçalhos mostram. */
export interface NotaResumo {
  path: string;
  title: string;
  mtime: number;
  projeto: string | null;
  tags: string[];
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
}

export interface ResultadoBusca {
  path: string;
  title: string;
  /** Trecho com os termos entre \u0002 e \u0003, para a UI destacar. */
  trecho: string;
}
