// Canonical ingredient lines: `- <quantity> <unit> <item>, <note>` (SPEC §6).
//
// Works on the line as written (Markdown source, not plain text), and re-parses its own
// result: a line whose quantity, unit, item or note would read differently afterward is
// left exactly as it was.

import { canonicalUnit, formatQuantity, parseIngredientText, parseQuantity, splitRemark, type Quantity, type UnitMatch, type UnitRegistry } from '../core/index.ts';
import { rewriteTemperatures, scanTemperatures, type BareDegrees, type ScaleContext } from './temperature.ts';

/** Markup that makes position-blind text surgery on the item / note unsafe. */
const UNSAFE_TAIL_RE = /[`\\<]|\]\(/;

export interface Amount {
  quantity: Quantity;
  unit: UnitMatch | null;
  /** Number of characters of the text the quantity and unit take up. */
  length: number;
}

/** The quantity and unit at the start of `text`, with the length they occupy. */
export function leadingAmount(text: string, units: UnitRegistry): Amount | null {
  const q = parseQuantity(text);
  if (!q) return null;
  const gap = /^\s*/.exec(text.slice(q.length))![0].length;
  const u = units.match(text.slice(q.length + gap));
  if (!u) return { quantity: q.quantity, unit: null, length: q.length };
  return { quantity: q.quantity, unit: u.unit, length: q.length + gap + u.length };
}

/** The canonical spelling of a quantity and its unit: `1 1/2 cups`, `250 g`, `2-3 cloves`. */
export function canonicalAmount(quantity: Quantity, unit: UnitMatch | null): string {
  const q = formatQuantity(quantity);
  return unit ? `${q} ${canonicalUnit(unit.def, quantity)}` : q;
}

export interface LineResult {
  text: string;
  /** Temperatures in the note whose scale stays undecided. */
  bare: BareDegrees[];
  /** True when a bare temperature in the note was given °F for its value alone. */
  valueDecided: boolean;
}

/**
 * Canonical form of one raw ingredient line (the text after the list marker).
 * `whole` is false when the list item continues on further lines: then only the leading
 * amount is canonicalized and the rest of the line is kept byte for byte.
 */
export function formatIngredientText(text: string, units: UnitRegistry, whole = true, context: ScaleContext = 'none'): LineResult {
  const unchanged: LineResult = { text, bare: [], valueDecided: false };
  const source = whole ? text.replace(/[ \t]+$/, '') : text;
  const amount = leadingAmount(source, units);

  let head = '';
  let tail = source;
  if (amount) {
    head = canonicalAmount(amount.quantity, amount.unit);
    tail = source.slice(amount.length);
    // `1,000 g flour` reads as the quantity 1 and a note; do not make it worse.
    if (!amount.unit && tail.startsWith(',')) return unchanged;
    if (!whole) {
      const next = tail.replace(/^[ \t]+/, '');
      const out = next === '' || next.startsWith(',') ? head + next : `${head} ${next}`;
      return sameIngredient(text, out, units, context) ? { text: out, bare: [], valueDecided: false } : unchanged;
    }
  } else if (!whole) return unchanged;

  let bare: BareDegrees[] = [];
  let valueDecided = false;
  if (!UNSAFE_TAIL_RE.test(tail)) {
    tail = tail.replace(/[ \t]{2,}/g, ' ');
    // A remark after ` — ` is kept as written (spacing aside); only the text before it is the item and note.
    const split = splitRemark(tail);
    const remark = split.remark === null ? '' : ` — ${split.remark}`;
    if (split.remark !== null) tail = split.text;
    const comma = noteComma(tail);
    if (comma !== -1) {
      const item = tail.slice(0, comma).replace(/[ \t]+$/, '');
      const note = tail.slice(comma + 1).replace(/^[ \t]+/, '');
      const digits = /\d$/.test(item) && /^\d/.test(note) && item.length === comma && note.length === tail.length - comma - 1;
      if (note !== '' && item.trim() !== '' && !digits) {
        const scan = scanTemperatures(note, context);
        bare = scan.bare;
        valueDecided = scan.edits.some((e) => e.decidedBy === 'value');
        tail = `${item}, ${rewriteTemperatures(note, context)}`;
      }
    }
    tail += remark;
  }
  tail = tail.replace(/^[ \t]+/, '');
  const out = head === '' ? tail : tail === '' || tail.startsWith(',') ? head + tail : `${head} ${tail}`;
  if (out === text) return { text, bare, valueDecided: false };
  return sameIngredient(text, out, units, context) ? { text: out, bare, valueDecided } : unchanged;
}

/** Index of the comma that separates item from note: the first one outside parentheses. */
function noteComma(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}

const collapse = (s: string | null, context: ScaleContext): string | null =>
  s === null ? null : rewriteTemperatures(s.replace(/\s+/g, ' ').trim(), context);

/** True when two raw lines read as the same ingredient: same values, unit, item and note. */
export function sameIngredient(before: string, after: string, units: UnitRegistry, context: ScaleContext = 'none'): boolean {
  const a = parseIngredientText(before, units);
  const b = parseIngredientText(after, units);
  return (
    sameQuantity(a.quantity, b.quantity) &&
    (a.unit?.def.name ?? null) === (b.unit?.def.name ?? null) &&
    collapse(a.item, context) === collapse(b.item, context) &&
    collapse(a.note, context) === collapse(b.note, context) &&
    (a.remark?.replace(/\s+/g, ' ').trim() ?? null) === (b.remark?.replace(/\s+/g, ' ').trim() ?? null)
  );
}

export function sameQuantity(a: Quantity | null, b: Quantity | null): boolean {
  if (a === null || b === null) return a === b;
  return a.min.value === b.min.value && (a.max?.value ?? null) === (b.max?.value ?? null);
}
