// Density tables: parsing, matching, grams per unit, loading. Values here are artificial fixtures,
// never real densities.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  densityOf,
  gramsPer,
  mergeTables,
  parseDensities,
} from '../../src/density/index.ts';
import { DEFAULT_DENSITIES, findCollectionRoot, loadDensities } from '../../src/density/node.ts';
import { equals, rational, toNumber } from '../../src/list/rational.ts';
import { loadUnits } from '../../src/node/files.ts';

import { FIXTURE } from './fixture.ts';

const units = loadUnits();
const u = (name: string) => units.find(name)!;

describe('parseDensities', () => {
  const t = parseDensities(FIXTURE, units);
  const entry = (name: string) => t.rows.find((r) => r.ingredient === name)!;

  it('reads only the table of the Reference densities section, skipping code blocks', () => {
    expect(t.problems).toEqual([]);
    expect(t.notes).toEqual([]);
    expect(t.rows.map((r) => r.ingredient)).toEqual(['blarg', 'glorp syrup', 'quux water', 'zorb flour']);
  });

  it('reads the fact, the other cells and the position', () => {
    const zorb = entry('zorb flour');
    const glorp = entry('glorp syrup');
    expect(zorb.aliases).toEqual(['test zorb flour', 'zorb meal']);
    expect(zorb.measure.unit.name).toBe('cup');
    expect(zorb.grams).toBe(100);
    expect(zorb.source).toBe('test');
    expect(zorb.row).toBe(4);
    expect(zorb.line).toBe(FIXTURE.split('\n').findIndex((l) => l.startsWith('| zorb flour')) + 1);
    expect(zorb.liquid).toBe(false);
    expect(zorb.notes).toBe('');
    expect(glorp.liquid).toBe(true);
    expect(glorp.notes).toBe('sticky | runny');
    // 45 g per 2 tbsp: exactly 45 / (2 × tbsp ml) per ml.
    expect(equals(glorp.perMl, rational(45n, 2n * BigInt(u('tbsp').ml!)))).toBe(true);
    // A weight in ounces is converted through the registry's own size.
    expect(entry('blarg').grams).toBeCloseTo(u('oz').grams!, 9);
  });

  const HEAD = '| Ingredient | Fact | Source | Aliases | Liquid | Note |\n|---|---|---|---|---|---|\n';
  const section = (rows: string, head = HEAD) => `# T\n\n## Reference densities\n\n${head}${rows}\n`;
  const ok = (name: string) => `| ${name} | 1 cup = 10 g | test | | | |\n`;

  it('reads a table with only the required columns, in any order', () => {
    const r = parseDensities(section('| test | 2 tbsp = 30 g | aaa |\n', '| Source | Fact | Ingredient |\n|:--|--:|---|\n'), units);
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => [x.ingredient, x.source, x.grams, x.aliases, x.liquid])).toEqual([['aaa', 'test', 30, [], false]]);
  });

  it.each([
    ['an empty Fact', '| a | | test | | | |', 'Fact cell is empty'],
    ['a fact that is not volume = weight', '| a | 1 cup 10 g | test | | | |', 'is not "<volume> = <weight>"'],
    ['no quantity', '| a | cup = 10 g | test | | | |', 'has no quantity'],
    ['a weight on the left', '| a | 10 g = 10 g | test | | | |', 'is not a volume'],
    ['a volume on the right', '| a | 1 cup = 1 cup | test | | | |', 'is not a weight'],
    ['a range', '| a | 1-2 cups = 10 g | test | | | |', 'is a range'],
    ['extra text after the unit', '| a | 1 cup sifted = 10 g | test | | | |', 'extra text'],
    ['no Source', '| a | 1 cup = 10 g | | | | hm |', 'has no Source'],
    ['a bad Liquid', '| a | 1 cup = 10 g | test | | maybe | |', 'write yes, no'],
    ['too few cells', '| a | 1 cup = 10 g | test |', 'has 3 cells; the header has 6'],
    ['too many cells', '| a | 1 cup = 10 g | test | | | | extra |', 'has 7 cells'],
    ['no name', '| | 1 cup = 10 g | test | | | |', 'Ingredient cell is empty'],
  ])('reports %s, with its line, and leaves the row out', (_what, body, reason) => {
    const md = section(`${ok('aaa')}${body}\n${ok('zzz')}`);
    const r = parseDensities(md, units);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['aaa', 'zzz']);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0].code).toBe('row');
    expect(r.problems[0].row).toBe(2);
    expect(r.problems[0].reason).toContain(reason);
    expect(r.problems[0].line).toBe(md.split('\n').indexOf(body) + 1);
  });

  it('refuses a row with no source', () => {
    const r = parseDensities(section(`${ok('aaa')}| bbb | 1 cup = 10 g | | | | |\n`), units);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['aaa']);
    expect(r.problems.map((p) => p.reason)).toEqual(['bbb: has no Source; a row needs one']);
  });

  it('refuses a name or alias covered by an earlier row, including an alias in two rows', () => {
    const md = section(
      `${ok('aaa')}| bbb | 1 cup = 10 g | test | Aaas | | |\n| ccc | 1 cup = 10 g | test | ddd; eee | | |\n${ok('ddd')}| fff | 1 cup = 10 g | test | EEE | | |\n`,
    );
    const r = parseDensities(md, units);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['aaa', 'ccc']);
    expect(r.problems.map((p) => [p.row, p.reason])).toEqual([
      [2, 'bbb: "Aaas" is already covered by the row "aaa"'],
      [4, 'ddd: "ddd" is already covered by the row "ccc"'],
      [5, 'fff: "EEE" is already covered by the row "ccc"'],
    ]);
  });

  it.each([
    ['an unknown column', '| Ingredient | Fact | Source | Brand |\n|---|---|---|---|\n', 'unknown column "brand"'],
    ['a missing required column', '| Ingredient | Fact |\n|---|---|\n', 'no Source column'],
    ['a column given twice', '| Ingredient | Fact | Source | Note | Note |\n|---|---|---|---|---|\n', 'given twice'],
    ['no delimiter line', '| Ingredient | Fact | Source |\n', 'no header row'],
  ])('refuses the whole table for %s', (_what, head, reason) => {
    const r = parseDensities(section('| aaa | 1 cup = 10 g | test |\n', head), units);
    expect(r.rows).toEqual([]);
    expect(r.problems.map((p) => p.code)).toEqual(['table']);
    expect(r.problems[0].reason).toContain(reason);
  });

  it('reports a second table in the section, and reads the first', () => {
    const r = parseDensities(section(`${ok('aaa')}\nProse.\n\n${HEAD}${ok('bbb')}`), units);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['aaa']);
    expect(r.problems.map((p) => p.code)).toEqual(['table']);
  });

  it('notes a row out of alphabetical order, and still uses it', () => {
    const r = parseDensities(section(`${ok('Banana')}${ok('apple')}${ok('cherry')}`), units);
    expect(r.rows.map((x) => x.ingredient)).toEqual(['Banana', 'apple', 'cherry']);
    expect(r.problems).toEqual([]);
    expect(r.notes.map((n) => [n.code, n.row, n.reason])).toEqual([['order', 2, 'apple: out of alphabetical order (after Banana)']]);
  });

  it('reports a missing section without throwing, and reads an empty one', () => {
    expect(parseDensities('# Nothing here\n', units).problems.map((p) => p.code)).toEqual(['no-section']);
    expect(parseDensities('# T\n\n## Reference densities\n\nNo rows yet.\n', units)).toEqual({ rows: [], problems: [], notes: [] });
  });

  it('parses the real file: its rows, facts as entered, every row sourced', () => {
    const real = loadDensities();
    expect(real.problems).toEqual([]);
    expect(real.notes).toEqual([]);
    const facts = real.rows.map((r) => `${r.ingredient}: ${r.measure.quantity.raw} ${r.measure.unit.name} = ${r.grams} g`);
    // The first five rows, as entered; later rows are added as recipes need them.
    expect(facts).toEqual(
      expect.arrayContaining(['water: 1 cup = 240 g', 'sugar: 1 cup = 200 g', 'brown sugar: 1 cup = 220 g', 'all-purpose flour: 1 cup = 120 g', 'butter: 8 tablespoon = 113 g']),
    );
    expect(facts).toContain('Morton kosher salt: 2 cup = 489 g');
    for (const r of real.rows) expect(r.source, r.ingredient).not.toBe('');
    const bySource = Object.fromEntries(real.rows.map((r) => [r.ingredient, r.source]));
    expect(bySource).toMatchObject({ 'all-purpose flour': 'house', 'brown sugar': 'house', butter: 'package', sugar: 'house', water: 'definition' });
    expect(real.rows.filter((r) => r.liquid).map((r) => r.ingredient).sort()).toEqual(['olive oil', 'vanilla extract', 'water', 'whole milk']);
    const aliases = Object.fromEntries(real.rows.filter((r) => r.aliases.length).map((r) => [r.ingredient, r.aliases]));
    expect(aliases).toMatchObject({
      'all-purpose flour': ['all purpose flour', 'unbleached all purpose flour', 'flour', 'kate flour'],
      butter: ['unsalted butter'],
      water: ['ice water'],
      'Morton kosher salt': ['kosher salt'],
      'table salt': ['salt'],
    });
  });
});

describe('densityOf', () => {
  const t = parseDensities(FIXTURE, units);
  it.each([
    ['zorb flour', 'zorb flour'],
    ['  Zorb   FLOUR ', 'zorb flour'],
    ['zorb flours', 'zorb flour'],
    ['zorb meal', 'zorb flour'],
    ['Test Zorb Flour', 'zorb flour'],
    ['glorp syrups', 'glorp syrup'],
  ])('%j → %s', (item, row) => {
    expect(densityOf(t, item)?.ingredient).toBe(row);
  });

  it.each(['flour', 'zorb', 'white zorb flour', 'zorb-flour', 'glorp'])('%j matches nothing', (item) => {
    expect(densityOf(t, item)).toBeNull();
  });
});

describe('conversion', () => {
  const t = parseDensities(FIXTURE, units);
  const zorb = t.rows.find((r) => r.ingredient === 'zorb flour')!;

  it('gives the grams in one of a volume unit, through a row', () => {
    expect(toNumber(gramsPer(zorb, u('tbsp'))!)).toBeCloseTo(100 / 16, 9);
    expect(toNumber(gramsPer(zorb, u('cup'))!)).toBeCloseTo(100, 9);
    expect(gramsPer(zorb, u('g'))).toBeNull();
  });
});

describe('loading', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-density-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('lays a collection table over the default, by name', () => {
    const base = parseDensities(FIXTURE, units);
    const over = parseDensities('## Reference densities\n\n| Ingredient | Fact | Source |\n|---|---|---|\n| new thing | 1 cup = 1 g | test |\n| Zorb Meal | 1 cup = 999 g | test |\n', units);
    const merged = mergeTables(base, over);
    expect(merged.rows.map((r) => r.ingredient)).toEqual(['blarg', 'glorp syrup', 'quux water', 'new thing', 'Zorb Meal']);
    expect(densityOf(merged, 'zorb meal')!.grams).toBe(999);
  });

  it('lets a collection row override the default row of the same name', () => {
    const own = mkdtempSync(join(tmpdir(), 'etna-density-own-'));
    try {
      const file = join(own, 'densities.md');
      writeFileSync(file, '# Ours\n\n## Reference densities\n\n| Ingredient | Fact | Source | Note |\n|---|---|---|---|\n| Sugars | 1 cup = 250 g | test | artificial |\n');
      const base = loadDensities();
      const merged = loadDensities(own);
      expect(merged.problems).toEqual([]);
      expect(merged.rows).toHaveLength(base.rows.length);
      const sugar = merged.rows.filter((r) => densityOf({ ...merged, rows: [r] }, 'sugar') !== null);
      expect(sugar.map((r) => [r.ingredient, r.grams, r.file])).toEqual([['Sugars', 250, file]]);
      expect(densityOf(merged, 'brown sugar')!.file).toBe(DEFAULT_DENSITIES());
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  });

  it('reads a collection densities.md when there is one, and finds the collection root', () => {
    mkdirSync(join(dir, 'recipes', 'some-recipe'), { recursive: true });
    writeFileSync(join(dir, 'recipes', 'some-recipe', 'recipe.md'), '# X\n');
    expect(findCollectionRoot(join(dir, 'recipes', 'some-recipe'))).toBe(dir);
    expect(findCollectionRoot(join(dir, 'recipes', 'some-recipe', 'recipe.md'))).toBe(dir);
    expect(findCollectionRoot(dir)).toBe(dir);
    expect(findCollectionRoot(tmpdir())).toBeNull();

    const plain = loadDensities(dir);
    expect(plain.rows.length).toBe(loadDensities().rows.length);
    writeFileSync(join(dir, 'densities.md'), FIXTURE);
    const withOwn = loadDensities(dir);
    expect(densityOf(withOwn, 'zorb flour')!.file).toBe(join(dir, 'densities.md'));
    expect(withOwn.rows.length).toBe(loadDensities().rows.length + 4);
    // A collection file with no Reference section is not a problem.
    writeFileSync(join(dir, 'densities.md'), '# Only notes\n');
    expect(loadDensities(dir).problems).toEqual([]);
    expect(readFileSync(DEFAULT_DENSITIES(), 'utf8')).toContain('## Reference densities');
  });
});
