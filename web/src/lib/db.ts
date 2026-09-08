// A ÚNICA camada que fala SQL. Nenhum componente importa isto para escrever query;
// eles chamam as funções daqui. Mesmo papel que lib/api.ts tem no eBOM generator.
//
// O schema real é criado pelas migrations em app/src-tauri/src/migrations.rs.
// Este arquivo assume que elas já rodaram.

import Database from '@tauri-apps/plugin-sql';
import type {
  Activity, ActivityStatus, BoardCard, DayEntry, DayTotals,
  EntryKind, EntrySource, Project, TimeEntry,
} from './types';
import { agoraIso, dayRangeUtc, tzAtual, type DayKey } from './tempo';

let _db: Database | null = null;

export async function db(): Promise<Database> {
  if (!_db) _db = await Database.load('sqlite:bancada.db');
  return _db;
}

/** Erro do banco em mensagem que dá pra mostrar. Ninguém quer ver um Result do sqlx. */
export function dbErro(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes('UNIQUE constraint failed: time_entries.gcal_event_id')) {
    return 'Este evento da agenda já foi importado.';
  }
  if (m.includes('UNIQUE constraint failed: projects.name')) {
    return 'Já existe um projeto com esse nome.';
  }
  if (m.includes('FOREIGN KEY constraint failed')) {
    return 'Referência inválida — o projeto ou a atividade não existe mais.';
  }
  return m;
}

// ──────────────────────────────── projetos ────────────────────────────────

export async function listProjects(incluirArquivados = false): Promise<Project[]> {
  const d = await db();
  return d.select<Project[]>(
    `SELECT * FROM projects
      ${incluirArquivados ? '' : 'WHERE archived_at IS NULL'}
      ORDER BY name COLLATE NOCASE`,
  );
}

export async function createProject(
  name: string, code: string | null = null, color: string | null = null,
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO projects (name, code, color, created_at) VALUES ($1, $2, $3, $4)`,
    [name.trim(), code?.trim() || null, color, agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function updateProject(
  id: number, patch: Partial<Pick<Project, 'name' | 'code' | 'color' | 'archived_at'>>,
): Promise<void> {
  const d = await db();
  const campos = Object.keys(patch);
  if (!campos.length) return;
  const set = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await d.execute(
    `UPDATE projects SET ${set} WHERE id = $${campos.length + 1}`,
    [...campos.map((c) => (patch as Record<string, unknown>)[c]), id],
  );
}

// ─────────────────────────────── atividades ───────────────────────────────

const CARD_SELECT = `
  SELECT a.*,
         p.name  AS project_name,
         p.code  AS project_code,
         p.color AS project_color,
         COALESCE((
           SELECT SUM((julianday(t.ended_at) - julianday(t.started_at)) * 1440)
             FROM time_entries t
            WHERE t.activity_id = a.id
              AND t.confirmed_at IS NOT NULL
              AND t.kind <> 'pausa'
         ), 0) AS minutes
    FROM activities a
    LEFT JOIN projects p ON p.id = a.project_id`;

export async function boardCards(): Promise<BoardCard[]> {
  const d = await db();
  const rows = await d.select<BoardCard[]>(
    `${CARD_SELECT}
      WHERE a.archived_at IS NULL
      ORDER BY (a.due_at IS NULL), a.due_at, a.created_at DESC`,
  );
  // SUM sobre julianday devolve float; a UI só lida com minutos inteiros.
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

export async function activeActivities(): Promise<BoardCard[]> {
  const rows = await boardCards();
  return rows.filter((a) => a.status === 'fazendo' || a.status === 'semana');
}

export async function createActivity(
  title: string, project_id: number | null = null, status: ActivityStatus = 'backlog',
): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `INSERT INTO activities (project_id, title, status, created_at)
     VALUES ($1, $2, $3, $4)`,
    [project_id, title.trim(), status, agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function setActivityStatus(id: number, status: ActivityStatus): Promise<void> {
  const d = await db();
  // done_at só existe enquanto o status for 'feito' — voltar a carta desfaz a conclusão.
  await d.execute(
    `UPDATE activities SET status = $1, done_at = CASE WHEN $1 = 'feito' THEN $2 ELSE NULL END
      WHERE id = $3`,
    [status, agoraIso(), id],
  );
}

export async function updateActivity(
  id: number,
  patch: Partial<Pick<Activity, 'title' | 'project_id' | 'due_at' | 'note_path' | 'archived_at'>>,
): Promise<void> {
  const d = await db();
  const campos = Object.keys(patch);
  if (!campos.length) return;
  const set = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await d.execute(
    `UPDATE activities SET ${set} WHERE id = $${campos.length + 1}`,
    [...campos.map((c) => (patch as Record<string, unknown>)[c]), id],
  );
}

/**
 * Tira do quadro o que está em 'feito' há mais de N dias. Continua nos relatórios
 * para sempre — é só sair da vista. Sem isto o quadro vira cemitério.
 */
export async function arquivarFeitosAntigos(dias = 14): Promise<number> {
  const d = await db();
  const r = await d.execute(
    `UPDATE activities SET archived_at = $1
      WHERE status = 'feito' AND archived_at IS NULL
        AND done_at IS NOT NULL
        AND julianday($1) - julianday(done_at) > $2`,
    [agoraIso(), dias],
  );
  return r.rowsAffected;
}

// ────────────────────────────── entradas de tempo ──────────────────────────

export async function entriesForDay(key: DayKey): Promise<DayEntry[]> {
  const d = await db();
  const { from, to } = dayRangeUtc(key);
  // Pega quem COMEÇA no dia. Bloco que atravessa a meia-noite pertence ao dia
  // em que começou — é como a pessoa pensa sobre o próprio dia.
  return d.select<DayEntry[]>(
    `SELECT t.*,
            a.title AS activity_title,
            p.name  AS project_name,
            p.code  AS project_code,
            p.color AS project_color
       FROM time_entries t
       LEFT JOIN activities a ON a.id = t.activity_id
       LEFT JOIN projects   p ON p.id = a.project_id
      WHERE t.started_at >= $1 AND t.started_at < $2
      ORDER BY t.started_at`,
    [from, to],
  );
}

export async function dayTotals(key: DayKey): Promise<DayTotals> {
  const entradas = await entriesForDay(key);
  const t: DayTotals = { total: 0, foco: 0, reuniao: 0, admin: 0, pendente: 0 };
  for (const e of entradas) {
    const min = Math.round(
      (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000,
    );
    if (e.kind === 'pausa') continue;
    // Candidato da agenda NÃO conta. É a regra que faz o número ser confiável.
    if (!e.confirmed_at) { t.pendente += min; continue; }
    t.total += min;
    if (e.kind === 'foco') t.foco += min;
    else if (e.kind === 'reuniao') t.reuniao += min;
    else if (e.kind === 'admin') t.admin += min;
  }
  return t;
}

export interface NovaEntrada {
  activity_id: number | null;
  started_at: string;
  ended_at: string;
  kind: EntryKind;
  source?: EntrySource;
  gcal_event_id?: string | null;
  /** Manual nasce confirmado; da agenda nasce candidato. */
  confirmed?: boolean;
  note?: string | null;
}

export async function createEntry(e: NovaEntrada): Promise<number> {
  const d = await db();
  const source = e.source ?? 'manual';
  const confirmado = e.confirmed ?? source !== 'calendar';
  const r = await d.execute(
    `INSERT INTO time_entries
       (activity_id, started_at, ended_at, tz, kind, source, gcal_event_id, confirmed_at, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [e.activity_id, e.started_at, e.ended_at, tzAtual(), e.kind, source,
     e.gcal_event_id ?? null, confirmado ? agoraIso() : null, e.note ?? null, agoraIso()],
  );
  return r.lastInsertId as number;
}

export async function updateEntry(
  id: number,
  patch: Partial<Pick<TimeEntry, 'activity_id' | 'started_at' | 'ended_at' | 'kind' | 'note'>>,
): Promise<void> {
  const d = await db();
  const campos = Object.keys(patch);
  if (!campos.length) return;
  const set = campos.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await d.execute(
    `UPDATE time_entries SET ${set} WHERE id = $${campos.length + 1}`,
    [...campos.map((c) => (patch as Record<string, unknown>)[c]), id],
  );
}

export async function setEntryConfirmed(id: number, confirmado: boolean): Promise<void> {
  const d = await db();
  await d.execute(`UPDATE time_entries SET confirmed_at = $1 WHERE id = $2`,
    [confirmado ? agoraIso() : null, id]);
}

export async function confirmDay(key: DayKey): Promise<number> {
  const d = await db();
  const { from, to } = dayRangeUtc(key);
  const r = await d.execute(
    `UPDATE time_entries SET confirmed_at = $1
      WHERE confirmed_at IS NULL AND started_at >= $2 AND started_at < $3`,
    [agoraIso(), from, to],
  );
  return r.rowsAffected;
}

export async function deleteEntry(id: number): Promise<void> {
  const d = await db();
  await d.execute(`DELETE FROM time_entries WHERE id = $1`, [id]);
}

// ────────────────────────────── relatórios ──────────────────────────────

export interface LinhaProjeto {
  project_id: number | null;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  minutes: number;
}

/** Horas por projeto num intervalo. Só confirmado, sem pausa. */
export async function horasPorProjeto(fromUtc: string, toUtc: string): Promise<LinhaProjeto[]> {
  const d = await db();
  const rows = await d.select<LinhaProjeto[]>(
    `SELECT p.id AS project_id, p.name AS project_name, p.code AS project_code,
            p.color AS project_color,
            SUM((julianday(t.ended_at) - julianday(t.started_at)) * 1440) AS minutes
       FROM time_entries t
       LEFT JOIN activities a ON a.id = t.activity_id
       LEFT JOIN projects   p ON p.id = a.project_id
      WHERE t.confirmed_at IS NOT NULL AND t.kind <> 'pausa'
        AND t.started_at >= $1 AND t.started_at < $2
      GROUP BY p.id
      ORDER BY minutes DESC`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

export interface LinhaDia { dia: string; kind: EntryKind; minutes: number }

/**
 * Minutos por dia e por tipo. O agrupamento por dia é feito em SQL com o
 * offset local aplicado — 'localtime' usa o fuso do sistema, que é o do usuário.
 */
export async function minutosPorDia(fromUtc: string, toUtc: string): Promise<LinhaDia[]> {
  const d = await db();
  const rows = await d.select<LinhaDia[]>(
    `SELECT date(t.started_at, 'localtime') AS dia,
            t.kind AS kind,
            SUM((julianday(t.ended_at) - julianday(t.started_at)) * 1440) AS minutes
       FROM time_entries t
      WHERE t.confirmed_at IS NOT NULL AND t.kind <> 'pausa'
        AND t.started_at >= $1 AND t.started_at < $2
      GROUP BY dia, kind
      ORDER BY dia`,
    [fromUtc, toUtc],
  );
  return rows.map((r) => ({ ...r, minutes: Math.round(r.minutes) }));
}

// ──────────────────────────────── meta ────────────────────────────────

export async function getMeta(key: string): Promise<string | null> {
  const d = await db();
  const r = await d.select<Array<{ value: string }>>(
    `SELECT value FROM meta WHERE key = $1`, [key]);
  return r.length ? r[0].value : null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const d = await db();
  await d.execute(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
}
