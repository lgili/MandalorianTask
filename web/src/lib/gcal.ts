// Google Agenda — classificação de eventos. (v0.2)
//
// Este módulo é PURO de propósito: não faz rede, não toca no banco, não depende
// do Tauri. Recebe o JSON do evento e devolve a decisão. Isso o torna testável
// sem OAuth, sem mock de HTTP e sem app aberto — e é onde mora a regra que
// decide se o número de "horas em reunião" é confiável ou lixo.
//
// A camada de rede (OAuth loopback + sync incremental com syncToken) entra
// separada, em gcal-sync.ts, e chama classifica() para cada evento.

import type { EntryKind } from './types';

// ── Subconjunto do recurso Event da Calendar API v3 que realmente usamos ──

export interface GEventDateTime {
  /** Presente em evento com hora marcada. RFC3339 com offset. */
  dateTime?: string;
  /** Presente em evento de DIA INTEIRO. 'YYYY-MM-DD', sem hora. */
  date?: string;
  timeZone?: string;
}

export interface GAttendee {
  email?: string;
  /** true no participante que é a própria conta autenticada. */
  self?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
}

export interface GEvent {
  /** Id da INSTÂNCIA. Em série recorrente vem como 'base_20260908T130000Z'. */
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  start?: GEventDateTime;
  end?: GEventDateTime;
  attendees?: GAttendee[];
  /** Id da SÉRIE quando o evento é instância de recorrente. */
  recurringEventId?: string;
  eventType?: 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation' | 'birthday' | 'fromGmail';
  /** 'transparent' = marcado como Livre na agenda. */
  transparency?: 'opaque' | 'transparent';
  organizer?: { email?: string; self?: boolean };
  creator?: { email?: string; self?: boolean };
}

export type MotivoDescarte =
  | 'cancelado'
  | 'dia-inteiro'
  | 'tipo-nao-trabalho'
  | 'recusado'
  | 'sem-horario'
  | 'duracao-invalida';

export interface Descartado {
  acao: 'descartar';
  motivo: MotivoDescarte;
}

export interface Importar {
  acao: 'importar';
  kind: Extract<EntryKind, 'reuniao' | 'foco'>;
  /** UTC ISO */
  started_at: string;
  ended_at: string;
  /** Id da instância — vai para time_entries.gcal_event_id (UNIQUE). */
  gcal_event_id: string;
  series_id: string | null;
  titulo: string;
  /** Participantes reais (fora você, salas e recursos). Zero => bloco de foco. */
  participantes: number;
  /** Marcado como Livre: importa, mas o usuário provavelmente não quer contar. */
  fraco: boolean;
}

export type Decisao = Descartado | Importar;

/** eventType que nunca representa trabalho registrável em horas. */
const TIPOS_DESCARTADOS = new Set(['outOfOffice', 'workingLocation', 'birthday']);

/**
 * Participantes que contam para decidir "isto é uma reunião?".
 * Salas e equipamentos (resource) não são gente. Você mesmo não conta —
 * senão todo bloco que você reserva para si viraria reunião.
 */
export function participantesReais(ev: GEvent): number {
  return (ev.attendees ?? []).filter((a) => !a.self && !a.resource).length;
}

/** Você recusou o convite. É a causa nº 1 de hora de reunião inflada. */
export function vocerecusou(ev: GEvent): boolean {
  return (ev.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined');
}

/**
 * Decide o que fazer com um evento da agenda.
 *
 * A ordem importa: descartes primeiro, do mais barato ao mais caro, e só então
 * a classificação. Cada regra existe por um motivo específico — ver os testes.
 */
export function classifica(ev: GEvent): Decisao {
  // Evento apagado ou cancelado. Chega assim no sync incremental.
  if (ev.status === 'cancelled') return { acao: 'descartar', motivo: 'cancelado' };

  // Tipos que a agenda usa para outra coisa que não trabalho medido em horas.
  // focusTime NÃO entra aqui: bloco de foco é exatamente o que queremos contar.
  if (ev.eventType && TIPOS_DESCARTADOS.has(ev.eventType)) {
    return { acao: 'descartar', motivo: 'tipo-nao-trabalho' };
  }

  // Dia inteiro: vem com start.date em vez de start.dateTime. Não é hora —
  // contar 24h de "Feriado" ou "Férias" destruiria qualquer relatório.
  if (ev.start?.date || ev.end?.date) return { acao: 'descartar', motivo: 'dia-inteiro' };

  if (!ev.start?.dateTime || !ev.end?.dateTime) {
    return { acao: 'descartar', motivo: 'sem-horario' };
  }

  // Você recusou: não esteve lá.
  if (vocerecusou(ev)) return { acao: 'descartar', motivo: 'recusado' };

  const started_at = new Date(ev.start.dateTime).toISOString();
  const ended_at = new Date(ev.end.dateTime).toISOString();
  if (!(ended_at > started_at)) return { acao: 'descartar', motivo: 'duracao-invalida' };

  // O classificador de reunião é a PRESENÇA DE OUTRAS PESSOAS, não a palavra no
  // título. "Reunião de alinhamento" que você marcou sozinho é bloco de foco;
  // "Flyback rev C" com 4 participantes é reunião.
  const participantes = participantesReais(ev);

  return {
    acao: 'importar',
    kind: participantes > 0 ? 'reuniao' : 'foco',
    started_at,
    ended_at,
    gcal_event_id: ev.id,
    series_id: ev.recurringEventId ?? null,
    titulo: (ev.summary ?? '').trim() || '(sem título)',
    participantes,
    fraco: ev.transparency === 'transparent',
  };
}

/** Conveniência para o sync: separa o que importa do que descarta. */
export function classificaLote(eventos: GEvent[]): {
  importar: Importar[];
  descartados: Array<{ id: string; motivo: MotivoDescarte }>;
} {
  const importar: Importar[] = [];
  const descartados: Array<{ id: string; motivo: MotivoDescarte }> = [];
  for (const ev of eventos) {
    const d = classifica(ev);
    if (d.acao === 'importar') importar.push(d);
    else descartados.push({ id: ev.id, motivo: d.motivo });
  }
  return { importar, descartados };
}
