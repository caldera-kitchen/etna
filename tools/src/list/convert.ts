// Totaling one item's amounts across units: same-kind conversion (always), and weight with
// volume through a reference density (when a table is given).

import type { Quantity, UnitDef, UnitRegistry } from '../core/index.ts';
import { densityOf, toBase, unitSize, type DensityTable } from '../density/index.ts';
import type { Amount, ConsolidateOptions, ListItem } from './index.ts';
import {
  addRanges,
  compare,
  div,
  equals,
  rational,
  roundTo,
  scaleRange,
  toQuantity,
  type Rational,
  type RationalRange,
} from './rational.ts';

type Kind = 'mass' | 'volume';

function kindOf(a: Amount): Kind | null {
  if (!a.quantity || !a.unit) return null;
  return unitSize(a.unit)?.kind ?? null;
}

function hasDecimal(amounts: Amount[]): boolean {
  return amounts.some((a) => a.quantity && (a.quantity.min.style === 'decimal' || a.quantity.max?.style === 'decimal'));
}

function sumBase(amounts: Amount[], perMl: Rational | null = null): RationalRange {
  let total: RationalRange | null = null;
  for (const a of amounts) {
    let r = toBase(a.quantity!, a.unit!)!;
    if (perMl && r.kind === 'volume') r = { ...scaleRange(r, perMl), kind: 'mass' };
    total = total ? addRanges(total, r) : r;
  }
  return total!;
}

function find(units: UnitRegistry | null | undefined, name: string): UnitDef | null {
  return units?.find(name) ?? null;
}

/** Map both ends of a range through `f`. */
function mapRange(r: RationalRange, f: (x: Rational) => Rational): RationalRange {
  return { ...r, min: f(r.min), max: f(r.max) };
}

function quantityOf(r: RationalRange, decimal: boolean): Quantity {
  return toQuantity({ ...r, decimal });
}

/**
 * Display rounding. Grams: whole grams from 10 g up, tenths below. Milliliters: whole. Liters:
 * hundredths. US volumes: exact when the fraction is a half, third, quarter or eighth;
 * otherwise to the nearest eighth (cup) or quarter (smaller units).
 */
function roundFor(unit: UnitDef, x: Rational): Rational {
  if (unit.kind === 'mass') return roundTo(x, compare(x, rational(10n)) >= 0 ? rational(1n) : rational(1n, 10n));
  if (unit.system === 'metric') return roundTo(x, unit.ml !== null && unit.ml >= 1000 ? rational(1n, 100n) : rational(1n));
  if (NICE.includes(x.den)) return x;
  const step = unit.ml !== null && unit.ml >= 240 ? rational(1n, 8n) : rational(1n, 4n);
  const r = roundTo(x, step);
  return r.num === 0n ? x : r;
}

/** Weights total in grams; fall back to the smallest mass unit used when no registry is given. */
function massUnit(parts: Amount[], units: UnitRegistry | null | undefined): UnitDef {
  const gram = find(units, 'g') ?? parts.map((p) => p.unit!).find((u) => u.grams === 1);
  if (gram) return gram;
  return parts.map((p) => p.unit!).sort((a, b) => a.grams! - b.grams!)[0];
}

/**
 * Volumes. Any metric part: ml, or l from one liter up. Otherwise among tsp, tbsp and cup plus
 * any unit the parts used: the largest unit in which the total is at least 1/4. When the total
 * is not a plain fraction there (halves, thirds, quarters, eighths), the next unit down is used
 * if it is plain there and under 16; otherwise the total is rounded.
 */
function volumeUnit(parts: Amount[], ml: Rational, units: UnitRegistry | null | undefined): UnitDef {
  const used = parts.map((p) => p.unit!);
  const metric = used.some((u) => u.system === 'metric');
  let candidates: UnitDef[];
  let threshold: Rational;
  if (metric) {
    candidates = [...used, find(units, 'ml'), find(units, 'l')].filter((u): u is UnitDef => u !== null && u.system === 'metric');
    threshold = rational(1n);
  } else {
    candidates = [...used, find(units, 'tsp'), find(units, 'tbsp'), find(units, 'cup')].filter((u): u is UnitDef => u !== null);
    threshold = rational(1n, 4n);
  }
  const unique = [...new Map(candidates.map((u) => [u.name, u])).values()].sort((a, b) => a.ml! - b.ml!);
  const value = (u: UnitDef) => div(ml, unitSize(u)!.size);
  const fits = unique.filter((u) => compare(value(u), threshold) >= 0);
  if (fits.length === 0) return unique[0];
  const best = fits[fits.length - 1];
  if (!metric && !NICE.includes(value(best).den) && fits.length > 1) {
    // One step down when that reads exactly and stays short: 2 1/2 tsp, not ≈ 3/4 tbsp.
    const lower = fits[fits.length - 2];
    if (NICE.includes(value(lower).den) && compare(value(lower), rational(16n)) < 0) return lower;
  }
  return best;
}

const NICE = [1n, 2n, 3n, 4n, 8n];

function build(
  parts: Amount[],
  total: RationalRange,
  unit: UnitDef,
  by: 'unit' | 'density',
  density: ReturnType<typeof densityOf>,
  plural: string | null,
): Amount {
  const size = unitSize(unit)!.size;
  const inUnit = mapRange(total, (x) => div(x, size));
  const decimal = hasDecimal(parts) || unit.kind === 'mass' || unit.system === 'metric';
  const exact = quantityOf(inUnit, decimal);
  const shown = mapRange(inUnit, (x) => roundFor(unit, x));
  const rounded = !equals(shown.min, inUnit.min) || !equals(shown.max, inUnit.max);
  const quantity = rounded ? quantityOf(shown, decimal) : exact;
  const lines = parts.reduce((n, p) => n + p.lines, 0);
  const name = plural !== null && parts.some((p) => p.name === plural) ? plural : parts[0].name;
  return {
    quantity,
    unit,
    lines,
    name,
    converted: {
      from: parts,
      by,
      density: density ? { ingredient: density.ingredient, source: density.source, file: density.file } : null,
      exact,
      approximate: by === 'density' || rounded,
    },
  };
}

/** Replace `parts` within `amounts` by `combined`, at the position of the first part. */
function replace(amounts: Amount[], parts: Amount[], combined: Amount): Amount[] {
  const before = amounts.slice(0, amounts.indexOf(parts[0])).filter((a) => !parts.includes(a)).length;
  const rest = amounts.filter((a) => !parts.includes(a));
  rest.splice(before, 0, combined);
  return rest;
}

export function combineAmounts(item: ListItem, options: ConsolidateOptions): { item: ListItem; unconverted: boolean; liquidOunces?: boolean } {
  const original = item.amounts;
  let amounts = original;
  const plural = item.forms?.plural ?? null;
  const mass = original.filter((a) => kindOf(a) === 'mass');
  const volume = original.filter((a) => kindOf(a) === 'volume');
  let unconverted = false;

  const table: DensityTable | null = options.densities ?? null;
  const row = table && mass.length > 0 && volume.length > 0 ? densityOf(table, item.forms?.singular ?? item.item) : null;
  // `8 oz water` beside `1 cup water`: for a liquid, oz may mean fluid ounces, and adding it to
  // the cups as weight would hide exactly the mistake the density table exists to catch. The
  // amounts stay side by side and the list says why.
  const liquidOunces = row !== null && row.liquid && mass.some((a) => a.unit?.name === 'ounce');
  if (row && !liquidOunces) {
    const parts = [...mass, ...volume].sort((a, b) => original.indexOf(a) - original.indexOf(b));
    const total = sumBase(parts, row.perMl);
    amounts = replace(amounts, parts, build(parts, total, massUnit(mass, options.units), 'density', row, plural));
  } else {
    if (mass.length >= 2) amounts = replace(amounts, mass, build(mass, sumBase(mass), massUnit(mass, options.units), 'unit', null, plural));
    if (volume.length >= 2) {
      const total = sumBase(volume);
      amounts = replace(amounts, volume, build(volume, total, volumeUnit(volume, total.min, options.units), 'unit', null, plural));
    }
    unconverted = table !== null && mass.length > 0 && volume.length > 0;
  }

  if (amounts === original) return { item, unconverted, liquidOunces };
  const name = item.forms ? (amounts.length === 1 ? amounts[0].name! : item.forms.plural) : item.item;
  return { item: { ...item, item: name, amounts }, unconverted, liquidOunces };
}

