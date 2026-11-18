// Charts of links to groups (SPEC §7 "Groups"): one edge from each sub-component's output into
// the linking step; a Choose keeps its Choose group.

import { describe, expect, it } from 'vitest';
import { buildGraph, parseRecipe, type Recipe } from '../../src/core/index.ts';
import { layoutDag, renderDag } from '../../src/dag/index.ts';
import { computeLayout } from '../../src/dag/layout/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test Tart\n\n${body}`, { units });
const step = (level: number, name: string, lines: string[] = ['100 g sugar']) =>
  `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}${lines.length ? '\n' : ''}Do it.\n\n`;

const FILLINGS =
  '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') +
  '### Fruit\n\n#### Berries\n\n' + step(5, 'Macerate the berries') + '#### Jam\n\n' + step(5, 'Simmer the jam');
const SHELL =
  '## Shell\n\n' + step(3, 'Mix the pastry') +
  '### Cook the shell\n\n> **Choose** — one method.\n\n' + step(4, 'Bake blind', []) + step(4, 'Air-fry', []);
const TART = parse(
  FILLINGS + SHELL + '## Assembly\n\n' + step(3, 'Fill', ['[shell](#shell)', '[fillings](#fillings)']) + step(3, 'Glaze', ['[fruit](#fruit)']),
);

type Layout = ReturnType<typeof layoutDag>;
const EPS = 0.011;

/**
 * Every edge segment that passes through the inside of a box, other than its own target at its
 * last point and its own source at its first (with `join-edges: separate`, an edge into a
 * node's side off its middle stops on the shape's outline, inside the box, and one out of it
 * off its middle starts there).
 */
function crossings(layout: Layout): string[] {
  const solid = layout.boxes.filter((b) => b.kind !== 'component');
  const found: string[] = [];
  for (const e of layout.edges) {
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1];
      const b = e.points[i];
      for (const s of solid) {
        if (i === e.points.length - 1 && s.id === e.to) continue;
        if (i === 1 && s.id === e.from) continue;
        const x1 = Math.max(Math.min(a.x, b.x), s.x);
        const x2 = Math.min(Math.max(a.x, b.x), s.x + s.width);
        const y1 = Math.max(Math.min(a.y, b.y), s.y);
        const y2 = Math.min(Math.max(a.y, b.y), s.y + s.height);
        const through =
          a.y === b.y ? a.y > s.y + EPS && a.y < s.y + s.height - EPS && x2 - x1 > EPS : a.x > s.x + EPS && a.x < s.x + s.width - EPS && y2 - y1 > EPS;
        if (through) found.push(`${e.from}>${e.to} through ${s.id}`);
      }
    }
  }
  return found;
}

const into = (layout: Layout, to: string) =>
  layout.edges
    .filter((e) => e.to === to && e.kind === 'reference')
    .map((e) => e.from)
    .sort();

describe('group links in the chart', () => {
  it('draws one edge from every sub-component output into the linking step, through no box', () => {
    const layout = layoutDag(TART);
    expect(into(layout, 'fill')).toEqual(['air-fry', 'bake-blind', 'cook-the-custard', 'macerate-the-berries', 'simmer-the-jam']);
    expect(into(layout, 'glaze')).toEqual(['macerate-the-berries', 'simmer-the-jam']);
    expect(crossings(layout)).toEqual([]);
  });

  it('keeps the Choose as a group and draws no group box for a group link', () => {
    const layout = layoutDag(TART);
    const groups = layout.boxes.filter((b) => b.id.startsWith('choose:'));
    expect(groups.map((b) => b.id)).toEqual(['choose:cook-the-shell']);
    expect(layout.boxes.some((b) => b.id === 'choose:fillings' || b.id === 'choose:fruit')).toBe(false);
  });

  it('names a nested group and its first sub-component in one caption', () => {
    const captions = computeLayout(TART).captions.map((c) => c.text);
    expect(captions).toContain('Fruit — Berries');
    expect(captions).toContain('Jam');
  });

  it('draws a group link in a flat chart too (a small group beside loose steps)', () => {
    const r = parse(
      '## Sauces\n\n### Red\n\n' + step(4, 'Cook red') + '### Green\n\n' + step(4, 'Blend green') +
        step(2, 'Boil pasta') + step(2, 'Serve', ['[sauces](#sauces)']),
    );
    const layout = layoutDag(r);
    expect(into(layout, 'serve')).toEqual(['blend-green', 'cook-red']);
    expect(crossings(layout)).toEqual([]);
    expect(buildGraph(r).sinks).toEqual(['serve']);
  });

  it('renders, without throwing, a group link that holds the linking step', () => {
    const r = parse('## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') + '### Jam\n\n' + step(4, 'Simmer the jam', ['[fillings](#fillings)']));
    expect(renderDag(r)).toContain('<svg');
  });
});
