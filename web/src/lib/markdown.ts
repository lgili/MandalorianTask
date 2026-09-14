// Reading a vault .md: frontmatter, title, links and tags.
//
// Everything here is pure and tested. The indexer calls this; the UI never runs
// regexes over markdown on its own. Same rule as time.ts: the place where bugs
// lie silently lives in a single file.
//
// Obsidian compatibility is the tiebreaker in every decision: the same vault
// will be opened by both apps.

import { load } from 'js-yaml';

export interface Frontmatter {
  data: Record<string, unknown>;
  /** Markdown without the `---` block. */
  body: string;
  /** Lines taken by the frontmatter, so the editor knows where the body starts. */
  lineCount: number;
}

const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits the YAML from the body. Invalid YAML is NOT an error: it becomes empty
 * `data` and the whole text stays the body. A note with broken frontmatter is
 * still a note — refusing to open it would be worse than ignoring the metadata.
 */
export function splitFrontmatter(text: string): Frontmatter {
  const m = text.match(FM);
  if (!m) return { data: {}, body: text, lineCount: 0 };
  let data: Record<string, unknown> = {};
  try {
    const y = load(m[1]);
    if (y && typeof y === 'object' && !Array.isArray(y)) data = y as Record<string, unknown>;
  } catch {
    return { data: {}, body: text, lineCount: 0 };
  }
  return { data, body: text.slice(m[0].length), lineCount: m[0].split('\n').length - 1 };
}

/** 'Projects/Flyback rev C.md' -> 'Flyback rev C' */
export function noteName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

/**
 * Note title. Obsidian's order: frontmatter `title`, then the first `# ` in
 * the body, then the file name.
 */
export function extractTitle(path: string, fm: Frontmatter): string {
  const t = fm.data.title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  const h1 = stripCode(fm.body).match(/^#[ \t]+(.+?)[ \t#]*$/m);
  if (h1) return h1[1].trim();
  return noteName(path);
}

/**
 * Blanks out code blocks and inline code, preserving line breaks.
 * `[[this]]` inside a code example is not a link, and `#include` is not a tag.
 */
export function stripCode(md: string): string {
  return md
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (b) => b.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]+`/g, (b) => ' '.repeat(b.length));
}

/**
 * Canonical form of a link target — it's what goes into `note_links.target`.
 *   '[[Flyback Rev C.md#Thermal test|the flyback]]' -> 'flyback rev c'
 * Keeps the folder when the link carries one: `[[Projects/Flyback]]` is a
 * different target from `[[Flyback]]`, and resolution decides which file each finds.
 */
export function normalizeTarget(target: string): string {
  return target
    .split('|')[0]
    .split('#')[0]
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .toLowerCase();
}

export interface Link {
  /** As written, without the brackets. */
  raw: string;
  target: string;
  /** Displayed text: the alias after `|`, or the target itself. */
  label: string;
  embed: boolean;
}

const WIKI = /(!?)\[\[([^\[\]\n]+?)\]\]/g;

export function extractLinks(md: string): Link[] {
  const out: Link[] = [];
  for (const m of stripCode(md).matchAll(WIKI)) {
    const raw = m[2];
    const target = normalizeTarget(raw);
    if (!target) continue;
    const alias = raw.split('|')[1]?.trim();
    out.push({ raw, target, label: alias || raw.split('|')[0].split('#')[0].trim(), embed: m[1] === '!' });
  }
  return out;
}

/** Distinct targets, to store in the index. */
export function extractTargets(md: string): string[] {
  return [...new Set(extractLinks(md).map((l) => l.target))];
}

/**
 * Tags from the frontmatter and the body, without '#', lowercase, no duplicates.
 *
 * Obsidian's rule: a tag needs at least one non-numeric character — `#2026`
 * is a number, not a tag. And `# Title` (with a space) is a heading.
 */
export function extractTags(fm: Frontmatter): string[] {
  const out = new Set<string>();
  const fromFm = fm.data.tags ?? fm.data.tag;
  const list = Array.isArray(fromFm) ? fromFm : typeof fromFm === 'string' ? fromFm.split(/[,\s]+/) : [];
  for (const t of list) {
    const s = String(t).replace(/^#/, '').trim().toLowerCase();
    if (s) out.add(s);
  }
  for (const m of stripCode(fm.body).matchAll(/(?:^|[\s(])#([\p{L}\p{N}_\-/]+)/gu)) {
    const t = m[1].toLowerCase();
    if (/\p{L}|[_\-/]/u.test(t)) out.add(t);
  }
  return [...out];
}

/** Raw value of `project:` (or the legacy `projeto:`), so the index can link a note to a project. */
export function extractProjectRef(fm: Frontmatter): string | null {
  // `projeto:` is the Portuguese key that earlier versions of Bancada wrote. The
  // user's existing notes still carry it, so it keeps being read — backward
  // compatibility only; the app itself now writes `project:`.
  const v = fm.data.project ?? fm.data.projeto;
  if (v == null) return null;
  // Obsidian writes a link property as "[[CF03B04]]": accept both forms.
  const s = String(v).replace(/^\[\[|\]\]$/g, '').trim();
  return s || null;
}

/** A file name that is safe on Windows, on macOS and in Obsidian. */
export function toFileName(title: string): string {
  const clean = title
    .replace(/[<>:"/\\|?*#^[\]]/g, ' ')   // forbidden on Windows + the ones that break links
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');               // Windows rejects names ending in a dot
  return `${clean || 'Untitled'}.md`;
}

/** Plain text for FTS: no frontmatter, no link syntax, no markup. */
export function toSearchText(fm: Frontmatter): string {
  return fm.body
    .replace(WIKI, (_m, _e, b: string) => b.split('|').pop() ?? b)
    .replace(/[*_~`>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Snippet around the first occurrence of a term — the line shown in a search result. */
export function extractSnippet(text: string, term: string, radius = 70): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const i = norm(text).indexOf(norm(term.trim()));
  if (i < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, i - radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, i + term.length + radius).trim()}…`;
}

/** Code spans as [start, end) ranges — a link in there is just text. */
function codeRanges(md: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of md.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm)) out.push([m.index!, m.index! + m[0].length]);
  for (const m of md.matchAll(/`[^`\n]+`/g)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

/**
 * Retargets every `[[link]]` that points to a renamed note.
 *
 * Preserves `#section` and `|alias`, and does NOT touch links inside code. It's
 * what keeps renaming one note from breaking the others — without this, every
 * rename would leave a trail of dead links, which is the #1 reason people give
 * up on linking notes.
 *
 * `oldTargets` are normalized targets (see `normalizeTarget`): the file name
 * and the path, because the link may have been written either way.
 */
export function retargetLinks(md: string, oldTargets: string[], newTarget: string): string {
  const code = codeRanges(md);
  const inCode = (i: number) => code.some(([a, b]) => i >= a && i < b);
  return md.replace(WIKI, (whole, embed: string, raw: string, offset: number) => {
    if (inCode(offset)) return whole;
    const [targetAndSection, ...alias] = raw.split('|');
    const [target, ...section] = targetAndSection.split('#');
    if (!oldTargets.includes(normalizeTarget(target))) return whole;
    const s = section.length ? `#${section.join('#')}` : '';
    const a = alias.length ? `|${alias.join('|')}` : '';
    return `${embed}[[${newTarget}${s}${a}]]`;
  });
}
