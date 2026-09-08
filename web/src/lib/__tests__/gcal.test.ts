import { describe, it, expect } from 'vitest';
import { classifica, classificaLote, participantesReais, type GEvent } from '../gcal';

// Cada teste aqui corresponde a uma forma concreta de o app mentir sobre
// "quantas horas eu passei em reunião". Não são testes de cobertura.

const base = (over: Partial<GEvent> = {}): GEvent => ({
  id: 'evt1',
  status: 'confirmed',
  summary: 'DFMEA review — Flyback',
  start: { dateTime: '2026-09-08T13:00:00-03:00' },
  end: { dateTime: '2026-09-08T14:00:00-03:00' },
  ...over,
});

const eu = { self: true, responseStatus: 'accepted' as const };
const outro = (n = 1) =>
  Array.from({ length: n }, (_, i) => ({ email: `p${i}@x.com`, responseStatus: 'accepted' as const }));

/** Estreita a união Decisao: devolve o motivo, ou null se o evento foi importado. */
const motivoDe = (ev: GEvent) => {
  const d = classifica(ev);
  return d.acao === 'descartar' ? d.motivo : null;
};

describe('descartes', () => {
  it('cancelado não aconteceu', () => {
    expect(classifica(base({ status: 'cancelled' })))
      .toEqual({ acao: 'descartar', motivo: 'cancelado' });
  });

  it('dia inteiro não é hora — férias não são 24h trabalhadas', () => {
    const ev = base({ summary: 'Férias', start: { date: '2026-09-08' }, end: { date: '2026-09-09' } });
    expect(classifica(ev)).toEqual({ acao: 'descartar', motivo: 'dia-inteiro' });
  });

  it('fora do escritório e local de trabalho não são trabalho registrável', () => {
    for (const t of ['outOfOffice', 'workingLocation', 'birthday'] as const) {
      expect(classifica(base({ eventType: t })).acao).toBe('descartar');
    }
  });

  it('convite RECUSADO não conta — a causa nº1 de hora inflada', () => {
    const ev = base({ attendees: [{ self: true, responseStatus: 'declined' }, ...outro(3)] });
    expect(classifica(ev)).toEqual({ acao: 'descartar', motivo: 'recusado' });
  });

  it('recusa de OUTRA pessoa não te tira da reunião', () => {
    const ev = base({
      attendees: [eu, { email: 'p@x.com', responseStatus: 'declined' }, ...outro(1)],
    });
    expect(classifica(ev).acao).toBe('importar');
  });

  it('sem horário definido é descartado em vez de virar NaN', () => {
    expect(motivoDe(base({ start: {}, end: {} }))).toBe('sem-horario');
  });

  it('fim antes do início seria rejeitado pelo CHECK do banco — barra antes', () => {
    const ev = base({
      start: { dateTime: '2026-09-08T14:00:00-03:00' },
      end: { dateTime: '2026-09-08T13:00:00-03:00' },
    });
    expect(motivoDe(ev)).toBe('duracao-invalida');
  });
});

describe('classificação reunião x foco', () => {
  it('com outras pessoas é reunião', () => {
    const d = classifica(base({ attendees: [eu, ...outro(3)] }));
    expect(d.acao).toBe('importar');
    if (d.acao !== 'importar') return;
    expect(d.kind).toBe('reuniao');
    expect(d.participantes).toBe(3);
  });

  it('bloco que você reservou sozinho é FOCO, não reunião', () => {
    const d = classifica(base({ summary: 'Reunião de alinhamento', attendees: undefined }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    // O título diz "Reunião" e mesmo assim é foco: quem classifica é a presença
    // de gente, não a palavra.
    expect(d.kind).toBe('foco');
  });

  it('só você na lista de participantes ainda é foco', () => {
    const d = classifica(base({ attendees: [eu] }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    expect(d.kind).toBe('foco');
  });

  it('sala de reunião não é gente', () => {
    const ev = base({ attendees: [eu, { email: 'sala-b@x.com', resource: true }] });
    expect(participantesReais(ev)).toBe(0);
    const d = classifica(ev);
    if (d.acao !== 'importar') throw new Error('deveria importar');
    expect(d.kind).toBe('foco');
  });

  it('focusTime é contado como foco, não descartado', () => {
    const d = classifica(base({ eventType: 'focusTime', attendees: undefined }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    expect(d.kind).toBe('foco');
  });
});

describe('dados que vão para o banco', () => {
  it('converte para UTC preservando o instante', () => {
    const d = classifica(base());
    if (d.acao !== 'importar') throw new Error('deveria importar');
    // 13:00 em -03:00 é 16:00Z
    expect(d.started_at).toBe('2026-09-08T16:00:00.000Z');
    expect(d.ended_at).toBe('2026-09-08T17:00:00.000Z');
  });

  it('guarda o id da INSTÂNCIA e o da série separados', () => {
    const d = classifica(base({ id: 'base_20260908T130000Z', recurringEventId: 'base' }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    // O UNIQUE do banco é sobre a instância. Se guardássemos o id da série,
    // a primeira sincronização de uma reunião semanal criaria 1 linha e
    // descartaria as outras 51.
    expect(d.gcal_event_id).toBe('base_20260908T130000Z');
    expect(d.series_id).toBe('base');
  });

  it('instâncias distintas da mesma série têm ids distintos', () => {
    const a = classifica(base({ id: 'base_20260908T130000Z', recurringEventId: 'base' }));
    const b = classifica(base({ id: 'base_20260915T130000Z', recurringEventId: 'base' }));
    if (a.acao !== 'importar' || b.acao !== 'importar') throw new Error('deveriam importar');
    expect(a.gcal_event_id).not.toBe(b.gcal_event_id);
  });

  it('marcado como Livre entra sinalizado como fraco', () => {
    const d = classifica(base({ transparency: 'transparent', attendees: [eu, ...outro(2)] }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    expect(d.fraco).toBe(true);
  });

  it('evento sem título não vira string vazia na timeline', () => {
    const d = classifica(base({ summary: undefined }));
    if (d.acao !== 'importar') throw new Error('deveria importar');
    expect(d.titulo).toBe('(sem título)');
  });
});

describe('classificaLote', () => {
  it('separa importáveis de descartados sem perder ninguém', () => {
    const eventos: GEvent[] = [
      base({ id: 'a', attendees: [eu, ...outro(2)] }),
      base({ id: 'b', status: 'cancelled' }),
      base({ id: 'c', start: { date: '2026-09-08' }, end: { date: '2026-09-09' } }),
      base({ id: 'd', attendees: undefined }),
      base({ id: 'e', attendees: [{ self: true, responseStatus: 'declined' }] }),
    ];
    const { importar, descartados } = classificaLote(eventos);
    expect(importar.map((i) => i.gcal_event_id)).toEqual(['a', 'd']);
    expect(descartados).toEqual([
      { id: 'b', motivo: 'cancelado' },
      { id: 'c', motivo: 'dia-inteiro' },
      { id: 'e', motivo: 'recusado' },
    ]);
    expect(importar.length + descartados.length).toBe(eventos.length);
  });
});
