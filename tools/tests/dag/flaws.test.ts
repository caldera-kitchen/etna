// The last geometry flaws of the charts, one test per fix: each would have failed before it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout, type DagTheme } from '../../src/dag/index.ts';
import { spotsAlong } from '../../src/dag/layout/labels.ts';
import { crossingCount } from '../../src/dag/layout/place.ts';
import { edgeLabel } from '../../src/dag/layout/turn.ts';
import { loadDagTheme } from '../../src/dag/node.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test Loaf\n\n${body}`, { units });
const styled = (style: string, values: Record<string, string>): DagTheme => {
  const base = loadDagTheme(style);
  return { ...base, values: { ...base.values, ...values } };
};

describe('an edge along a row', () => {
  it('runs level after rounding, even where its two ends are each a node of a different height', () => {
    // Dense, with a margin that puts the row's middle on a half hundredth: each end, computed
    // from its own node, used to round 0.01 apart, and the spine's hop was drawn as a slant.
    const recipe = parse(
      '## Steps\n\n### Mix\n\n- 10 g flour\n- 5 g salt\n- 3 g yeast\n\nMix.\n\n### Rest the dough until it has doubled\n\nRest.\n\n' +
        '### Fold\n\nFold.\n\n### Knead\n\n- 10 g water\n- 2 g yeast\n- 1 g salt\n\nKnead.\n\n### Shape\n\nShape.\n\n### Bake\n\nBake.\n',
    );
    for (const margin of ['10.02', '10.24', '10.27']) {
      const layout = computeLayout(recipe, { theme: styled('dense', { 'third-column': 'always', columns: '1', margin }) });
      const hop = layout.edges.find((e) => e.from === 'mix' && e.to === 'rest-the-dough-until-it-has-doubled')!;
      expect(hop.points.length, `margin ${margin}`).toBe(2);
      expect(hop.points[1].y, `margin ${margin}`).toBe(hop.points[0].y);
    }
  });
});

describe('the amount on an edge', () => {
  // A quantified reference: its amount is written beside the edge into "Fold".
  const recipe = parse(
    '## Batter\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Rest\n\nRest.\n\n### Whisk\n\n- 5 g yeast\n\nWhisk.\n\n' +
      '## Assembly\n\n### Combine\n\n- 100 g butter\n\nCombine.\n\n### Fold\n\n- 250 g [batter](#batter)\n\nFold.\n\n### Bake\n\nBake.\n',
  );
  const flawsOf = (values: Record<string, string>): string[] => {
    const theme = styled('flow', values);
    const layout = computeLayout(recipe, { theme });
    return checkGeometry(layout, readTheme(theme), recipe).flaws.filter((f) => f.ids.includes('caption:250 g')).map((f) => f.detail);
  };
  it('stays where it is wanted when that place has room', () => {
    // The edge, 336 long, counted as joining neighbors: its amount is wanted where
    // edge-label-at says.
    for (const values of [{ 'edge-label-at': '0.3', 'edge-label-short': '400' }] as Record<string, string>[]) {
      const theme = styled('flow', values);
      const t = readTheme(theme);
      const layout = computeLayout(recipe, { theme });
      const label = layout.captions.find((c) => c.text === '250 g')!;
      const e = layout.edges.find((x) => x.from === 'whisk' && x.to === 'fold')!;
      expect(label, JSON.stringify(values)).toEqual(edgeLabel(e.points, '250 g', t.num('edge-label-at'), t.num('caption-font-size')));
      expect(flawsOf(values)).toEqual([]);
    }
  });
  it('moves along its edge to a clear spot when its own spot is not', () => {
    // Halfway, its spot crosses the Assembly frame's border (mirrored too); at the arrowhead
    // (`edge-label-at: 1`) it is on the node it points at. Both with the edge counted as
    // joining neighbors; by default, the edge being long, near its start.
    for (const values of [{}, { 'ingredient-side': 'right' }, { 'edge-label-short': '400' }, { 'edge-label-at': '1', 'edge-label-short': '400' }] as Record<string, string>[]) {
      expect(flawsOf(values), JSON.stringify(values)).toEqual([]);
    }
  });
});

describe('the name of a branch or of a Choose alternative', () => {
  const captionFlaws = (recipe: Recipe, style: string, values: Record<string, string>): string[] => {
    const theme = styled(style, values);
    const layout = computeLayout(recipe, { theme });
    return checkGeometry(layout, readTheme(theme), recipe).flaws.filter((f) => f.rule.startsWith('caption')).map((f) => f.detail);
  };
  const SETS: Record<string, string>[] = [
    {},
    { columns: '1', 'third-column': 'always' },
    { columns: '2', 'third-column': 'never' },
    { columns: '3', 'third-column': 'never' },
    { 'ingredient-side': 'right' },
  ];

  it('over a node with no ingredients, moves clear of the edge into the node and stays in its frame', () => {
    // The first alternative's name is longer than its node: over the node's left corner it ran
    // through the edge coming down into the node and out of the Choose frame (and, folded, off
    // the canvas). It moves over the empty ingredient column, ending left of that edge or at
    // the node's right corner.
    const recipe = parse(
      '## Mix\n\n- 500 g flour\n- 10 g salt\n\nMix.\n\n## Rest\n\nRest.\n\n## Cook\n\n> **Choose** — one.\n\n' +
        '### A long way round in a slow oven\n\n#### Shape the dough\n\nShape.\n\n#### Bake slowly\n\nBake.\n\n' +
        '### Quickly in a pan\n\n#### Shape flat\n\nShape.\n\n#### Fry\n\nFry.\n',
    );
    for (const style of ['flow', 'dense', 'ink', 'station']) for (const values of SETS) expect(captionFlaws(recipe, style, values), `${style} ${JSON.stringify(values)}`).toEqual([]);
  });

  it('over an ingredient box, has the edge coming in over the top from the left run above it', () => {
    // Dense, folded: the Choose edges come in from the column on the left over each
    // alternative's ingredient box, and the second ran through "Quick Way".
    const recipe = parse(
      '## Cook the bacon\n\n- 113 g bacon\n\nCook.\n\n## Cook the onion\n\n- 1 onion\n\nCook.\n\n## Add garlic\n\n- 2 cloves garlic\n- 2 jalapenos\n\nAdd.\n\n' +
        '## Stir in the tomatoes\n\n- 15 oz tomatoes\n\nStir.\n\n## Beans\n\n> **Choose** — one.\n\n' +
        '### Slow Way\n\n#### Cook slowly\n\n- 16 oz beans\n- 7 cups water\n\nCook.\n\n### Quick Way\n\n#### Simmer\n\n- 16 oz beans\n- 10 cups water\n\nSimmer.\n\n' +
        '## Salt and blend\n\n- 1 tsp salt\n\nBlend.\n\n## Stir in the herbs\n\n- 1 cup herbs\n\nStir.\n',
    );
    expect(captionFlaws(recipe, 'dense', { columns: '2', 'third-column': 'never' })).toEqual([]);
    for (const style of ['flow', 'dense', 'ink', 'station']) for (const values of SETS) expect(captionFlaws(recipe, style, values), `${style} ${JSON.stringify(values)}`).toEqual([]);
  });
});

describe('the spots an amount may move to along its edge', () => {
  // An edge down 40 from (0, 0), then right 40: 80 long, its middle at the corner (0, 40).
  const L = [
    { x: 0, y: 0 },
    { x: 0, y: 40 },
    { x: 40, y: 40 },
  ];
  const key = (s: { x: number; y: number; anchor?: string }) => `${s.x},${s.y},${s.anchor}`;

  it('come nearest the arrowhead first at 1, the order they always had', () => {
    const spots = spotsAlong(L, 10, 1);
    // Above, then below the horizontal run at the arrowhead (40, 40).
    expect(spots.slice(0, 2)).toEqual([
      { x: 40, y: 35, anchor: 'middle' },
      { x: 40, y: 50.5, anchor: 'middle' },
    ]);
    expect(spotsAlong(L, 10)).toEqual(spots);
  });

  it('come nearest the source first at 0', () => {
    // Right, then left of the vertical run at the source (0, 0).
    expect(spotsAlong(L, 10, 0).slice(0, 2)).toEqual([
      { x: 6, y: 3.5, anchor: 'start' },
      { x: -6, y: 3.5, anchor: 'end' },
    ]);
  });

  it('come nearest the middle first at 0.5, then outward both ways', () => {
    const spots = spotsAlong(L, 10, 0.5);
    // The corner is met twice, at the end of each run: the horizontal run's spots come first,
    // as they did, then the vertical run's.
    expect(spots.slice(0, 4)).toEqual([
      { x: 0, y: 35, anchor: 'middle' },
      { x: 0, y: 50.5, anchor: 'middle' },
      { x: 6, y: 43.5, anchor: 'start' },
      { x: -6, y: 43.5, anchor: 'end' },
    ]);
    // Then 4 along the edge either way: toward the arrowhead first, as the walk meets it.
    expect(spots.slice(4, 8)).toEqual([
      { x: 4, y: 35, anchor: 'middle' },
      { x: 4, y: 50.5, anchor: 'middle' },
      { x: 6, y: 39.5, anchor: 'start' },
      { x: -6, y: 39.5, anchor: 'end' },
    ]);
  });

  it('are the same spots in every order, and spots equally near keep the old order', () => {
    const old = spotsAlong(L, 10, 1).map(key);
    for (const at of [0, 0.25, 0.5, 0.75]) {
      const spots = spotsAlong(L, 10, at).map(key);
      expect([...spots].sort(), String(at)).toEqual([...old].sort());
      // Both sides of one point are equally near: right before left, above before below.
      for (let k = 0; k < spots.length; k += 2) expect(old.indexOf(spots[k]), `${at} ${k}`).toBeLessThan(old.indexOf(spots[k + 1]));
    }
  });
});

describe('a moved amount in a cookbook chart', () => {
  it('stays near the middle of its edge: 104 g of mashed potato in the cinnamon rolls (flow)', () => {
    // Its own place, half way along (edge-label-at 0.5), is taken; it used to move to the
    // clear spot nearest the arrowhead, 0.87 of the way along. Now the spot with room nearest
    // half way (tests/dag/amounts.test.ts pins it).
    const recipe = parseRecipe(readFileSync(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'), 'utf8'), { units });
    const theme = loadDagTheme('flow');
    const t = readTheme(theme);
    const layout = computeLayout(recipe, { theme });
    const e = layout.edges.find((x) => x.from === 'cook-and-mash' && x.to === 'mix')!;
    const label = layout.captions.find((c) => c.text === '104 g')!;
    expect(label).not.toEqual(edgeLabel(e.points, '104 g', t.num('edge-label-at'), t.num('caption-font-size')));
    const runs = e.points.slice(1).map((q, k) => ({ p: e.points[k], q, len: Math.hypot(q.x - e.points[k].x, q.y - e.points[k].y) }));
    const total = runs.reduce((sum, r) => sum + r.len, 0);
    // How far along the edge the spot nearest the label lies, as a share of the edge.
    let best = { dist: Infinity, at: 0 };
    let before = 0;
    for (const r of runs) {
      for (let d = 0; d <= r.len; d++) {
        const x = r.p.x + ((r.q.x - r.p.x) * d) / r.len;
        const y = r.p.y + ((r.q.y - r.p.y) * d) / r.len;
        const dist = Math.hypot(x - label.x, y - label.y);
        if (dist < best.dist) best = { dist, at: (before + d) / total };
      }
      before += r.len;
    }
    expect(Math.abs(best.at - 0.5)).toBeLessThan(0.1);
    expect(checkGeometry(layout, t, recipe).flaws.filter((f) => f.ids.includes('caption:104 g'))).toEqual([]);
  });
});

describe("a container's name, mirrored (`ingredient-side: right`)", () => {
  it("moves along the frame's top clear of an edge that comes down through it, and only then", () => {
    // Turned over, the lane down to "Fold" runs on the left of the spine, through the
    // Assembly frame's name at the left of its top.
    const recipe = parse(
      '## Batter\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Rest\n\nRest.\n\n### Whisk\n\n- 5 g yeast\n\nWhisk.\n\n' +
        '## Assembly\n\n### Combine\n\n- 100 g butter\n\nCombine.\n\n### Fold\n\n- 250 g [batter](#batter)\n\nFold.\n\n### Bake\n\nBake.\n',
    );
    for (const style of ['flow', 'dense', 'ink', 'station']) {
      const theme = styled(style, { 'ingredient-side': 'right' });
      const layout = computeLayout(recipe, { theme });
      const flaws = checkGeometry(layout, readTheme(theme), recipe).flaws.filter((f) => f.rule === 'edge-through-pill' || f.rule.startsWith('pill'));
      expect(flaws.map((f) => f.detail), style).toEqual([]);
      const inset = (id: string) => layout.containers.find((c) => c.box.id === id)!.inset;
      expect(inset('component:assembly'), style).toBeGreaterThan(18);
      // Nothing runs through the Batter frame's name: it stays where it always was.
      expect(inset('component:batter'), style).toBeUndefined();
    }
  });
});

describe('the order of the lanes', () => {
  // One step fans out into three Choose alternatives in the next column: packed shortest
  // first, the three edges up the gutter crossed three times; in the other order, none.
  const recipe = parse(
    '## Warm\n\n- 4 eggs\n- 200 g sugar\n\nWarm.\n\n## Beat\n\nBeat.\n\n## Add the butter\n\n- 450 g butter\n\nAdd.\n\n## Finish\n\n- 1 g salt\n\nFinish.\n\n' +
      '## Flavor\n\n> **Choose** — one.\n\n### Chocolate\n\n#### Melt the chocolate\n\n- 6 oz chocolate\n\nMelt.\n\n' +
      '### Lemon\n\n#### Add the lemon curd\n\n- 1 cup lemon curd\n\nAdd.\n\n### Berry\n\n#### Puree the berries\n\n- 1 pint berries\n- 50 g sugar\n\nPuree.\n',
  );
  it('is changed when another order crosses fewer edges, at the same width', () => {
    for (const style of ['flow', 'dense', 'ink', 'station']) {
      const theme = styled(style, { columns: '2', 'third-column': 'always' });
      const layout = computeLayout(recipe, { theme });
      const { crossings, flaws } = checkGeometry(layout, readTheme(theme), recipe);
      expect(crossings, style).toBe(0);
      expect(flaws, style).toEqual([]);
    }
  });
  it('counts crossings as the geometry check does', () => {
    const theme = styled('flow', { columns: '4', 'third-column': 'never' });
    const layout = computeLayout(recipe, { theme });
    expect(crossingCount(layout.edges)).toBe(checkGeometry(layout, readTheme(theme), recipe).crossings);
    const cross = [
      { points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] },
      { points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] },
    ];
    expect(crossingCount(cross)).toBe(1);
  });
});

describe('an edge that leaves a Choose through the bottom', () => {
  // Folded into two columns, the spine is cut under the Choose: its last alternative's edge
  // leaves through the node's bottom and turns toward the next column. It used to turn 14
  // under the row, on the Choose frame's bottom border (Easter Bread's KitchenAid, at landscape).
  const recipe = parse(
    '## Dough\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Knead\n\n> **Choose**\n\n#### By hand\n\n##### Knead by hand\n\nKnead.\n\n' +
      '#### Mixer\n\n##### Knead in the mixer\n\nKnead.\n\n### Rise\n\nRise.\n\n### Shape\n\nShape.\n\n### Bake\n\nBake.\n',
  );
  it('turns clear of the frame, below it when there is room', () => {
    for (const style of ['flow', 'dense', 'ink', 'station']) {
      const theme = styled(style, { columns: '2' });
      const layout = computeLayout(recipe, { theme });
      const flaws = checkGeometry(layout, readTheme(theme), recipe).flaws.map((f) => f.detail);
      expect(flaws, style).toEqual([]);
      if (style !== 'flow') continue;
      const e = layout.edges.find((x) => x.from === 'knead-in-the-mixer' && x.to === 'rise')!;
      const frame = layout.containers.find((c) => c.box.id === 'choose:knead')!.box;
      expect(e.points[1].y - (frame.y + frame.height)).toBeGreaterThanOrEqual(4);
    }
  });
});
