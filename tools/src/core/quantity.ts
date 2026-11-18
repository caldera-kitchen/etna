// Quantities: integers, decimals, fractions, mixed numbers, Unicode fraction glyphs, ranges.

import type { NumberValue, Quantity } from './model.ts';

const GLYPHS: Record<string, [number, number]> = {
  '½': [1, 2],
  '⅓': [1, 3],
  '⅔': [2, 3],
  '¼': [1, 4],
  '¾': [3, 4],
  '⅕': [1, 5],
  '⅖': [2, 5],
  '⅗': [3, 5],
  '⅘': [4, 5],
  '⅙': [1, 6],
  '⅚': [5, 6],
  '⅛': [1, 8],
  '⅜': [3, 8],
  '⅝': [5, 8],
  '⅞': [7, 8],
};

const SUPER = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const GLYPH_CLASS = Object.keys(GLYPHS).join('');

// A composed fraction such as ¹⁄₁₆ : superscript digits, U+2044 FRACTION SLASH, subscript digits.
const COMPOSED = `[${SUPER}]+⁄[${SUB}]+`;
const FRACTION_GLYPH = `(?:[${GLYPH_CLASS}]|${COMPOSED})`;

// Order matters: mixed forms before their prefixes.
const NUMBER_RE = new RegExp(
  '^(?:' +
    `(\\d+)\\s*(${FRACTION_GLYPH})` + // 1,2  mixed with glyph: 1½, 1 ½
    `|(${FRACTION_GLYPH})` + // 3  glyph alone: ½
    '|(\\d+)\\s+(\\d+)/(\\d+)' + // 4,5,6  mixed ASCII: 1 1/2
    '|(\\d+)/(\\d+)' + // 7,8  fraction: 1/2
    '|(\\d*\\.\\d+)' + // 9  decimal: 2.5, .5
    '|(\\d{1,3}(?:,\\d{3})+(?!\\d))' + // 10  integer with thousands separators: 1,000
    '|(\\d+)' + // 11  integer
    ')',
);

function glyphParts(glyph: string): [number, number] {
  const known = GLYPHS[glyph];
  if (known) return known;
  const [top, bottom] = glyph.split('⁄');
  const num = Number([...top].map((c) => SUPER.indexOf(c)).join(''));
  const den = Number([...bottom].map((c) => SUB.indexOf(c)).join(''));
  return [num, den];
}

/** Parse one number at the start of `text`. Returns the value and the number of characters used. */
export function parseNumber(text: string): { number: NumberValue; length: number } | null {
  const m = NUMBER_RE.exec(text);
  if (!m) return null;
  const raw = m[0];
  let number: NumberValue;
  if (m[1] !== undefined) {
    const whole = Number(m[1]);
    const [num, den] = glyphParts(m[2]);
    number = { value: whole + num / den, text: raw, style: 'mixed', unicode: true, whole, num, den };
  } else if (m[3] !== undefined) {
    const [num, den] = glyphParts(m[3]);
    number = { value: num / den, text: raw, style: 'fraction', unicode: true, whole: 0, num, den };
  } else if (m[4] !== undefined) {
    const whole = Number(m[4]);
    const num = Number(m[5]);
    const den = Number(m[6]);
    if (den === 0) return null;
    number = { value: whole + num / den, text: raw, style: 'mixed', unicode: false, whole, num, den };
  } else if (m[7] !== undefined) {
    const num = Number(m[7]);
    const den = Number(m[8]);
    if (den === 0) return null;
    number = { value: num / den, text: raw, style: 'fraction', unicode: false, whole: 0, num, den };
  } else if (m[9] !== undefined) {
    number = { value: Number(m[9]), text: raw, style: 'decimal', unicode: false, whole: 0, num: 0, den: 1 };
  } else if (m[10] !== undefined) {
    const whole = Number(m[10].replace(/,/g, ''));
    number = { value: whole, text: raw, style: 'integer', unicode: false, whole, num: 0, den: 1 };
  } else {
    // `00 Flour` is a flour grade, not a quantity: a multi-digit integer never starts with 0.
    if (/^0\d/.test(m[11])) return null;
    const whole = Number(m[11]);
    number = { value: whole, text: raw, style: 'integer', unicode: false, whole, num: 0, den: 1 };
  }
  // A number no kitchen uses, and no arithmetic can carry: `¹⁄₀`, or an integer too long to
  // hold exactly. Not a quantity; the line is then read as an ingredient with none.
  if (!Number.isFinite(number.value) || number.den === 0 || !Number.isSafeInteger(number.whole) || !Number.isSafeInteger(number.num) || !Number.isSafeInteger(number.den)) return null;
  return { number, length: raw.length };
}

// Range separators between two numbers: hyphen, en dash, or the word "to".
const RANGE_RE = /^(\s*(-|–)\s*|\s+(to)\s+)/;

/**
 * Parse a quantity at the start of `text`: a number, or a range of two numbers.
 * A quantity must be followed by whitespace, a comma or the end of the text — so
 * `2-inch piece` and `14-ounce can` are not read as quantities or ranges.
 */
export function parseQuantity(text: string): { quantity: Quantity; length: number } | null {
  const first = parseNumber(text);
  if (!first) return null;
  let length = first.length;
  let max: NumberValue | null = null;
  let rangeSeparator: string | null = null;

  const sep = RANGE_RE.exec(text.slice(length));
  if (sep) {
    const second = parseNumber(text.slice(length + sep[0].length));
    if (second && endsCleanly(text, length + sep[0].length + second.length)) {
      max = second.number;
      rangeSeparator = sep[2] ?? sep[3];
      length += sep[0].length + second.length;
    }
  }
  if (!endsCleanly(text, length)) return null;
  return {
    quantity: { raw: text.slice(0, length), min: first.number, max, rangeSeparator },
    length,
  };
}

function endsCleanly(text: string, index: number): boolean {
  if (index >= text.length) return true;
  return /[\s,]/.test(text[index]);
}

// ------------------------------------------------------------------ formatting

export type FractionStyle = 'ascii' | 'unicode';

const GLYPH_BY_PARTS = new Map(Object.entries(GLYPHS).map(([g, [n, d]]) => [`${n}/${d}`, g]));

/** Render one number. Decimals and integers are kept as written. */
export function formatNumber(n: NumberValue, fractions: FractionStyle = 'ascii'): string {
  if (n.style === 'integer') return String(n.whole);
  if (n.style === 'decimal') return n.text;
  const frac =
    fractions === 'unicode' ? (GLYPH_BY_PARTS.get(`${n.num}/${n.den}`) ?? `${n.num}/${n.den}`) : `${n.num}/${n.den}`;
  if (n.style === 'fraction') return frac;
  return `${n.whole} ${frac}`;
}

export interface QuantityFormat {
  fractions?: FractionStyle;
  /** Text placed between the two numbers of a range. Default `-`. */
  range?: string;
}

/** Render a quantity. The defaults give the canonical source form: `1 1/2`, `2-3`. */
export function formatQuantity(q: Quantity, options: QuantityFormat = {}): string {
  const fractions = options.fractions ?? 'ascii';
  const min = formatNumber(q.min, fractions);
  if (!q.max) return min;
  return `${min}${options.range ?? '-'}${formatNumber(q.max, fractions)}`;
}

/** Singular up to and including one, plural above it and for any range. */
export function isPlural(q: Quantity): boolean {
  if (q.max) return true;
  // A decimal reads as plural unless it is exactly one: `0.75 grams`, but `1/2 cup`.
  if (q.min.style === 'decimal') return q.min.value !== 1;
  return q.min.value > 1;
}
