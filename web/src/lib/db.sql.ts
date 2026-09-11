// A ÚNICA camada que fala SQL. Nenhum componente escreve query; eles chamam
// as funções daqui. Mesmo papel que lib/api.ts tem no eBOM generator.
//
// O schema é criado pelas migrations em src-tauri/src/migrations.rs.

import Database from '@tauri-apps/plugin-sql';
import type {
  NotaIndice, NotaResumo, Outcome, Project, ResultadoBusca, Session, SessionCard, Task, TaskCard,
  TaskKind, TaskStatus, Totais, Transition,
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

/**
 * Paleta fechada de cor de projeto.
 *
 * A coluna guarda o NOME do token ('p1'..'p6'), não um hex: a cor precisa
 * mudar junto com o tema, e só o CSS sabe fazer isso. (A migration v1 chama a
 * coluna de "hex sem '#'" — o comentário está errado desde o primeiro dia; o
 * front sempre leu var(--pN). Não dá para editar a migration, então a verdade
 * mora aqui.)
 */
export const PALETA = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const;
export type Cor = typeof PALETA[number];

/**
 * A cor menos usada entre os projetos vivos.
 *
 * Ninguém escolhe cor ao criar um projeto. Perguntar isso no meio de uma
 * reunião é a fricção que faz o campo ficar vazio para sempre — e cor vazia
 * era o motivo de TODO projeto real nascer cinza enquanto o mock era colorido.
 */
export async function proximaCor(): Promise<Cor> {
  const d = await db();
  const rows = await d.select<Array<{ color: string; n: number }>>(
    `SELECT color, COUNT(*) AS n FROM projects
      WHERE archived_at IS NULL AND color IS NOT NULL GROUP BY color`,
  );
  const uso = new Map(rows.map((r) => [r.color, r.n]));
  return PALETA.reduce((a, b) => ((uso.get(a) ?? 0) <= (uso.get(b) ?? 0) ? a : b));
}

export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO projects (name, code, color, created_at) VALUES ($1,$2,$3,$4)`,
    [name.trim(), code?.trim() || null, color ?? await proximaCor(), agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function updateProject(
  id: number, patch: Partial<Pick<Project, 'name' | 'code' | 'color' | 'archived_at'>>,
): Promise<void> {
  await patchRow('projects', id, patch);
}

/**
 * Apaga o projeto. As tarefas SOBREVIVEM e voltam para a Caixa — é o
 * ON DELETE SET NULL da migration v1. Apagar projeto nunca pode apagar
 * trabalho medido junto.
 */
export async function deleteProject(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM projects WHERE id = $1`, [id]);
}

/**
 * Dá cor aos projetos criados antes de a cor existir. Roda na abertura, uma
 * vez por projeto sem cor, e é silencioso: é conserto de dado, não notícia.
 */
export async function pintaProjetosSemCor(): Promise<number> {
  const d = await db();
  const sem = await d.select<Array<{ id: number }>>(
    `SELECT id FROM projects WHERE color IS NULL ORDER BY id`);
  for (const p of sem) {
    await d.execute(`UPDATE projects SET color = $1 WHERE id = $2`, [await proximaCor(), p.id]);
  }
  return sem.length;
}

/** Projeto + o que a lista e o cabeçalho precisam mostrar junto. */
export interface ProjetoResumo extends Project {
  abertas: number;
  fazendo: number;
  feitas: number;
  total: number;
  /** Minutos de sessões fechadas de TODAS as tarefas do projeto. */
  minutos: number;
  /** Último sinal de vida: captura de tarefa ou sessão. NULL = projeto vazio. */
  ultima_at: string | null;
}

/**
 * A lista de projetos com números.
 *
 * Ordenada por ATIVIDADE, não por nome: num seletor e numa sidebar, o que foi
 * tocado ontem tem que vir antes do que dorme há três meses. Projeto sem
 * nenhuma atividade vai para o fim, não some.
 */
export async function resumoProjetos(incluirArquivados = false): Promise<ProjetoResumo[]> {
  const d = await db();
  const rows = await d.select<ProjetoResumo[]>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.archived_at IS NULL AND t.status <> 'feito')                       AS abertas,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.archived_at IS NULL AND t.status = 'fazendo')                      AS fazendo,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id
          AND t.status = 'feito')                                                  AS feitas,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id)                    AS total,
       COALESCE((SELECT SUM((julianday(s.ended_at) - julianday(s.started_at)) * 1440)
                   FROM sessions s JOIN tasks t ON t.id = s.task_id
                  WHERE t.project_id = p.id AND s.ended_at IS NOT NULL), 0)        AS minutos,
       (SELECT MAX(quando) FROM (
          SELECT MAX(t.created_at) AS quando FROM tasks t WHERE t.project_id = p.id
          UNION ALL
          SELECT MAX(s.started_at) FROM sessions s JOIN tasks t ON t.id = s.task_id
           WHERE t.project_id = p.id
       ))                                                                          AS ultima_at
     FROM projects p
     ${incluirArquivados ? '' : 'WHERE p.archived_at IS NULL'}
     ORDER BY (ultima_at IS NULL), ultima_at DESC, p.name COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...r, minutos: Math.round(r.minutos) }));
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
 * As tarefas de UM projeto — a pergunta que o app inteiro não sabia responder.
 * `projectId === null` devolve a Caixa: o que foi capturado sem projeto.
 *
 * Inclui as arquivadas por padrão, ao contrário do quadro: a tela do projeto é
 * o histórico dele, e esconder o que foi entregue há 20 dias esvazia justamente
 * a parte que responde "esse projeto rendeu?".
 */
export async function tarefasDoProjeto(
  projectId: number | null, incluirArquivadas = true,
): Promise<TaskCard[]> {
  const d = await db();
  const rows = await d.select<TaskCard[]>(
    `${TASK_SELECT}
      WHERE ${projectId == null ? 't.project_id IS NULL' : 't.project_id = $1'}
        ${incluirArquivadas ? '' : 'AND t.archived_at IS NULL'}
      ORDER BY t.pos, t.created_at DESC`,
    projectId == null ? [] : [projectId],
  );
  return rows.map((r) => ({ ...r, minutos: Math.round(r.minutos) }));
}

/**
 * Joga N tarefas num projeto de uma vez. Reclassificar dez tarefas custava dez
 * aberturas de drawer e ~40 cliques; aqui é uma chamada.
 */
export async function reatribuiProjeto(ids: number[], projectId: number | null): Promise<void> {
  if (!ids.length) return;
  const d = await db();
  const marcas = ids.map((_, i) => `$${i + 2}`).join(',');
  await d.execute(
    `UPDATE tasks SET project_id = $1 WHERE id IN (${marcas})`, [projectId, ...ids],
  );
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

// ───────────────────────────────── notas ─────────────────────────────────
// Só o ÍNDICE. Quem escreve aqui é o indexador (lib/notas.ts); a UI lê.

/**
 * Nota + projeto resolvido pelo valor cru do frontmatter.
 *
 * Código ganha de nome: se um projeto se CHAMA "CF03B04" e outro tem esse
 * CÓDIGO, `projeto: CF03B04` é o segundo. Isso é o COALESCE — e não um
 * ORDER BY, porque o SQLite recusa coluna correlacionada no ORDER BY de uma
 * subquery escalar ("no such column: n.projeto"), embora aceite no WHERE.
 */
const NOTA_SELECT = `
  SELECT x.*, p.name AS project_name, p.color AS project_color FROM (
    SELECT n.path, n.title, n.mtime, n.projeto, n.tags,
           COALESCE(
             (SELECT q.id FROM projects q WHERE q.code = n.projeto COLLATE NOCASE LIMIT 1),
             (SELECT q.id FROM projects q WHERE q.name = n.projeto COLLATE NOCASE LIMIT 1)
           ) AS project_id
      FROM notes n) x
  LEFT JOIN projects p ON p.id = x.project_id`;

type LinhaNota = Omit<NotaResumo, 'tags'> & { tags: string | null };
const nota = (r: LinhaNota): NotaResumo => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [] });

export async function notasIndexadas(): Promise<Array<{ path: string; mtime: number }>> {
  const d = await db();
  return d.select(`SELECT path, mtime FROM notes`);
}

/**
 * Grava uma nota no índice. Três tabelas, sem transação: o plugin-sql não
 * garante a mesma conexão entre chamadas, e um índice meio escrito se
 * conserta no próximo scan — é justamente para isso que ele é reconstruível.
 */
export async function indexaNota(n: NotaIndice): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO notes (path, title, mtime, size, projeto, tags, indexed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(path) DO UPDATE SET
       title = excluded.title, mtime = excluded.mtime, size = excluded.size,
       projeto = excluded.projeto, tags = excluded.tags, indexed_at = excluded.indexed_at`,
    [n.path, n.title, n.mtime, n.size, n.projeto, JSON.stringify(n.tags), agoraIso()],
  );
  await d.execute(`DELETE FROM notes_fts WHERE path = $1`, [n.path]);
  await d.execute(`INSERT INTO notes_fts (path, title, body) VALUES ($1,$2,$3)`, [n.path, n.title, n.body]);
  await d.execute(`DELETE FROM note_links WHERE src = $1`, [n.path]);
  if (n.links.length) {
    const vals = n.links.map((_, i) => `($1, $${i + 2})`).join(',');
    await d.execute(`INSERT OR IGNORE INTO note_links (src, target) VALUES ${vals}`, [n.path, ...n.links]);
  }
}

export async function desindexaNota(path: string): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM notes WHERE path = $1`, [path]);   // links caem junto (CASCADE)
  await d.execute(`DELETE FROM notes_fts WHERE path = $1`, [path]);
}

export async function renomeiaNoIndice(de: string, para: string): Promise<void> {
  const d = await db();
  await d.execute(`UPDATE notes SET path = $2 WHERE path = $1`, [de, para]);   // links: ON UPDATE CASCADE
  await d.execute(`UPDATE notes_fts SET path = $2 WHERE path = $1`, [de, para]);
}

/** Trocar de vault começa do zero: o índice do anterior não vale nada aqui. */
export async function limpaIndice(): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM notes`);
  await d.execute(`DELETE FROM notes_fts`);
}

export async function listaNotas(): Promise<NotaResumo[]> {
  const d = await db();
  return (await d.select<LinhaNota[]>(`${NOTA_SELECT} ORDER BY x.mtime DESC`)).map(nota);
}

export async function notasDoProjeto(projectId: number): Promise<NotaResumo[]> {
  const d = await db();
  const r = await d.select<LinhaNota[]>(`SELECT * FROM (${NOTA_SELECT}) WHERE project_id = $1 ORDER BY mtime DESC`,
    [projectId]);
  return r.map(nota);
}

/**
 * Quem aponta para esta nota. O link pode ter sido escrito pelo nome do
 * arquivo (`[[Snubber RCD]]`) ou pelo caminho (`[[Técnico/Snubber RCD]]`) —
 * o Obsidian aceita os dois, então os dois contam.
 */
export async function backlinks(path: string, nomeNorm: string, pathNorm: string): Promise<NotaResumo[]> {
  const d = await db();
  const r = await d.select<LinhaNota[]>(
    `SELECT * FROM (${NOTA_SELECT})
      WHERE path IN (SELECT src FROM note_links WHERE target IN ($1, $2))
        AND path <> $3
      ORDER BY mtime DESC`,
    [nomeNorm, pathNorm, path],
  );
  return r.map(nota);
}

/** Todo `[[link]]` do vault, cru. Quem resolve alvo -> nota é lib/notas.ts. */
export async function todasAsLigacoes(): Promise<Array<{ src: string; target: string }>> {
  const d = await db();
  return d.select(`SELECT src, target FROM note_links`);
}

/**
 * Busca de texto. Cada palavra vira prefixo entre aspas — "reun" acha
 * "reunião", e aspas neutralizam os operadores do FTS5 (AND, NEAR, -),
 * que num campo de busca de usuário só produzem erro de sintaxe.
 * Título pesa 5× o corpo: achar no nome é quase sempre o que se queria.
 */
export async function buscaNotas(q: string, limite = 30): Promise<ResultadoBusca[]> {
  const termos = q.trim().split(/\s+/).filter(Boolean);
  if (!termos.length) return [];
  const match = termos.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
  const d = await db();
  return d.select<ResultadoBusca[]>(
    `SELECT path, title, snippet(notes_fts, 2, char(2), char(3), '…', 14) AS trecho
       FROM notes_fts WHERE notes_fts MATCH $1
      ORDER BY bm25(notes_fts, 0, 5.0, 1.0) LIMIT $2`,
    [match, limite],
  );
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
