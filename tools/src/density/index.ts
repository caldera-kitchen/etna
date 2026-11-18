// Ingredient densities (registries/densities.md): reading the Reference densities table, matching an
// ingredient to a row, and converting between volume and weight. Pure and browser-safe.
//
// This module never supplies a density of its own. Every value comes from a table it is given.

import { parseAmount, type Quantity, type UnitDef, type UnitRegistry } from '../core/index.ts';
import { normalizeName, sameItem } from '../list/inflect.ts';
import {
  div,
  fromNumber,
  mul,
  rangeOf,
  scaleRange,
  toNumber,
  type Rational,
  type RationalRange,
} from '../list/rational.ts';

export interface Density {
  /** The row's Ingredient cell: the ingredient name as written. */
  ingredient: string;
  /** Other names the row covers, from its Aliases cell (separated by `;`). */
  aliases: string[];
  /** The stated volume (left of `=` in the Fact cell). */
  measure: { quantity: Quantity; unit: UnitDef };
  /** What that volume weighs, in grams (converted from the weight's unit). */
  grams: number;
  source: string;
  /** The row's Note, or empty. */
  notes: string;
  /** True when the row's Liquid cell says `yes`. */
  liquid: boolean;
  /** Grams per milliliter, exact: weight ÷ (quantity × unit ml). */
  perMl: Rational;
  /** 1-based number of the row within the Reference densities table, and its line in the file. */
  row: number;
  line: number;
  /** The file the row came from, when known (set by the node loader). */
  file: string | null;
}

export interface DensityProblem {
  /**
   * `no-section`: the file has no Reference densities section (fine for a collection's own
   * file). `table`: the section's table cannot be read (a missing or unknown column); no row of
   * it is used. `row`: a row that cannot be used; it is left out. `order`: a row out of
   * alphabetical order — a note only, the row is used.
   */
  code: 'no-section' | 'table' | 'row' | 'order';
  /** The row's number, when the problem belongs to one. */
  row: number | null;
  line: number;
  reason: string;
  file: string | null;
}

export interface DensityTable {
  rows: Density[];
  /** Problems that leave a row out (or mean there is no usable table). */
  problems: DensityProblem[];
  /** Milder findings that change nothing: rows out of alphabetical order. */
  notes: DensityProblem[];
}

export const REFERENCE_HEADING = 'Reference densities';

/** The table's columns, in the order the registry writes them. Ingredient, Fact and Source are required. */
export const COLUMNS = ['ingredient', 'fact', 'source', 'aliases', 'liquid', 'note'] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: Column[] = ['ingredient', 'fact', 'source'];
const COLUMN_NAMES = 'Ingredient, Fact, Source, Aliases, Liquid, Note';

/** Remove inline code and emphasis markers. */
function plain(text: string): string {
  return text.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]*)\*\*/g, '$1').replace(/\*([^*]*)\*/g, '$1').trim();
}

/** Parse `<quantity> <unit>` exactly: nothing may follow the unit. */
function parseMeasure(text: string, units: UnitRegistry): { quantity: Quantity; unit: UnitDef } | string {
  const { quantity, unit, rest } = parseAmount(text.trim(), units);
  if (!quantity) return `"${text.trim()}" has no quantity`;
  if (!unit) return `"${text.trim()}" has no known unit`;
  if (rest.trim() !== '') return `"${text.trim()}" has extra text after the unit`;
  if (quantity.max) return `"${text.trim()}" is a range; a row states one amount`;
  if (quantity.min.value <= 0) return `"${text.trim()}" is not a positive amount`;
  return { quantity, unit: unit.def };
}

/** Split the file into lines, blanking fenced code so that its headings and tables are not read. */
function visibleLines(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  let fence: string | null = null;
  return lines.map((l) => {
    const m = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fence !== null) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      return '';
    }
    if (m) {
      fence = m[1];
      return '';
    }
    return l;
  });
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_LINE = /^\s*\|/;
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** The cells of a table line: split on `|` not escaped by a backslash, outer pipes dropped. */
function cells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i++;
    } else if (text[i] === '|') {
      out.push(current.trim());
      current = '';
    } else current += text[i];
  }
  out.push(current.trim());
  return out;
}

/**
 * Read the Reference densities section of a densities file: one table, one row per ingredient,
 *
 *     | Ingredient | Fact | Source | Aliases | Liquid | Note |
 *     |---|---|---|---|---|---|
 *     | all-purpose flour | 1 cup = 120 g | house | all purpose flour; flour | | spooned and leveled |
 *
 * Ingredient, Fact and Source are required columns; Aliases, Liquid and Note may be left out.
 * Rows that cannot be used become problems (with their line); a row out of alphabetical order
 * is a note. Prose in the section is allowed; only its first table is read, and nothing outside
 * the section.
 */
export function parseDensities(markdown: string, units: UnitRegistry): DensityTable {
  const lines = visibleLines(markdown);
  const rows: Density[] = [];
  const problems: DensityProblem[] = [];
  const notes: DensityProblem[] = [];
  const problem = (row: number | null, line: number, reason: string, code: DensityProblem['code'] = 'row') =>
    (code === 'order' ? notes : problems).push({ code, row, line, reason, file: null });
  const done = () => ({ rows, problems, notes });

  const start = lines.findIndex((l) => {
    const m = HEADING.exec(l);
    return m !== null && plain(m[2]).toLowerCase() === REFERENCE_HEADING.toLowerCase();
  });
  if (start === -1) {
    problem(null, 1, `no "${REFERENCE_HEADING}" section`, 'no-section');
    return done();
  }
  const depth = HEADING.exec(lines[start])![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = HEADING.exec(lines[i]);
    if (m && m[1].length <= depth) {
      end = i;
      break;
    }
  }

  // The first table in the section: consecutive lines starting with `|`.
  let first = -1;
  for (let i = start + 1; i < end; i++) {
    if (TABLE_LINE.test(lines[i])) {
      first = i;
      break;
    }
  }
  if (first === -1) return done(); // an empty section: no rows yet
  let last = first;
  while (last + 1 < end && TABLE_LINE.test(lines[last + 1])) last++;
  for (let i = last + 1; i < end; i++) {
    if (TABLE_LINE.test(lines[i])) {
      problem(null, i + 1, 'a second table in the Reference densities section is not read; keep every row in one table', 'table');
      break;
    }
  }

  // Header and delimiter.
  const header = cells(lines[first]).map((h) => plain(h).toLowerCase());
  if (first + 1 > last || !DELIMITER.test(lines[first + 1])) {
    problem(null, first + 1, 'the table has no header row and |---| line under it', 'table');
    return done();
  }
  const index = new Map<Column, number>();
  for (const [i, h] of header.entries()) {
    if (!(COLUMNS as readonly string[]).includes(h)) {
      problem(null, first + 1, `unknown column "${h}" (known: ${COLUMN_NAMES})`, 'table');
      return done();
    }
    if (index.has(h as Column)) {
      problem(null, first + 1, `column "${h}" is given twice`, 'table');
      return done();
    }
    index.set(h as Column, i);
  }
  const missing = REQUIRED.filter((c) => !index.has(c));
  if (missing.length > 0) {
    problem(null, first + 1, `the table has no ${missing.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ')} column`, 'table');
    return done();
  }

  const seen = new Map<string, { name: string; row: number }>();
  let previous: string | null = null;
  for (let i = first + 2; i <= last; i++) {
    const row = i - first - 1;
    const lineNo = i + 1;
    const raw = cells(lines[i]);
    const get = (c: Column) => (index.has(c) ? plain(raw[index.get(c)!] ?? '') : '');
    const name = get('ingredient');
    const fail = (reason: string) => problem(row, lineNo, `${name || '(no name)'}: ${reason}`);

    if (raw.length !== header.length) {
      fail(`has ${raw.length} cells; the header has ${header.length} (a | inside a cell is written \\|)`);
      continue;
    }
    if (name === '') {
      fail('the Ingredient cell is empty');
      continue;
    }
    if (previous !== null && name.localeCompare(previous, 'en', { sensitivity: 'base' }) < 0) {
      problem(row, lineNo, `${name}: out of alphabetical order (after ${previous})`, 'order');
    }
    previous = name;

    const fact = get('fact');
    if (fact === '') {
      fail('the Fact cell is empty (`<volume> = <weight>`)');
      continue;
    }
    const sides = fact.split('=');
    if (sides.length !== 2) {
      fail(`Fact "${fact}" is not "<volume> = <weight>"`);
      continue;
    }
    const measure = parseMeasure(sides[0], units);
    if (typeof measure === 'string') {
      fail(`volume ${measure}`);
      continue;
    }
    if (measure.unit.kind !== 'volume' || measure.unit.ml === null) {
      fail(`"${sides[0].trim()}" is not a volume`);
      continue;
    }
    const weight = parseMeasure(sides[1], units);
    if (typeof weight === 'string') {
      fail(`weight ${weight}`);
      continue;
    }
    if (weight.unit.kind !== 'mass' || weight.unit.grams === null) {
      fail(`"${sides[1].trim()}" is not a weight`);
      continue;
    }

    const source = get('source');
    if (source === '') {
      fail('has no Source; a row needs one');
      continue;
    }
    const liquid = get('liquid').toLowerCase();
    if (liquid !== '' && liquid !== 'yes' && liquid !== 'no') {
      fail(`Liquid is "${liquid}"; write yes, no, or leave it empty`);
      continue;
    }
    const aliases = get('aliases')
      .split(';')
      .map((a) => a.trim())
      .filter((a) => a !== '');

    let clashed = false;
    for (const n of [name, ...aliases]) {
      const clash = [...seen.keys()].find((k) => sameItem(k, n));
      if (clash !== undefined) {
        fail(`"${n}" is already covered by the row "${seen.get(clash)!.name}"`);
        clashed = true;
        break;
      }
    }
    if (clashed) continue;
    for (const n of [name, ...aliases]) seen.set(normalizeName(n), { name, row });

    const gramsExact = mul(rangeOf(weight.quantity).min, fromNumber(weight.unit.grams));
    const mlExact = mul(rangeOf(measure.quantity).min, fromNumber(measure.unit.ml));
    rows.push({
      ingredient: name,
      aliases,
      measure,
      grams: toNumber(gramsExact),
      source,
      notes: get('note'),
      liquid: liquid === 'yes',
      perMl: div(gramsExact, mlExact),
      row,
      line: lineNo,
      file: null,
    });
  }
  return done();
}

/**
 * The row for an ingredient: its name or one of its aliases is the same item by the shopping
 * list's rule (case, whitespace, singular/plural of the last word). Exact names only.
 */
export function densityOf(table: DensityTable, item: string): Density | null {
  return table.rows.find((r) => sameItem(r.ingredient, item) || r.aliases.some((a) => sameItem(a, item))) ?? null;
}

/**
 * Lay `override` over `base`: a row in `override` replaces every base row covering the same
 * name (by ingredient or alias). Problems from both are kept.
 */
export function mergeTables(base: DensityTable, override: DensityTable): DensityTable {
  const names = (r: Density) => [r.ingredient, ...r.aliases];
  const kept = base.rows.filter((b) => !override.rows.some((o) => names(o).some((n) => names(b).some((m) => sameItem(n, m)))));
  return { rows: [...kept, ...override.rows], problems: [...base.problems, ...override.problems], notes: [...base.notes, ...override.notes] };
}

// ------------------------------------------------------------------ conversion

/** Size of one unit in its kind's base (grams or milliliters), exactly; null for other kinds. */
export function unitSize(unit: UnitDef): { kind: 'mass' | 'volume'; size: Rational } | null {
  if (unit.kind === 'mass' && unit.grams !== null) return { kind: 'mass', size: fromNumber(unit.grams) };
  if (unit.kind === 'volume' && unit.ml !== null) return { kind: 'volume', size: fromNumber(unit.ml) };
  return null;
}

/** A quantity of a mass or volume unit, in grams or milliliters. Null for other units. */
export function toBase(quantity: Quantity, unit: UnitDef): (RationalRange & { kind: 'mass' | 'volume' }) | null {
  const s = unitSize(unit);
  if (!s) return null;
  return { ...scaleRange(rangeOf(quantity), s.size), kind: s.kind };
}

/** Grams in one of `unit` (a volume unit) of the ingredient, exactly; null for a non-volume unit. */
export function gramsPer(density: Density, unit: UnitDef): Rational | null {
  const s = unitSize(unit);
  if (!s || s.kind !== 'volume') return null;
  return mul(density.perMl, s.size);
}
