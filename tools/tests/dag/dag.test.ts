import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

import { allSteps, buildGraph, parseRecipe, type Recipe } from '../../src/core/index.ts';
import { computeLayout, defaultDagTheme, layoutDag, NODE_WRAP, nodeText, renderDag } from '../../src/dag/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { TIE } from '../../src/dag/layout/fit.ts';
import { listDagThemes, loadDagTheme } from '../../src/dag/node.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, findRecipes, loadUnits } from '../../src/node/files.ts';
import { box, byKind, centerY, checkInvariants, type Box, type Layout } from './invariants.ts';

const units = loadUnits();
const parse = (source: string): Recipe => parseRecipe(source, { units });
const example = (slug: string): Recipe => parse(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'));

const columns = (layout: Layout): number[] => [...new Set(byKind(layout, 'operation').map((b) => b.x))].sort((a, b) => a - b);
const columnOf = (layout: Layout, id: string): number => columns(layout).indexOf(box(layout, id).x);
const rowsOf = (layout: Layout): number[] => [...new Set(byKind(layout, 'operation').map((b) => centerY(b)))].sort((a, b) => a - b);
const rowOf = (layout: Layout, id: string): number => rowsOf(layout).indexOf(centerY(box(layout, id)));
const edgeOf = (layout: Layout, from: string, to: string) => layout.edges.find((e) => e.from === from && e.to === to)!;

/**
 * The plain layout: the third column, one column. What every chart was before charts were laid
 * out for their sheet; the tests of the third column's shapes pin it, so that the scorer's
 * choice of another layout cannot change what they look at.
 */
const plain = { name: 'plain', values: { 'third-column': 'always', columns: '1' } };
const pinned = (values: Record<string, string | number>) => ({ name: 'pinned', values: { ...plain.values, ...values } });

describe('the three reference charts', () => {
  it('Malted Chocolate: the spine turns into the third column and back', () => {
    const recipe = example('malted-chocolate');
    const layout = layoutDag(recipe, { theme: plain });
    checkInvariants(recipe, layout, plain);
    expect(byKind(layout, 'ingredients')).toHaveLength(4);
    expect(byKind(layout, 'operation')).toHaveLength(7);
    expect(byKind(layout, 'component')).toHaveLength(0);
    expect(byKind(layout, 'title')[0].lines).toEqual(['Malted Chocolate']);
    const at = (id: string) => [columnOf(layout, id), rowOf(layout, id)];
    expect(at('blend-the-base')).toEqual([0, 0]);
    expect(at('add-the-chocolate')).toEqual([0, 1]);
    expect(at('add-the-cream')).toEqual([0, 2]);
    expect(at('chill')).toEqual([1, 2]);
    expect(at('churn')).toEqual([1, 3]);
    expect(at('fold-in-the-whoppers')).toEqual([0, 3]);
    expect(at('freeze')).toEqual([0, 4]);
    expect(rowsOf(layout)).toHaveLength(5);
    // Every edge is a single straight segment.
    expect(layout.edges.every((e) => e.points.length === 2)).toBe(true);
    expect(box(layout, 'ingredients:blend-the-base').lines).toEqual([
      '240 g heavy cream',
      '240 g whole milk',
      ' 85 g egg yolk',
      '150 g sugar',
      ' 21 g Dutch cocoa powder',
      '135 g malted milk powder',
      '  1 g salt',
    ]);
  });

  it('Pistachio: the closing steps run down the third column', () => {
    const recipe = example('pistachio-in-the-style-of-van-leeuwen');
    const layout = layoutDag(recipe, { theme: plain });
    checkInvariants(recipe, layout, plain);
    expect(byKind(layout, 'ingredients')).toHaveLength(3);
    expect(byKind(layout, 'operation')).toHaveLength(5);
    const at = (id: string) => [columnOf(layout, id), rowOf(layout, id)];
    expect(at('add-remaining-ingredients')).toEqual([0, 2]);
    expect(at('chill-base')).toEqual([1, 2]);
    expect(at('churn')).toEqual([1, 3]);
    expect(byKind(layout, 'title')[0].lines).toEqual(['Pistachio', 'in the style of Van Leeuwen']);
    // Decimal quantities are right-aligned too.
    expect(box(layout, 'ingredients:whirl-30-seconds').lines).toEqual(['92.5 g shelled pistachios', '92.5 g sugar', ' 2.3 g kosher salt']);
  });

  it('Frosty Chocolate: a branch joins around the spine, which runs back up the third column', () => {
    const recipe = example('frosty-chocolate');
    const layout = layoutDag(recipe, { theme: plain });
    checkInvariants(recipe, layout, plain);
    expect(byKind(layout, 'ingredients')).toHaveLength(4);
    expect(byKind(layout, 'operation')).toHaveLength(9);
    // Two components in the source, but the cacao bloom is a side branch: no containers.
    expect(byKind(layout, 'component')).toHaveLength(0);
    const at = (id: string) => [columnOf(layout, id), rowOf(layout, id)];
    expect(at('combine--rest')).toEqual([0, 0]);
    expect(at('blend-to-170f')).toEqual([0, 1]);
    expect(at('combine')).toEqual([0, 2]);
    expect(at('cool-to-110f')).toEqual([0, 3]);
    expect(at('add-to-vitamix')).toEqual([0, 4]);
    expect(at('wait-10-minutes')).toEqual([1, 4]);
    expect(at('blend-15-seconds')).toEqual([1, 3]);
    expect(at('chill')).toEqual([1, 2]);
    expect(at('churn')).toEqual([1, 1]);
    expect(rowsOf(layout)).toHaveLength(5);
    // `Cool to 110°F` takes no ingredients but keeps its row on the spine.
    expect(layout.boxes.some((b) => b.id === 'ingredients:cool-to-110f')).toBe(false);

    // The bloom leaves to the right, runs down between the columns, and enters from the right.
    const join = edgeOf(layout, 'combine--rest', 'add-to-vitamix');
    const bloom = box(layout, 'combine--rest');
    const add = box(layout, 'add-to-vitamix');
    const wait = box(layout, 'wait-10-minutes');
    expect(join.kind).toBe('reference');
    expect(join.points).toHaveLength(4);
    expect(join.points[0]).toEqual({ x: bloom.x + bloom.width, y: centerY(bloom) });
    expect(join.points[3]).toEqual({ x: add.x + add.width, y: centerY(add) });
    expect(join.points[1].x).toBeGreaterThan(add.x + add.width);
    expect(join.points[1].x).toBeLessThan(wait.x);
    // So the spine leaves `Add to Vitamix` from the bottom and turns up into the third column.
    const turn = edgeOf(layout, 'add-to-vitamix', 'wait-10-minutes');
    expect(turn.points).toHaveLength(4);
    expect(turn.points[0].y).toBe(add.y + add.height);
    expect(turn.points[3].y).toBe(wait.y + wait.height);
    expect(turn.points[1].y).toBeGreaterThan(add.y + add.height);
    expect(box(layout, 'ingredients:combine--rest').lines).toEqual([' 32 g water, at 110°F', '  8 g extra brute cacao']);
  });
});

describe('every recipe that ships', () => {
  const recipes = findRecipes(join(ETNA_ROOT, 'cookbook')).filter((r) => !/^form: traditional$/m.test(readFileSync(r.file!, 'utf8')));

  it('finds the recipes', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(10);
  });

  for (const found of recipes) {
    it(`${found.slug} lays out and renders`, () => {
      const recipe = parse(readFileSync(found.file!, 'utf8'));
      const layout = layoutDag(recipe);
      checkInvariants(recipe, layout);
      const svg = renderDag(recipe);
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      // Self-contained: no external resources.
      expect(svg).not.toMatch(/href=|url\(|@import|<image|<script/);
      // Deterministic: the same bytes every time.
      expect(renderDag(recipe)).toBe(svg);
      expect(renderDag(parse(readFileSync(found.file!, 'utf8')))).toBe(svg);
      expect(layoutDag(recipe)).toEqual(layout);
    });
  }

  const twoColumns = pinned({ columns: '2' });

  it('draws each component of a multi-component recipe as a titled container', () => {
    const recipe = example('next-day-soft-cinnamon-rolls');
    const layout = layoutDag(recipe, { theme: plain });
    checkInvariants(recipe, layout, plain);
    const containers = byKind(layout, 'component');
    expect(containers.map((c) => c.lines[0])).toEqual(['Dough', 'Cream cheese frosting', 'Cinnamon goo filling']);
    // Containers share a left edge and a width, and stack downward.
    expect(new Set(containers.map((c) => c.x)).size).toBe(1);
    expect(new Set(containers.map((c) => c.width)).size).toBe(1);
    for (let i = 1; i < containers.length; i++) expect(containers[i].y).toBeGreaterThan(containers[i - 1].y + containers[i - 1].height);
    expect(new Set(byKind(layout, 'ingredients').map((b) => b.x)).size).toBe(1);
    // Every operation sits inside the container of its top-level component; the closing
    // top-level steps sit below the last container, in no frame.
    const graph = buildGraph(recipe);
    const bottom = Math.max(...containers.map((c) => c.y + c.height));
    const closing = graph.steps.filter((step) => step.path.length === 0).map((step) => step.id);
    expect(closing).toEqual(['roll-and-fill', 'slice-and-pan', 'bake', 'frost']);
    for (const step of graph.steps) {
      const op = box(layout, step.id);
      if (step.path.length === 0) {
        expect(op.y).toBeGreaterThan(bottom);
        continue;
      }
      const container = box(layout, `component:${step.path[0].anchor}`);
      expect(op.x).toBeGreaterThan(container.x);
      expect(op.x + op.width).toBeLessThan(container.x + container.width);
      expect(op.y).toBeGreaterThan(container.y);
      expect(op.y + op.height).toBeLessThan(container.y + container.height);
    }
    // The nested yudane and mashed potato are side branches inside Dough, joining at Mix.
    expect(layout.boxes.some((b) => b.id === 'component:yudane')).toBe(false);
    const mix = box(layout, 'mix');
    // By default (`join-edges: separate`) each comes in at its own point on Mix's right side,
    // one above the middle and one below; with `bus`, both meet at its tip.
    const ends = ['stir', 'cook-and-mash'].map((from) => edgeOf(layout, from, 'mix').points.at(-1)!);
    expect(ends[0].y).not.toBe(ends[1].y);
    expect(Math.min(ends[0].y, ends[1].y)).toBeLessThan(centerY(mix));
    expect(Math.max(ends[0].y, ends[1].y)).toBeGreaterThan(centerY(mix));
    for (const end of ends) expect(end.x).toBeGreaterThan(mix.x + mix.width / 2);
    const bus = layoutDag(recipe, { theme: pinned({ 'join-edges': 'bus' }) });
    const busMix = box(bus, 'mix');
    for (const from of ['stir', 'cook-and-mash']) {
      const end = edgeOf(bus, from, 'mix').points.at(-1)!;
      expect(end.x).toBe(busMix.x + busMix.width);
      expect(end.y).toBeCloseTo(centerY(busMix), 9);
    }
    // An edge to the next container down runs down the channel between the operation columns,
    // inside the containers, not out beyond their right edge.
    const right = containers[0].x + containers[0].width;
    const spineRight = box(layout, 'roll-and-fill').x + box(layout, 'roll-and-fill').width;
    const finish = edgeOf(layout, 'stir-in-the-vanilla', 'roll-and-fill').points.map((p) => p.x);
    expect(Math.max(...finish)).toBeLessThan(right);
    expect(Math.max(...finish)).toBeGreaterThan(spineRight);
    // An edge to a container further on, past one between, goes out to the gutter beyond the
    // containers, so it crosses no frame it neither starts nor ends in.
    for (const [from, to] of [['raise', 'roll-and-fill'], ['beat', 'frost']]) {
      expect(Math.max(...edgeOf(layout, from, to).points.map((p) => p.x))).toBeGreaterThan(right);
    }
    expect(checkGeometry(computeLayout(recipe, { theme: plain }), readTheme(plain), recipe).flaws.filter((f) => f.rule === 'edge-through-frame')).toEqual([]);
  });

  it('folds a long stack of containers into two columns when columns: 2', () => {
    const recipe = example('next-day-soft-cinnamon-rolls');
    const stacked = layoutDag(recipe, { theme: plain });
    const layout = computeLayout(recipe, { theme: twoColumns });
    checkInvariants(recipe, layout, twoColumns);
    expect(layout.plan).toMatchObject({ third: true, columns: 2, broken: 0 });
    // The dough alone in the first column; the other two containers and the closing steps
    // stacked in the second. The second is the shorter, and stands at the foot of the first,
    // so the dough runs across to the closing steps rather than back up the page.
    const [dough, frosting, goo] = byKind(layout, 'component');
    const closing = ['roll-and-fill', 'slice-and-pan', 'bake', 'frost'].map((id) => box(layout, id));
    expect(frosting.x).toBeGreaterThan(dough.x + dough.width);
    expect(goo.x).toBe(frosting.x);
    for (const step of closing) expect(step.x).toBeGreaterThan(dough.x + dough.width);
    expect(frosting.y).toBeGreaterThan(dough.y);
    const raise = box(layout, 'raise');
    expect(Math.max(...closing.map((step) => step.y + step.height))).toBeCloseTo(raise.y + raise.height, 1);
    expect(layout.height).toBeLessThan(stacked.height * 0.65);
    // The dough crosses to the closing steps between the two columns.
    const cross = edgeOf(layout, 'raise', 'roll-and-fill');
    for (const p of cross.points.slice(1, -2)) {
      expect(p.x).toBeGreaterThan(dough.x + dough.width);
      expect(p.x).toBeLessThan(frosting.x);
    }
  });

  it('folds the long stack only on a sheet, and only where that prints clearly larger', () => {
    const recipe = example('next-day-soft-cinnamon-rolls');
    // On the screen, which scrolls, the chart stands in one column with every step on the spine.
    const screen = computeLayout(recipe);
    expect(screen.plan).toMatchObject({ columns: 1, third: false });
    expect(computeLayout(recipe, { sheet: { shape: 'screen' } })).toEqual(screen);
    expect(new Set(byKind(screen, 'component').map((c) => c.x)).size).toBe(1);
    // On a landscape sheet, and so on `auto`, the fold into two columns prints largest.
    for (const shape of ['auto', 'landscape'] as const) {
      const sheet = computeLayout(recipe, { sheet: { shape } });
      expect(sheet.plan!.columns, shape).toBe(2);
      expect(new Set(byKind(sheet, 'component').map((c) => c.x)).size, shape).toBe(2);
      // The fold is taken because it prints larger than the plain layout on the same sheet, by more than a tie.
      const flat = computeLayout(recipe, { theme: plain, sheet: { shape } });
      expect(sheet.plan!.scale, shape).toBeGreaterThan(flat.plan!.scale * (1 + TIE));
    }
    // Upright, with the unit column wide enough for `large` (unit width 7), the fold no longer
    // prints larger: the chart keeps one column, its third column beside the spine.
    const upright = computeLayout(recipe, { sheet: { shape: 'portrait' } });
    expect(upright.plan).toMatchObject({ columns: 1, third: true });
    const folded = computeLayout(recipe, { theme: { name: 'two', values: { columns: '2' } }, sheet: { shape: 'portrait' } });
    expect(folded.plan!.scale).toBeLessThan(upright.plan!.scale);
    // A shorter recipe keeps one stack, and one left column of ingredient boxes, on the sheet as on the screen.
    for (const slug of ['nana-palumbos-meatloaf']) {
      for (const sheet of [undefined, { shape: 'auto' as const }]) {
        const other = layoutDag(example(slug), { sheet });
        expect(new Set(byKind(other, 'component').map((c) => c.x)).size, slug).toBe(1);
        expect(new Set(byKind(other, 'ingredients').map((b) => b.x)).size, slug).toBe(1);
      }
    }
  });

  it('holds its invariants for every recipe that ships in one column and in two', () => {
    for (const found of recipes) {
      const recipe = parse(readFileSync(found.file!, 'utf8'));
      for (const theme of [plain, twoColumns]) {
        try {
          checkInvariants(recipe, layoutDag(recipe, { theme }), theme);
        } catch (error) {
          throw new Error(`${found.slug}, ${theme.name}: ${(error as Error).message}`);
        }
      }
    }
  });

  it('keeps a unit of up to seven characters in the unit column, so every name starts at one edge', () => {
    expect(defaultDagTheme.values['ingredient-unit-width']).toBe(7);
    const layout = layoutDag(example('next-day-soft-cinnamon-rolls'));
    expect(box(layout, 'ingredients:beat').lines).toEqual([
      '113 g     unsalted butter, softened',
      '113 g     cream cheese, softened',
      '  5 g     vanilla',
      '  1 pinch kosher salt',
      '120 g     powdered sugar',
    ]);
  });

  it('puts a unit longer than seven characters in the item column instead of widening the unit column', () => {
    const recipe = parse('---\netna: 1\n---\n\n# T\n\n## Mix\n\n- 2 tablespoons sugar\n- 1 medium onion\n- 100 g flour\n\nMix.\n');
    const lines = byKind(layoutDag(recipe), 'ingredients')[0].lines;
    expect(lines).toEqual(['  2 tablespoons sugar', '  1 medium onion', '100 g      flour']);
  });
});

describe('node text', () => {
  it('wraps a box at 24 characters', () => {
    expect(NODE_WRAP).toBe(24);
  });

  it('leaves 24 units beside a box\'s text, so a full line keeps clear of a hexagon\'s ends', () => {
    expect(defaultDagTheme.values['operation-padding-x']).toBe(24);
    // Dense keeps Flow's room at its own size (6 to Flow's 8 before); Station's pill is wider than its text needs.
    expect(loadDagTheme('dense').values['operation-padding-x']).toBe(18);
    expect(loadDagTheme('station').values['operation-padding-x']).toBe(14);
    // The widest lines, "Knead in a spiral mixer" and "Speed 6 for 6-8 minutes", set every box's width: 16 units wider each side than with 8.
    const recipe = example('easter-bread');
    const wide = box(computeLayout(recipe, { theme: plain }), 'knead-in-a-spiral-mixer');
    const narrow = box(computeLayout(recipe, { theme: { name: 'p8', values: { ...plain.values, 'operation-padding-x': '8' } } }), 'knead-in-a-spiral-mixer');
    expect(wide.lines).toEqual(['Knead in a spiral mixer', 'Speed 2 for 4 minutes', '30 minute rest', 'Speed 6 for 6-8 minutes']);
    expect(wide.width - narrow.width).toBeCloseTo(32, 0);
  });

  it('is the step heading, wrapped to short balanced lines', () => {
    const steps = allSteps(example('easter-bread').nodes);
    const text = Object.fromEntries(steps.map((s) => [s.heading.anchor, nodeText(s)]));
    // The heading, then each mark on a line of its own (SPEC §5.3).
    expect(text['bake']).toEqual(['Bake', 'at 275°F', '50-70 minutes', 'to 190°F internal']);
    // 21 and 23 characters fit the 24-cell width; 25 do not, and wrap to balanced lines.
    expect(text['add-the-yeast-mixture']).toEqual(['Add the yeast mixture']);
    expect(text['knead-in-a-spiral-mixer']).toEqual(['Knead in a spiral mixer', 'Speed 2 for 4 minutes', '30 minute rest', 'Speed 6 for 6-8 minutes']);
    const beans = Object.fromEntries(allSteps(example('navy-bean-soup').nodes).map((s) => [s.heading.anchor, nodeText(s)]));
    expect(beans['rinse-and-brine-the-beans']).toEqual(['Rinse and brine', 'the beans', 'overnight']);
    // "— optional" is not part of the node's text: the chart says it its own way.
    const optional = parse('---\netna: 1\n---\n\n# T\n\n## Bake\n\n- 100 g flour\n\nBake.\n\n## Ice the loaf — optional\n\n- 90 g powdered sugar\n\nIce the loaf.\n');
    expect(nodeText(allSteps(optional.nodes)[1])).toEqual(['Ice the loaf']);
    for (const lines of Object.values(text)) for (const line of lines) expect(line.length).toBeLessThanOrEqual(NODE_WRAP);
    // Any other qualifier stays, on a line of its own when the heading fills the first.
    const placeholder = parse('---\netna: 1\n---\n\n# T\n\n## Do the first thing — the night before\n\n- 100 g flour\n\nDo the first thing.\n\n## Do the second thing\n\nDo the second thing.\n');
    expect(nodeText(allSteps(placeholder.nodes)[0])).toEqual(['Do the first thing', '— the night before']);
  });
});

describe('errors and options', () => {
  it('refuses a traditional recipe with a clear message', () => {
    const recipe = parse('---\netna: 1\nform: traditional\n---\n\n# Toast\n\n## Ingredients\n\n- 1 slice bread\n\n## Directions\n\n1. Toast the bread.\n');
    expect(recipe.form).toBe('traditional');
    expect(() => renderDag(recipe)).toThrow(/traditional/);
    expect(() => renderDag(recipe)).toThrow(/Toast/);
    expect(() => layoutDag(recipe)).toThrow(Error);
  });

  it('refuses a recipe with no steps', () => {
    expect(() => renderDag(parse('# Nothing\n'))).toThrow(/no steps/);
  });

  it('can leave the title out', () => {
    const recipe = example('malted-chocolate');
    // In one layout: without its title the scorer may take another, taller one.
    const layout = layoutDag(recipe, { title: false, theme: plain });
    checkInvariants(recipe, layout, plain);
    expect(byKind(layout, 'title')).toHaveLength(0);
    expect(layout.height).toBeLessThan(layoutDag(recipe, { theme: plain }).height);
    expect(byKind(layoutDag(recipe, { title: false }), 'title')).toHaveLength(0);
  });

  it('takes its look from the theme', () => {
    const recipe = example('malted-chocolate');
    const theme = { name: 'test', values: { 'ingredient-fill': '#abcdef', 'row-gap': 80, 'edge-radius': 0 } };
    const svg = renderDag(recipe, { theme });
    expect(svg).toContain('#abcdef');
    expect(svg).toContain('theme-test');
    expect(svg).not.toContain(String(defaultDagTheme.values['ingredient-fill']));
    const layout = layoutDag(recipe, { theme });
    checkInvariants(recipe, layout);
    expect(layout.height).toBeGreaterThan(layoutDag(recipe).height);
  });
});

describe('chart themes', () => {
  const recipes = findRecipes(join(ETNA_ROOT, 'cookbook')).filter((r) => !/^form: traditional$/m.test(readFileSync(r.file!, 'utf8')));
  const variants = [
    ...listDagThemes().map((name) => loadDagTheme(name)),
    { name: 'mirrored', values: { 'ingredient-side': 'right', 'edge-style': 'curved' } },
    { name: 'bus', values: { 'join-edges': 'bus' } },
    { name: 'bus-mirrored', values: { 'join-edges': 'bus', 'ingredient-side': 'right' } },
    { name: 'shapes', values: { 'ingredient-shape': 'hexagon', 'operation-shape': 'pill', 'title-position': 'left' } },
    { name: 'boxes', values: { 'ingredient-shape': 'pill', 'operation-shape': 'rectangle', 'text-measure': 'serif', 'font-family': 'Georgia, serif' } },
  ];

  it('bundles flow, ink, dense and station', () => {
    expect(listDagThemes()).toEqual(['dense', 'flow', 'ink', 'station']);
  });

  it('holds the chart invariants for every example in every bundled theme and option', () => {
    for (const found of recipes) {
      const recipe = parse(readFileSync(found.file!, 'utf8'));
      for (const theme of variants) {
        try {
          checkInvariants(recipe, layoutDag(recipe, { theme }), theme);
          renderDag(recipe, { theme });
        } catch (error) {
          throw new Error(`${found.slug}, ${theme.name}: ${(error as Error).message}`);
        }
      }
    }
  });

  it('mirrors the chart for ingredient-side: right, and keeps the title', () => {
    const recipe = example('frosty-chocolate');
    const left = layoutDag(recipe);
    const right = layoutDag(recipe, { theme: { name: 'r', values: { 'ingredient-side': 'right' } } });
    expect(right.width).toBe(left.width);
    expect(box(right, 'title')).toEqual(box(left, 'title'));
    for (const b of left.boxes.filter((x) => x.kind !== 'title')) {
      const m = box(right, b.id);
      expect(m.y).toBe(b.y);
      expect(Math.abs(m.x + m.width / 2 - (left.width - (b.x + b.width / 2)))).toBeLessThan(0.02);
    }
  });

  it('draws each shape and edge style', () => {
    const recipe = example('malted-chocolate');
    const svg = (values: Record<string, string | number>) => renderDag(recipe, { theme: { name: 't', values } });
    expect(svg({ 'ingredient-shape': 'hexagon' })).toMatch(/\.dag-ingredients path\{/);
    expect(svg({ 'ingredient-shape': 'pill' })).toMatch(/<g class="dag-ingredients"[^>]*><rect [^>]*rx="(\d+(\.\d+)?)"/);
    expect(svg({ 'operation-shape': 'pill' })).toMatch(/<g class="dag-operation"[^>]*><path d="M[^"]*A/);
    expect(svg({ 'operation-shape': 'rectangle', 'operation-radius': 0 })).toMatch(/<g class="dag-operation"[^>]*><path d="M[\d.]+ [\d.]+H[\d.]+V/);
    expect(svg({ 'title-position': 'none' })).not.toContain('dag-title"');
    expect(svg({ 'title-position': 'left' })).toContain('.dag-title text{text-anchor:start}');
    expect(svg({ 'title-shape': 'underline' })).toMatch(/<g class="dag-title"><line /);
    expect(svg({ 'title-shape': 'plain' })).toMatch(/<g class="dag-title"><text /);
    expect(svg({ 'ingredient-stroke-dash': '4 3' })).toContain('stroke-dasharray:4 3');
    // Curved edges bend wider than orthogonal ones, through the same points.
    const frosty = example('frosty-chocolate');
    const curved = renderDag(frosty, { theme: { name: 'c', values: { 'edge-style': 'curved' } } });
    expect(curved).not.toBe(renderDag(frosty));
    expect(layoutDag(frosty, { theme: { name: 'c', values: { 'edge-style': 'curved' } } })).toEqual(layoutDag(frosty));
  });

  it('lays out proportional text narrower than monospace, and wraps by width', () => {
    const recipe = example('easter-bread');
    const mono = layoutDag(recipe);
    const sans = layoutDag(recipe, { theme: { name: 's', values: { 'text-measure': 'sans', 'char-width': 0.55, 'font-family': 'Arial, sans-serif' } } });
    const width = (l: Layout, kind: Box['kind']) => byKind(l, kind)[0].width;
    expect(width(sans, 'ingredients')).toBeLessThan(width(mono, 'ingredients'));
    expect(width(sans, 'operation')).toBeLessThanOrEqual(width(mono, 'operation'));
  });
});

describe('the flow theme', () => {
  it('has the same values in theme.yaml as defaultDagTheme', () => {
    const yaml = parseYaml(readFileSync(join(ETNA_ROOT, 'themes', 'flow', 'theme.yaml'), 'utf8')) as { name: string; values: Record<string, unknown> };
    expect(yaml.name).toBe(defaultDagTheme.name);
    expect(yaml.values).toEqual(defaultDagTheme.values);
    expect(Object.keys(yaml.values)).toEqual(Object.keys(defaultDagTheme.values));
  });

  it('loads by name, by default, and from a directory', () => {
    expect(loadDagTheme()).toEqual(defaultDagTheme);
    expect(loadDagTheme('flow')).toEqual(defaultDagTheme);
    expect(loadDagTheme(join(ETNA_ROOT, 'themes', 'flow'))).toEqual(defaultDagTheme);
    expect(() => loadDagTheme('no-such-theme')).toThrow(/not found/);
  });

  it('renders the same chart from the loaded theme as from the default', () => {
    const recipe = example('frosty-chocolate');
    expect(renderDag(recipe, { theme: loadDagTheme() })).toBe(renderDag(recipe));
  });

  it('uses hyphenated names only', () => {
    for (const key of Object.keys(defaultDagTheme.values)) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(renderDag(example('easter-bread'))).not.toMatch(/class="[^"]*_/);
  });
});

// ---------------------------------------------------------------------------------------
// Shapes the recipes that ship do not cover, written as small synthetic recipes. `I` is a step that
// takes ingredients, `n` one that does not.

const stepsFrom = (pattern: string, depth = 2, prefix = 'Step'): string =>
  [...pattern].map((c, i) => `${'#'.repeat(depth)} ${prefix} ${i + 1}\n\n${c === 'I' ? `- ${i + 1}0 g item ${i + 1}\n\n` : ''}Do it.\n`).join('\n');
const flat = (pattern: string): Recipe => parse(`# Pattern ${pattern}\n\n${stepsFrom(pattern)}`);

describe('snake shapes', () => {
  // Lays out every pattern of up to eight steps: well over a second when the machine is busy, so a long timeout.
  it('holds its invariants for every pattern of up to eight steps', { timeout: 60_000 }, () => {
    let count = 0;
    for (let length = 1; length <= 8; length++) {
      for (let bits = 0; bits < 1 << length; bits++) {
        const pattern = [...Array(length)].map((_, i) => ((bits >> i) & 1 ? 'I' : 'n')).join('');
        const recipe = flat(pattern);
        try {
          checkInvariants(recipe, layoutDag(recipe));
        } catch (error) {
          throw new Error(`pattern ${pattern}: ${(error as Error).message}`);
        }
        count++;
      }
    }
    expect(count).toBe(510);
  });

  // Some two thousand layouts, each checked twice: slow on a busy machine.
  it('holds its invariants and its geometry for every pattern of up to eight steps folded into two and three columns', { timeout: 60_000 }, () => {
    let count = 0;
    for (let length = 1; length <= 8; length++) {
      for (let bits = 0; bits < 1 << length; bits++) {
        const pattern = [...Array(length)].map((_, i) => ((bits >> i) & 1 ? 'I' : 'n')).join('');
        const recipe = flat(pattern);
        for (const columns of ['2', '3']) {
          for (const third of ['always', 'never']) {
            const theme = { name: 'fold', values: { columns, 'third-column': third } };
            try {
              const layout = computeLayout(recipe, { theme });
              checkInvariants(recipe, layout, theme);
              expect(layout.plan!.columns).toBeLessThanOrEqual(Number(columns));
              expect(checkGeometry(layout, readTheme(theme), recipe).flaws).toEqual([]);
            } catch (error) {
              throw new Error(`pattern ${pattern}, columns ${columns}, third-column ${third}: ${(error as Error).message}`);
            }
            count++;
          }
        }
      }
    }
    expect(count).toBe(510 * 4);
  });

  it('keeps one step without ingredients on the spine, and sends two or more to the third column', () => {
    const one = layoutDag(flat('InI'), { theme: plain });
    expect(columns(one)).toHaveLength(1);
    expect(rowsOf(one)).toHaveLength(3);
    const two = layoutDag(flat('InnI'), { theme: plain });
    expect(columns(two)).toHaveLength(2);
    expect(rowsOf(two)).toHaveLength(2);
    expect([columnOf(two, 'step-2'), columnOf(two, 'step-3'), columnOf(two, 'step-4')]).toEqual([1, 1, 0]);
  });

  it('runs a long closing run back up the third column, staying compact', () => {
    // Four rows with ingredients, then four steps without: all four fit going up.
    const up = layoutDag(flat('IIIInnnn'), { theme: plain });
    expect(rowsOf(up)).toHaveLength(4);
    expect([5, 6, 7, 8].map((i) => rowOf(up, `step-${i}`))).toEqual([3, 2, 1, 0]);
    // One row with ingredients, then seven without: three continue down the spine so the
    // other four fit going up.
    const long = layoutDag(flat('Innnnnnn'), { theme: plain });
    expect(rowsOf(long)).toHaveLength(4);
    expect([2, 3, 4].map((i) => columnOf(long, `step-${i}`))).toEqual([0, 0, 0]);
    expect([5, 6, 7, 8].map((i) => [columnOf(long, `step-${i}`), rowOf(long, `step-${i}`)])).toEqual([[1, 3], [1, 2], [1, 1], [1, 0]]);
  });

  it('draws a recipe with no ingredients at all as a plain column', () => {
    const recipe = flat('nnn');
    const layout = layoutDag(recipe);
    expect(byKind(layout, 'ingredients')).toHaveLength(0);
    expect(columns(layout)).toHaveLength(1);
  });
});

describe('branches', () => {
  const withBranch = (pattern: string, joinAt: number, branch = 'I'): Recipe =>
    parse(
      `# Branch\n\n## Side\n\n${stepsFrom(branch, 3, 'Side')}\n## Main\n\n` +
        [...pattern]
          .map((c, i) => `### Step ${i + 1}\n\n${i === joinAt ? '- [side](#side)\n' : ''}${c === 'I' ? `- ${i + 1}0 g item ${i + 1}\n` : ''}\nDo it.\n`)
          .join('\n'),
    );

  it('draws a top-level step that joins nothing as preparation: first, dashed, under a caption', () => {
    const recipe = parse(
      '---\netna: 1\n---\n\n# Biscuits\n\n## Heat the oven\n\nHeat the oven to 450°F.\n\n## Flour mixture\n\n### Combine the flour\n\n- 1 cup flour\n\nCombine.\n\n' +
        '## Milk mixture\n\n### Whisk the milk\n\n- 1 cup milk\n\nWhisk.\n\n## Assembly\n\n### Stir together\n\n- [flour mixture](#flour-mixture)\n- [milk mixture](#milk-mixture)\n\nStir.\n\n### Bake\n\nBake.\n',
    );
    const layout = computeLayout(recipe, { theme: defaultDagTheme });
    const prep = layout.operations.find((o) => o.box.id === 'heat-the-oven')!;
    expect(prep.prep).toBe(true);
    expect(layout.operations.filter((o) => o.prep)).toHaveLength(1);
    // Above every other operation, and touched by no edge.
    for (const o of layout.operations) if (o !== prep) expect(o.box.y).toBeGreaterThan(prep.box.y + prep.box.height);
    expect(layout.edges.some((e) => e.from === 'heat-the-oven' || e.to === 'heat-the-oven')).toBe(false);
    expect(layout.captions.some((c) => c.text === 'Before you start')).toBe(true);
    const svg = renderDag(recipe, { theme: defaultDagTheme });
    expect(svg).toContain('class="dag-operation dag-prep"');
    expect(svg).toContain('stroke-dasharray:5 4');
    // A step with an ingredient, or one an edge touches, is never preparation.
    const flat = computeLayout(parse('---\netna: 1\n---\n\n# T\n\n## Heat the oven\n\nHeat.\n\n## Mix\n\n- 1 cup flour\n\nMix.\n'), { theme: defaultDagTheme });
    expect(flat.operations.filter((o) => o.prep)).toHaveLength(0);
  });

  it('writes a quantified reference\'s amount by its arrowhead and captions what the component makes', () => {
    const recipe = parse(
      '---\netna: 1\n---\n\n# Pancakes\n\n## Dry Mix\n\n### Combine and store\n\n- 120 g flour\n- 60 g sugar\n- 1 tsp baking soda\n\nCombine and store.\n\n' +
        '## Pancakes\n\n### Add the egg\n\n- 100 g [dry mix](#dry-mix)\n- 1 large egg\n\nWhisk.\n\n### Cook\n\nCook.\n',
    );
    const layout = computeLayout(recipe, { theme: defaultDagTheme });
    const texts = layout.captions.map((c) => c.text);
    expect(texts).toContain('Dry Mix — makes about 180 g'); // the teaspoon is left out, so "about"
    const label = layout.captions.find((c) => c.edge)!;
    expect(label.text).toBe('100 g');
    const edge = layout.edges.find((e) => e.from === 'combine-and-store' && e.to === 'add-the-egg')!;
    // Beside the edge, part way along it (edge-label-at 0.5): within the edge's extent, off the line.
    const xs = edge.points.map((p) => p.x);
    const ys = edge.points.map((p) => p.y);
    expect(label.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(label.x).toBeLessThanOrEqual(Math.max(...xs) + 12);
    expect(label.y).toBeGreaterThanOrEqual(Math.min(...ys) - 8);
    expect(label.y).toBeLessThanOrEqual(Math.max(...ys) + 8);
    expect(edge.points.every((p) => Math.abs(p.x - label.x) > 2 || Math.abs(p.y - label.y) > 2)).toBe(true);
    expect(renderDag(recipe, { theme: defaultDagTheme })).toContain('class="dag-caption dag-edge-label"');
    // No quantity on the reference: no total and no label.
    const plain = computeLayout(parse(recipe.source.replace('- 100 g [dry mix]', '- [dry mix]')), { theme: defaultDagTheme });
    expect(plain.captions.map((c) => c.text)).toContain('Dry Mix');
    expect(plain.captions.some((c) => c.edge)).toBe(false);
    // Units that do not resolve (grams and cups): the name alone.
    const mixed = computeLayout(parse(recipe.source.replace('- 60 g sugar', '- 1 cup sugar')), { theme: defaultDagTheme });
    expect(mixed.captions.map((c) => c.text)).toContain('Dry Mix');
  });

  // Lays out a chart for every step of every snake shape: well over a second when the machine is busy, so a long timeout.
  it('routes a side branch to any step of any snake without crossing a box', { timeout: 60_000 }, () => {
    let count = 0;
    for (let length = 1; length <= 6; length++) {
      for (let bits = 0; bits < 1 << length; bits++) {
        const pattern = [...Array(length)].map((_, i) => ((bits >> i) & 1 ? 'I' : 'n')).join('');
        for (let joinAt = 0; joinAt < length; joinAt++) {
          const recipe = withBranch(pattern, joinAt);
          expect(buildGraph(recipe).edges.filter((e) => e.kind === 'reference')).toHaveLength(1);
          try {
            const layout = layoutDag(recipe);
            checkInvariants(recipe, layout);
            expect(byKind(layout, 'component')).toHaveLength(0);
          } catch (error) {
            throw new Error(`pattern ${pattern}, joining at ${joinAt + 1}: ${(error as Error).message}`);
          }
          count++;
        }
      }
    }
    expect(count).toBeGreaterThan(300);
  });

  it('uses containers once a side component is more than a small branch', () => {
    const recipe = withBranch('IInn', 1, 'II');
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    expect(byKind(layout, 'component').map((c) => c.lines[0])).toEqual(['Side', 'Main']);
    // …unless the theme allows longer inline branches.
    const inline = layoutDag(recipe, { theme: { name: 'inline', values: { 'branch-max-steps': 2 } } });
    checkInvariants(recipe, inline);
    expect(byKind(inline, 'component')).toHaveLength(0);
  });

  it('routes between containers for every shape of consumer', () => {
    for (const pattern of ['I', 'n', 'In', 'nI', 'InnI', 'IInnn', 'Innnn', 'IIIn']) {
      for (let joinAt = 0; joinAt < pattern.length; joinAt++) {
        for (const branch of ['II', 'In', 'Inn', 'InnI', 'IIInnn']) {
          const recipe = withBranch(pattern, joinAt, branch);
          // In one column the edge comes in from the right; in two, from the left. Two
          // containers fold only between them (a cut container takes whole columns).
          for (const columns of [1, 2]) {
            try {
              const theme = pinned({ columns: String(columns) });
              const layout = computeLayout(recipe, { theme });
              checkInvariants(recipe, layout, theme);
              expect(layout.plan!.columns).toBe(columns);
              expect(new Set(byKind(layout, 'component').map((c) => c.x)).size).toBe(columns);
            } catch (error) {
              throw new Error(`branch ${branch} into ${pattern} at ${joinAt + 1}, ${columns} column(s): ${(error as Error).message}`);
            }
          }
        }
      }
    }
  });

  it('lists a reference to another recipe in the ingredient box', () => {
    const recipe = parse('# Outside\n\n## Mix\n\n- 80 g [mango chutney](../mango-chutney/)\n- 10 g salt\n\nMix.\n');
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    expect(box(layout, 'ingredients:mix').lines).toEqual(['80 g mango chutney', '10 g salt']);
  });

  it('lays out loose top-level steps with a multi-step side component, and a reference to an earlier step', () => {
    const recipe = parse(
      '# Mixed\n\n## Start\n\n- 10 g a\n\nGo.\n\n## Sauce\n\n### Simmer\n\n- 5 g b\n\nGo.\n\n### Strain\n\nGo.\n\n' +
        '## Rest\n\nGo.\n\n## Wait\n\nGo.\n\n## Finish\n\n- [sauce](#sauce)\n- [start](#start)\n- 1 large egg\n\nGo.\n',
    );
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    // The top-level steps beside it keep the component framed (SPEC §7).
    expect(byKind(layout, 'component').map((c) => c.id)).toEqual(['component:sauce']);
    expect(box(layout, 'ingredients:finish').lines).toEqual([' 1 large egg']);
  });
});

describe('Choose and Checkpoint', () => {
  const source =
    '# Choices\n\n## Mix\n\n- 10 g flour\n\nMix.\n\n## Cook\n\n> **Choose** — one method.\n\n### Stovetop\n\n- 5 g butter\n\nFry.\n\n' +
    '### Oven\n\n#### Heat\n\nHeat.\n\n#### Roast\n\n- 5 g oil\n\nRoast.\n\n> **Checkpoint** — golden at the edges.\n\n### Grill\n\nGrill.\n\n## Rest\n\nRest.\n\n## Serve\n\n- 1 pinch salt\n\nServe.\n';

  it('draws the branches of a Choose as alternatives inside a group labeled Choose', () => {
    const recipe = parse(source);
    const graph = buildGraph(recipe);
    expect(graph.edges.some((e) => e.kind === 'choose')).toBe(true);
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    const group = box(layout, 'choose:cook');
    expect(group.kind).toBe('component');
    expect(group.lines).toEqual(['Choose — Cook']);
    // The alternatives are inside the group, one under another; the shared steps are outside.
    const inside = (id: string): boolean => {
      const b = box(layout, id);
      return b.x > group.x && b.x + b.width < group.x + group.width && b.y > group.y && b.y + b.height < group.y + group.height;
    };
    expect(['stovetop', 'heat', 'roast', 'grill'].map(inside)).toEqual([true, true, true, true]);
    expect(['mix', 'rest', 'serve'].map(inside)).toEqual([false, false, false]);
    expect(columns(layout)).toHaveLength(1);
    expect(layout.edges.filter((e) => e.kind === 'choose')).toHaveLength(3);
  });

  it('names each alternative that is a component, as a side branch is named', () => {
    const recipe = parse(
      '# Pies\n\n## Dough\n\n> **Choose** — one.\n\n### Quick Dough\n\n#### Rub in\n\n- 10 g flour\n\nRub in.\n\n' +
        '### Slow Dough\n\n#### Liquid\n\n##### Combine\n\n- 5 g water\n\nCombine.\n\n#### Toss\n\n- 10 g flour\n\nToss.\n\n' +
        '### Plain\n\nGo.\n\n## Bake\n\nBake.\n',
    );
    const layout = computeLayout(recipe);
    checkInvariants(recipe, layout);
    const group = box(layout, 'choose:dough');
    const caption = (text: string) => layout.captions.find((c) => c.text === text)!;
    // A component alternative carries its name; one that opens with a sub-component names both,
    // outer first. A step alternative is named by its own node.
    expect(layout.captions.map((c) => c.text).sort()).toEqual(['Quick Dough', 'Slow Dough — Liquid']);
    for (const [text, first] of [['Quick Dough', 'rub-in'], ['Slow Dough — Liquid', 'combine']] as const) {
      const c = caption(text);
      const firstTop = Math.min(box(layout, first).y, ...layout.tables.filter((t) => t.box.id === `ingredients:${first}`).map((t) => t.box.y));
      // Inside the group, under its label, just over the alternative's first row.
      expect(c.y).toBeGreaterThan(group.y + 10);
      expect(c.y).toBeLessThan(firstTop);
      expect(c.x).toBeGreaterThan(group.x);
    }
    // The rule between the first two alternatives runs over the second one's caption.
    const rules = layout.separators.map((r) => r.y1).sort((a, b) => a - b);
    expect(rules[0]).toBeLessThan(caption('Slow Dough — Liquid').y - 8);
    expect(rules[0]).toBeGreaterThan(box(layout, 'rub-in').y + box(layout, 'rub-in').height);
  });

  it('marks a Checkpoint on the node, without a branch', () => {
    const recipe = parse(source);
    const svg = renderDag(recipe);
    expect(svg.match(/class="dag-checkpoint"/g)).toHaveLength(1);
    expect(svg).toContain('Checkpoint — golden at the edges.');
    expect(renderDag(example('malted-chocolate'))).not.toContain('class="dag-checkpoint"');
    expect(renderDag(example('an-etna-recipe')).match(/class="dag-checkpoint"/g)).toHaveLength(1);
  });

  it('holds its invariants with a Choose first, last, or alone in a component', () => {
    const choose = (depth: number) =>
      `${'#'.repeat(depth)} Pick\n\n> **Choose** — one.\n\n${'#'.repeat(depth + 1)} Left\n\n- 1 g a\n\nGo.\n\n${'#'.repeat(depth + 1)} Right\n\nGo.\n\n`;
    const cases = [
      `# First\n\n${choose(2)}## After\n\n- 2 g b\n\nGo.\n`,
      `# Last\n\n## Before\n\n- 2 g b\n\nGo.\n\n${choose(2)}`,
      `# Alone\n\n## Part\n\n${choose(3)}## Other\n\n### One\n\n- 2 g b\n\nGo.\n\n### Two\n\n- [part](#part)\n\nGo.\n\n### Three\n\nGo.\n`,
      `# Turn\n\n## A\n\n- 1 g a\n\nGo.\n\n## B\n\nGo.\n\n## C\n\nGo.\n\n## D\n\n- 1 g d\n\nGo.\n\n${choose(2)}## E\n\nGo.\n\n## F\n\nGo.\n\n## G\n\nGo.\n`,
    ];
    for (const text of cases) {
      const recipe = parse(text);
      try {
        checkInvariants(recipe, layoutDag(recipe));
        renderDag(recipe);
      } catch (error) {
        throw new Error(`${recipe.title?.text}: ${(error as Error).message}`);
      }
    }
  });
});

describe('recipe text that names an Object.prototype member', () => {
  it('charts callouts and amounts named constructor or __proto__', () => {
    const recipe = parse(
      '---\netna: 1\n---\n\n# Proto\n\n## Mix\n\n- 2 g salt\n\nStir for constructor minutes, then toString to __proto__ hours.\n\n> **constructor** — hello\n\n> **__proto__** — there\n',
    );
    const svg = renderDag(recipe);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/function |\[object/);
  });
});

describe('informational callouts on a chart (SPEC §5.1)', () => {
  const recipe = (callouts: string) => `---\netna: 1\n---\n\n# Test\n\n## Mix\n\n- 2 g salt\n\nStir.\n${callouts}\n## Bake\n\nBake for 20 minutes.\n`;

  it('leaves every aside out: the chart is the same byte for byte', () => {
    const plain = renderDag(parse(recipe('')));
    const asides = renderDag(parse(recipe('\n> **Tip** — a.\n\n> **Warning** — b.\n\n> **Make ahead** — c.\n\n> **Variation** — d.\n\n> **Storage** — e.\n')));
    expect(asides).toBe(plain);
  });

  it('marks only the keyword Checkpoint, written exactly; a near-miss is an aside', () => {
    expect(renderDag(parse(recipe('\n> **Checkpoint** — if dry, add water.\n')))).toContain('class="dag-checkpoint"');
    for (const k of ['checkpoint', 'CHECKPOINT', 'Checkpoints']) {
      expect(renderDag(parse(recipe(`\n> **${k}** — if dry, add water.\n`))), k).toBe(renderDag(parse(recipe(''))));
    }
  });
});

describe('top-level steps beside components', () => {
  const pie =
    '# Pie\n\n## Preheat\n\nHeat.\n\n## Crust\n\n### Roll the crust\n\n- 1 g flour\n\nGo.\n\n' +
    '## Filling\n\n### Combine the filling\n\n- 1 g berries\n\nGo.\n\n' +
    '## Fill and cover\n\n- [crust](#crust)\n- [filling](#filling)\n- 1 g butter\n\nGo.\n\n## Bake\n\nGo.\n';

  it('frames every component, however small; preparation above, the closing steps below, unframed', () => {
    const recipe = parse(pie);
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    const frames = byKind(layout, 'component');
    expect(frames.map((c) => c.id)).toEqual(['component:crust', 'component:filling']);
    const bottom = Math.max(...frames.map((c) => c.y + c.height));
    for (const id of ['fill-and-cover', 'bake']) {
      const op = box(layout, id);
      expect(op.y).toBeGreaterThan(bottom);
      for (const c of frames) expect(op.x >= c.x && op.x + op.width <= c.x + c.width && op.y < c.y + c.height && op.y + op.height > c.y).toBe(false);
    }
    // In the containers' step column.
    expect(box(layout, 'fill-and-cover').x).toBe(box(layout, 'roll-the-crust').x);
    const prep = box(layout, 'preheat');
    expect(prep.y + prep.height).toBeLessThan(Math.min(...frames.map((c) => c.y)));
  });

  it('in one column keeps the closing steps under the frames; folded, lets them stand in a later column', () => {
    const recipe = parse(pie);
    const one = layoutDag(recipe, { theme: plain });
    checkInvariants(recipe, one, plain);
    expect(new Set(byKind(one, 'component').map((c) => c.x)).size).toBe(1);
    const two = computeLayout(recipe, { theme: pinned({ columns: '2' }) });
    checkInvariants(recipe, two, pinned({ columns: '2' }));
    expect(two.plan!.columns).toBe(2);
    const [crust, filling] = byKind(two, 'component');
    // The crust in the first column, under the preparation; the filling heads the second, and
    // the closing steps follow it there, unframed.
    expect(filling.x).toBeGreaterThan(crust.x + crust.width);
    for (const id of ['fill-and-cover', 'bake']) {
      const op = box(two, id);
      expect(op.x).toBeGreaterThan(crust.x + crust.width);
      expect(op.y).toBeGreaterThan(filling.y + filling.height);
    }
    expect(box(two, 'preheat').y + box(two, 'preheat').height).toBeLessThan(crust.y);
  });

  it('frames the components around a step between them, each run of steps in source order', () => {
    const recipe = parse(
      '# Coffee cake\n\n## Cake\n\n### Mix\n\n- 1 g a\n\nGo.\n\n### Pour\n\nGo.\n\n## Assemble\n\n- [cake](#cake)\n\nGo.\n\n## Bake\n\nGo.\n\n' +
        '## Glaze\n\n### Whisk\n\n- 1 g b\n\nGo.\n\n## Glaze the cake\n\n- [glaze](#glaze)\n\nGo.\n',
    );
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    const [cake, glaze] = byKind(layout, 'component');
    expect([cake.id, glaze.id]).toEqual(['component:cake', 'component:glaze']);
    expect(box(layout, 'assemble').y).toBeGreaterThan(cake.y + cake.height);
    expect(box(layout, 'bake').y).toBeLessThan(glaze.y);
    expect(box(layout, 'glaze-the-cake').y).toBeGreaterThan(glaze.y + glaze.height);
  });

  it('draws a recipe with a top-level Choose flat, as before', () => {
    const recipe = parse(
      '# Beans\n\n## Brown\n\n- 1 g bacon\n\nGo.\n\n## Base\n\n### Soak\n\nGo.\n\n### Rinse\n\nGo.\n\n## Beans\n\n> **Choose**\n\n### Slow\n\n#### Cook slow\n\nGo.\n\n' +
        '### Fast\n\n#### Cook fast\n\nGo.\n\n## Blend\n\n- [base](#base)\n\nGo.\n',
    );
    const layout = layoutDag(recipe);
    checkInvariants(recipe, layout);
    expect(byKind(layout, 'component').filter((c) => c.id.startsWith('component:'))).toHaveLength(0);
  });

  it('leaves a recipe of components only as it was: Frosty Chocolate stays flat', () => {
    expect(byKind(layoutDag(example('frosty-chocolate')), 'component')).toHaveLength(0);
  });
});
