import { describe, expect, it } from 'vitest';
import { deriveProjectCode, predictNextColor, scoreProject, canCreateProject, rankProjects } from '../projects';
import type { Project } from '../types';

const P = (id: number, name: string, code: string | null = null): Project =>
  ({ id, name, code, color: 'p1', archived_at: null, created_at: '' });

const FLYBACK = P(1, 'Flyback rev C', 'CF03B04');
const NACQ = P(2, 'NACQ 2026', 'NACQ');
const INFRA = P(3, 'Lab bench and infra', 'INFRA');
const RESUMES = P(4, 'Candidate résumés', null);

describe('scoreProject', () => {
  it('exact code beats everything', () => {
    expect(scoreProject('nacq', NACQ)).toBeGreaterThan(scoreProject('nacq', P(9, 'NACQ other')));
  });

  it('code prefix beats name prefix', () => {
    expect(scoreProject('cf03', FLYBACK)).toBeGreaterThan(scoreProject('flyb', FLYBACK));
  });

  it('matches by word initials', () => {
    expect(scoreProject('lbai', INFRA)).toBeGreaterThan(0);
  });

  it('ignores accents on both sides', () => {
    expect(scoreProject('resumes', RESUMES)).toBeGreaterThan(0);
    expect(scoreProject('résumés', RESUMES)).toBeGreaterThan(0);
  });

  it('an empty query lets everyone through', () => {
    expect(scoreProject('', FLYBACK)).toBeGreaterThan(0);
  });

  it('does not match what has nothing to do with it', () => {
    expect(scoreProject('zzz', FLYBACK)).toBe(0);
  });
});

describe('rankProjects', () => {
  const all = [FLYBACK, NACQ, INFRA, RESUMES];

  it('ambiguity returns both, instead of null', () => {
    const r = rankProjects('n', [NACQ, P(5, 'New bench', 'NB')]);
    expect(r).toHaveLength(2);
  });

  it('keeps the input order on a tie', () => {
    const a = P(6, 'Alpha project', null);
    const b = P(7, 'Alpha other', null);
    expect(rankProjects('alpha', [b, a]).map((p) => p.id)).toEqual([7, 6]);
  });

  it('an empty query returns the whole list in the original order', () => {
    expect(rankProjects('', all)).toEqual(all);
  });
});

describe('canCreateProject', () => {
  const all = [FLYBACK, NACQ];

  it('offers to create when nothing has that name', () => {
    expect(canCreateProject('Retrofit line 4', all)).toBe(true);
  });

  it('does not offer to create a duplicate name, ignoring case and accents', () => {
    expect(canCreateProject('flyback rev c', all)).toBe(false);
  });

  it('does not offer to create when the text is an existing code', () => {
    expect(canCreateProject('NACQ', all)).toBe(false);
  });

  it('does not offer to create with empty text', () => {
    expect(canCreateProject('   ', all)).toBe(false);
  });
});

describe('deriveProjectCode', () => {
  const all = [FLYBACK, NACQ];

  it('derives from the first four letters of the first word', () => {
    expect(deriveProjectCode('Retrofit line 4', all)).toBe('RETR');
    expect(deriveProjectCode('Lab bench and infra', all)).toBe('LAB');
  });

  it('strips accents', () => {
    expect(deriveProjectCode('Résumé', all)).toBe('RESU');
  });

  it('does not collide with an existing code', () => {
    const withNacq = [...all, P(9, 'Nacq other', 'NACQ')];
    expect(deriveProjectCode('NACQ 2027', withNacq)).toBe('NACQ2');
  });

  it('a name with no alphanumerics returns null instead of an empty code', () => {
    expect(deriveProjectCode('!!!', all)).toBeNull();
  });
});

describe('predictNextColor', () => {
  it('returns the least used color among active projects', () => {
    const used = [
      { ...P(1, 'a'), color: 'p1' }, { ...P(2, 'b'), color: 'p1' },
      { ...P(3, 'c'), color: 'p2' },
    ];
    expect(predictNextColor(used)).toBe('p3');
  });

  it('ignores archived projects in the count', () => {
    const used = [
      { ...P(1, 'a'), color: 'p1', archived_at: '2026-01-01' },
      { ...P(2, 'b'), color: 'p2' }, { ...P(3, 'c'), color: 'p3' },
      { ...P(4, 'd'), color: 'p4' }, { ...P(5, 'e'), color: 'p5' },
      { ...P(6, 'f'), color: 'p6' },
    ];
    expect(predictNextColor(used)).toBe('p1');
  });
});
