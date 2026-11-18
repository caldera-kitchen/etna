// Where an amount on an arrow is written (SPEC §6): halfway
// along an arrow between neighboring boxes; near the start of a longer one, inside the frame it
// starts in when it fits; always with room around it, the right of the line (above a level
// run) before the left (below), and only then along the arrow.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout } from '../../src/dag/index.ts';
import { CLEAR, clearCaptions, wantedInside } from '../../src/dag/layout/labels.ts';
import { edgeLabel, edgeLength, joinsNeighbors, wantedAt } from '../../src/dag/layout/turn.ts';
import type { DetailedLayout, Point, Sizes } from '../../src/dag/layout/types.ts';
import { loadDagTheme } from '../../src/dag/node.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { defaultDagTheme } from '../../src/dag/index.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

// A vertical arrow 200 long and one 400 long, and a level one 400 long.
const down = (length: number, x = 100, y = 50): Point[] => [
  { x, y },
  { x, y: y + length },
];
const across: Point[] = [
  { x: 50, y: 300 },
  { x: 450, y: 300 },
];

describe('where along its arrow an amount is wanted', () => {
  it('is edge-label-at on an arrow up to edge-label-short long, between neighboring boxes', () => {
    expect(defaultDagTheme.values['edge-label-short']).toBe(300);
    expect(defaultDagTheme.values['edge-label-within']).toBe(72);
    expect(joinsNeighbors(down(200), 300)).toBe(true);
    expect(joinsNeighbors(down(300), 300)).toBe(true);
    expect(wantedAt(down(200), 0.5, 300, 72)).toBe(0.5);
    expect(wantedAt(down(200), 0.8, 300, 72)).toBe(0.8);
  });

  it('is no farther than edge-label-within from the start of a longer arrow', () => {
    expect(joinsNeighbors(down(400), 300)).toBe(false);
    expect(wantedAt(down(400), 0.5, 300, 72)).toBe(72 / 400);
    // Nearer, when edge-label-at says so.
    expect(wantedAt(down(400), 0.1, 300, 72)).toBe(0.1);
  });

  it('has no neighbors at edge-label-short 0, and no limit at edge-label-within 0', () => {
    expect(joinsNeighbors(down(200), 0)).toBe(false);
    expect(wantedAt(down(200), 0.5, 0, 72)).toBe(72 / 200);
    expect(wantedAt(down(400), 0.5, 300, 0)).toBe(0.5);
    expect(wantedAt(down(400), 0.5, 0, 0)).toBe(0.5);
  });
});

describe('an amount on a longer arrow, in the frame the arrow starts in', () => {
  // A frame 200 high; the arrow starts 20 into it and leaves it 180 along, 380 long in all.
  const frame = { x: 0, y: 0, width: 200, height: 200 };
  const arrow = down(380, 100, 20);

  it('is pulled back to before the arrow leaves the frame, when the amount fits', () => {
    // Its half width and room, 20 each side: written no farther than 160 along.
    expect(wantedInside(arrow, 0.5, [frame], 20)).toBeCloseTo(160 / 380, 10);
    // Already inside: unchanged.
    expect(wantedInside(arrow, 0.2, [frame], 20)).toBe(0.2);
  });

  it('ignores the frame when the amount does not fit before the arrow leaves it', () => {
    expect(wantedInside(arrow, 0.5, [frame], 100)).toBe(0.5);
  });

  it('is unchanged when the arrow starts in no frame, or never leaves its frame', () => {
    expect(wantedInside(arrow, 0.5, [], 20)).toBe(0.5);
    expect(wantedInside(arrow, 0.5, [{ x: 300, y: 0, width: 100, height: 100 }], 20)).toBe(0.5);
    expect(wantedInside(arrow, 0.5, [{ x: 0, y: 0, width: 500, height: 500 }], 20)).toBe(0.5);
  });

  it('keeps to the innermost frame the arrow starts in', () => {
    const outer = { x: 0, y: 0, width: 500, height: 500 };
    expect(wantedInside(arrow, 0.5, [outer, frame], 20)).toBeCloseTo(160 / 380, 10);
  });
});

describe('the room an amount keeps', () => {
  const theme = loadDagTheme('flow');
  const t = readTheme(theme);
  const cap = t.num('caption-font-size');
  const sizes = { t, captionSize: cap } as unknown as Sizes;
  const text = '250 g';
  const w = t.measure(t.num('font-weight'))(text) * cap * t.num('char-width');

  /**
   * Lay out `arrow` (a reference with an amount) among `others` (plain arrows) and `boxes`, on
   * a chart `width` by `height`, and write its amount.
   */
  const write = (arrow: Point[], others: Point[][] = [], boxes: { x: number; y: number; width: number; height: number }[] = [], width = 600, height = 600) => {
    const edges = [arrow, ...others].map((points, i) => ({ from: `a${i}`, to: `b${i}`, kind: i === 0 ? 'reference' : 'flow', points }));
    const caption: DetailedLayout['captions'][number] = { x: 0, y: 0, text, anchor: 'start', edge: true };
    const out = {
      width,
      height,
      boxes: [],
      edges,
      title: null,
      tables: [],
      operations: boxes.map((b, i) => ({ box: { id: `box${i}`, kind: 'operation', lines: [], ...b }, checkpoints: [], prep: false })),
      containers: [],
      separators: [],
      captions: [caption],
    } as DetailedLayout;
    clearCaptions(sizes, out, [], [{ caption, edge: edges[0] }]);
    return { x: caption.x, y: caption.y, anchor: caption.anchor };
  };
  const wanted = (arrow: Point[]) => {
    const { x, y, anchor } = edgeLabel(arrow, text, wantedAt(arrow, 0.5, 300, 72), cap);
    return { x, y, anchor };
  };
  const arrow = down(400);

  it('is written where it is wanted, right of a vertical arrow, when it has room there', () => {
    expect(wanted(arrow)).toEqual({ x: 106, y: 122 + cap * 0.35, anchor: 'start' });
    expect(write(arrow)).toEqual(wanted(arrow));
  });

  it('moves from its first place when another arrow is nearer than the room it needs', () => {
    // An arrow 3 units right of the amount's end: not touching it, but too near.
    const near = down(500, 106 + w + 3, 0);
    expect(3).toBeLessThan(CLEAR);
    // The left of the arrow, at the same place, before anywhere along it.
    expect(write(arrow, [near])).toEqual({ x: 94, y: wanted(arrow).y, anchor: 'end' });
  });

  it('keeps its room from a box in full, though the check would let it come nearer', () => {
    // A box 4.8 units right of the amount's end.
    expect(write(arrow, [], [{ x: 106 + w + 4.8, y: 0, width: 100, height: 600 }])).toEqual({ x: 94, y: wanted(arrow).y, anchor: 'end' });
    // And 5 units: room enough.
    expect(write(arrow, [], [{ x: 106 + w + 5, y: 0, width: 100, height: 600 }])).toEqual(wanted(arrow));
  });

  it('slides along its arrow to the nearest place with room when neither side has it', () => {
    // Arrows close on both sides down to 200: the first place with room is the first spot whose
    // text keeps 5 clear below 200 (spots every 4 back from the arrowhead at 450), on the right.
    const right = [{ x: 106 + w + 3, y: 0 }, { x: 106 + w + 3, y: 200 }];
    const left = [{ x: 94 - w - 3, y: 0 }, { x: 94 - w - 3, y: 200 }];
    expect(write(arrow, [right, left])).toEqual({ x: 106, y: 210 + cap * 0.35, anchor: 'start' });
  });

  it('may come as near its own arrow as before, and near the chart\'s own edge', () => {
    // Above a level arrow, its text ends less than 5 above the line: it stays.
    const level = write(across);
    expect(level).toEqual({ x: 50 + 72, y: 295, anchor: 'middle' });
    // On a chart that ends 2 units past the amount: it stays.
    expect(write(arrow, [], [], 106 + w + 2)).toEqual(wanted(arrow));
  });

  it('with no room anywhere, goes to the place that touches the fewest things, or stays', () => {
    // A box under the whole arrow: every place touches it, so the amount stays where it is wanted.
    const under = { x: 0, y: 0, width: 600, height: 600 };
    expect(write(arrow, [], [under])).toEqual(wanted(arrow));
    // With an arrow close on its right as well, the left touches one thing fewer: it goes there.
    expect(write(arrow, [down(600, 106 + w + 3, 0)], [under])).toEqual({ x: 94, y: wanted(arrow).y, anchor: 'end' });
  });
});

describe('the amounts in the cookbook', () => {
  const units = loadUnits();
  const recipeOf = (slug: string) => parseRecipe(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'), { units });

  it('104 g of mashed potato in the cinnamon rolls: left of its arrow, halfway (flow)', () => {
    // Its arrow, between neighboring boxes, is short; the right of it, halfway, is too near
    // the arrow from "Stir" into "Mix".
    const recipe = recipeOf('next-day-soft-cinnamon-rolls');
    const theme = loadDagTheme('flow');
    const t = readTheme(theme);
    const layout = computeLayout(recipe, { theme });
    const e = layout.edges.find((x) => x.from === 'cook-and-mash' && x.to === 'mix')!;
    expect(edgeLength(e.points)).toBeLessThanOrEqual(300);
    const label = layout.captions.find((c) => c.text === '104 g')!;
    expect(label).toEqual({ x: 732, y: 498.65, text: '104 g', anchor: 'end', edge: true });
    // Halfway to within the 4 units between the spots tried along an arrow (0.84 here), pinned
    // from a render looked at.
    expect(Math.abs(label.y - edgeLabel(e.points, '104 g', 0.5, t.num('caption-font-size')).y)).toBeLessThanOrEqual(2);
  });

  it('8 oz of chicken stock in the wedding soup: inside the Chicken Stock frame, near the start of its long arrow (flow)', () => {
    const recipe = recipeOf('italian-wedding-soup');
    const layout = computeLayout(recipe, { theme: loadDagTheme('flow') });
    const label = layout.captions.find((c) => c.text === '8 oz')!;
    expect(label).toEqual({ x: 778.4, y: 222.7, text: '8 oz', anchor: 'middle', edge: true });
    const frame = layout.containers.find((c) => c.box.id === 'component:chicken-stock')!.box;
    expect(label.x).toBeGreaterThan(frame.x);
    expect(label.x).toBeLessThan(frame.x + frame.width);
    expect(label.y).toBeGreaterThan(frame.y);
    expect(label.y).toBeLessThan(frame.y + frame.height);
  });

  it('touch nothing in the four bundled styles, on screen and on every sheet', () => {
    for (const slug of ['next-day-soft-cinnamon-rolls', 'italian-wedding-soup']) {
      const recipe = recipeOf(slug);
      for (const style of ['flow', 'dense', 'ink', 'station']) {
        for (const shape of ['screen', 'auto', 'portrait', 'landscape'] as const) {
          const theme = loadDagTheme(style);
          const layout = computeLayout(recipe, { theme, sheet: { shape } });
          const flaws = checkGeometry(layout, readTheme(theme), recipe).flaws.filter((f) => f.rule.startsWith('caption'));
          expect(flaws, `${slug} ${style} ${shape}`).toEqual([]);
        }
      }
    }
  });
});
