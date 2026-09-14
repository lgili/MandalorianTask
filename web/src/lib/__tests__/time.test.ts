import { describe, it, expect } from 'vitest';
import {
  dayKey, parseDayKey, addDays, dayRangeUtc, minutesOfDay, hhmm, toUtc,
  durationMin, roundToGrain, fmtHM, fmtDur, overlaps, overlapMinutes,
  findGaps, startOfWeek,
} from '../time';

// These tests exist because it is HERE that the app can lie about hours
// without anything visibly breaking.

describe('dayKey / parseDayKey', () => {
  it('uses the local date, not the UTC one', () => {
    // 23:00 local on 08/09 is still 08/09, even if in UTC it is already the 9th
    const d = new Date(2026, 8, 8, 23, 30);
    expect(dayKey(d)).toBe('2026-09-08');
  });

  it('round-trips', () => {
    expect(dayKey(parseDayKey('2026-01-31'))).toBe('2026-01-31');
  });

  it('crosses the month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dayRangeUtc', () => {
  it('covers exactly one local day', () => {
    const { from, to } = dayRangeUtc('2026-09-08');
    const hours = durationMin(from, to) / 60;
    // 24h normally; 23 or 25 on a daylight saving changeover day — never anything else
    expect([23, 24, 25]).toContain(hours);
  });

  it('the start is local midnight', () => {
    const { from } = dayRangeUtc('2026-09-08');
    const d = new Date(from);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('consecutive days touch with no gap and no overlap', () => {
    expect(dayRangeUtc('2026-09-08').to).toBe(dayRangeUtc('2026-09-09').from);
  });
});

describe('toUtc / minutesOfDay / hhmm', () => {
  it('round-trips minutes of the day', () => {
    const iso = toUtc('2026-09-08', 9 * 60 + 30);
    expect(minutesOfDay(iso)).toBe(9 * 60 + 30);
    expect(hhmm(iso)).toBe('09:30');
  });

  it('midnight is 0, not 1440', () => {
    expect(minutesOfDay(toUtc('2026-09-08', 0))).toBe(0);
  });
});

describe('roundToGrain', () => {
  it('goes to the nearest multiple of 15', () => {
    expect(roundToGrain(0)).toBe(0);
    expect(roundToGrain(7)).toBe(0);
    expect(roundToGrain(8)).toBe(15);
    expect(roundToGrain(22)).toBe(15);
    expect(roundToGrain(23)).toBe(30);
    expect(roundToGrain(52)).toBe(45);   // 52 is 7 from 45 and 8 from 60
    expect(roundToGrain(53)).toBe(60);   // 53 is 8 from 45 and 7 from 60
    expect(roundToGrain(90)).toBe(90);
  });
});

describe('formatting', () => {
  it('fmtHM always shows the hour', () => {
    expect(fmtHM(375)).toBe('6h15');
    expect(fmtHM(45)).toBe('0h45');
    expect(fmtHM(60)).toBe('1h00');
    expect(fmtHM(0)).toBe('0h00');
  });

  it('fmtDur switches unit at 1h', () => {
    expect(fmtDur(45)).toBe('45 min');
    expect(fmtDur(59)).toBe('59 min');
    expect(fmtDur(60)).toBe('1h00');
    expect(fmtDur(135)).toBe('2h15');
  });
});

describe('overlap', () => {
  const min = (hhmmStr: string) => {
    const [h, m] = hhmmStr.split(':').map(Number);
    return h * 60 + m;
  };
  const block = (a: string, b: string) => ({
    started_at: toUtc('2026-09-08', min(a)),
    ended_at: toUtc('2026-09-08', min(b)),
  });

  it('touching is not overlapping', () => {
    expect(overlaps(block('09:00', '10:00'), block('10:00', '11:00'))).toBe(false);
    expect(overlapMinutes(block('09:00', '10:00'), block('10:00', '11:00'))).toBe(0);
  });

  it('detects a partial overlap and measures it', () => {
    expect(overlaps(block('09:00', '10:00'), block('09:30', '11:00'))).toBe(true);
    expect(overlapMinutes(block('09:00', '10:00'), block('09:30', '11:00'))).toBe(30);
  });

  it('detects full containment', () => {
    expect(overlaps(block('09:00', '12:00'), block('10:00', '11:00'))).toBe(true);
    expect(overlapMinutes(block('09:00', '12:00'), block('10:00', '11:00'))).toBe(60);
  });

  it('is symmetric', () => {
    const a = block('09:00', '10:00'), b = block('09:30', '11:00');
    expect(overlaps(a, b)).toBe(overlaps(b, a));
    expect(overlapMinutes(a, b)).toBe(overlapMinutes(b, a));
  });
});

describe('findGaps', () => {
  const b = (from: number, to: number) => ({
    started_at: toUtc('2026-09-08', from), ended_at: toUtc('2026-09-08', to),
  });

  it('finds only the holes between blocks', () => {
    const g = findGaps([b(540, 630), b(675, 720), b(900, 1035)]); // 09:00-10:30, 11:15-12:00, 15:00-17:15
    expect(g).toEqual([{ from: 630, to: 675 }, { from: 720, to: 900 }]);
  });

  it('ignores a hole smaller than the grain', () => {
    expect(findGaps([b(540, 600), b(605, 660)])).toEqual([]);
  });

  it('does not invent a gap before the first block or after the last', () => {
    expect(findGaps([b(540, 600)])).toEqual([]);
  });

  it('does not depend on input order', () => {
    expect(findGaps([b(900, 1035), b(540, 630)])).toEqual([{ from: 630, to: 900 }]);
  });
});

describe('startOfWeek', () => {
  it('Monday is the start', () => {
    // 08/09/2026 is a Tuesday
    expect(startOfWeek('2026-09-08')).toBe('2026-09-07');
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07');
  });

  it('Sunday belongs to the week that started on the previous Monday', () => {
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
  });
});
