// The geometry check (src/dag/check.ts) as a standing invariant.
//
// 1. Every example × every bundled chart style × the option sets below (among them every fold
//    from one to four columns, with and without the third column, the screen, and the sheet
//    either way up and auto): the flaws found are pinned
//    in geometry-baseline.json, and the test asserts equality with it. A new flaw fails; a
//    flaw that disappears fails too, until the baseline is rewritten with `npx vitest run -u
//    tests/dag/geometry.test.ts` (read the diff before committing it).
// 2. Hand-made layouts: for every rule, one layout that trips that rule alone, and the clean
//    layout it was made from, which trips none.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkGeometry, RULES, type Rule } from '../../src/dag/check.ts';
import { computeLayout, defaultDagTheme, type DetailedLayout, type LayoutBox } from '../../src/dag/index.ts';
import { loadDagTheme } from '../../src/dag/node.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, findRecipes, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string): Recipe => parseRecipe(source, { units });

const STYLES = ['flow', 'dense', 'ink', 'station'];
/** Style values, and what the chart is fitted to (letter, half-inch margin; the screen unless named). */
interface OptionSet {
  values: Record<string, string>;
  sheet?: { shape: 'screen' | 'auto' | 'portrait' | 'landscape' };
}
const OPTION_SETS: Record<string, OptionSet> = {
  default: { values: {} },
  'ingredient-side-right': { values: { 'ingredient-side': 'right' } },
  'join-edges-separate': { values: { 'join-edges': 'separate' } },
  // Every fold the engine makes, pinned: 1 to 4 columns, with and without the third column.
  ...Object.fromEntries(
    [1, 2, 3, 4].flatMap((columns) =>
      (['always', 'never'] as const).map((third) => [`columns-${columns}-third-${third}`, { values: { columns: String(columns), 'third-column': third } }]),
    ),
  ),
  // The scorer's own choice on the screen (as `default`, named) and on the sheet, auto and each way up.
  'sheet-screen': { values: {}, sheet: { shape: 'screen' } },
  'sheet-auto': { values: {}, sheet: { shape: 'auto' } },
  'sheet-portrait': { values: {}, sheet: { shape: 'portrait' } },
  'sheet-landscape': { values: {}, sheet: { shape: 'landscape' } },
};

describe('the geometry of every recipe that ships', () => {
  it('finds exactly the flaws pinned in geometry-baseline.json', async () => {
    const recipes = findRecipes(join(ETNA_ROOT, 'cookbook'));
    expect(recipes.length).toBeGreaterThanOrEqual(11);
    const found: string[] = [];
    for (const r of recipes) {
      const recipe = parse(readFileSync(r.file!, 'utf8'));
      if (recipe.form !== 'structured') continue;
      for (const style of STYLES) {
        const base = loadDagTheme(style);
        for (const [option, { values, sheet }] of Object.entries(OPTION_SETS)) {
          const theme = { ...base, values: { ...base.values, ...values } };
          const { flaws } = checkGeometry(computeLayout(recipe, { theme, sheet }), readTheme(theme), recipe);
          for (const f of flaws) found.push(JSON.stringify({ recipe: r.slug, style, option, rule: f.rule, ids: f.ids }));
        }
      }
    }
    await expect(`[\n${found.join(',\n')}\n]\n`).toMatchFileSnapshot('geometry-baseline.json');
  }, 120_000);
});

// ------------------------------------------------------------------ hand-made layouts

const t = readTheme(defaultDagTheme);

const rect = (id: string, kind: LayoutBox['kind'], x: number, y: number, width: number, height: number, lines: string[] = []): LayoutBox => ({
  id,
  kind,
  x,
  y,
  width,
  height,
  lines,
});

/**
 * The clean layout every case starts from, on a 600 × 400 canvas: an ingredient box
 * (20–140, 100–140) feeding `mix` (200–350, 100–140), which feeds `bake` (200–350, 200–240)
 * straight down at x 275. Empty room to the right (x 400–600) and below (y 250–400).
 */
function clean(): DetailedLayout {
  const table = rect('ingredients:mix', 'ingredients', 20, 100, 120, 40);
  const mix = rect('mix', 'operation', 200, 100, 150, 40, ['Mix']);
  const bake = rect('bake', 'operation', 200, 200, 150, 40, ['Bake']);
  return {
    width: 600,
    height: 400,
    boxes: [table, mix, bake],
    edges: [
      { from: 'ingredients:mix', to: 'mix', kind: 'ingredients', points: [{ x: 140, y: 120 }, { x: 200, y: 120 }] },
      { from: 'mix', to: 'bake', kind: 'spine', points: [{ x: 275, y: 140 }, { x: 275, y: 200 }] },
    ],
    title: null,
    tables: [{ box: table, rows: [], quantityRight: 30, unitLeft: 30, itemLeft: 30 }],
    operations: [
      { box: mix, checkpoints: [], prep: false },
      { box: bake, checkpoints: [], prep: false },
    ],
    containers: [],
    separators: [],
    captions: [],
  };
}

const frame = (id: string, x: number, y: number, width: number, height: number, title = 'Two') => ({
  box: rect(id, 'component', x, y, width, height, [title]),
  title,
  choose: false,
});
const addOp = (l: DetailedLayout, b: LayoutBox): void => {
  l.boxes.push(b);
  l.operations.push({ box: b, checkpoints: [], prep: false });
};
const op = (l: DetailedLayout, id: string): LayoutBox => l.operations.find((o) => o.box.id === id)!.box;

// A frame in the empty room at the bottom right; its name pill straddles y 300 from x 418.
const emptyFrame = () => frame('component:empty', 400, 300, 180, 60);

// Two edges into `rest` (420–570, 300–340), from `mix` and from `bake`, both down x 380 and
// in at y 320: they share 100 units of x 380 and 40 of y 320. `apart` moves the second over;
// `from` gives it another source (`mix`: out of its right tip 10 below the first).
const sharing = (l: DetailedLayout, apart = 0, from = 'bake'): void => {
  addOp(l, rect('rest', 'operation', 420, 300, 150, 40, ['Rest']));
  l.edges.push(
    { from: 'mix', to: 'rest', kind: 'reference', points: [{ x: 350, y: 120 }, { x: 380, y: 120 }, { x: 380, y: 320 }, { x: 420, y: 320 }] },
    { from, to: 'rest', kind: 'reference', points: [{ x: 350, y: from === 'mix' ? 130 : 220 }, { x: 380 + apart, y: from === 'mix' ? 130 : 220 }, { x: 380 + apart, y: 320 + apart }, { x: 420, y: 320 + apart }] },
  );
};
// `rest` (200–350) stands `gap` below an edge out of `bake` that turns right at y 270.
const nearBox = (l: DetailedLayout, gap: number): void => {
  addOp(l, rect('rest', 'operation', 200, 270 + gap, 150, 40, ['Rest']));
  l.edges.push({ from: 'bake', to: 'away', kind: 'reference', points: [{ x: 275, y: 240 }, { x: 275, y: 270 }, { x: 500, y: 270 }] });
};

const cases: Record<Rule, (l: DetailedLayout) => void> = {
  'off-canvas': (l) => {
    l.height = 230;
  },
  'boxes-overlap': (l) => addOp(l, rect('stray', 'operation', 300, 210, 150, 40, ['Stray'])),
  'box-crosses-frame': (l) => {
    l.containers.push(frame('component:dough', 180, 80, 190, 140));
  },
  'frames-cross': (l) => {
    l.containers.push(frame('component:dough', 180, 80, 190, 90), frame('component:other', 360, 150, 140, 40));
  },
  'frame-membership': () => {
    // Driven by a recipe: see the cases below.
  },
  'pill-on-box': (l) => {
    l.containers.push(frame('component:below', 180, 250, 190, 50));
  },
  'pill-off-canvas': (l) => {
    l.containers.push(frame('component:top', 450, 5, 140, 60));
  },
  'pill-long': (l) => {
    l.containers.push(frame('component:narrow', 420, 300, 40, 50));
  },
  'pills-overlap': (l) => {
    l.containers.push(frame('component:outer', 400, 280, 180, 100), frame('component:inner', 410, 280, 150, 60));
  },
  'diagonal-segment': (l) => {
    l.edges[1].points[1] = { x: 280, y: 200 };
  },
  'edge-through-box': (l) => {
    addOp(l, rect('rest', 'operation', 200, 300, 150, 40, ['Rest']));
    l.edges.push({ from: 'mix', to: 'rest', kind: 'reference', points: [{ x: 275, y: 140 }, { x: 275, y: 300 }] });
  },
  'edge-through-pill': (l) => {
    l.containers.push(emptyFrame());
    // 10 above the frame's top border (so through its pill, clear of the border), never into the frame.
    l.edges.push({ from: 'bake', to: 'away', kind: 'reference', points: [{ x: 350, y: 220 }, { x: 390, y: 220 }, { x: 390, y: 290 }, { x: 560, y: 290 }] });
  },
  'edge-through-frame': (l) => {
    l.containers.push(emptyFrame());
    l.edges.push({ from: 'bake', to: 'away', kind: 'reference', points: [{ x: 350, y: 220 }, { x: 560, y: 220 }, { x: 560, y: 390 }] });
  },
  'edges-share-line': (l) => sharing(l),
  'edge-on-frame': (l) => {
    l.containers.push(emptyFrame());
    // One unit below the frame's bottom border (y 360), along it, never into it.
    l.edges.push({ from: 'bake', to: 'away', kind: 'reference', points: [{ x: 350, y: 220 }, { x: 390, y: 220 }, { x: 390, y: 361 }, { x: 560, y: 361 }] });
  },
  'edge-near-box': (l) => nearBox(l, 3),
  'caption-on-box': (l) => {
    l.captions.push({ x: 210, y: 130, text: 'Note' });
  },
  'caption-on-pill': (l) => {
    l.containers.push(emptyFrame());
    // Text from y 288.75 to 299.2: on the pill (287–313), clear of the border at 300.
    l.captions.push({ x: 420, y: 297, text: 'x' });
  },
  'caption-on-line': (l) => {
    l.captions.push({ x: 270, y: 175, text: 'ab' });
  },
  'caption-off-canvas': (l) => {
    l.captions.push({ x: 560, y: 380, text: 'a caption far too long' });
  },
  'caption-crosses-frame': (l) => {
    l.containers.push(emptyFrame());
    l.captions.push({ x: 500, y: 365, text: 'x' });
  },
  'captions-overlap': (l) => {
    l.captions.push({ x: 420, y: 380, text: 'one' }, { x: 425, y: 380, text: 'two' });
  },
  'node-text-outside': (l) => {
    op(l, 'mix').lines = ['A very long operation name that cannot fit'];
  },
  'table-text-outside': (l) => {
    l.tables[0].rows.push({ quantity: '', unit: '', text: 'x', inline: false, item: ['a very long ingredient line here'] });
  },
};

const rulesOf = (l: DetailedLayout, recipe: Recipe | null = null): string[] => [...new Set(checkGeometry(l, t, recipe).flaws.map((f) => f.rule))].sort();

describe('the geometry check on hand-made layouts', () => {
  it('finds nothing in the clean layout, with or without an empty frame', () => {
    expect(checkGeometry(clean(), t, null)).toEqual({ flaws: [], crossings: 0 });
    const l = clean();
    l.containers.push(emptyFrame(), frame('component:dough', 180, 80, 190, 90));
    expect(checkGeometry(l, t, null)).toEqual({ flaws: [], crossings: 0 });
  });

  for (const rule of RULES.filter((r) => r !== 'frame-membership')) {
    it(`${rule}: fires alone on its layout`, () => {
      const l = clean();
      cases[rule](l);
      expect(rulesOf(l)).toEqual([rule]);
    });
  }

  it('lists every rule once, hyphenated', () => {
    expect(new Set(RULES).size).toBe(RULES.length);
    for (const r of RULES) expect(r).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(Object.keys(cases).sort()).toEqual([...RULES].sort());
  });

  // `mix` belongs to Dough, `bake` to Bake it.
  const recipe = parse('---\netna: 1\n---\n\n# Test\n\n## Dough\n\n### Mix\n\n- 1 g flour\n\nMix.\n\n## Bake it\n\n### Bake\n\nBake.\n');

  it('frame-membership: quiet when each step sits in its own frame', () => {
    const l = clean();
    // Bake it's name sits right of the edge coming down into it.
    l.containers.push(frame('component:dough', 10, 80, 350, 80, 'Dough'), { ...frame('component:bake-it', 180, 180, 190, 80, 'B'), inset: 110 });
    expect(rulesOf(l, recipe)).toEqual([]);
  });

  it('frame-membership: fires when a step lies outside its own frame', () => {
    const l = clean();
    l.containers.push(frame('component:dough', 10, 280, 350, 80, 'Dough'));
    expect(rulesOf(l, recipe)).toEqual(['frame-membership']);
    expect(checkGeometry(l, t, recipe).flaws.map((f) => f.ids)).toEqual([
      ['mix', 'component:dough'],
      ['ingredients:mix', 'component:dough'],
    ]);
  });

  it('frame-membership: fires when a step lies in a frame not its own', () => {
    const l = clean();
    l.containers.push(frame('component:bake-it', 10, 80, 350, 80, 'Bake it'));
    expect(checkGeometry(l, t, recipe).flaws.map((f) => [f.rule, ...f.ids])).toEqual([
      ['frame-membership', 'mix', 'component:bake-it'],
      ['frame-membership', 'ingredients:mix', 'component:bake-it'],
      ['frame-membership', 'bake', 'component:bake-it'],
    ]);
  });

  it('frame-membership: ignores a Choose frame the step is not in', () => {
    const l = clean();
    l.containers.push({ ...frame('choose:other', 10, 80, 350, 80, 'Choose — other'), choose: true });
    expect(rulesOf(l, recipe)).toEqual([]);
  });

  it('edges-share-line: quiet for edges 3 apart, from one source, or joined into one target by a bus', () => {
    const at = (apart: number, from = 'bake', theme = t): string[] => {
      const l = clean();
      sharing(l, apart, from);
      return [...new Set(checkGeometry(l, theme, null).flaws.map((f) => f.rule))];
    };
    expect(at(2.9)).toEqual(['edges-share-line']);
    expect(at(3)).toEqual([]);
    expect(at(0, 'mix')).toEqual([]);
    const bus = readTheme({ ...defaultDagTheme, values: { ...defaultDagTheme.values, 'join-edges': 'bus' } });
    expect(at(0, 'bake', bus)).toEqual([]);
    // A bus joins edges into one target only: into another target they share no line.
    const l = clean();
    sharing(l);
    l.edges[3].to = 'other';
    expect(checkGeometry(l, bus, null).flaws.filter((f) => f.rule === 'edges-share-line').map((f) => f.ids)).toEqual([['bake>other', 'mix>rest']]);
  });

  it('edge-on-frame: fires on the border and within 2 of it, outside or inside, not further', () => {
    // Outside: below the empty frame's bottom border (y 360).
    const below = (y: number): string[] => {
      const l = clean();
      l.containers.push(emptyFrame());
      l.edges.push({ from: 'bake', to: 'away', kind: 'reference', points: [{ x: 350, y: 220 }, { x: 390, y: 220 }, { x: 390, y }, { x: 560, y }] });
      return rulesOf(l);
    };
    for (const y of [360, 361, 362]) expect(below(y), `y ${y}`).toEqual(['edge-on-frame']);
    expect(below(362.5)).toEqual([]);
    // Inside: a frame round `mix` (bottom border y 170), an edge out of it along the border, then down out of it to `bake`.
    const inside = (y: number): string[] => {
      const l = clean();
      l.containers.push(frame('component:dough', 180, 80, 190, 90));
      l.edges.push({ from: 'mix', to: 'bake', kind: 'reference', points: [{ x: 350, y: 120 }, { x: 360, y: 120 }, { x: 360, y }, { x: 300, y }, { x: 300, y: 200 }] });
      return rulesOf(l);
    };
    expect(inside(168)).toEqual(['edge-on-frame']);
    expect(inside(167)).toEqual([]);
  });

  it('edge-near-box: fires within 4 of a box, not at 4, and never for its own boxes', () => {
    for (const gap of [0.5, 3.9]) {
      const l = clean();
      nearBox(l, gap);
      expect(rulesOf(l), `gap ${gap}`).toEqual(['edge-near-box']);
    }
    const l = clean();
    nearBox(l, 4);
    expect(rulesOf(l)).toEqual([]);
    // The ingredient edge runs 0 from both its boxes, the spine 0 from both of its.
    expect(rulesOf(clean())).toEqual([]);
  });

  it('counts crossings between edges, not as a flaw', () => {
    const l = clean();
    expect(checkGeometry(l, t, null).crossings).toBe(0);
    l.edges.push({ from: 'ingredients:mix', to: 'away', kind: 'reference', points: [{ x: 80, y: 140 }, { x: 80, y: 170 }, { x: 450, y: 170 }] });
    expect(checkGeometry(l, t, null)).toEqual({ flaws: [], crossings: 1 });
  });
});
