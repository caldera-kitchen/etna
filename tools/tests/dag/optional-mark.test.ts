// The chart's mark for a component or step designated optional (`## Glaze — optional`, SPEC §6,
// §8): a small "(optional)" after a frame's name or under a step's text. The graph is unchanged.

import { describe, expect, it } from 'vitest';

import { buildGraph, nodeName, parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout, renderDag } from '../../src/dag/index.ts';
import { listDagThemes, loadDagTheme } from '../../src/dag/node.ts';
import { drawList } from '../../src/dag/pdf.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test Dish\n\n${body}`, { units });
const step = (level: number, name: string, lines: string[] = []) =>
  `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}${lines.length ? '\n' : ''}Do it.\n\n`;

// An optional component (Glaze), linked by the closing step, and an optional step in the middle of a chain.
const DISH = (q: string) =>
  parse(
    step(2, 'Heat the oven') +
      '## Vegetables\n\n' +
      step(3, 'Cut', ['500 g carrots', '1 tsp salt']) +
      step(3, 'Roast') +
      `## Glaze${q}\n\n` +
      step(3, 'Warm the glaze', ['2 tbsp honey', '1 tbsp butter']) +
      '## Garnish\n\n' +
      step(3, 'Chop', ['10 g parsley']) +
      step(3, `Toast the nuts${q}`, ['50 g walnuts']) +
      step(3, 'Scatter') +
      step(2, 'Serve', ['[vegetables](#vegetables)', `[glaze](#glaze${q ? '--optional' : ''})`, '[garnish](#garnish)']),
  );
const OPTIONAL = DISH(' — optional');
const PLAIN = DISH('');

// An optional group, an optional step inside a Choose branch, and the plain version of the same.
const BOWLS = (q: string) =>
  parse(
    '## Base\n\n' +
      step(3, 'Cook the rice', ['200 g rice']) +
      `## Toppings${q}\n\n### Pickles\n\n` +
      step(4, 'Slice the onion', ['1 red onion']) +
      '### Herbs\n\n' +
      step(4, 'Chop the herbs', ['1 bunch parsley']) +
      '## Eggs\n\n' +
      step(3, 'Boil the eggs', ['4 large eggs']) +
      '### Finish\n\n> **Choose** — one way.\n\n' +
      step(4, 'Peel') +
      '#### Devilled\n\n' +
      step(5, `Devil the yolks${q}`, ['2 tbsp mayonnaise']) +
      step(5, 'Fill the whites', ['1 pinch paprika']) +
      step(2, 'Build', ['[base](#base)', `[toppings](#toppings${q ? '--optional' : ''})`, '[eggs](#eggs)']),
  );
const BOWL = BOWLS(' — optional');
const PLAIN_BOWL = BOWLS('');

// An optional Choose: one topping, or none.
const CRUMBLE = parse(step(2, 'Bake the fruit', ['500 g apples']) + '## Topping — optional\n\n> **Choose** — one.\n\n' + step(3, 'Crumble', ['50 g oats']) + step(3, 'Streusel', ['50 g flour']));

const flow = loadDagTheme('flow');

describe('the chart of an optional component or step', () => {
  it('leaves the graph as it is: the same steps and edges, optional or not', () => {
    const shape = (r: Recipe) => {
      const g = buildGraph(r);
      const names = new Map(g.steps.map((s) => [s.id, nodeName(s.step)]));
      return { steps: g.steps.map((s) => nodeName(s.step)), edges: g.edges.map((e) => [names.get(e.from) ?? e.from, names.get(e.to) ?? e.to, e.kind]) };
    };
    expect(shape(OPTIONAL)).toEqual(shape(PLAIN));
  });

  it('marks a step designated optional under its text, and no other step', () => {
    const marked = computeLayout(OPTIONAL, { theme: flow }).operations.filter((o) => o.mark).map((o) => [o.box.lines.join(' '), o.mark]);
    expect(marked).toEqual([['Toast the nuts', '(optional)']]);
  });

  it('marks a framed component after its name, without the qualifier, and an optional Choose on its pill', () => {
    expect(computeLayout(OPTIONAL, { theme: flow }).containers.map((c) => [c.title, c.note ?? null])).toEqual([
      ['Vegetables', null],
      ['Glaze', '(optional)'],
      ['Garnish', null],
    ]);
    expect(computeLayout(BOWL, { theme: flow }).containers.find((c) => c.title === 'Toppings')?.note).toBe('(optional)');
    expect(computeLayout(CRUMBLE, { theme: flow }).containers.map((c) => [c.title, c.choose, c.note ?? null])).toEqual([['Choose — Topping', true, '(optional)']]);
  });

  it('draws the mark in the SVG and the PDF, in the theme\'s word, and nothing new in a chart without one', () => {
    const svg = renderDag(OPTIONAL, { theme: flow });
    expect(svg.match(/>\(optional\)</g)?.length).toBe(2);
    expect(renderDag(PLAIN, { theme: flow })).not.toContain('dag-optional');
    const texts = drawList(computeLayout(OPTIONAL, { theme: flow }), readTheme(flow)).flatMap((d) => (d.type === 'text' ? [d.text] : []));
    expect(texts.filter((x) => x === '(optional)')).toHaveLength(2);
    const local = { ...flow, values: { ...flow.values, 'optional-label': 'facultatif' } };
    expect(renderDag(OPTIONAL, { theme: local })).toContain('>(facultatif)<');
  });

  it('adds no geometry flaw in the four chart styles', () => {
    const flaws = (recipe: Recipe, theme: ReturnType<typeof loadDagTheme>) => checkGeometry(computeLayout(recipe, { theme }), readTheme(theme), recipe).flaws.map((f) => f.detail);
    for (const style of listDagThemes()) {
      const theme = loadDagTheme(style);
      expect(flaws(OPTIONAL, theme), `dish, ${style}`).toEqual([]);
      expect(flaws(CRUMBLE, theme), `crumble, ${style}`).toEqual([]);
      // Dense crosses the Eggs frame with its Choose frame, marked or not: not the mark's doing.
      expect(flaws(BOWL, theme), `bowl, ${style}`).toEqual(flaws(PLAIN_BOWL, theme));
    }
  });
});
