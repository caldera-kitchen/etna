// Totaling across units in the shopping list. Densities are artificial fixtures.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatQuantity, parseRecipe } from '../../src/core/index.ts';
import { parseDensities } from '../../src/density/index.ts';
import { run } from '../../src/list/cli.ts';
import { consolidate, formatAmount, formatListMarkdown, formatListText, type ConsolidateOptions, type ListItem } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { FIXTURE } from '../density/fixture.ts';

const units = loadUnits();
const densities = parseDensities(FIXTURE, units);
const withTable: ConsolidateOptions = { densities, units };
const noTable: ConsolidateOptions = { units };

const recipe = (lines: string[]) => parseRecipe(`# T\n\n## A\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nGo.\n`, { units });
const listOf = (lines: string[], options: ConsolidateOptions = withTable) => consolidate([{ id: 't', title: 'T', recipe: recipe(lines) }], options);
const only = (lines: string[], options?: ConsolidateOptions): ListItem => {
  const l = listOf(lines, options);
  expect(l.items).toHaveLength(1);
  return l.items[0];
};
const shown = (item: ListItem) => item.amounts.map((a) => formatAmount(a)).join(' + ');

describe('same kind, different units (always on)', () => {
  it.each([
    [['2 tbsp x', '1/4 cup x'], '3/8 cup'],
    [['1 tbsp x', '1 tsp x'], '1 1/3 tbsp'],
    [['1 tsp x', '1/2 tbsp x'], '2 1/2 tsp'],
    [['4 tbsp x', '1 tsp x'], '4 1/3 tbsp'],
    [['1 tbsp x', '1/4 cup x', '1 tsp x'], '1/3 cup'],
    [['1 tbsp x', '1/2 cup x'], '9 tbsp'],
    [['1 tsp x', '7/8 cup x'], '14 1/3 tbsp'],
    [['1 tsp x', '1 1/2 cups x'], '≈ 1 1/2 cups'],
    [['1 cup x', '1 quart x'], '1 1/4 quarts'],
    [['500 ml x', '1 l x'], '1.5 l'],
    [['100 ml x', '50 ml x', '1 tsp x'], '155 ml'],
    [['1 kg x', '500 g x'], '1500 g'],
    [['1-2 cups x', '1/2 cup x'], '1 1/2-2 1/2 cups'],
  ])('%j → %s', (lines, expected) => {
    expect(shown(only(lines, noTable))).toBe(expected);
  });

  it('marks a rounded total approximate, keeping the exact value', () => {
    const item = only(['200 g x', '1 lb x'], noTable);
    expect(shown(item)).toMatch(/^≈ \d+ g$/);
    const c = item.amounts[0].converted!;
    expect(c.by).toBe('unit');
    expect(c.approximate).toBe(true);
    expect(c.from.map((a) => formatAmount(a))).toEqual(['200 g', '1 lb']);
    expect(Number(formatQuantity(c.exact))).toBeCloseTo(200 + units.find('lb')!.grams!, 9);
    expect(item.amounts[0].lines).toBe(2);
  });

  it('is exact when it can be, and says so', () => {
    const c = only(['2 tbsp x', '1/4 cup x'], noTable).amounts[0].converted!;
    expect(c.approximate).toBe(false);
    expect(formatQuantity(c.exact)).toBe('3/8');
  });

  it('rounds a US volume to an eighth or a quarter when the fraction is awkward', () => {
    // 1 tsp + 1 cup: 245 ml = 49/48 cup.
    expect(shown(only(['1 tsp x', '1 cup x'], noTable))).toBe('≈ 1 cup');
  });

  it('never converts other kinds', () => {
    expect(shown(only(['2 large x', '50 g x', '1 pinch x', '1 can x'], withTable))).toBe('2 large + 50 g + 1 pinch + 1 can');
  });

  it('keeps a total of one unit untouched', () => {
    expect(only(['1 tbsp x', '2 tbsp x'], noTable).amounts[0].converted).toBeUndefined();
  });
});

describe('weight and volume through a density', () => {
  it('totals by weight when the table has the ingredient, marked as converted', () => {
    const item = only(['100 g zorb flour', '1/2 cup zorb flour']);
    expect(shown(item)).toBe('≈ 150 g');
    const c = item.amounts[0].converted!;
    expect(c.by).toBe('density');
    expect(c.density).toEqual({ ingredient: 'zorb flour', source: 'test', file: null });
    expect(c.from.map((a) => formatAmount(a))).toEqual(['100 g', '1/2 cup']);
    expect(formatListText(listOf(['100 g zorb flour, sifted', '1/2 cup zorb flour']))).toContain('≈ 150 g  zorb flour, 100 g: sifted (100 g + 1/2 cup)\n');
    expect(formatListMarkdown(listOf(['100 g zorb flour', '1/2 cup zorb flour']))).toContain('- [ ] ≈ 150 g zorb flour (100 g + 1/2 cup)\n');
  });

  it('uses aliases and singular/plural, and folds in same-kind amounts', () => {
    expect(shown(only(['10 g zorb meal', '1 oz zorb meal', '1 tbsp zorb meal', '1 tsp zorb meal']))).toMatch(/^≈ \d+ g$/);
    expect(shown(only(['50 g zorb flours', '1/4 cup zorb flour']))).toBe('≈ 75 g');
  });

  it('adds ranges end to end', () => {
    expect(shown(only(['1-2 cups zorb flour', '50 g zorb flour']))).toBe('≈ 150-250 g');
  });

  it('leaves the amounts as they are and records the item when there is no row', () => {
    const l = listOf(['50 g plimp powder', '2 tbsp plimp powder', '1 tsp plimp powder', '5 g zorb flour']);
    expect(shown(l.items[0])).toBe('50 g + 2 1/3 tbsp');
    expect(l.unconverted.map((u) => u.item)).toEqual(['plimp powder']);
    expect(l.unconverted[0].uses).toEqual([{ source: 't', step: 'A' }]);
    expect(formatListText(l)).toContain('\nNo density for: plimp powder — amounts left as written\n');
    expect(formatListMarkdown(l)).toContain('\n_No density for: plimp powder — amounts left as written_\n');
  });

  it('never adds oz of a liquid to a volume: the amounts stay side by side, and the list says why', () => {
    // glorp syrup is marked Liquid: yes, so `8 oz` may be fluid ounces.
    const l = listOf(['8 oz glorp syrup', '1 cup glorp syrup', '50 g zorb flour', '1 cup zorb flour']);
    const syrup = l.items.find((i) => i.item === 'glorp syrup')!;
    expect(shown(syrup)).toBe('8 oz + 1 cup');
    expect(syrup.amounts.every((a) => !a.converted)).toBe(true);
    expect(l.unconverted).toMatchObject([{ item: 'glorp syrup', reason: 'liquid-ounces' }]);
    expect(formatListText(l)).toContain('\nMeasured in oz, by weight or fluid ounces? glorp syrup — amounts left as written\n');
    // Grams of the same liquid are unambiguous and still total by weight; a dry ingredient in oz converts as before.
    expect(shown(only(['100 g glorp syrup', '1 cup glorp syrup']))).toMatch(/^≈ \d+ g$/);
    expect(l.items.find((i) => i.item === 'zorb flour')!.amounts).toHaveLength(1);
  });

  it('does nothing density-related without a table', () => {
    const l = listOf(['100 g zorb flour', '1/2 cup zorb flour'], noTable);
    expect(shown(l.items[0])).toBe('100 g + 1/2 cup');
    expect(l.unconverted).toEqual([]);
    expect(formatListText(l)).not.toContain('No density');
  });

  it('works with no units registry, choosing among the units used', () => {
    expect(shown(only(['100 g zorb flour', '1/2 cup zorb flour'], { densities }))).toBe('≈ 150 g');
    expect(shown(only(['2 tbsp x', '1/4 cup x'], {}))).toBe('3/8 cup');
  });
});

describe('etna list and densities', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-list-density-'));
  const recipeDir = join(dir, 'recipes', 'zorb-cake');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(join(recipeDir, 'recipe.md'), '# Zorb Cake\n\n## Mix\n\n- 100 g zorb flour\n- 1/2 cup zorb flour\n- 50 g plimp powder\n- 1 tbsp plimp powder\n\nMix.\n');
  writeFileSync(join(dir, 'densities.md'), FIXTURE);
  let out: string[];
  beforeEach(() => {
    out = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('converts with the collection table by default', async () => {
    expect(await run([recipeDir])).toBe(0);
    const text = out.join('');
    expect(text).toMatch(/^≈ 150 g +zorb flour \(100 g \+ 1\/2 cup\)$/m);
    expect(text).toContain('No density for: plimp powder — amounts left as written');
  });

  it('--no-convert leaves weight and volume apart', async () => {
    expect(await run([recipeDir, '--no-convert'])).toBe(0);
    const text = out.join('');
    expect(text).toMatch(/^100 g \+ 1\/2 cup +zorb flour$/m);
    expect(text).not.toContain('No density');
  });

  it('carries conversions in JSON', async () => {
    expect(await run([recipeDir, '--format', 'json'])).toBe(0);
    const json = JSON.parse(out.join(''));
    expect(json.items[0].amounts[0].converted.by).toBe('density');
    expect(json.unconverted[0].item).toBe('plimp powder');
  });
});
