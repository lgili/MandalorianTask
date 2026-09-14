import { describe, expect, it } from 'vitest';
import {
  extractLinks, extractProjectRef, extractSnippet, extractTags, extractTargets, extractTitle,
  normalizeTarget, noteName, retargetLinks, splitFrontmatter, stripCode, toFileName, toSearchText,
} from '../markdown';

describe('frontmatter', () => {
  it('splits the YAML from the body and counts the lines', () => {
    const fm = splitFrontmatter('---\ntitle: Minutes\nproject: CF03B04\n---\n# Body\n');
    expect(fm.data).toEqual({ title: 'Minutes', project: 'CF03B04' });
    expect(fm.body).toBe('# Body\n');
    expect(fm.lineCount).toBe(4);
  });

  it('without frontmatter, the whole text is body', () => {
    expect(splitFrontmatter('# Only body').body).toBe('# Only body');
  });

  it('broken YAML does not take the note down: it becomes body', () => {
    const fm = splitFrontmatter('---\ntitle: [unclosed\n---\ntext');
    expect(fm.data).toEqual({});
    expect(fm.body).toContain('text');
  });

  it('accepts CRLF, which is what Windows writes', () => {
    expect(splitFrontmatter('---\r\ntitle: X\r\n---\r\nbody').data).toEqual({ title: 'X' });
  });
});

describe('title', () => {
  it('frontmatter beats heading, heading beats file name', () => {
    expect(extractTitle('a.md', splitFrontmatter('---\ntitle: From FM\n---\n# From H1'))).toBe('From FM');
    expect(extractTitle('a.md', splitFrontmatter('# From H1\ntext'))).toBe('From H1');
    expect(extractTitle('Folder/From file.md', splitFrontmatter('text'))).toBe('From file');
  });

  it('`## ` is not a title, and neither is `# ` inside code', () => {
    expect(extractTitle('x.md', splitFrontmatter('## Section\n```\n# comment\n```'))).toBe('x');
  });
});

describe('links', () => {
  it('normalizes folder, extension, section and alias', () => {
    expect(normalizeTarget('Flyback Rev C.md#Thermal test|the flyback')).toBe('flyback rev c');
    expect(normalizeTarget('Projects\\Flyback')).toBe('projects/flyback');
  });

  it('takes the label from the alias and marks embeds', () => {
    const [a, b] = extractLinks('see [[RCD snubber|the snubber]] and ![[diagram.png]]');
    expect(a).toMatchObject({ target: 'rcd snubber', label: 'the snubber', embed: false });
    expect(b.embed).toBe(true);
  });

  it('ignores links inside code', () => {
    expect(extractTargets('`[[fake]]` and\n```\n[[also fake]]\n```\n[[real]]')).toEqual(['real']);
  });

  it('does not repeat the same target', () => {
    expect(extractTargets('[[A]] [[a]] [[A|other]]')).toEqual(['a']);
  });
});

describe('tags', () => {
  it('merges frontmatter and body, without # and lowercased', () => {
    const fm = splitFrontmatter('---\ntags: [Minutes, meeting]\n---\ntext #Hardware and #power/flyback');
    expect(extractTags(fm).sort()).toEqual(['hardware', 'meeting', 'minutes', 'power/flyback']);
  });

  it('a pure number is not a tag, and a heading is not a tag', () => {
    expect(extractTags(splitFrontmatter('# Title\nversion #2026 and #v2'))).toEqual(['v2']);
  });

  it('accepts accents', () => {
    expect(extractTags(splitFrontmatter('#résumé'))).toEqual(['résumé']);
  });
});

describe('project', () => {
  it('reads `project:` and accepts the Obsidian link form', () => {
    expect(extractProjectRef(splitFrontmatter('---\nproject: CF03B04\n---\n'))).toBe('CF03B04');
    expect(extractProjectRef(splitFrontmatter('---\nproject: "[[NACQ]]"\n---\n'))).toBe('NACQ');
    expect(extractProjectRef(splitFrontmatter('no fm'))).toBeNull();
  });

  it('still reads the legacy `projeto:` key that older notes carry', () => {
    // Backward compatibility: earlier versions of Bancada wrote the Portuguese key.
    expect(extractProjectRef(splitFrontmatter('---\nprojeto: CF03B04\n---\n'))).toBe('CF03B04');
  });

  it('prefers `project:` when a note carries both keys', () => {
    expect(extractProjectRef(splitFrontmatter('---\nprojeto: OLD\nproject: NEW\n---\n'))).toBe('NEW');
  });
});

describe('files', () => {
  it('note name drops folder and extension', () => {
    expect(noteName('a/b/Nice Note.md')).toBe('Nice Note');
  });

  it('title becomes a Windows-safe name', () => {
    expect(toFileName('Minutes: 12/09 — résumé?')).toBe('Minutes 12 09 — résumé.md');
    expect(toFileName('  ...  ')).toBe('Untitled.md');
  });
});

describe('search', () => {
  it('search text swaps a link for its label and strips markup', () => {
    expect(toSearchText(splitFrontmatter('**See** [[Snubber|the snubber]] `x`')))
      .toBe('See the snubber x');
  });

  it('snippet finds the term ignoring accents', () => {
    expect(extractSnippet('the minutes of the café meeting on the snubber review', 'cafe', 5)).toContain('café');
  });

  it('stripCode preserves line breaks, so line numbers stay valid', () => {
    const md = 'a\n```\nb\n```\nc';
    expect(stripCode(md).split('\n')).toHaveLength(md.split('\n').length);
  });
});

describe('renaming rewrites links', () => {
  const oldTargets = ['rcd snubber', 'technical/rcd snubber'];

  it('retargets while preserving section and alias', () => {
    expect(retargetLinks('see [[RCD snubber#Sizing|the snubber]]', oldTargets, 'Clamp'))
      .toBe('see [[Clamp#Sizing|the snubber]]');
  });

  it('finds it by path too, and keeps the embed', () => {
    expect(retargetLinks('![[Technical/RCD snubber]]', oldTargets, 'Clamp')).toBe('![[Clamp]]');
  });

  it('ignores case and extension, like Obsidian', () => {
    expect(retargetLinks('[[rcd snubber.md]]', oldTargets, 'Clamp')).toBe('[[Clamp]]');
  });

  it('leaves links to other notes alone', () => {
    expect(retargetLinks('[[RC snubber]] and [[Flyback]]', oldTargets, 'X')).toBe('[[RC snubber]] and [[Flyback]]');
  });

  it('leaves links inside code alone', () => {
    const md = '`[[RCD snubber]]`\n```\n[[RCD snubber]]\n```\n[[RCD snubber]]';
    expect(retargetLinks(md, oldTargets, 'G')).toBe('`[[RCD snubber]]`\n```\n[[RCD snubber]]\n```\n[[G]]');
  });
});
