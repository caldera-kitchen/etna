// Lanes: where joining edges run down beside the operations. An edge to a container further
// down the same column runs down the channel inside the containers, and lanes are packed so an
// edge takes the innermost lane free over its height.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout, layoutDag, type DagTheme } from '../../src/dag/index.ts';
import { crossingCount, packLanes, type Stretch } from '../../src/dag/layout/place.ts';
import type { Sizes } from '../../src/dag/layout/types.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test Cake\n\n${body}`, { units });
const flow: DagTheme = { name: 'flow', values: {} };
/** Flow in its plain layout (the third column, one column), for the tests of third-column shapes. */
const plain: DagTheme = { name: 'flow', values: { 'third-column': 'always', columns: '1' } };
type Layout = ReturnType<typeof layoutDag>;
const box = (l: Layout, id: string) => l.boxes.find((b) => b.id === id)!;
const edge = (l: Layout, from: string, to: string) => l.edges.find((e) => e.from === from && e.to === to)!;
/** The x of an edge's lane: the vertical run of a three-turn joining edge. */
const laneOf = (l: Layout, from: string, to: string): number => edge(l, from, to).points[1].x;

/** Pairs of different edges with vertical runs on one line whose heights overlap. */
function shared(l: Layout): string[] {
  const runs = l.edges.flatMap((e) =>
    e.points.slice(1).flatMap((q, k) => {
      const p = e.points[k];
      return Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) > 2 ? [{ name: `${e.from}>${e.to}`, x: p.x, lo: Math.min(p.y, q.y), hi: Math.max(p.y, q.y) }] : [];
    }),
  );
  const found: string[] = [];
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (a.name !== b.name && Math.abs(a.x - b.x) < 0.01 && Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 0) found.push(`${a.name} & ${b.name}`);
    }
  return found;
}

const BATTER =
  '## Batter\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Rest\n\nRest.\n\n### Whisk\n\n- 5 g yeast\n\nWhisk.\n\n' +
  '## Assembly\n\n### Combine\n\n- 100 g butter\n\nCombine.\n\n### Fold\n\n- [batter](#batter)\n\nFold.\n\n' +
  '### Top\n\n- 5 g sugar\n\nTop.\n\n### Bake\n\nBake.\n';

describe('lanes', () => {
  it('drops an edge straight into a third-column node whose column is clear above it', () => {
    const l = layoutDag(
      parse(
        '## Syrup\n\n### Boil the syrup\n\n- 1 g sugar\n\nBoil.\n\n### Add the cream\n\n- 1 g cream\n\nAdd.\n\n' +
          '## Foam\n\n### Whip the foam\n\n- 1 g cream\n\nWhip.\n\n' +
          '## Assembly\n\n### Blend the slush\n\n- [syrup](#syrup)\n- 1 g water\n\nBlend.\n\n### Top with foam\n\n- [foam](#foam)\n\nTop.\n',
      ),
      { theme: plain },
    );
    const top = box(l, 'top-with-foam');
    const foam = edge(l, 'whip-the-foam', 'top-with-foam');
    // Out along its row, then straight down into the node's top center: three points, no lane.
    expect(foam.points).toHaveLength(3);
    expect(foam.points[1].y).toBe(foam.points[0].y);
    expect(foam.points[2].x).toBe(foam.points[1].x);
    expect(foam.points[2].x).toBeCloseTo(top.x + top.width / 2, 1);
    expect(foam.points[2].y).toBeCloseTo(top.y, 1);
    // The syrup edge still takes a lane into the spine node, and the two never share a vertical.
    expect(edge(l, 'add-the-cream', 'blend-the-slush').points.length).toBeGreaterThan(3);
    expect(shared(l)).toEqual([]);
  });

  it('keeps the lane when a third-column node sits between the source and the target', () => {
    const l = layoutDag(
      parse(
        '## Syrup\n\n### Boil the syrup\n\n- 1 g sugar\n\nBoil.\n\n' +
          '## Assembly\n\n### Blend the slush\n\n- 1 g water\n\nBlend.\n\n### Chill\n\nChill it.\n\n### Pour\n\n- 1 g ice\n\nPour.\n\n### Top with syrup\n\n- [syrup](#syrup)\n\nTop.\n',
      ),
      { theme: flow },
    );
    const top = box(l, 'top-with-syrup');
    const e = edge(l, 'boil-the-syrup', 'top-with-syrup');
    const drop = e.points.length === 3 && Math.abs(e.points[2].x - (top.x + top.width / 2)) < 0.1;
    // Either the node is not in the third column at all, or something stands above it: never a straight drop through a box.
    if (drop) {
      const vertical = { x: e.points[2].x, lo: e.points[1].y, hi: e.points[2].y };
      const crossed = l.boxes.filter((b) => b.kind === 'operation' && b.id !== e.to && b.x < vertical.x && vertical.x < b.x + b.width && b.y < vertical.hi && b.y + b.height > vertical.lo);
      expect(crossed).toEqual([]);
    }
  });

  it('runs an edge to a container below down the channel beside the operations, not beyond the containers', () => {
    // Bake sits in the third column, so the containers are wide; the edge still turns down
    // just right of Whisk, inside both containers.
    const l = layoutDag(parse(BATTER), { theme: plain });
    const container = box(l, 'component:batter');
    const whisk = box(l, 'whisk');
    expect(box(l, 'bake').x).toBeGreaterThan(whisk.x + whisk.width);
    const lane = laneOf(l, 'whisk', 'fold');
    expect(lane).toBeGreaterThan(whisk.x + whisk.width);
    expect(lane).toBeLessThanOrEqual(whisk.x + whisk.width + 56 / 2 + 0.01);
    expect(lane).toBeLessThan(box(l, 'bake').x);
    expect(Math.max(...edge(l, 'whisk', 'fold').points.map((p) => p.x))).toBeLessThan(container.x + container.width);
  });

  it('runs an edge past a container between its two out to the gutter, through no frame', () => {
    // As BATTER, with a glaze between the batter and the assembly: the edge from the batter
    // to the assembly may not run down the channel through the glaze's frame.
    const recipe = parse(
      BATTER.replace('## Assembly', '## Glaze\n\n### Melt\n\n- 5 g chocolate\n\nMelt.\n\n### Stir\n\n- 5 g cream\n\nStir.\n\n## Assembly').replace(
        '- [batter](#batter)\n',
        '- [batter](#batter)\n- [glaze](#glaze)\n',
      ),
    );
    const l = computeLayout(recipe, { theme: plain });
    const [batter, glaze, assembly] = ['batter', 'glaze', 'assembly'].map((id) => box(l, `component:${id}`));
    expect(glaze.y).toBeGreaterThan(batter.y + batter.height);
    expect(assembly.y).toBeGreaterThan(glaze.y + glaze.height);
    const right = Math.max(batter.x + batter.width, glaze.x + glaze.width, assembly.x + assembly.width);
    // Past the glaze: out beyond the containers' right edge, in the gutter.
    expect(Math.max(...edge(l, 'whisk', 'fold').points.map((p) => p.x))).toBeGreaterThan(right);
    // From the glaze, the next container: still down the channel, inside the frames.
    const stir = box(l, 'stir');
    const lane = laneOf(l, 'stir', 'fold');
    expect(lane).toBeGreaterThan(stir.x + stir.width);
    expect(Math.max(...edge(l, 'stir', 'fold').points.map((p) => p.x))).toBeLessThan(assembly.x + assembly.width);
    expect(checkGeometry(l, readTheme(plain), recipe).flaws.filter((f) => f.rule === 'edge-through-frame')).toEqual([]);
    expect(shared(l)).toEqual([]);
  });

  it('reuses the innermost lane for edges at different heights, keeping them apart', () => {
    const l = layoutDag(
      parse(
        '## Batter\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Whisk\n\n- 5 g yeast\n\nWhisk.\n\n' +
          '## Assembly\n\n### Combine\n\n- 100 g butter\n\nCombine.\n\n### Fold\n\n- [batter](#batter)\n\nFold.\n\n' +
          '### Chill\n\n- 5 g sugar\n\nChill.\n\n### Roll\n\n- 5 g flour\n\nRoll.\n\n### Fill\n\n- [the chilled dough](#chill)\n- 5 g jam\n\nFill.\n',
      ),
      { theme: flow },
    );
    expect(laneOf(l, 'whisk', 'fold')).toBe(laneOf(l, 'chill', 'fill'));
    expect(shared(l)).toEqual([]);
  });

  it('never runs two edges down one lane at the same height (`join-edges: separate`)', () => {
    for (const slug of readdirSync(join(ETNA_ROOT, 'cookbook')).filter((name) => existsSync(join(ETNA_ROOT, 'cookbook', name, 'recipe.md')))) {
      const recipe = parseRecipe(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'), { units });
      if (recipe.form !== 'structured') continue;
      for (const values of [{}, { columns: '1' }, { columns: '2' }, { columns: '3', 'third-column': 'never' }] as Record<string, string>[]) {
        expect([slug, shared(layoutDag(recipe, { theme: { name: 'flow', values } }))]).toEqual([slug, []]);
      }
    }
  });
});

describe('a box that feeds several boxes', () => {
  // `a` feeds `b`, `c` and `d`, none of them the next box down: three edges out of one box.
  const FORK = parse(
    '## Part one\n\n### a\n\n- 1 g sugar\n\nStir.\n\n' +
      '## Part two\n\n### b\n\n- [part one](#part-one)\n- 1 g water\n\nStir.\n\n' +
      '### c\n\n- [part one](#part-one)\n- 1 g salt\n\nStir.\n\n### d\n\n- [part one](#part-one)\n- 1 g flour\n\nStir.\n',
  );
  const out = (l: Layout) => ['b', 'c', 'd'].map((to) => edge(l, 'a', to));

  it('gives each edge its own point of exit and its own lane, none crossing another (`join-edges: separate`)', () => {
    for (const values of [{}, { columns: '2' }, { columns: '3', 'third-column': 'never' }] as Record<string, string>[]) {
      const theme: DagTheme = { name: 'flow', values };
      const l = computeLayout(FORK, { theme });
      const edges = out(l);
      const starts = edges.map((e) => `${e.points[0].x},${e.points[0].y}`);
      expect(new Set(starts).size).toBe(3);
      // Each runs out at its own height, so no two run along one line, nor cross.
      expect(new Set(edges.map((e) => e.points[1].y)).size).toBe(3);
      expect(shared(l)).toEqual([]);
      expect(crossingCount(edges)).toBe(0);
      expect(checkGeometry(l, readTheme(theme), FORK).flaws).toEqual([]);
    }
  });

  it('leaves the edges one point to share with `join-edges: bus`', () => {
    const l = layoutDag(FORK, { theme: { name: 'flow', values: { 'join-edges': 'bus' } } });
    expect(new Set(out(l).map((e) => `${e.points[0].x},${e.points[0].y}`)).size).toBe(1);
  });
});

describe('lanes in entry order', () => {
  // Tres Leches at portrait fit, in Flow: two edges come into one row at one height from
  // opposite sides of the channel, and a third runs beside them. Packed by length alone, the
  // edge that turns left into the spine node took a lane right of the one that turns right, and
  // their level runs lay on one line where they overlapped.
  const lanes = (reorder: boolean): Record<string, number> => {
    const got: Record<string, number> = {};
    const stretch = (key: string, a: number, b: number, aLeft: boolean, bLeft: boolean): Stretch => ({ key, a, b, aLeft, bLeft, set: (lane) => (got[key] = lane) });
    const list = [
      stretch('sift>add-the-flour-mixture', 193.5, 934.3, true, true),
      stretch('blend>soak-the-cake', 335.7, 994.3, true, false),
      stretch('blend>soak-and-chill', 335.7, 934.3, true, false),
    ];
    packLanes({ laneGap: 14 } as Sizes, list, reorder);
    return got;
  };
  it('the edge that turns left at a height takes a lane left of the one that turns right there', () => {
    for (const reorder of [false, true]) {
      const got = lanes(reorder);
      expect(got['sift>add-the-flour-mixture']).toBeLessThan(got['blend>soak-and-chill']);
    }
  });
});
