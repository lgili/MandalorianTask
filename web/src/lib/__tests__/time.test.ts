import { describe, it, expect } from 'vitest';
import {
  dayKey, parseDayKey, addDays, dayRangeUtc, minutosDoDia, hhmm, utcDe,
  duracaoMin, arredonda, fmtHM, fmtDur, sobrepoe, minutosSobrepostos,
  lacunas, inicioSemana,
} from '../time';

// Estes testes existem porque é AQUI que o app pode mentir sobre horas
// sem que nada quebre visivelmente.

describe('dayKey / parseDayKey', () => {
  it('usa a data local, não a UTC', () => {
    // 23h local de 08/09 continua sendo 08/09, mesmo que em UTC já seja dia 09
    const d = new Date(2026, 8, 8, 23, 30);
    expect(dayKey(d)).toBe('2026-09-08');
  });

  it('faz round-trip', () => {
    expect(dayKey(parseDayKey('2026-01-31'))).toBe('2026-01-31');
  });

  it('atravessa a virada do mês', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dayRangeUtc', () => {
  it('cobre exatamente um dia local', () => {
    const { from, to } = dayRangeUtc('2026-09-08');
    const horas = duracaoMin(from, to) / 60;
    // 24h normalmente; 23 ou 25 num dia de mudança de horário de verão — nunca outra coisa
    expect([23, 24, 25]).toContain(horas);
  });

  it('o começo é meia-noite local', () => {
    const { from } = dayRangeUtc('2026-09-08');
    const d = new Date(from);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('dias consecutivos se encostam sem buraco nem sobreposição', () => {
    expect(dayRangeUtc('2026-09-08').to).toBe(dayRangeUtc('2026-09-09').from);
  });
});

describe('utcDe / minutosDoDia / hhmm', () => {
  it('round-trip de minutos do dia', () => {
    const iso = utcDe('2026-09-08', 9 * 60 + 30);
    expect(minutosDoDia(iso)).toBe(9 * 60 + 30);
    expect(hhmm(iso)).toBe('09:30');
  });

  it('meia-noite é 0, não 1440', () => {
    expect(minutosDoDia(utcDe('2026-09-08', 0))).toBe(0);
  });
});

describe('arredonda', () => {
  it('vai para o múltiplo de 15 mais próximo', () => {
    expect(arredonda(0)).toBe(0);
    expect(arredonda(7)).toBe(0);
    expect(arredonda(8)).toBe(15);
    expect(arredonda(22)).toBe(15);
    expect(arredonda(23)).toBe(30);
    expect(arredonda(52)).toBe(45);   // 52 está a 7 de 45 e a 8 de 60
    expect(arredonda(53)).toBe(60);   // 53 está a 8 de 45 e a 7 de 60
    expect(arredonda(90)).toBe(90);
  });
});

describe('formatação', () => {
  it('fmtHM sempre mostra hora', () => {
    expect(fmtHM(375)).toBe('6h15');
    expect(fmtHM(45)).toBe('0h45');
    expect(fmtHM(60)).toBe('1h00');
    expect(fmtHM(0)).toBe('0h00');
  });

  it('fmtDur troca de unidade em 1h', () => {
    expect(fmtDur(45)).toBe('45 min');
    expect(fmtDur(59)).toBe('59 min');
    expect(fmtDur(60)).toBe('1h00');
    expect(fmtDur(135)).toBe('2h15');
  });
});

describe('sobreposição', () => {
  const min = (hhmmStr: string) => {
    const [h, m] = hhmmStr.split(':').map(Number);
    return h * 60 + m;
  };
  const bloco = (a: string, b: string) => ({
    started_at: utcDe('2026-09-08', min(a)),
    ended_at: utcDe('2026-09-08', min(b)),
  });

  it('encostar não é sobrepor', () => {
    expect(sobrepoe(bloco('09:00', '10:00'), bloco('10:00', '11:00'))).toBe(false);
    expect(minutosSobrepostos(bloco('09:00', '10:00'), bloco('10:00', '11:00'))).toBe(0);
  });

  it('detecta invasão parcial e mede', () => {
    expect(sobrepoe(bloco('09:00', '10:00'), bloco('09:30', '11:00'))).toBe(true);
    expect(minutosSobrepostos(bloco('09:00', '10:00'), bloco('09:30', '11:00'))).toBe(30);
  });

  it('detecta contenção total', () => {
    expect(sobrepoe(bloco('09:00', '12:00'), bloco('10:00', '11:00'))).toBe(true);
    expect(minutosSobrepostos(bloco('09:00', '12:00'), bloco('10:00', '11:00'))).toBe(60);
  });

  it('é simétrico', () => {
    const a = bloco('09:00', '10:00'), b = bloco('09:30', '11:00');
    expect(sobrepoe(a, b)).toBe(sobrepoe(b, a));
    expect(minutosSobrepostos(a, b)).toBe(minutosSobrepostos(b, a));
  });
});

describe('lacunas', () => {
  const b = (de: number, ate: number) => ({
    started_at: utcDe('2026-09-08', de), ended_at: utcDe('2026-09-08', ate),
  });

  it('acha só os buracos entre blocos', () => {
    const g = lacunas([b(540, 630), b(675, 720), b(900, 1035)]); // 09:00-10:30, 11:15-12:00, 15:00-17:15
    expect(g).toEqual([{ de: 630, ate: 675 }, { de: 720, ate: 900 }]);
  });

  it('ignora buraco menor que o grão', () => {
    expect(lacunas([b(540, 600), b(605, 660)])).toEqual([]);
  });

  it('não inventa lacuna antes do primeiro nem depois do último', () => {
    expect(lacunas([b(540, 600)])).toEqual([]);
  });

  it('não depende da ordem de entrada', () => {
    expect(lacunas([b(900, 1035), b(540, 630)])).toEqual([{ de: 630, ate: 900 }]);
  });
});

describe('inicioSemana', () => {
  it('segunda é o começo', () => {
    // 08/09/2026 é uma terça
    expect(inicioSemana('2026-09-08')).toBe('2026-09-07');
    expect(inicioSemana('2026-09-07')).toBe('2026-09-07');
  });

  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(inicioSemana('2026-09-13')).toBe('2026-09-07');
  });
});
