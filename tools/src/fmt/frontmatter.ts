// Frontmatter key order.
//
// Whole key blocks are moved as text: a top-level key line, the indented lines under it,
// and the comment lines directly above it. Values are never re-serialized, so quoting,
// spacing and comments stay as written. When the block structure is not plain enough to be
// sure of that, the frontmatter is left alone.

import { parse as parseYaml } from 'yaml';

/** Recognized keys, in canonical order. Other keys follow in their existing order; `extra` is last. */
const ORDER = ['etna', 'form', 'source', 'yield', 'license', 'version'];
const LAST = 'extra';

// A plain or quoted top-level key at column 0.
const KEY_RE = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s#"'[\]{},&*!|>%@`-][^:#]*?))\s*:(?:\s|$)/;

interface Block {
  key: string;
  lines: string[];
}

export interface FrontmatterResult {
  /** The reordered YAML text, or null when nothing changes or it cannot be done safely. */
  text: string | null;
  /** Why the frontmatter was left alone although its keys are out of order. */
  reason: string | null;
}

function rank(key: string): number {
  if (key === LAST) return ORDER.length + 1;
  const i = ORDER.indexOf(key);
  return i === -1 ? ORDER.length : i;
}

/** `raw` is the YAML between the `---` fences; `data` is what it parses to. */
export function orderFrontmatter(raw: string, data: Record<string, unknown>): FrontmatterResult {
  const keys = Object.keys(data);
  const sorted = keys.map((key, index) => ({ key, index })).sort((a, b) => rank(a.key) - rank(b.key) || a.index - b.index);
  if (sorted.every((k, i) => k.key === keys[i])) return { text: null, reason: null };
  const leave = (reason: string): FrontmatterResult => ({ text: null, reason: `frontmatter keys left in their order: ${reason}` });

  const blocks: Block[] = [];
  let pending: string[] = []; // comment lines waiting for the key they sit above
  for (const line of raw.split('\n')) {
    if (line.trim() === '') return leave('it contains blank lines');
    if (/^#/.test(line)) {
      pending.push(line);
      continue;
    }
    if (/^\s/.test(line)) {
      // An indented line belongs to the key above it — and so do any comments before it.
      if (blocks.length === 0) return leave('it does not start with a key');
      blocks[blocks.length - 1].lines.push(...pending, line);
      pending = [];
      continue;
    }
    const m = KEY_RE.exec(line);
    if (!m) return leave('a line is not a plain `key: value`');
    const key = m[1] !== undefined ? unescapeDouble(m[1]) : m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3].trim();
    if (key === null) return leave('a key uses escapes');
    blocks.push({ key, lines: [...pending, line] });
    pending = [];
  }
  if (pending.length > 0) return leave('it ends with a comment');
  if (blocks.length !== keys.length || blocks.some((b, i) => b.key !== keys[i])) return leave('its keys could not be located line by line');

  const text = sorted.flatMap((k) => blocks[k.index].lines).join('\n');
  // The proof: the moved text must parse to the same data, with the keys in the wanted order.
  try {
    const again = parseYaml(text) as Record<string, unknown> | null;
    if (again === null || typeof again !== 'object' || Array.isArray(again)) return leave('the result would not parse');
    const wanted = sorted.map((k) => k.key);
    const got = Object.keys(again);
    if (got.length !== wanted.length || got.some((k, i) => k !== wanted[i])) return leave('the result would not parse the same');
    if (stable(again) !== stable(data)) return leave('the result would not parse the same');
  } catch {
    return leave('the result would not parse');
  }
  return { text, reason: null };
}

function unescapeDouble(s: string): string | null {
  return s.includes('\\') ? null : s;
}

/** JSON with object keys sorted at every level, for comparing parsed YAML regardless of key order. */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
    }
    return v;
  });
}
