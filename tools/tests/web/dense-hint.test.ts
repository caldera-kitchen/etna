import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The bundle's data, as build.ts compiles it, without esbuild (as engine.test.ts does).
vi.mock('virtual:etna-data', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { listThemes, readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');
  const { ETNA_ROOT: root } = await import('../../src/node/files.ts');
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(j(THEMES_DIR, name));
  const { dagThemeDir, listDagThemes, readDagThemeFiles } = await import('../../src/dag/node.ts');
  const chartThemes: Record<string, Record<string, string>> = {};
  for (const name of listDagThemes()) chartThemes[name] = readDagThemeFiles(dagThemeDir(name));
  return { unitsYaml: read(j(root, 'registries', 'units.yaml'), 'utf8'), themes, chartThemes, fontMode: 'web', fontCss: {}, localServer: true, about: null };
});

const { ETNA_ROOT } = await import('../../src/node/files.ts');
const { analyze, builtinChartThemes, chart, chartRenderOptions, chartThemeEntry, pickChartTheme } = await import('../../src/web/engine.ts');
const { DENSE_CHART_THEME, denseHint } = await import('../../src/web/dense-hint.ts');
const { pointsText } = await import('../../src/dag/small-print.ts');
const { SMALL_PRINT, FULL_SIZE } = await import('../../src/dag/layout/fit.ts');
const { computeLayout } = await import('../../src/dag/index.ts');
const { readDagThemeFiles, dagThemeDir } = await import('../../src/dag/node.ts');
const { cardType } = await import('../../src/card/index.ts');
const { builtinThemes, pickTheme } = await import('../../src/web/engine.ts');

type Sheet = { paper?: 'letter' | 'a4'; margin?: '0.5in' | '0.75in' | '1in'; shape?: 'screen' | 'auto' | 'portrait' | 'landscape' };

const recipeOf = (slug: string) => {
  const a = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'));
  if (!a.recipe.ok) throw new Error(a.recipe.error);
  return a.recipe.value;
};
// In Flow on Letter, fitted to a page either way up, the rolls print at about 5.5 pt and Dense
// prints them at about 6.9; malted chocolate prints above 7 pt.
const rolls = recipeOf('next-day-soft-cinnamon-rolls');
const malted = recipeOf('malted-chocolate');
const all = builtinChartThemes;
const flow = pickChartTheme(all, 'builtin:flow')!;
const dense = pickChartTheme(all, DENSE_CHART_THEME)!;

/** The line for `recipe` drawn with `entry`, as the chart tab asks for it. */
function hintFor(recipe: typeof rolls, entry: typeof flow | null, sheet: Sheet, themes = all, more: { cardType?: ReturnType<typeof cardType> | null } = {}) {
  const svg = chart(recipe, entry, { sheet, cardType: more.cardType });
  if (!svg.ok) throw new Error(svg.error);
  return denseHint(recipe, entry, themes, svg.value, { joinEdges: null, sheet, cardType: more.cardType });
}

/** Body text in points as the engine's own plan says: print scale times the style's font-size. */
function planPoints(recipe: typeof rolls, entry: typeof flow, sheet: Sheet, fontSize: number) {
  const render = chartRenderOptions(entry, { sheet });
  if (!render.ok) throw new Error(render.error);
  return computeLayout(recipe, render.value).plan!.scale * fontSize;
}

describe('the floor', () => {
  it('is 7 pt, under full size', () => {
    expect(SMALL_PRINT).toBe(7);
    expect(SMALL_PRINT).toBeLessThan(FULL_SIZE);
  });
});

describe('denseHint: when the line shows', () => {
  it('shows for a chart fitted to a page whose text prints under 7 pt, when Dense prints it larger', () => {
    const hint = hintFor(rolls, flow, { shape: 'auto' });
    expect(hint).not.toBeNull();
    expect(hint!.now).toBeLessThan(SMALL_PRINT);
    expect(hint!.dense).toBeGreaterThan(hint!.now);
    // The sizes are the engine's: the plan's print scale times each style's body size (14 and 11).
    expect(hint!.now).toBeCloseTo(planPoints(rolls, flow, { shape: 'auto' }, 14), 2);
    expect(hint!.dense).toBeCloseTo(planPoints(rolls, dense, { shape: 'auto' }, 11), 2);
    expect(pointsText(hint!.now)).toBe('5.5 pt');
    expect(pointsText(hint!.dense)).toBe('6.9 pt');
  });

  it('shows for the default style (no entry) as for Flow', () => {
    expect(hintFor(rolls, null, { shape: 'auto' })).toEqual(hintFor(rolls, flow, { shape: 'auto' }));
  });

  it('shows on each of the three page fits, A4 and a wider margin included, when the text is small there', () => {
    for (const shape of ['auto', 'portrait', 'landscape'] as const) {
      const hint = hintFor(rolls, flow, { shape, paper: 'a4', margin: '1in' });
      expect(hint, shape).not.toBeNull();
    }
  });

  it('shows for a third-party style, with the same words', () => {
    const files = readDagThemeFiles(dagThemeDir('flow'));
    const theirs = chartThemeEntry({ id: 'demo', label: 'Demo' }, 'roomy', { ...files, 'theme.yaml': files['theme.yaml'].replace(/^name: .*$/m, 'name: roomy') });
    expect(theirs.theme).not.toBeNull();
    const hint = hintFor(rolls, theirs, { shape: 'auto' }, [...all, theirs]);
    expect(hint).toEqual(hintFor(rolls, flow, { shape: 'auto' }));
  });

  it('measures the text as drawn in the card’s fonts, and Dense in the same fonts', () => {
    const mise = cardType(pickTheme(builtinThemes, 'builtin:mise')!.theme!);
    const own = hintFor(rolls, flow, { shape: 'auto' });
    const matched = hintFor(rolls, flow, { shape: 'auto' }, all, { cardType: mise });
    expect(matched).not.toBeNull();
    expect(matched!.now).not.toBeCloseTo(own!.now, 3);
    expect(matched!.dense).toBeGreaterThan(matched!.now);
  });
});

describe('denseHint: when the line does not show', () => {
  it('not on the screen', () => {
    expect(hintFor(rolls, flow, { shape: 'screen' })).toBeNull();
    expect(hintFor(rolls, flow, {})).toBeNull();
  });

  it('not when the text prints at 7 pt or more', () => {
    const svg = chart(malted, flow, { sheet: { shape: 'auto' } });
    expect(planPoints(malted, flow, { shape: 'auto' }, 14)).toBeGreaterThanOrEqual(SMALL_PRINT);
    expect(svg.ok && denseHint(malted, flow, all, svg.value, { joinEdges: null, sheet: { shape: 'auto' } })).toBeNull();
  });

  it('not when the style is already Dense', () => {
    expect(hintFor(rolls, dense, { shape: 'auto' })).toBeNull();
  });

  it('not when Dense is unavailable', () => {
    expect(hintFor(rolls, flow, { shape: 'auto' }, all.filter((e) => e.id !== DENSE_CHART_THEME))).toBeNull();
    const broken = { ...dense, theme: null, errors: ['broken'] };
    expect(hintFor(rolls, flow, { shape: 'auto' }, [...all.filter((e) => e.id !== DENSE_CHART_THEME), broken])).toBeNull();
  });

  it('not when Dense would print no larger (within the engine’s 2% tie)', () => {
    // A third-party style that is Dense under another name, and a made-up recipe long enough that
    // even Dense prints it under 7 pt: Dense prints it at the same size, so it is not suggested.
    const files = readDagThemeFiles(dagThemeDir('dense'));
    const twin = chartThemeEntry({ id: 'demo', label: 'Demo' }, 'twin', { ...files, 'theme.yaml': files['theme.yaml'].replace(/^name: .*$/m, 'name: twin') });
    expect(twin.theme).not.toBeNull();
    const steps = Array.from({ length: 150 }, (_, i) => `### Step ${i + 1}\n\n- 1 cup thing ${i + 1}\n\nStir it.\n`).join('\n');
    const long = analyze(`---\netna: 1\nform: structured\n---\n\n# Long\n\n## Steps\n\n${steps}`).recipe;
    if (!long.ok) throw new Error(long.error);
    const sheet: Sheet = { shape: 'auto' };
    const svg = chart(long.value, twin, { sheet });
    if (!svg.ok) throw new Error(svg.error);
    const twinPoints = planPoints(long.value, twin, sheet, 11);
    expect(twinPoints).toBeLessThan(SMALL_PRINT);
    expect(twinPoints).toBeCloseTo(planPoints(long.value, dense, sheet, 11), 6);
    expect(denseHint(long.value, twin, [...all, twin], svg.value, { joinEdges: null, sheet })).toBeNull();
    // The same recipe in Flow: Dense prints it larger, and the line shows.
    expect(hintFor(long.value, flow, sheet)).not.toBeNull();
  });
});

describe('pointsText', () => {
  it('gives a tenth of a point, rounded down, so it never says more than prints', () => {
    expect(pointsText(5.8324)).toBe('5.8 pt');
    expect(pointsText(6.99)).toBe('6.9 pt');
    expect(pointsText(7)).toBe('7.0 pt');
    expect(pointsText(8.3897)).toBe('8.3 pt');
  });
});
