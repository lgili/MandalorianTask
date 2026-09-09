// A ÚNICA camada que fala SQL. Nenhum componente escreve query; eles chamam
// as funções daqui. Mesmo papel que lib/api.ts tem no eBOM generator.
//
// O schema é criado pelas migrations em src-tauri/src/migrations.rs.

import Database from '@tauri-apps/plugin-sql';
import type {
  Outcome, Project, Session, SessionCard, Task, TaskCard, TaskKind, TaskStatus, Totais, Transition,
} from './types';
import { agoraIso, dayRangeUtc, tzAtual, type DayKey } from './tempo';

let _db: Database | null = null;

export async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:bancada.db');
  return _db;
}

/** Erro do banco em mensagem que dá para mostrar. */
export function dbErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes('idx_uma_sessao_aberta')) {
    return 'Já existe uma tarefa rodando. Pare ela antes de começar outra.';
  }
  if (m.includes('UNIQUE constraint failed: projects.name')) {
    return 'Já existe um projeto com esse nome.';
  }
  if (m.includes('FOREIGN KEY constraint failed')) {
    return 'Referência inválida — o projeto ou a tarefa não existe mais.';
  }
  if (m.includes('CHECK constraint failed')) {
    return 'Horário inválido: o fim precisa ser depois do início.';
  }
  return m;
}

// ──────────────────────────────── projetos ────────────────────────────────

export async function listProjects(incluirArquivados = false): Promise<Project[]> {
  const d = await db();
  return d.select<Project[]>(
    `SELECT * FROM projects ${incluirArquivados ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY name COLLATE NOCASE`,
  );
}

export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO projects (name, code, color, created_at) VALUES ($1,$2,$3,$4)`,
    [name.trim(), code?.trim() || null, color, agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function updateProject(
  id: number, patch: Partial<Pick<Project, 'name' | 'code' | 'color' | 'archived_at'>>,
): Promise<void> {
  await patchRow('projects', id, patch);
}

// ───────────────────────────────── tarefas ─────────────────────────────────

const TASK_SELECT = `
  SELECT t.*,
         p.name  AS project_name,
         p.code  AS project_code,
         p.color AS project_color,
         COALESCE((SELECT SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440)
                     FROM sessions s
                    WHERE s.task_id = t.id AND s.ended_at IS NOT NULL), 0) AS minutos,
         COALESCE((SELECT COUNT(*) FROM sessions s WHERE s.task_id = t.id), 0) AS sessoes,
         o.title AS origem_title,
         o.kind  AS origem_kind
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks    o ON o.id = t.origem_id`;

/** Tudo que está no quadro (inclui o backlog). */
export async function boardTasks(): Promise<TaskCard[]> {
  const d = await db();
  const rows = await d.select<TaskCard[]>(
    `${TASK_SELECT} WHERE t.archived_at IS NULL ORDER BY t.pos, t.created_at DESC`,
  );
  // SUM sobre julianday devolve float; a UI só lida com minutos inteiros.
  return rows.map((r) => ({ ...r, minutos: Math.round(r.minutos) }));
}

/**
 * Captura rápida. É a operação mais usada do app — durante uma reunião — então
 * só o título é obrigatório. Entra no topo do backlog.
 */
export async function capturaTarefa(
  title: string, project_id: number | null = null, kind: TaskKind = 'trabalho',
  due_at: string | null = null,
): Promise<number> {
  const d = await db();
  // Contexto de captura: o que estava rodando neste instante. Ninguém digita isto.
  const aberta = await d.select<Array<{ task_id: number }>>(
    `SELECT task_id FROM sessions WHERE ended_at IS NULL LIMIT 1`);
  const origem = aberta[0]?.task_id ?? null;
  const min = await d.select<Array<{ m: number | null }>>(
    `SELECT MIN(pos) AS m FROM tasks WHERE status = 'backlog' AND archived_at IS NULL`,
  );
  const pos = (min[0]?.m ?? 0) - 1;   // topo da coluna
  const agora = agoraIso();
  const r = await d.execute(
    `INSERT INTO tasks (project_id, title, kind, status, pos, created_at, due_at, origem_id)
     VALUES ($1,$2,$3,'backlog',$4,$5,$6,$7)`,
    [project_id, title.trim(), kind, pos, agora, due_at, origem],
  );
  const id = r.lastInsertId as number;
  await d.execute(`INSERT INTO transitions (task_id, de, para, at) VALUES ($1,NULL,'backlog',$2)`,
    [id, agora]);
  return id;
}

export async function updateTask(
  id: number,
  patch: Partial<Pick<Task, 'title' | 'project_id' | 'kind' | 'due_at' | 'notes' | 'pos' | 'archived_at'
                           | 'outcome' | 'outcome_note'>>,
): Promise<void> {
  await patchRow('tasks', id, patch);
}

/** Concluir com desfecho: move para 'feito' e registra COMO terminou. */
export async function concluiTarefa(id: number, outcome: Outcome, nota: string | null = null): Promise<void> {
  await moveTask(id, 'feito');
  await patchRow('tasks', id, { outcome, outcome_note: nota });
}

export async function transicoes(taskId: number): Promise<Transition[]> {
  const d = await db();
  return d.select<Transition[]>(`SELECT * FROM transitions WHERE task_id = $1 ORDER BY at`, [taskId]);
}

export async function sessoesDaTarefa(taskId: number): Promise<Session[]> {
  const d = await db();
  return d.select<Session[]>(`SELECT * FROM sessions WHERE task_id = $1 ORDER BY started_at DESC`, [taskId]);
}

/** Desfechos no período, para "Como terminaram". */
export async function desfechos(fromUtc: string, toUtc: string): Promise<Array<{ outcome: Outcome | null; n: number }>> {
  const d = await db();
  return d.select(`SELECT outcome, COUNT(*) AS n FROM tasks
                    WHERE done_at IS NOT NULL AND done_at >= $1 AND done_at < $2
                    GROUP BY outcome ORDER BY n DESC`, [fromUtc, toUtc]);
}

/** Concluídas por dia (últimos N dias), para a sparkline da sidebar. */
export async function concluidasPorDia(dias: number): Promise<Array<{ dia: string; n: number }>> {
  const d = await db();
  return d.select(`SELECT date(done_at,'localtime') AS dia, COUNT(*) AS n FROM tasks
                    WHERE done_at IS NOT NULL AND julianday('now') - julianday(done_at) < $1
                    GROUP BY dia ORDER BY dia`, [dias]);
}

export async function deleteTask(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM tasks WHERE id = $1`, [id]);   // sessões caem junto (CASCADE)
}

/**
 * Move a tarefa de coluna — e é ISTO que produz o tempo.
 *
 * Entrar em 'fazendo' abre uma sessão; sair fecha. O usuário nunca aperta
 * "iniciar cronômetro": o cronômetro é consequência do quadro.
 *
 * A ordem importa: fechamos ANTES de abrir, sempre. Assim, se o app morrer no
 * meio, o pior caso é nenhuma sessão aberta — nunca duas, que seria hora
 * contada em dobro. (O índice único no banco também barraria, mas é melhor
 * não depender disso.)
 */
export async function moveTask(id: number, para: TaskStatus): Promise<void> {
  const d = await db();
  const atual = await d.select<Array<{ status: TaskStatus; started_at: string | null }>>(
    `SELECT status, started_at FROM tasks WHERE id = $1`, [id]);
  if (!atual.length) return;
  const de = atual[0].status;
  if (de === para) return;
  const agora = agoraIso();

  // 1. Fecha QUALQUER sessão aberta (desta tarefa ou de outra).
  await d.execute(`UPDATE sessions SET ended_at = $1 WHERE ended_at IS NULL`, [agora]);

  // 2. Abre uma nova só se estiver entrando em 'fazendo'.
  if (para === 'fazendo') {
    await d.execute(
      `INSERT INTO sessions (task_id, started_at, tz, source, created_at)
       VALUES ($1,$2,$3,'auto',$4)`,
      [id, agora, tzAtual(), agora],
    );
  }

  // 3. Carimbos. started_at guarda só a PRIMEIRA vez em 'fazendo'.
  await d.execute(
    `UPDATE tasks SET
       status     = $1,
       queued_at  = CASE WHEN $1 = 'fila'    AND queued_at  IS NULL THEN $2 ELSE queued_at  END,
       started_at = CASE WHEN $1 = 'fazendo' AND started_at IS NULL THEN $2 ELSE started_at END,
       done_at    = CASE WHEN $1 = 'feito' THEN $2 ELSE NULL END,
       outcome    = CASE WHEN $1 = 'feito' THEN outcome ELSE NULL END,
       outcome_note = CASE WHEN $1 = 'feito' THEN outcome_note ELSE NULL END
     WHERE id = $3`,
    [para, agora, id],
  );

  await d.execute(`INSERT INTO transitions (task_id, de, para, at) VALUES ($1,$2,$3,$4)`,
    [id, de, para, agora]);
}

/** Reordena dentro da coluna: pos vira a média dos vizinhos, sem reescrever a lista. */
export async function reordena(id: number, anterior: number | null, proximo: number | null): Promise<void> {
  const pos = anterior != null && proximo != null ? (anterior + proximo) / 2
    : anterior != null ? anterior + 1
    : proximo != null ? proximo - 1
    : 0;
  await patchRow('tasks', id, { pos });
}

/** Tira do quadro o que está em 'feito' há mais de N dias. Relatórios seguem vendo. */
export async function arquivaFeitos(dias = 14): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `UPDATE tasks SET archived_at = $1
      WHERE status = 'feito' AND archived_at IS NULL AND done_at IS NOT NULL
        AND julianday($1) - julianday(done_at) > $2`,
    [agoraIso(), dias],
  );
  return r.rowsAffected;
}

// ───────────────────────────────── sessões ─────────────────────────────────

const SESSION_SELECT = `
  SELECT s.*, t.title, t.kind, p.name AS project_name, p.code AS project_code, p.color AS project_color
    FROM sessions s
    JOIN tasks t     ON t.id = s.task_id
    LEFT JOIN projects p ON p.id = t.project_id`;

/** A sessão que está rodando agora, se houver. */
export async function sessaoAberta(): Promise<SessionCard | null> {
  const d = await db();
  const r = await d.select<SessionCard[]>(`${SESSION_SELECT} WHERE s.ended_at IS NULL LIMIT 1`);
  return r[0] ?? null;
}

/** Fecha a sessão aberta sem mexer no status da tarefa (botão "pausar"). */
export async function pausa(): Promise<void> {
  const d = await db();
  await d.execute(`UPDATE sessions SET ended_at = $1 WHERE ended_at IS NULL`, [agoraIso()]);
}

export async function sessoesDoDia(key: DayKey): Promise<SessionCard[]> {
  const d = await db();
  const { from, to } = dayRangeUtc(key);
  // Pega quem COMEÇOU no dia: sessão que atravessa a meia-noite pertence ao dia
  // em que começou, que é como a pessoa pensa sobre o próprio dia.
  return d.select<SessionCard[]>(
    `${SESSION_SELECT} WHERE s.started_at >= $1 AND s.started_at < $2 ORDER BY s.started_at`,
    [from, to],
  );
}

export async function totaisDoDia(key: DayKey): Promise<Totais> {
  const sess = await sessoesDoDia(key);
  const t: Totais = { total: 0, trabalho: 0, reuniao: 0, admin: 0 };
  for (const s of sess) {
    if (!s.ended_at) continue;   // a que roda é contada ao vivo na UI
    const min = Math.round(
      (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
    t.total += min;
    t[s.kind] += min;
  }
  return t;
}

/** Sessão lançada à mão — "esqueci de mover o card". */
export async function criaSessao(
  task_id: number, started_at: string, ended_at: string, note: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO sessions (task_id, started_at, ended_at, tz, source, note, created_at)
     VALUES ($1,$2,$3,$4,'manual',$5,$6)`,
    [task_id, started_at, ended_at, tzAtual(), note, agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function updateSession(
  id: number, patch: Partial<Pick<Session, 'started_at' | 'ended_at' | 'task_id' | 'note'>>,
): Promise<void> {
  await patchRow('sessions', id, patch);
}

export async function deleteSession(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM sessions WHERE id = $1`, [id]);
}

// ─────────────────────────────── relatórios ───────────────────────────────

export interface LinhaProjeto {
  project_id: number | null;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  minutos: number;
}

export async function horasPorProjeto(fromUtc: string, toUtc: string): Promise<LinhaProjeto[]> {
  const d = await db();
  const rows = await d.select<LinhaProjeto[]>(
    `SELECT p.id AS project_id, p.name AS project_name, p.code AS project_code,
            p.color AS project_color,
            SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440) AS minutos
       FROM sessions s
       JOIN tasks t ON t.id = s.task_id
       LEFT JOIN projects p ON p.id = t.project_id
      WHERE s.ended_at IS NOT NULL AND s.started_at >= $1 AND s.started_at < $2
      GROUP BY p.id ORDER BY minutos DESC`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutos: Math.round(r.minutos) }));
}

export interface LinhaDia { dia: string; kind: TaskKind; minutos: number }

export async function minutosPorDia(fromUtc: string, toUtc: string): Promise<LinhaDia[]> {
  const d = await db();
  const rows = await d.select<LinhaDia[]>(
    `SELECT date(s.started_at, 'localtime') AS dia, t.kind AS kind,
            SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440) AS minutos
       FROM sessions s JOIN tasks t ON t.id = s.task_id
      WHERE s.ended_at IS NOT NULL AND s.started_at >= $1 AND s.started_at < $2
      GROUP BY dia, kind ORDER BY dia`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutos: Math.round(r.minutos) }));
}

/** Lead time (captura -> feito) e cycle time (começou -> feito), em horas. */
export interface Fluxo { task_id: number; title: string; lead_h: number; cycle_h: number | null }

export async function fluxoConcluidas(fromUtc: string, toUtc: string): Promise<Fluxo[]> {
  const d = await db();
  const rows = await d.select<Fluxo[]>(
    `SELECT id AS task_id, title,
            (julianday(done_at) - julianday(created_at)) * 24 AS lead_h,
            CASE WHEN started_at IS NULL THEN NULL
                 ELSE (julianday(done_at) - julianday(started_at)) * 24 END AS cycle_h
       FROM tasks
      WHERE done_at IS NOT NULL AND done_at >= $1 AND done_at < $2
      ORDER BY done_at DESC`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({
    ...r,
    lead_h: Math.round(r.lead_h * 10) / 10,
    cycle_h: r.cycle_h == null ? null : Math.round(r.cycle_h * 10) / 10,
  }));
}

// ──────────────────────────────── meta ────────────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  const d = await db();
  const r = await d.select<Array<{ value: string }>>(`SELECT value FROM meta WHERE key = $1`, [key]);
  return r.length ? r[0].value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO meta (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]);
}

// ──────────────────────────────── interno ────────────────────────────────

/**
 * UPDATE parcial. As chaves vêm de tipos TS, mas TS não existe em runtime —
 * então validamos contra uma lista branca antes de interpolar no SQL.
 */
const COLUNAS: Record<string, ReadonlySet<string>> = {
  projects: new Set(['name', 'code', 'color', 'archived_at']),
  tasks: new Set(['title', 'project_id', 'kind', 'status', 'due_at', 'notes', 'pos', 'archived_at', 'outcome', 'outcome_note']),
  sessions: new Set(['started_at', 'ended_at', 'task_id', 'note']),
};

async function patchRow(tabela: keyof typeof COLUNAS, id: number, patch: object): Promise<void> {
  const campos = Object.keys(patch).filter((c) => COLUNAS[tabela].has(c));
  if (!campos.length) return;
  const d = await db();
  const set = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await d.execute(
    `UPDATE ${tabela} SET ${set} WHERE id = $${campos.length + 1}`,
    [...campos.map((c) => (patch as Record<string, unknown>)[c]), id],
  );
}
