import { describe, expect, it } from 'vitest';
import { isCompatible, validateManifest } from '../plugins/validation';
import { extractOpenCheckboxes } from '../plugins/core/noteTasks';
import { formatWorkBlock } from '../plugins/core/dailyNote';

describe('API version compatibility', () => {
  it('with no requirement, any plugin fits', () => {
    expect(isCompatible(undefined, '1.0.0')).toBe(true);
  });
  it('same major number and not higher: fits', () => {
    expect(isCompatible('1.0.0', '1.3.2')).toBe(true);
    expect(isCompatible('1.3.2', '1.3.2')).toBe(true);
  });
  it('plugin asking for a newer API than the app has: rejected', () => {
    expect(isCompatible('1.4.0', '1.3.2')).toBe(false);
    expect(isCompatible('1.3.3', '1.3.2')).toBe(false);
  });
  it('a different major number breaks the contract, in both directions', () => {
    expect(isCompatible('2.0.0', '1.9.0')).toBe(false);
    expect(isCompatible('1.0.0', '2.0.0')).toBe(false);
  });
  it('unreadable version: rejected instead of guessing', () => {
    expect(isCompatible('abc', '1.0.0')).toBe(false);
  });
});

describe('manifest', () => {
  const ok = { id: 'highlight-todo', name: 'Highlight TODO', version: '1.0.0' };

  it('accepts the minimal manifest', () => {
    expect(validateManifest(ok, 'highlight-todo').name).toBe('Highlight TODO');
  });

  it('rejects an id that would become a path outside the folder', () => {
    for (const id of ['../outside', 'a/b', 'Uppercase', '-starts-with-hyphen', 'x']) {
      expect(() => validateManifest({ ...ok, id }, id)).toThrow(/invalid id/);
    }
  });

  it("id must be the folder name — otherwise one plugin's data.json lands in another's folder", () => {
    expect(() => validateManifest(ok, 'other-folder')).toThrow(/does not match/);
  });

  it('rejects a missing name, a missing version, or something that is not an object', () => {
    expect(() => validateManifest({ ...ok, name: '  ' }, 'highlight-todo')).toThrow(/name/);
    expect(() => validateManifest({ id: 'highlight-todo', name: 'X' }, 'highlight-todo')).toThrow(/version/);
    expect(() => validateManifest(null, 'x')).toThrow(/object/);
    expect(() => validateManifest([ok], 'highlight-todo')).toThrow(/object/);
  });

  it('rejects one that requires a newer API', () => {
    expect(() => validateManifest({ ...ok, minApiVersion: '1.9.0' }, 'highlight-todo', '1.0.0')).toThrow(/requires API/);
  });
});

describe('Note tasks: open checkboxes', () => {
  it('takes only the open checkboxes, with any list marker', () => {
    const md = '- [ ] measure ripple\n* [ ] quote inductor\n+ [x] already done\n- plain item\n  - [ ] nested';
    expect(extractOpenCheckboxes(md)).toEqual(['measure ripple', 'quote inductor', 'nested']);
  });

  it('replaces [[link]] with its text — a task title has no brackets', () => {
    expect(extractOpenCheckboxes('- [ ] review [[RCD snubber]] and [[Derating|the derating]]'))
      .toEqual(['review RCD snubber and the derating']);
  });

  it('ignores a checkbox inside a code block', () => {
    expect(extractOpenCheckboxes('```\n- [ ] example\n```\n- [ ] for real')).toEqual(['for real']);
  });

  it('accepts CRLF', () => {
    expect(extractOpenCheckboxes('- [ ] a\r\n- [ ] b')).toEqual(['a', 'b']);
  });
});

describe('Daily note: work block', () => {
  const projects = [{ id: 1, name: 'Flyback rev C', code: 'CF03B04', color: 'p1' }];
  const at = (h: number, m: number) => new Date(2026, 8, 11, h, m).toISOString();

  it('one line per session, with project and duration', () => {
    const b = formatWorkBlock([
      { task: 1, title: 'Thermal test', project: 1, start: at(9, 0), end: at(10, 15) },
      { task: 2, title: 'Daily', project: null, start: at(10, 30), end: at(10, 45) },
    ], projects);
    expect(b.split('\n')).toEqual([
      '- 09:00–10:15 · Thermal test · CF03B04 (1h15)',
      '- 10:30–10:45 · Daily (15 min)',
    ]);
  });

  it('an open session shows as "now", measured up to the given instant', () => {
    const b = formatWorkBlock([{ task: 1, title: 'X', project: null, start: at(14, 0), end: null }],
      projects, new Date(2026, 8, 11, 14, 40));
    expect(b).toBe('- 14:00–now · X (40 min)');
  });

  it('a day with no sessions says so, instead of an empty list', () => {
    expect(formatWorkBlock([], projects)).toMatch(/No sessions/);
  });
});
