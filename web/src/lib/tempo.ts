// Toda aritmética de tempo do app mora aqui, e só aqui.
//
// Regras:
//  - Persistimos SEMPRE UTC ISO-8601 ("2026-09-08T12:00:00.000Z").
//  - A fronteira do dia é LOCAL. O app roda na máquina do usuário, então o
//    fuso do sistema é a resposta certa — inclusive no horário de verão, que
//    o Date nativo já resolve.
//  - Granularidade é 15 min. Arredondar é decisão de produto, não detalhe.

export const GRAO_MIN = 15;
/** Janela desenhada na timeline (hora local). */
export const DIA_INICIO_H = 7;
export const DIA_FIM_H = 20;

export type DayKey = string; // 'YYYY-MM-DD' no fuso local

const p2 = (n: number) => String(n).padStart(2, '0');

export function tzAtual(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Data local -> 'YYYY-MM-DD'. Nunca use toISOString aqui: ele converte pra UTC. */
export function dayKey(d: Date = new Date()): DayKey {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/**
 * Intervalo UTC que corresponde ao dia local. Meia-noite local -> meia-noite local
 * do dia seguinte. Em dia de mudança de horário de verão isso dá 23h ou 25h, que
 * é exatamente o correto.
 */
export function dayRangeUtc(key: DayKey): { from: string; to: string } {
  const start = parseDayKey(key);
  const end = parseDayKey(key);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Minutos desde a meia-noite LOCAL do dia do próprio instante. */
export function minutosDoDia(utcIso: string): number {
  const d = new Date(utcIso);
  return d.getHours() * 60 + d.getMinutes();
}

/** 'HH:MM' local. */
export function hhmm(utcIso: string): string {
  const d = new Date(utcIso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Dia local + minutos desde a meia-noite -> UTC ISO. */
export function utcDe(key: DayKey, minutos: number): string {
  const d = parseDayKey(key);
  d.setMinutes(d.getMinutes() + minutos);
  return d.toISOString();
}

export function duracaoMin(aIso: string, bIso: string): number {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60000);
}

/** Arredonda minutos para o grão. Meio caminho sobe. */
export function arredonda(minutos: number, grao = GRAO_MIN): number {
  return Math.round(minutos / grao) * grao;
}

/** '6h15' — para totais. Sempre com hora, mesmo abaixo de 1h ('0h45'). */
export function fmtHM(minutos: number): string {
  const neg = minutos < 0;
  const m = Math.abs(Math.round(minutos));
  return `${neg ? '-' : ''}${Math.floor(m / 60)}h${p2(m % 60)}`;
}

/** '45 min' abaixo de uma hora, '1h30' acima — para a duração de um bloco. */
export function fmtDur(minutos: number): string {
  const m = Math.round(minutos);
  return m < 60 ? `${m} min` : fmtHM(m);
}

/** Sobreposição real de dois intervalos. Encostar não é sobrepor. */
export function sobrepoe(
  a: { started_at: string; ended_at: string },
  b: { started_at: string; ended_at: string },
): boolean {
  return a.started_at < b.ended_at && b.started_at < a.ended_at;
}

/** Minutos em comum entre dois intervalos (0 se não se tocam). */
export function minutosSobrepostos(
  a: { started_at: string; ended_at: string },
  b: { started_at: string; ended_at: string },
): number {
  const ini = a.started_at > b.started_at ? a.started_at : b.started_at;
  const fim = a.ended_at < b.ended_at ? a.ended_at : b.ended_at;
  const d = duracaoMin(ini, fim);
  return d > 0 ? d : 0;
}

/**
 * Lacunas entre blocos consecutivos, em minutos-do-dia local.
 * Só entre o primeiro e o último bloco: antes de começar e depois de terminar
 * não é lacuna, é o dia não ter começado ainda.
 */
export function lacunas(
  blocos: Array<{ started_at: string; ended_at: string }>,
  minimoMin = GRAO_MIN,
): Array<{ de: number; ate: number }> {
  const ord = [...blocos].sort((x, y) => x.started_at.localeCompare(y.started_at));
  const out: Array<{ de: number; ate: number }> = [];
  for (let i = 0; i < ord.length - 1; i++) {
    const fim = minutosDoDia(ord[i].ended_at);
    const ini = minutosDoDia(ord[i + 1].started_at);
    if (ini - fim >= minimoMin) out.push({ de: fim, ate: ini });
  }
  return out;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'ter, 08 set' */
export function rotuloDia(key: DayKey): string {
  const d = parseDayKey(key);
  return `${DIAS[d.getDay()]}, ${p2(d.getDate())} ${MESES[d.getMonth()]}`;
}

/** Segunda-feira da semana daquele dia. */
export function inicioSemana(key: DayKey): DayKey {
  const d = parseDayKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

export function agoraIso(): string {
  return new Date().toISOString();
}
