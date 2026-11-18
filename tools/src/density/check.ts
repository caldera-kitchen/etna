// `etna density check`: what a collection needs from the density table. Pure: takes parsed
// recipes and a table, returns findings, and renders them as text or as the "Wanted" section.

import { parseAmount, type Ingredient, type Quantity, type UnitDef, type UnitRegistry } from '../core/index.ts';
import { consolidate, ingredientLines, type ListSource } from '../list/index.ts';
import { normalizeName, sameItem } from '../list/inflect.ts';
import { div, mul, toNumber } from '../list/rational.ts';
import { densityOf, gramsPer, toBase, unitSize, type DensityTable } from './index.ts';

export interface CheckOptions {
  /** Allowed disagreement between a stated pair and its reference row, as a fraction. Default 0.05. */
  tolerance?: number;
  /** Below this many grams per cup, a stated pair for water fails the water test. Default 233. */
  waterMinimum?: number;
}

export interface LineRef {
  recipe: string;
  line: string;
}

export interface Needed {
  item: string;
  recipes: string[];
  example: LineRef;
}

export interface Candidate {
  item: string;
  /** The row's Ingredient name. */
  row: string;
  /** `spelling`: equal but for hyphens or spacing. `contains`: the item's name contains the row's. `inside`: the row's name contains the item's. */
  relation: 'spelling' | 'contains' | 'inside';
  recipes: number;
}

/** A line that states its amount both ways: `8 tsp water, 40 grams`. */
export interface StatedPair extends LineRef {
  item: string;
  volume: { quantity: Quantity; unit: UnitDef };
  weight: { quantity: Quantity; unit: UnitDef };
  /** What the line implies, in grams per cup. */
  gramsPerCup: number;
}

export interface Disagreement extends StatedPair {
  row: string;
  referencePerCup: number;
  /** (stated − reference) ÷ reference. */
  difference: number;
}

export interface LiquidOunces extends LineRef {
  item: string;
  row: string;
}

export interface CheckReport {
  recipes: number;
  rows: number;
  tolerance: number;
  waterMinimum: number;
  needed: Needed[];
  candidates: Candidate[];
  pairs: StatedPair[];
  disagreements: Disagreement[];
  /** Lines measured in `oz` whose row says Liquid: yes. */
  liquidOunces: LiquidOunces[];
  /** All `oz` lines, for scale. */
  ounceLines: number;
  /** Rows marked Liquid: yes. */
  liquidRows: string[];
  water: StatedPair[];
}

const BOUNDARY = /[\s(,]/;

function cleanItem(item: string): string {
  return item.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Every amount (quantity + mass or volume unit) written after the line's own. */
function laterAmounts(line: Ingredient, units: UnitRegistry): { quantity: Quantity; unit: UnitDef }[] {
  const tail = `${line.item}${line.note ? `, ${line.note}` : ''}${line.remark ? ` — ${line.remark}` : ''}`.replace(/[()[\]]/g, ' ');
  const out: { quantity: Quantity; unit: UnitDef }[] = [];
  for (let i = 0; i < tail.length; i++) {
    if (i > 0 && !BOUNDARY.test(tail[i - 1])) continue;
    const a = parseAmount(tail.slice(i), units);
    if (!a.quantity || !a.unit) continue;
    if (unitSize(a.unit.def)) out.push({ quantity: a.quantity, unit: a.unit.def });
    i += a.quantity.raw.length;
  }
  return out;
}

/** The volume/weight pair a line states, if it states exactly one. */
export function statedPair(recipe: string, line: Ingredient, units: UnitRegistry, cup: UnitDef): StatedPair | null {
  if (!line.quantity || !line.unit || line.quantity.max) return null;
  const own = unitSize(line.unit.def);
  if (!own) return null;
  const later = laterAmounts(line, units);
  const sameKind = later.filter((a) => unitSize(a.unit)!.kind === own.kind);
  const other = later.filter((a) => unitSize(a.unit)!.kind !== own.kind);
  // `1 cup (8 oz) plus 2 tbsp` is a compound amount: leave it alone.
  if (sameKind.length > 0 || other.length !== 1 || other[0].quantity.max) return null;
  const first = { quantity: line.quantity, unit: line.unit.def };
  const volume = own.kind === 'volume' ? first : other[0];
  const weight = own.kind === 'mass' ? first : other[0];
  const g = toBase(weight.quantity, weight.unit)!.min;
  const ml = toBase(volume.quantity, volume.unit)!.min;
  if (ml.num === 0n) return null;
  const perCup = mul(div(g, ml), unitSize(cup)!.size);
  return { recipe, line: line.raw, item: cleanItem(line.item), volume, weight, gramsPerCup: toNumber(perCup) };
}

const spellingKey = (s: string) => normalizeName(s).replace(/-/g, ' ').replace(/\s+/g, ' ');

function relationTo(item: string, row: string): Candidate['relation'] | null {
  const a = spellingKey(item);
  const b = spellingKey(row);
  if (a === b) return 'spelling';
  if (` ${a} `.includes(` ${b} `)) return 'contains';
  if (` ${b} `.includes(` ${a} `)) return 'inside';
  return null;
}

export function checkCollection(sources: ListSource[], table: DensityTable, units: UnitRegistry, options: CheckOptions = {}): CheckReport {
  const tolerance = options.tolerance ?? 0.05;
  const waterMinimum = options.waterMinimum ?? 233;
  const cup = units.find('cup');
  if (!cup || !unitSize(cup)) throw new Error('the units registry has no cup');

  // 1. Needed: a weight and a volume of one item in one recipe, with no row.
  const needed = new Map<string, Needed>();
  for (const s of sources) {
    const list = consolidate([s], { densities: table, units });
    for (const u of list.unconverted) {
      // A liquid measured in oz has a row; it is reported under "Ounces used for liquids".
      if (u.reason === 'liquid-ounces') continue;
      const item = list.items.find((i) => i.item === u.item);
      const name = item?.forms?.singular ?? u.item;
      const key = normalizeName(name);
      let entry = needed.get(key);
      if (!entry) {
        const raw = ingredientLines(s.recipe).find(
          (p) => p.line.kind === 'ingredient' && p.line.unit?.def.kind === 'volume' && sameItem(p.line.item, name),
        );
        entry = { item: u.item, recipes: [], example: { recipe: s.id, line: raw?.line.raw ?? u.item } };
        needed.set(key, entry);
      }
      if (!entry.recipes.includes(s.id)) entry.recipes.push(s.id);
    }
  }
  const neededList = [...needed.values()].sort((a, b) => b.recipes.length - a.recipes.length || (a.item.toLowerCase() < b.item.toLowerCase() ? -1 : 1));

  // 3–5. Lines read one by one.
  const pairs: StatedPair[] = [];
  const disagreements: Disagreement[] = [];
  const liquidOunces: LiquidOunces[] = [];
  const water: StatedPair[] = [];
  let ounceLines = 0;
  for (const s of sources) {
    for (const { line } of ingredientLines(s.recipe)) {
      if (line.kind !== 'ingredient') continue;
      if (line.unit?.def.kind === 'mass' && line.unit.def.symbol === 'oz') {
        ounceLines++;
        const row = densityOf(table, cleanItem(line.item));
        // A note saying "by weight" is the author's answer to the question: not asked again.
        const settled = /\bby weight\b/i.test(line.note ?? '');
        if (row?.liquid && !settled) liquidOunces.push({ recipe: s.id, line: line.raw, item: cleanItem(line.item), row: row.ingredient });
      }
      const pair = statedPair(s.id, line, units, cup);
      if (!pair) continue;
      pairs.push(pair);
      const row = densityOf(table, pair.item);
      if (row) {
        const reference = toNumber(gramsPer(row, cup)!);
        const difference = (pair.gramsPerCup - reference) / reference;
        if (Math.abs(difference) > tolerance) disagreements.push({ ...pair, row: row.ingredient, referencePerCup: reference, difference });
      }
      const name = normalizeName(pair.item);
      const isWater = (row !== null && sameItem(row.ingredient, 'water')) || name === 'water' || name.endsWith(' water');
      if (isWater && pair.gramsPerCup < waterMinimum) water.push(pair);
    }
  }

  // 2. Probably covered: unmatched names near a row's name. Only names that matter: needed
  // items, and items of stated pairs with no row.
  const recipesOf = new Map<string, Set<string>>();
  const note = (name: string, recipe: string) => {
    const k = normalizeName(name);
    if (!recipesOf.has(k)) recipesOf.set(k, new Set());
    recipesOf.get(k)!.add(recipe);
  };
  for (const n of neededList) for (const r of n.recipes) note(n.item, r);
  for (const p of pairs) if (!densityOf(table, p.item)) note(p.item, p.recipe);
  const order = { spelling: 0, contains: 1, inside: 2 };
  const candidates: Candidate[] = [];
  for (const [name, recipes] of recipesOf) {
    for (const row of table.rows) {
      // The closest relation to any of the row's names, once per row.
      const relations = [row.ingredient, ...row.aliases].map((n) => relationTo(name, n)).filter((x) => x !== null);
      if (relations.length === 0) continue;
      const relation = relations.sort((a, b) => order[a] - order[b])[0];
      candidates.push({ item: name, row: row.ingredient, relation, recipes: recipes.size });
    }
  }
  candidates.sort((a, b) => order[a.relation] - order[b.relation] || b.recipes - a.recipes || (a.item < b.item ? -1 : 1));

  return {
    recipes: sources.length,
    rows: table.rows.length,
    tolerance,
    waterMinimum,
    needed: neededList,
    candidates,
    pairs,
    disagreements,
    liquidOunces,
    ounceLines,
    liquidRows: table.rows.filter((r) => r.liquid).map((r) => r.ingredient),
    water,
  };
}

// ------------------------------------------------------------------ rendering

const g = (n: number) => `${Math.round(n)} g`;
const pct = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;

export function formatCheckText(r: CheckReport): string {
  const out: string[] = [];
  out.push(`Checked ${r.recipes} recipes against ${r.rows} reference rows.`, '');

  out.push(`1. Needed — listed by weight and by volume in one recipe, with no reference row (${r.needed.length}):`);
  if (r.needed.length === 0) out.push('   none');
  for (const n of r.needed) out.push(`   ${n.item} — ${n.recipes.length} recipe${n.recipes.length === 1 ? '' : 's'}; e.g. ${n.example.recipe}: "${n.example.line}"`);
  out.push('');

  out.push(`2. Probably covered by an existing row — candidates for its Aliases cell (${r.candidates.length}):`);
  if (r.candidates.length === 0) out.push('   none');
  const why = { spelling: 'same but for hyphens or spacing', contains: 'contains the entry name', inside: 'is part of the entry name' };
  for (const c of r.candidates) out.push(`   ${c.item} → ${c.row} (${why[c.relation]}; ${c.recipes} recipe${c.recipes === 1 ? '' : 's'})`);
  out.push('');

  out.push(
    `3. To verify — lines stating both a volume and a weight that disagree with the reference by more than ${Math.round(r.tolerance * 100)}% (${r.disagreements.length} of ${r.pairs.length} such lines):`,
  );
  if (r.disagreements.length === 0) out.push('   none');
  for (const d of r.disagreements)
    out.push(`   ${d.recipe}: "${d.line}" — states ${g(d.gramsPerCup)} per cup; the ${d.row} row says ${g(d.referencePerCup)} (${pct(d.difference)})`);
  out.push('');

  out.push(`4. Ounces used for liquids — ${r.ounceLines} lines measure in oz; rows marked Liquid: ${r.liquidRows.join(', ') || 'none'}:`);
  if (r.liquidOunces.length === 0) out.push('   none for an ingredient marked as a liquid');
  for (const l of r.liquidOunces) out.push(`   ${l.recipe}: "${l.line}" — by weight, or fluid ounces?`);
  out.push('');

  out.push(`5. Water test — water stated at less than ${r.waterMinimum} g per cup (${r.water.length}):`);
  if (r.water.length === 0) out.push('   none');
  for (const w of r.water) out.push(`   ${w.recipe}: "${w.line}" — ${g(w.gramsPerCup)} per cup; fluid ounces read as weight?`);
  return `${out.join('\n')}\n`;
}

export const WANTED_BEGIN = '<!-- etna density check: begin. Generated by `etna density check --write`; everything up to the end marker is replaced on each run. -->';
export const WANTED_END = '<!-- etna density check: end -->';

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(header: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['_None._'];
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)];
}

/** The regenerated "Wanted" section, markers included. Deterministic: no dates. */
export function formatWantedSection(r: CheckReport): string {
  const why = { spelling: 'same but for hyphens or spacing', contains: 'contains the entry name', inside: 'is part of the entry name' };
  const out = [
    WANTED_BEGIN,
    '## Wanted',
    '',
    `What \`etna density check\` found in ${r.recipes} recipes, against ${r.rows} reference rows. Act on it by editing the Reference densities table; this section is rewritten on every run.`,
    '',
    '### Needed',
    '',
    'Listed by weight and by volume in one recipe, with no reference row, so the shopping list cannot total them. Most needed first.',
    '',
    ...table(
      ['Ingredient', 'Recipes', 'Example'],
      r.needed.map((n) => [n.item, String(n.recipes.length), `${n.example.recipe}: ${n.example.line}`]),
    ),
    '',
    '### Probably covered by an existing row',
    '',
    'Not matched automatically. Add a name to the row\'s Aliases cell to accept it.',
    '',
    ...table(['Ingredient', 'Entry', 'Why', 'Recipes'], r.candidates.map((c) => [c.item, c.row, why[c.relation], String(c.recipes)])),
    '',
    '### To verify',
    '',
    `Lines that state an amount both ways and disagree with the reference row by more than ${Math.round(r.tolerance * 100)}%.`,
    '',
    ...table(
      ['Recipe', 'Line', 'Stated per cup', 'Entry', 'Reference per cup', 'Difference'],
      r.disagreements.map((d) => [d.recipe, d.line, g(d.gramsPerCup), d.row, g(d.referencePerCup), pct(d.difference)]),
    ),
    '',
    '### Ounces used for liquids',
    '',
    `Lines measured in \`oz\` for an ingredient whose row says Liquid: yes. By weight, or fluid ounces? (${r.ounceLines} lines use oz in all.)`,
    '',
    ...table(['Recipe', 'Line', 'Entry'], r.liquidOunces.map((l) => [l.recipe, l.line, l.row])),
    '',
    '### Water test',
    '',
    `Water stated at less than ${r.waterMinimum} g per cup: probably fluid ounces read as ounces of weight.`,
    '',
    ...table(['Recipe', 'Line', 'Stated per cup'], r.water.map((w) => [w.recipe, w.line, g(w.gramsPerCup)])),
    WANTED_END,
  ];
  return out.join('\n');
}

const NEW_FILE = `# Ingredient densities

This collection's own density file. Rows in a "Reference densities" table here (the same
columns as in \`etna/registries/densities.md\`) override the default rows by name.
`;

/** Put the section into a densities file's text, replacing a previous one; null text = a new file. */
export function writeWantedSection(existing: string | null, section: string): string {
  if (existing === null) return `${NEW_FILE}\n${section}\n`;
  const begin = existing.indexOf(WANTED_BEGIN);
  const end = existing.indexOf(WANTED_END);
  if (begin !== -1 && end !== -1 && end > begin) return existing.slice(0, begin) + section + existing.slice(end + WANTED_END.length);
  const sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${section}\n`;
}

