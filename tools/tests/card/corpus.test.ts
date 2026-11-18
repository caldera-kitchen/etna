// Every recipe that ships, and a spread of the collection, renders.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from '../../src/card/cli.ts';
import { renderCard, renderCardParts } from '../../src/card/index.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import { ETNA_ROOT, findRecipes, readRecipe } from '../../src/node/files.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const COLLECTION = process.env.ETNA_COLLECTION ?? join(ETNA_ROOT, '..', 'recipe-collection');
const SAMPLE_SIZE = 40;

const theme = loadTheme('binder');

function check(file: string): void {
  const recipe = readRecipe(file);
  const doc = renderCard(recipe, theme);
  expect(doc.startsWith('<!doctype html>')).toBe(true);
  expect(doc).toContain('<h1 class="card-title">');
  expect(doc).not.toMatch(/\{\{[#/]?[a-z-]+\}\}/);
  expect(doc).not.toContain('undefined');
  const { html } = renderCardParts(recipe, theme, { slots: { yield: true, source: true, version: true, license: true } });
  // A card always has something under its title.
  expect(/ingr-table|direction-list/.test(html)).toBe(true);
}

describe('loadTheme', () => {
  it('finds the bundled Binder theme by name, by default and by directory', () => {
    expect(listThemes()).toContain('binder');
    expect(loadTheme('binder').name).toBe('Binder');
    expect(loadTheme(join(ETNA_ROOT, 'themes', 'binder')).css).toEqual(theme.css);
  });

  it('names the themes it does have when asked for one it does not', () => {
    expect(() => loadTheme('no-such-theme')).toThrow(/theme not found: no-such-theme \(available: .*binder/);
  });
});

describe('the recipes that ship', () => {
  const shipped = findRecipes(COOKBOOK).filter((r) => r.file !== null);

  it('there are recipes to render', () => {
    expect(shipped.length).toBeGreaterThanOrEqual(11);
  });

  it.each(shipped.map((r) => [r.slug, r.file!]))('%s renders', (_slug, file) => {
    check(file);
  });

  it('every recipe that ships hoists all of its ingredient bullets', () => {
    for (const example of shipped) {
      const recipe = readRecipe(example.file!);
      // The Notes are not ingredients: their bullets do not count.
      const bullets = (recipe.source.replace(/\n## Notes\n[\s\S]*$/, '\n').match(/^- /gm) ?? []).length;
      const { html } = renderCardParts(recipe, theme);
      // A `divided` row stands for every line merged into it (SPEC §8).
      const merged = [...html.matchAll(/data-lines="(\d+)"/g)].reduce((n, m) => n + Number(m[1]) - 1, 0);
      expect(html.split('<tr class="ingr').length - 1 + merged, example.slug).toBe(bullets);
    }
  });
});

describe.skipIf(!existsSync(COLLECTION))('collection sample', () => {
  const all = existsSync(COLLECTION) ? findRecipes(COLLECTION).filter((r) => r.file !== null) : [];
  const stride = Math.max(1, Math.floor(all.length / SAMPLE_SIZE));
  const sample = all.filter((_r, i) => i % stride === 0);

  it(`renders ${SAMPLE_SIZE} or so recipes spread across the collection`, () => {
    expect(sample.length).toBeGreaterThanOrEqual(Math.min(SAMPLE_SIZE, all.length));
    for (const r of sample) check(r.file!);
  });
});

describe('etna card', () => {
  let dir: string;
  let out: string[];
  let err: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'etna-card-'));
    out = [];
    err = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    vi.spyOn(console, 'log').mockImplementation((...args) => void out.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => void err.push(args.join(' ')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  const example = join(COOKBOOK, 'malted-chocolate');

  it('prints help', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(out.join('\n')).toContain('Usage: etna card');
  });

  it('prints one recipe to standard output', async () => {
    expect(await run([example])).toBe(0);
    const doc = out.join('');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<h1 class="card-title">Malted Chocolate</h1>');
    expect(doc).toContain('card-page');
  });

  it('writes one recipe to --out', async () => {
    const file = join(dir, 'nested', 'card.html');
    expect(await run([join(example, 'recipe.md'), '--theme', 'binder', '--out', file])).toBe(0);
    expect(out).toEqual([]);
    expect(readFileSync(file, 'utf8')).toContain('Binder / Classic');
  });

  it('writes a directory of recipes to --out-dir, one file per slug', async () => {
    expect(await run([COOKBOOK, '--theme=binder', '--out-dir', dir])).toBe(0);
    for (const r of findRecipes(COOKBOOK)) {
      expect(readFileSync(join(dir, `${r.slug}.html`), 'utf8')).toContain('Binder / Classic');
    }
  });

  it('refuses several recipes without --out-dir', async () => {
    expect(await run([COOKBOOK])).toBe(2);
    expect(await run([COOKBOOK, '--out', join(dir, 'x.html')])).toBe(2);
    expect(out).toEqual([]);
  });

  it('reports usage errors with exit code 2', async () => {
    expect(await run([])).toBe(2);
    expect(await run([join(dir, 'missing')])).toBe(2);
    expect(await run([example, '--frobnicate'])).toBe(2);
    expect(await run([example, '--out'])).toBe(2);
  });
});
