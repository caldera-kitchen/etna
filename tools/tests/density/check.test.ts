// `etna density check` on a small artificial collection.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { checkCollection, formatCheckText, formatWantedSection, WANTED_BEGIN, WANTED_END, writeWantedSection } from '../../src/density/check.ts';
import { run } from '../../src/density/cli.ts';
import { parseDensities } from '../../src/density/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { FIXTURE } from './fixture.ts';

const units = loadUnits();
const table = parseDensities(FIXTURE, units);

const RECIPES: Record<string, string[]> = {
  alpha: [
    '100 g zorb flour',
    '1/2 cup zorb flour',
    '50 g plimp powder',
    '2 tbsp plimp powder',
    '1 cup quux water, 150 g',
    '3 oz glorp syrup',
    '4 oz glorp syrup, by weight',
    '2 oz quux water',
    '2/3 cup zorb flour, 70 grams',
    '1 cup zorb flour (130 g)',
    '13 g zorb flour, [1 tbsp]',
    '1 cup (8 oz) plus 2 tbsp zorb flour',
  ],
  beta: ['10 g plimp powder', '1 tsp plimp powder', '20 g white zorb flour', '1 tbsp white zorb flour', '1/4 cup zorb-flour, 30 g'],
};

const recipeText = (title: string, lines: string[]) =>
  `---\netna: 1\nform: traditional\n---\n\n# ${title}\n\n## Ingredients\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\n## Directions\n\n1. Cook.\n`;

const sources = Object.entries(RECIPES).map(([id, lines]) => ({ id, title: id, recipe: parseRecipe(recipeText(id, lines), { units }) }));

describe('checkCollection', () => {
  const r = checkCollection(sources, table, units);

  it('a liquid measured in oz beside a volume is not reported as needing an entry: it has one', () => {
    const syrup = { id: 'gamma', title: 'gamma', recipe: parseRecipe(recipeText('gamma', ['8 oz glorp syrup', '1 cup glorp syrup']), { units }) };
    const report = checkCollection([syrup], table, units);
    expect(report.needed).toEqual([]);
    expect(report.liquidOunces.map((l) => l.recipe)).toEqual(['gamma']);
  });

  it('1. lists what needs a row, most needed first, with an example', () => {
    expect(r.needed.map((n) => [n.item, n.recipes])).toEqual([
      ['plimp powder', ['alpha', 'beta']],
      ['white zorb flour', ['beta']],
    ]);
    expect(r.needed[0].example).toEqual({ recipe: 'alpha', line: '2 tbsp plimp powder' });
  });

  it('2. proposes near names as aliases, never matching them', () => {
    expect(r.candidates.map((c) => [c.item, c.row, c.relation])).toEqual([
      ['zorb-flour', 'zorb flour', 'spelling'],
      ['white zorb flour', 'zorb flour', 'contains'],
    ]);
  });

  it('3. flags stated pairs that disagree with the row beyond the tolerance', () => {
    expect(r.pairs.map((p) => p.line)).toEqual(['1 cup quux water, 150 g', '2/3 cup zorb flour, 70 grams', '1 cup zorb flour (130 g)', '13 g zorb flour, [1 tbsp]', '1/4 cup zorb-flour, 30 g']);
    expect(r.disagreements.map((d) => [d.line, Math.round(d.gramsPerCup), Math.round(d.referencePerCup)])).toEqual([
      ['1 cup quux water, 150 g', 150, 200],
      ['1 cup zorb flour (130 g)', 130, 100],
      ['13 g zorb flour, [1 tbsp]', 208, 100],
    ]);
    expect(checkCollection(sources, table, units, { tolerance: 0.4 }).disagreements).toHaveLength(1);
    expect(checkCollection(sources, table, units, { tolerance: 0.04 }).disagreements).toHaveLength(4);
  });

  it('4. lists oz lines only for rows marked as liquid', () => {
    expect(r.liquidRows).toEqual(['glorp syrup']);
    expect(r.ounceLines).toBe(3);
    // A line noted "by weight" is the author's answer: it is counted but not asked about.
    expect(r.liquidOunces.map((l) => l.line)).toEqual(['3 oz glorp syrup']);
  });

  it('5. runs the water test', () => {
    expect(r.water.map((w) => w.line)).toEqual(['1 cup quux water, 150 g']);
    expect(checkCollection(sources, table, units, { waterMinimum: 100 }).water).toEqual([]);
  });

  it('renders text and a Wanted section', () => {
    const text = formatCheckText(r);
    expect(text).toContain('plimp powder — 2 recipes; e.g. alpha: "2 tbsp plimp powder"');
    expect(text).toContain('zorb-flour → zorb flour (same but for hyphens or spacing; 1 recipe)');
    const section = formatWantedSection(r);
    expect(section.startsWith(WANTED_BEGIN)).toBe(true);
    expect(section.endsWith(WANTED_END)).toBe(true);
    expect(section).toContain('| plimp powder | 2 | alpha: 2 tbsp plimp powder |');
  });
});

describe('writeWantedSection', () => {
  const section = `${WANTED_BEGIN}\n## Wanted\n\nnew\n${WANTED_END}`;
  it('creates a file, appends to one without the section, and replaces only between markers', () => {
    expect(writeWantedSection(null, section)).toContain(section);
    const before = '# Mine\n\n## Reference densities\n\n| a |\n';
    const once = writeWantedSection(before, section);
    expect(once.startsWith(before)).toBe(true);
    const edited = `${once.replace('# Mine', '# Mine, edited')}\ntrailing  text \n`;
    const again = writeWantedSection(edited, `${WANTED_BEGIN}\nother\n${WANTED_END}`);
    const head = edited.slice(0, edited.indexOf(WANTED_BEGIN));
    const tail = edited.slice(edited.indexOf(WANTED_END) + WANTED_END.length);
    expect(again).toBe(`${head}${WANTED_BEGIN}\nother\n${WANTED_END}${tail}`);
    expect(writeWantedSection(again, `${WANTED_BEGIN}\nother\n${WANTED_END}`)).toBe(again);
  });
});

describe('etna density', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-density-cli-'));
  let out: string[];
  let err: string[];
  for (const [id, lines] of Object.entries(RECIPES)) {
    mkdirSync(join(dir, 'recipes', id), { recursive: true });
    writeFileSync(join(dir, 'recipes', id, 'recipe.md'), recipeText(id, lines));
  }
  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('prints help and rejects usage errors', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(out.join('')).toContain('etna density check');
    expect(await run([])).toBe(2);
    expect(await run(['frob'])).toBe(2);
    expect(await run(['check'])).toBe(2);
    expect(await run(['check', dir, '--tolerance', 'x'])).toBe(2);
    expect(await run(['check', join(dir, 'missing')])).toBe(2);
    expect(await run(['list', '--write'])).toBe(2);
  });

  it('lists the rows, with a collection table laid over', async () => {
    expect(await run(['list'])).toBe(0);
    expect(out.join('')).toContain('per cup');
    writeFileSync(join(dir, 'densities.md'), `# Mine\n\nKeep  this   exactly.\n\n${FIXTURE}`);
    out = [];
    expect(await run(['list', dir])).toBe(0);
    expect(out.join('')).toMatch(/^zorb flour \(also: test zorb flour; zorb meal\) +100 g +6\.3 g +test$/m);
  });

  it('checks without writing, then writes the Wanted section idempotently', async () => {
    const file = join(dir, 'densities.md');
    const original = readFileSync(file, 'utf8');
    expect(await run(['check', dir])).toBe(0);
    expect(out.join('')).toContain('1. Needed');
    expect(readFileSync(file, 'utf8')).toBe(original);

    expect(await run(['check', dir, '--write'])).toBe(0);
    const written = readFileSync(file, 'utf8');
    expect(written.startsWith(original)).toBe(true);
    expect(written).toContain('| plimp powder | 2 |');
    expect(await run(['check', dir, '--write'])).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(written);
    expect(err.join('\n')).toContain('unchanged');
  });

  it('creates the collection file when missing', async () => {
    rmSync(join(dir, 'densities.md'));
    expect(await run(['check', dir, '--write'])).toBe(0);
    expect(existsSync(join(dir, 'densities.md'))).toBe(true);
    expect(readFileSync(join(dir, 'densities.md'), 'utf8')).toContain('## Wanted');
  });
});
