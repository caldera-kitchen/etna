// A link to a group (a component made only of sub-components) stands for each sub-component
// (SPEC §7, "Groups").

import { describe, expect, it } from 'vitest';
import { buildGraph, hasCycle, isGroup, outputsOf, parseRecipe, productCount, type Component, type Recipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { consolidate } from '../../src/list/index.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test\n\n${body}`, { units });
const step = (level: number, name: string, lines: string[] = []) =>
  `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}${lines.length ? '\n' : ''}Do it.\n\n`;
const refs = (r: Recipe, to: string) =>
  buildGraph(r)
    .edges.filter((e) => e.kind === 'reference' && e.to === to)
    .map((e) => e.from);

const TART = parse(
  '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') +
    '### Fruit\n\n#### Berries\n\n' + step(5, 'Macerate the berries') +
    '#### Jam\n\n' + step(5, 'Simmer the jam') +
    '## Shell\n\n' + step(3, 'Mix the pastry') +
    '### Cook the shell\n\n> **Choose** — one method.\n\n' + step(4, 'Bake blind') + step(4, 'Air-fry') +
    '## Assembly\n\n' + step(3, 'Fill', ['[shell](#shell)', '[fillings](#fillings)']) + step(3, 'Glaze', ['[fruit](#fruit)']),
);

describe('groups', () => {
  it('knows a group from a component with a step and from a Choose', () => {
    const [fillings, shell] = TART.nodes as Component[];
    expect(isGroup(fillings)).toBe(true);
    expect(isGroup(fillings.children[1])).toBe(true); // Fruit, nested
    expect(isGroup(shell)).toBe(false); // has a step of its own
    expect(isGroup(shell.children[1])).toBe(false); // Choose
  });

  it('expands a link to a group into every sub-component, nested groups all the way down, in order', () => {
    expect(refs(TART, 'fill')).toEqual(['bake-blind', 'air-fry', 'cook-the-custard', 'macerate-the-berries', 'simmer-the-jam']);
    expect(refs(TART, 'glaze')).toEqual(['macerate-the-berries', 'simmer-the-jam']);
    expect(outputsOf(TART.nodes[0]).map((s) => s.heading.anchor)).toEqual(['cook-the-custard', 'macerate-the-berries', 'simmer-the-jam']);
  });

  it('counts products: a group sums its sub-components, a Choose is one', () => {
    const [fillings, shell] = TART.nodes as Component[];
    expect(productCount(fillings)).toBe(3);
    expect(productCount(shell)).toBe(1); // last child is a Choose
    expect(productCount(shell.children[1])).toBe(1);
  });

  it('counts a group link as using every sub-component: none of them is left a sink', () => {
    const g = buildGraph(TART);
    expect(g.sinks).toEqual(['glaze']);
    expect(hasCycle(g)).toBe(false);
    expect(g.problems).toEqual([]);
  });

  it('leaves a component with a step unchanged: its last child, step or component', () => {
    const r = parse(
      '## Dough\n\n' + step(3, 'Mix') + '### Topping\n\n' + step(4, 'Toast nuts') + step(4, 'Chop nuts') +
        '## Bake\n\n' + step(3, 'Bake it', ['[dough](#dough)']),
    );
    expect(refs(r, 'bake-it')).toEqual(['chop-nuts']);
  });

  it('expands a group that is the last child of a component with a step', () => {
    const r = parse(
      '## Dough\n\n' + step(3, 'Mix') + '### Toppings\n\n#### Nuts\n\n' + step(5, 'Toast nuts') + '#### Seeds\n\n' + step(5, 'Toast seeds') +
        '## Bake\n\n' + step(3, 'Bake it', ['[dough](#dough)']),
    );
    expect(refs(r, 'bake-it')).toEqual(['toast-nuts', 'toast-seeds']);
    expect(productCount(r.nodes[0])).toBe(2);
  });

  it('reports a link to a group that holds the linking step as a cycle, and draws no edge for it', () => {
    const r = parse(
      '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') + '### Jam\n\n' + step(4, 'Simmer the jam', ['[fillings](#fillings)']),
    );
    const g = buildGraph(r);
    expect(g.problems.map((p) => p.reason)).toEqual(['cycle']);
    expect(g.edges.filter((e) => e.kind === 'reference')).toEqual([]);
    expect(hasCycle(g)).toBe(false);
  });

  it('reports a link to its own step as a cycle', () => {
    const r = parse(step(2, 'Stir', ['[stir](#stir)']));
    expect(buildGraph(r).problems.map((p) => p.reason)).toEqual(['cycle']);
  });

  it('reports a link to a component with no step as empty, without throwing', () => {
    // The parser never makes a component with no children; build one by hand.
    const r = parse('## Fillings\n\n### Custard\n\n' + step(4, 'Cook') + '## Assembly\n\n' + step(3, 'Fill', ['[fillings](#fillings)']));
    const fillings = r.nodes[0] as Component;
    const emptied: Recipe = { ...r, nodes: [{ ...fillings, children: [] }, r.nodes[1]] };
    expect(outputsOf(emptied.nodes[0])).toEqual([]);
    expect(productCount(emptied.nodes[0])).toBe(0);
    const g = buildGraph(emptied);
    expect(g.problems.map((p) => p.reason)).toEqual(['empty']);
    expect(g.edges.filter((e) => e.kind === 'reference')).toEqual([]);
  });

  it('leaves the shopping list alone: a group link, with or without an amount, is not an ingredient', () => {
    const body = (amount: string) =>
      '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard', ['250 g milk']) + '### Jam\n\n' + step(4, 'Simmer the jam', ['100 g sugar']) +
      '## Assembly\n\n' + step(3, 'Fill', [`${amount}[fillings](#fillings)`, '50 g sugar']);
    const list = (amount: string) => {
      const r = parse(body(amount));
      return consolidate([{ id: 'r', title: 'Test', recipe: r }]);
    };
    for (const amount of ['', '1/2 ']) {
      const l = list(amount);
      expect(JSON.stringify(l.items)).toBe(JSON.stringify(list('').items));
      const sugar = l.items.find((i) => i.item === 'sugar')!;
      expect(sugar.amounts.map((a) => [a.quantity?.raw, a.unit?.symbol, a.lines])).toEqual([['150', 'g', 2]]);
      expect(l.items.map((i) => i.item).sort()).toEqual(['milk', 'sugar']);
      expect(l.recipes).toEqual([]);
    }
  });

  it('feeds every sub-component of a Choose branch that is a group from the step before the Choose', () => {
    const r = parse(
      step(2, 'Prepare') +
        '## Finish\n\n> **Choose** — one way.\n\n### Two-part\n\n#### Topping\n\n' + step(5, 'Make topping') +
        '#### Coating\n\n##### Glaze\n\n' + step(6, 'Make glaze') + '##### Dust\n\n' + step(6, 'Dust it') +
        '### Plain\n\n' + step(4, 'Leave plain') + step(2, 'Serve'),
    );
    const g = buildGraph(r);
    const fed = g.edges.filter((e) => e.kind === 'choose' && e.from === 'prepare').map((e) => e.to);
    expect(fed).toEqual(['make-topping', 'make-glaze', 'dust-it', 'leave-plain']);
    expect(g.edges.filter((e) => e.to === 'serve').map((e) => e.from)).toEqual(['make-topping', 'make-glaze', 'dust-it', 'leave-plain']);
    expect(g.problems).toEqual([]);
    expect(hasCycle(g)).toBe(false);
  });

  it('feeds both sub-components of a two-part group branch: two edges from the preceding step', () => {
    const r = parse(
      step(2, 'Prepare') +
        '## Finish\n\n> **Choose** — one way.\n\n### Two-part\n\n#### Topping\n\n' + step(5, 'Make topping') +
        '#### Glaze\n\n' + step(5, 'Make glaze') + '### Plain\n\n' + step(4, 'Leave plain'),
    );
    const into = (to: string) => buildGraph(r).edges.filter((e) => e.from === 'prepare' && e.to === to);
    expect(into('make-topping')).toHaveLength(1);
    expect(into('make-glaze')).toHaveLength(1);
  });
});
