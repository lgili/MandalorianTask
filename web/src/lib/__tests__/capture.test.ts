import { describe, it, expect } from 'vitest';
import { parseCapture, parseDue, findProject } from '../capture';
import type { Project } from '../types';

const proj = (id: number, name: string, code: string | null): Project => ({
  id, name, code, color: null, archived_at: null, created_at: '2026-01-01T00:00:00Z',
});
const PROJECTS = [
  proj(1, 'Flyback rev C', 'CF03B04'),
  proj(2, 'NACQ', 'NACQ'),
  proj(3, 'Quotes', null),
];
// 2026-09-08 is a Tuesday
const TUESDAY = new Date(2026, 8, 8, 10, 0, 0);
const day = (iso: string | null) => (iso ? new Date(iso).toDateString() : null);

describe('project by prefix', () => {
  it('matches by code', () => {
    expect(findProject('cf03', PROJECTS)?.id).toBe(1);
  });
  it('matches by name when there is no code', () => {
    expect(findProject('quot', PROJECTS)?.id).toBe(3);
  });
  // Rule inverted on purpose. An ambiguous prefix used to return null: the
  // task was born orphaned and the warning was a strikethrough on a 10px chip.
  // Now `#` opens a list where both options show up, and this function became
  // the fallback for someone who submitted without looking — and then the best
  // guess is worth more than a silent omission.
  it('ambiguous prefix returns the best match, not null', () => {
    const ambiguous = [proj(1, 'Alpha', 'AA1'), proj(2, 'Alpha 2', 'AA2')];
    expect(findProject('aa', ambiguous)?.id).toBe(1);
    expect(findProject('aa2', ambiguous)?.id).toBe(2);
  });
  it('no match returns null instead of blowing up', () => {
    expect(findProject('zzz', PROJECTS)).toBeNull();
  });
});

describe('type by @ token', () => {
  it('default is work', () => {
    expect(parseCapture('measure ripple', PROJECTS, TUESDAY).kind).toBe('work');
  });
  it('@meeting and @m mark a meeting', () => {
    expect(parseCapture('daily @meeting', PROJECTS, TUESDAY).kind).toBe('meeting');
    expect(parseCapture('daily @m', PROJECTS, TUESDAY).kind).toBe('meeting');
  });
  it('@admin marks admin and drops out of the title', () => {
    const a = parseCapture('organize datasheets @admin', PROJECTS, TUESDAY);
    expect(a.kind).toBe('admin');
    expect(a.title).toBe('organize datasheets');
  });
  it('unknown @ becomes text, no error', () => {
    const a = parseCapture('talk to @john', PROJECTS, TUESDAY);
    expect(a.kind).toBe('work');
    expect(a.title).toBe('talk to @john');
  });
});

describe('due', () => {
  it('today and tomorrow', () => {
    expect(day(parseDue('today', TUESDAY))).toBe(new Date(2026, 8, 8).toDateString());
    expect(day(parseDue('tomorrow', TUESDAY))).toBe(new Date(2026, 8, 9).toDateString());
  });
  it('a weekday points to the NEXT one, never today', () => {
    // "tue" on a Tuesday means next Tuesday
    expect(day(parseDue('tue', TUESDAY))).toBe(new Date(2026, 8, 15).toDateString());
    expect(day(parseDue('fri', TUESDAY))).toBe(new Date(2026, 8, 11).toDateString());
  });
  it('+Nd', () => {
    expect(day(parseDue('+3d', TUESDAY))).toBe(new Date(2026, 8, 11).toDateString());
    expect(day(parseDue('+10', TUESDAY))).toBe(new Date(2026, 8, 18).toDateString());
  });
  it('dd/mm', () => {
    expect(day(parseDue('22/09', TUESDAY))).toBe(new Date(2026, 8, 22).toDateString());
  });
  it('a past date without a year goes to the next year', () => {
    expect(day(parseDue('05/03', TUESDAY))).toBe(new Date(2027, 2, 5).toDateString());
  });
  it('an impossible date is rejected instead of rolling into the next month', () => {
    expect(parseDue('31/02', TUESDAY)).toBeNull();
  });
  it('garbage returns null', () => {
    expect(parseDue('thursday-after-next', TUESDAY)).toBeNull();
  });
  it('stores local noon — a due date is a day, not an instant', () => {
    expect(new Date(parseDue('today', TUESDAY)!).getHours()).toBe(12);
  });
});

describe('full line', () => {
  it('extracts title, project and due', () => {
    const a = parseCapture('measure ripple on the 400 V bus #cf03 !thu', PROJECTS, TUESDAY);
    expect(a.title).toBe('measure ripple on the 400 V bus');
    expect(a.project?.id).toBe(1);
    expect(day(a.due)).toBe(new Date(2026, 8, 10).toDateString());
  });

  it('tokens in the middle of the sentence count too', () => {
    const a = parseCapture('#nacq close BOM !fri rev C', PROJECTS, TUESDAY);
    expect(a.title).toBe('close BOM rev C');
    expect(a.project?.id).toBe(2);
  });

  it('NEVER fails: a token that does not match becomes plain text', () => {
    const a = parseCapture('check #nonexistent and !nothinglikethis', PROJECTS, TUESDAY);
    // the task is still created, with the whole text preserved
    expect(a.title).toBe('check #nonexistent and !nothinglikethis');
    expect(a.project).toBeNull();
    expect(a.due).toBeNull();
    expect(a.ignored).toEqual(['#nonexistent', '!nothinglikethis']);
  });

  it('a line with no tokens at all is a valid task', () => {
    const a = parseCapture('request a sample of the isolated driver', PROJECTS, TUESDAY);
    expect(a.title).toBe('request a sample of the isolated driver');
    expect(a.ignored).toEqual([]);
  });

  it('only the first token of each type counts', () => {
    const a = parseCapture('test #cf03 #nacq', PROJECTS, TUESDAY);
    expect(a.project?.id).toBe(1);
    expect(a.title).toBe('test #nacq');   // the second one becomes text
  });

  it('a lone # is not a token', () => {
    expect(parseCapture('use # as a comment', PROJECTS, TUESDAY).title)
      .toBe('use # as a comment');
  });

  it('extra spaces do not make a crooked title', () => {
    expect(parseCapture('   review    eBOM   #nacq  ', PROJECTS, TUESDAY).title).toBe('review eBOM');
  });
});
