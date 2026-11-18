// Ingredient columns that line up down the whole card.
//
// A card has several ingredient tables (one per step, per part, per run), and a table sizes
// its own columns: a "pinch" in one step's table would push that table's items to the right
// of every other table's. So the renderer looks at every quantity and unit the card prints,
// estimates the widest of each, and hands the widths to the themes as custom properties on
// :root (`--ingr-qty-width`, `--ingr-unit-width`, in `ch`). A theme sizes its quantity and unit
// cells with `max(<its own width>, var(--ingr-unit-width, 0px))`, so a card with only short
// units keeps the theme's spacing and a card with a long one widens the column in every table
// at once. The estimate errs wide: a column a little too wide still lines up; one too narrow
// lets a table widen its own.

/**
 * Approximate advance widths in `ch` (the width of "0" in the same font). Proportional faces
 * differ, but in the card fonts these hold to within a few percent for lowercase text; the
 * caller adds a margin on top.
 */
const NARROW = new Set([...'ijl.,:;\'|!']);
const SLIM = new Set([...'frt()[]-/ ']);
const WIDE = new Set([...'mwMW']);

function charWidth(c: string): number {
  if (/[0-9]/.test(c)) return 1; // tabular or near enough: "0" is the unit
  if (NARROW.has(c)) return 0.5;
  if (SLIM.has(c)) return 0.7;
  if (WIDE.has(c)) return 1.6;
  if (c === '–' || c === '—') return c === '–' ? 1 : 1.8;
  if (/[¼-¾⅐-⅞]/.test(c)) return 1.25; // vulgar fractions: ½ ⅓ ¾ …
  if (/\p{Lu}/u.test(c)) return 1.35;
  if (/[ac-hk-qsuvx-z]/.test(c)) return c === 's' || c === 'c' || c === 'z' ? 0.9 : 1.05;
  return 1.1;
}

/** Estimated printed width of a short text, in `ch`. */
export function textWidth(text: string): number {
  let w = 0;
  for (const c of text) w += charWidth(c);
  return w;
}

/** Widths of the quantity and unit columns a card needs, in `ch`; null when the card prints none. */
export interface ColumnWidths {
  qty: number | null;
  unit: number | null;
}

const CELL = /<td class="ingr-(qty|unit)">([^<]*)<\/td>/g;

function unescape(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** The widest quantity and unit in a card's HTML (every `ingr-qty` and `ingr-unit` cell). */
export function columnWidths(html: string): ColumnWidths {
  let qty: number | null = null;
  let unit: number | null = null;
  for (const m of html.matchAll(CELL)) {
    const text = unescape(m[2]).trim();
    if (text === '') continue;
    const w = textWidth(text);
    if (m[1] === 'qty') qty = Math.max(qty ?? 0, w);
    else unit = Math.max(unit ?? 0, w);
  }
  return { qty, unit };
}

/** Margin on the estimate, for bold or italic text and faces wider than the table assumes. */
const MARGIN = 1.1;

const ch = (w: number) => `${Math.ceil(w * MARGIN * 10) / 10}ch`;

/** The custom property declarations for a card's HTML: empty when it prints no quantities or units. */
export function columnProperties(html: string): string {
  const { qty, unit } = columnWidths(html);
  const lines: string[] = [];
  if (qty !== null) lines.push(`  --ingr-qty-width: ${ch(qty)};\n`);
  if (unit !== null) lines.push(`  --ingr-unit-width: ${ch(unit)};\n`);
  return lines.join('');
}
