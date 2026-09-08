// Espelhos TS das tabelas. Mantidos à mão de propósito — o schema é pequeno
// e um gerador seria mais peça para manter do que economia.

export type ActivityStatus = 'backlog' | 'semana' | 'fazendo' | 'feito';
export type EntryKind = 'foco' | 'reuniao' | 'admin' | 'pausa';
export type EntrySource = 'manual' | 'timer' | 'calendar';

export interface Project {
  id: number;
  name: string;
  /** Código curto usado nos relatórios e no card: "CF03B04", "NACQ". */
  code: string | null;
  /** Hex sem #, ex "12707B". Usado nos gráficos para a cor ser estável entre relatórios. */
  color: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface Activity {
  id: number;
  project_id: number | null;
  title: string;
  status: ActivityStatus;
  /** UTC ISO. NULL = sem prazo. */
  due_at: string | null;
  /** id do evento de prazo que NÓS criamos no Google (v0.4). */
  gcal_due_id: string | null;
  /** caminho relativo no vault (v0.3). */
  note_path: string | null;
  archived_at: string | null;
  created_at: string;
  done_at: string | null;
}

export interface TimeEntry {
  id: number;
  activity_id: number | null;
  /** UTC ISO */
  started_at: string;
  /** UTC ISO */
  ended_at: string;
  /** IANA tz vigente no momento do registro. Guardado para o histórico, não para cálculo. */
  tz: string;
  kind: EntryKind;
  source: EntrySource;
  /** id da INSTÂNCIA do evento (não da série). UNIQUE — é a regra anti-duplicata. */
  gcal_event_id: string | null;
  /** NULL = candidato: aparece na timeline, NÃO entra em relatório. */
  confirmed_at: string | null;
  note: string | null;
  created_at: string;
}

/** Linha da timeline já resolvida para a UI (join com activity + project). */
export interface DayEntry extends TimeEntry {
  activity_title: string | null;
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
}

/** Card do quadro, com as horas já somadas. */
export interface BoardCard extends Activity {
  project_name: string | null;
  project_code: string | null;
  project_color: string | null;
  /** minutos confirmados acumulados */
  minutes: number;
}

export interface DayTotals {
  /** minutos confirmados, excluindo pausa */
  total: number;
  foco: number;
  reuniao: number;
  admin: number;
  /** minutos de blocos da agenda ainda NÃO confirmados */
  pendente: number;
}
