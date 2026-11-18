// The chart laid out for what it is fitted to, a screen or a sheet (src/dag/layout/ `computeLayout`,
// layout/fold.ts, layout/fit.ts): with or without the third column, folded into one to six
// columns on a sheet (one on a screen), the layout that prints largest taken. Every example ×
// every bundled chart style × the option sets below:
//
//   pinned   `columns` 1 to 4 × `third-column` always and never, fitted to the screen (the
//            default): a style value pins a layout whatever it is fitted to;
//   sheets   the style's own (`auto` for both) on a letter sheet portrait, landscape and auto;
//   screen   the style's own, fitted to the screen.
//
// What holds of every one of them, what a fold must keep (reading order, one frame per
// container), what `layout.plan` says, and how the scorer chooses. Hand-written recipes test
// the two routes only a fold has: the spine returning up the gutter to the next column's head,
// and an edge over the top of a column it passes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildGraph, parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout, type DagTheme, type DetailedLayout } from '../../src/dag/index.ts';
import { FULL_SIZE, preferred, printScale, TIE, type PageShape } from '../../src/dag/layout/fit.ts';
import { loadDagTheme } from '../../src/dag/node.ts';
import { chartSheetFor } from '../../src/dag/sheet.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, findRecipes, loadUnits } from '../../src/node/files.ts';
import { box, checkInvariants, EPS } from './invariants.ts';

const units = loadUnits();
const parse = (source: string): Recipe => parseRecipe(source, { units });

const STYLES = ['flow', 'dense', 'ink', 'station'];
/**
 * Flaws the recipes that ship show today, each in the one layout where it shows (a style with
 * pinned columns no bundled style uses). Pinned, not hidden: the test fails when a flaw goes
 * away or moves, so a fix is noticed. None today.
 */
const KNOWN: Record<string, string> = {};
/** The structured recipes that ship (a traditional recipe has no chart). */
const SHIPPED = findRecipes(join(ETNA_ROOT, 'cookbook'))
  .map((r) => ({ slug: r.slug, recipe: parse(readFileSync(r.file!, 'utf8')) }))
  .filter((e) => e.recipe.form === 'structured');
/** The box a chart fills on the default sheet, letter with the half-inch margin; a screen is as wide as it. */
const BOX = chartSheetFor(0, 1, 'letter', '0.5in').points.box;

interface OptionSet {
  name: string;
  values: Record<string, string>;
  shape?: PageShape;
}
const PINNED: OptionSet[] = [1, 2, 3, 4].flatMap((columns) =>
  (['always', 'never'] as const).map((third) => ({ name: `columns ${columns}, third-column ${third}`, values: { columns: String(columns), 'third-column': third } })),
);
const SHEETS: OptionSet[] = (['portrait', 'landscape', 'auto'] as const).map((shape) => ({ name: `sheet ${shape}`, values: {}, shape }));
const SCREEN: OptionSet = { name: 'screen', values: {}, shape: 'screen' };
const SETS = [...PINNED, ...SHEETS, SCREEN];

const themeOf = (style: string, values: Record<string, string>): DagTheme => {
  const base = loadDagTheme(style);
  return { ...base, values: { ...base.values, ...values } };
};
const cache = new Map<string, DetailedLayout>();
const lay = (slug: string, recipe: Recipe, style: string, set: OptionSet): DetailedLayout => {
  const key = `${slug}|${style}|${set.name}`;
  let got = cache.get(key);
  if (!got) {
    got = computeLayout(recipe, { theme: themeOf(style, set.values), sheet: set.shape ? { shape: set.shape } : undefined });
    cache.set(key, got);
  }
  return got;
};
/** Every recipe × style × option set, with a name for failures. */
function* every(sets: OptionSet[] = SETS) {
  for (const { slug, recipe } of SHIPPED) {
    for (const style of STYLES) {
      for (const set of sets) yield { slug, recipe, style, set, theme: themeOf(style, set.values), layout: lay(slug, recipe, style, set), where: `${slug}, ${style}, ${set.name}` };
    }
  }
}

/** The steps that are not preparation (the leading row that joins nothing, drawn first whatever its place in the source). */
const spineBoxes = (layout: DetailedLayout) => layout.operations.filter((o) => !o.prep).map((o) => o.box);
/** With no third column, each column of a folded chart has one spine: its nodes share one x. The columns, left to right. */
const columnsOf = (layout: DetailedLayout) => {
  const xs = [...new Set(spineBoxes(layout).map((b) => b.x))].sort((a, b) => a - b);
  return xs.map((x) => spineBoxes(layout).filter((b) => b.x === x));
};

describe('every layout of every recipe that ships', () => {
  for (const { slug, recipe } of SHIPPED) {
    it(`${slug}: holds the chart invariants and the geometry check in every fold and on every sheet`, () => {
      for (const style of STYLES) {
        for (const set of SETS) {
          const theme = themeOf(style, set.values);
          const layout = lay(slug, recipe, style, set);
          const where = `${slug}, ${style}, ${set.name}, plan ${JSON.stringify(layout.plan)}`;
          try {
            checkInvariants(recipe, layout, theme);
          } catch (error) {
            throw new Error(`${where}: ${(error as Error).message}`);
          }
          const known = KNOWN[`${slug}, ${style}, ${set.name}`];
          const flaws = checkGeometry(layout, readTheme(theme), recipe).flaws.map((f) => `${f.rule} ${f.ids.join(' ')}`);
          expect(flaws, where).toEqual(known ? [known] : []);
        }
      }
    }, 60_000);
  }

  it('draws every graph edge exactly once, every step as exactly one node, the same texts in every layout', () => {
    const texts = new Map<string, string>();
    for (const { recipe, style, layout, where, slug } of every()) {
      const graph = buildGraph(recipe);
      const drawn = layout.edges.filter((e) => e.kind !== 'ingredients').map((e) => `${e.from}>${e.to}`);
      const wanted = [...new Set(graph.edges.map((e) => `${e.from}>${e.to}`))];
      expect(drawn.length, where).toBe(wanted.length);
      expect(new Set(drawn), where).toEqual(new Set(wanted));
      const nodes = layout.operations.map((o) => o.box.id);
      expect(nodes.length, where).toBe(graph.steps.length);
      expect(new Set(nodes), where).toEqual(new Set(graph.steps.map((s) => s.id)));
      // What each node and each ingredient box says, by id: one fingerprint per recipe and style.
      const said = JSON.stringify([
        Object.fromEntries(layout.operations.map((o) => [o.box.id, o.box.lines]).sort()),
        Object.fromEntries(layout.tables.map((t) => [t.box.id, t.box.lines]).sort()),
      ]);
      const key = `${slug}|${style}`;
      if (!texts.has(key)) texts.set(key, said);
      expect(said, where).toBe(texts.get(key));
    }
  }, 60_000);
});

describe('reading order of a folded chart without its third column', () => {
  // With `third-column: never` every step is on the spine. A fold cuts the one-column strip
  // into columns read top to bottom, then left to right, and never reorders it. So, leaving out
  // the preparation steps (a row of their own, drawn first): the nodes stand at one x per
  // column (`plan.columns` of them, one fewer when the preparation row has a column to itself),
  // and read down each column and on across the columns they are exactly the one-column
  // chart's nodes read top to bottom.
  //
  // The strip is not always source order: a side branch is drawn above the spine step it
  // joins even when the spine step comes first in the source (in the corpus, 37 recipes read
  // so in one column). Where the one-column strip is in source order, as in most of the recipes, the
  // fold therefore keeps source order: down each column, and from one column to the next.
  it('reads down each column and on to the next in the order of the one-column chart', () => {
    let folded = 0;
    let sourced = 0;
    for (const { slug, recipe, style, set, layout, where } of every(PINNED.filter((s) => s.values['third-column'] === 'never'))) {
      const order = new Map(buildGraph(recipe).steps.map((s, i) => [s.id, i]));
      const prep = layout.operations.filter((o) => o.prep).map((o) => o.box);
      const rest = layout.boxes.filter((b) => (b.kind === 'operation' || b.kind === 'ingredients') && !prep.includes(b));
      const prepAlone = prep.length > 0 && Math.max(...prep.map((b) => b.x + b.width)) < Math.min(...rest.map((b) => b.x));
      const columns = columnsOf(layout);
      expect(columns.length, where).toBe(layout.plan!.columns - (prepAlone ? 1 : 0));
      if (columns.length > 1) folded++;
      const read = columns.map((c) => [...c].sort((a, b) => a.y - b.y).map((b) => b.id));
      const strip = spineBoxes(lay(slug, recipe, style, { ...set, name: 'columns 1, third-column never', values: { ...set.values, columns: '1' } }))
        .sort((a, b) => a.y - b.y)
        .map((b) => b.id);
      expect(read.flat(), where).toEqual(strip);
      const ranks = strip.map((id) => order.get(id)!);
      if (ranks.some((r, i) => i > 0 && r < ranks[i - 1])) continue;
      sourced++;
      for (const [k, column] of read.entries()) {
        const rank = column.map((id) => order.get(id)!);
        expect(rank, `${where}: column ${k + 1}`).toEqual([...rank].sort((a, b) => a - b));
        if (k > 0) expect(Math.min(...rank), `${where}: column ${k + 1} after column ${k}`).toBeGreaterThan(Math.max(...read[k - 1].map((id) => order.get(id)!)));
      }
    }
    expect(folded).toBeGreaterThan(0);
    expect(sourced).toBeGreaterThan(0);
  });
});

describe('edges kept apart', () => {
  /** The geometry check's `edges-share-line`: pairs of edges that run along one line where they do not share by design. */
  const shared = (layout: DetailedLayout, theme: DagTheme, recipe: Recipe): string[] =>
    checkGeometry(layout, readTheme(theme), recipe)
      .flaws.filter((f) => f.rule === 'edges-share-line')
      .map((f) => f.ids.join(' & '));

  it('in the plain layout, never runs two edges along one line (edges-share-line)', () => {
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        const set = PINNED.find((s) => s.values.columns === '1' && s.values['third-column'] === 'always')!;
        expect(shared(lay(slug, recipe, style, set), themeOf(style, set.values), recipe), `${slug}, ${style}`).toEqual([]);
      }
    }
  });

  // Edges that come into one row through the top each run at their own height (frosty-chocolate, flow, columns 2, third-column never, once shared a line).
  // Lays out every example × style × option set: well over a second when the machine is busy, so a long timeout.
  it('in a folded layout, never runs two edges along one line (edges-share-line)', { timeout: 60_000 }, () => {
    const found: string[] = [];
    for (const { recipe, theme, layout, where } of every()) for (const pair of shared(layout, theme, recipe)) found.push(`${where}: ${pair}`);
    expect(found).toEqual([]);
  });
});

describe('a container cut by a fold', () => {
  const stepsOf = (recipe: Recipe, anchor: string): string[] => buildGraph(recipe).steps.filter((s) => s.path.some((h) => h.anchor === anchor)).map((s) => s.id);
  const inside = (b: { x: number; y: number; width: number; height: number }, f: { x: number; y: number; width: number; height: number }): boolean =>
    b.x >= f.x - EPS && b.y >= f.y - EPS && b.x + b.width <= f.x + f.width + EPS && b.y + b.height <= f.y + f.height + EPS;

  // Lays out every example × style × option set: well over a second when the machine is busy, so a long timeout.
  it('keeps one frame, holding all its steps and no other container\'s', { timeout: 60_000 }, () => {
    for (const { recipe, layout, where } of every()) {
      const graph = buildGraph(recipe);
      for (const c of layout.containers.filter((c) => c.box.id.startsWith('component:'))) {
        const anchor = c.box.id.slice('component:'.length);
        expect(layout.containers.filter((d) => d.box.id === c.box.id), `${where}: ${c.box.id}`).toHaveLength(1);
        const own = new Set(stepsOf(recipe, anchor));
        for (const s of graph.steps) {
          for (const id of [s.id, `ingredients:${s.id}`]) {
            const b = layout.boxes.find((x) => x.id === id);
            if (!b) continue;
            if (own.has(s.id)) expect(inside(b, c.box), `${where}: ${id} outside its frame ${c.box.id}`).toBe(true);
            else expect(inside(b, c.box), `${where}: ${id} inside ${c.box.id}`).toBe(false);
          }
        }
      }
    }
  });

  // Without the third column, the columns of a cut container are its spines (one x each). A
  // part's top is its first row's: the higher of the node and its ingredient box (a row is as
  // tall as the taller and centers the other), and, when a side branch's name stands over the
  // row, the room the engine gives that name above it (caption-font-size + 4).
  //
  // Two things drawn over a part's first row take room of their own, and that part then starts
  // lower: the frame of a Choose that opens at that row, and lines that arrive over its first
  // step from two or more steps (each needs a lane). Such a part is held to using the room: its
  // frame, or its highest line, comes up to where the other parts start.
  it('starts all its parts at one height, but for a Choose frame or arriving lines over a first row', () => {
    let cut = 0;
    let lower = 0;
    const uneven: string[] = [];
    for (const { recipe, layout, theme, where } of every(PINNED.filter((s) => s.values['third-column'] === 'never'))) {
      const room = readTheme(theme).num('caption-font-size') + 4;
      const frames = layout.containers.filter((k) => k.box.id.startsWith('choose:')).map((k) => k.box);
      const lines = layout.edges.filter((e) => e.kind !== 'ingredients');
      for (const c of layout.containers.filter((c) => c.box.id.startsWith('component:'))) {
        const own = new Set(stepsOf(recipe, c.box.id.slice('component:'.length)));
        const nodes = layout.operations.filter((o) => own.has(o.box.id) && !o.prep).map((o) => o.box);
        const parts = [...new Set(nodes.map((b) => b.x))].map((x) => nodes.filter((b) => b.x === x));
        if (parts.length < 2) continue;
        cut++;
        const heads = parts.map((p) => {
          const first = [...p].sort((a, b) => a.y - b.y)[0];
          const boxes = [first, ...layout.boxes.filter((x) => x.id === `ingredients:${first.id}`)];
          const row = Math.min(...boxes.map((b) => b.y));
          const left = Math.min(...boxes.map((b) => b.x));
          const right = Math.max(...boxes.map((b) => b.x + b.width));
          const named = layout.captions.some((k) => !k.edge && k.x >= left - 30 && k.x <= right && k.y > c.box.y && k.y < row);
          const top = named ? row - room : row;
          // What is drawn over the first row: a Choose frame that opens at it, or lines arriving over its step.
          const frame = frames.find((f) => inside(first, f) && f.y < first.y);
          const over = lines.filter((e) => e.to === first.id && e.points.some((q) => q.y < first.y - EPS));
          const drawn = frame ? frame.y : over.length >= 2 ? Math.min(...over.flatMap((e) => e.points.map((q) => q.y))) : null;
          return { top, drawn };
        });
        const plain = heads.filter((h) => h.drawn === null).map((h) => h.top);
        if (plain.length === 0) continue;
        if (plain.some((top) => Math.abs(top - plain[0]) >= EPS)) uneven.push(`${where}: ${c.box.id} parts start at ${plain.join(', ')}`);
        for (const h of heads) {
          if (h.drawn === null) continue;
          lower++;
          if (h.top < plain[0] - EPS) uneven.push(`${where}: ${c.box.id} a part with a frame or lines over it starts above the others, at ${h.top}`);
          if (h.drawn > plain[0] + room) uneven.push(`${where}: ${c.box.id} a part starts at ${h.top} with nothing drawn above ${h.drawn} (the others start at ${plain[0]})`);
        }
      }
    }
    expect(uneven).toEqual([]);
    // Both kinds of part do occur in the recipes that ship.
    expect(lower).toBeGreaterThan(0);
    // The recipes do cut a container somewhere, so this is not vacuous.
    expect(cut).toBeGreaterThan(0);
  });
});

describe('the plan', () => {
  it('folds into the columns pinned when the chart can be cut that often, otherwise into fewer', () => {
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        for (const third of ['always', 'never']) {
          const got = [1, 2, 3, 4].map((columns) => lay(slug, recipe, style, PINNED.find((s) => s.values.columns === String(columns) && s.values['third-column'] === third)!).plan!.columns);
          const where = `${slug}, ${style}, third-column ${third}: ${got.join(', ')}`;
          expect(got[0], where).toBe(1);
          for (let k = 1; k < 4; k++) {
            // Never more than pinned; once fewer, the chart can be cut no more often.
            expect(got[k], where).toBeLessThanOrEqual(k + 1);
            if (got[k - 1] < k) expect(got[k], where).toBe(got[k - 1]);
            else expect(got[k], where).toBeGreaterThanOrEqual(k);
          }
        }
      }
    }
  });

  // Lays out every example × style × pinned fold: well over a second when the machine is busy, so a long timeout.
  it('has no third column when pinned never, and the third column when pinned always', { timeout: 60_000 }, () => {
    for (const { set, layout, where } of every(PINNED)) expect(layout.plan!.third, where).toBe(set.values['third-column'] === 'always');
  });

  // Lays out every example × style × option set: well over a second when the machine is busy, so a long timeout.
  it('gives the print scale of the chart on its screen or sheet', { timeout: 60_000 }, () => {
    for (const { set, layout, where } of every()) {
      const scale = Math.round(printScale(layout.width, layout.height, BOX, set.shape ?? 'screen') * 10000) / 10000;
      expect(layout.plan!.scale, where).toBe(scale);
    }
  });

  it('measures the scale on the sheet it is given: A4, a wider margin', () => {
    const { recipe } = SHIPPED.find((e) => e.slug === 'next-day-soft-cinnamon-rolls')!;
    for (const sheet of [{ paper: 'a4', margin: '0.5in' }, { paper: 'letter', margin: '1in' }] as const) {
      const box = chartSheetFor(0, 1, sheet.paper, sheet.margin).points.box;
      for (const shape of ['auto', 'screen'] as const) {
        const layout = computeLayout(recipe, { sheet: { ...sheet, shape } });
        expect(layout.plan!.scale, shape).toBe(Math.round(printScale(layout.width, layout.height, box, shape) * 10000) / 10000);
      }
    }
  });
});

describe('the scorer', () => {
  const SHAPES: PageShape[] = ['screen', 'auto', 'portrait', 'landscape'];
  const r = (n: number): number => Math.round(n * 10000) / 10000;
  /** Print scale as fit.ts `choose` counts it: on a sheet up to the scale at which body text is full size, on a screen without end. */
  const capped = (l: DetailedLayout, style: string, shape: PageShape): number =>
    Math.min(printScale(l.width, l.height, BOX, shape), shape === 'screen' ? Infinity : FULL_SIZE / readTheme(loadDagTheme(style)).num('font-size'));
  /**
   * The layouts the engine chooses among, each made alone by pinning `third-column` and
   * `columns` (a layout does not depend on what it is fitted to; only the choice does): one
   * column on a screen, one to six on a sheet; in the engine's own order.
   */
  const candidatesOf = (slug: string, recipe: Recipe, style: string, shape: PageShape): DetailedLayout[] =>
    (['always', 'never'] as const).flatMap((third) =>
      Array.from({ length: shape === 'screen' ? 1 : 6 }, (_, k) => k + 1).map((columns) =>
        lay(slug, recipe, style, { name: `columns ${columns}, third-column ${third}`, values: { columns: String(columns), 'third-column': third } }),
      ),
    );
  const setOf = (shape: PageShape): OptionSet => (shape === 'screen' ? SCREEN : SHEETS.find((s) => s.shape === shape)!);
  const planOf = (l: DetailedLayout) => ({ third: l.plan!.third, columns: l.plan!.columns, broken: l.plan!.broken });

  // Lays out every example × style × shape and up to twelve candidates each: well over a second when the machine is busy, so a long timeout.
  it('takes the layout that prints largest, or of those tied with it the first by preference', { timeout: 60_000 }, () => {
    let tiedAway = 0;
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        for (const shape of SHAPES) {
          const chosen = lay(slug, recipe, style, setOf(shape));
          const candidates = candidatesOf(slug, recipe, style, shape);
          const where = `${slug}, ${style}, ${shape}, plan ${JSON.stringify(chosen.plan)}`;
          const largest = Math.max(...candidates.map((c) => capped(c, style, shape)));
          // As large as every candidate, within the tie.
          expect(capped(chosen, style, shape), where).toBeGreaterThanOrEqual(largest / (1 + TIE) - 1e-9);
          // Of the candidates tied with the largest, the first by preference (fewer columns, then the third column).
          const tied = candidates.filter((c) => capped(c, style, shape) >= largest / (1 + TIE) - 1e-12).sort((a, b) => preferred(a.plan!, b.plan!));
          expect(planOf(chosen), where).toEqual(planOf(tied[0]));
          expect([chosen.width, chosen.height], where).toEqual([tied[0].width, tied[0].height]);
          if (capped(chosen, style, shape) < largest - 1e-9) tiedAway++;
        }
      }
    }
    // Some chart takes a layout a whisker smaller than the largest, so the test sees the tie at work.
    expect(tiedAway).toBeGreaterThan(0);
  });

  // Lays out every example × style, its candidates, and every pinned fold: well over a second when the machine is busy, so a long timeout.
  it('fits a chart to the screen in one column, the narrowest within the tie, unless `columns` is pinned', { timeout: 60_000 }, () => {
    let narrower = 0;
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        const screen = lay(slug, recipe, style, SCREEN);
        const where = `${slug}, ${style}, plan ${JSON.stringify(screen.plan)}`;
        expect(screen.plan!.columns, where).toBe(1);
        const narrowest = Math.min(...candidatesOf(slug, recipe, style, 'screen').map((c) => c.width));
        expect(screen.width, where).toBeLessThanOrEqual(narrowest * (1 + TIE) + 1e-9);
        expect(screen.plan!.scale, where).toBe(r(BOX.width / screen.width));
        if (screen.width < lay(slug, recipe, style, SHEETS.find((s) => s.shape === 'auto')!).width) narrower++;
      }
    }
    expect(narrower).toBeGreaterThan(0);
    // A pinned number of columns holds on the screen too: some chart is folded there.
    expect([...every(PINNED.filter((s) => s.values.columns !== '1'))].some(({ layout }) => layout.plan!.columns > 1)).toBe(true);
  });

  it('uses the chosen layout\'s own scale upright or turned, and on auto the larger of the two', () => {
    let differ = 0;
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        const [portrait, landscape, auto] = SHEETS.map((set) => lay(slug, recipe, style, set));
        const where = `${slug}, ${style}`;
        expect(portrait.plan!.scale, where).toBe(r(printScale(portrait.width, portrait.height, BOX, 'portrait')));
        expect(landscape.plan!.scale, where).toBe(r(printScale(landscape.width, landscape.height, BOX, 'landscape')));
        const upright = printScale(auto.width, auto.height, BOX, 'portrait');
        const turned = printScale(auto.width, auto.height, BOX, 'landscape');
        expect(auto.plan!.scale, where).toBe(r(Math.max(upright, turned)));
        // Auto chooses over both ways up: it prints, within the tie, as large as the better of the two sheets' choices.
        const best = Math.max(capped(portrait, style, 'portrait'), capped(landscape, style, 'landscape'));
        expect(capped(auto, style, 'auto'), where).toBeGreaterThanOrEqual(best / (1 + TIE) - 1e-9);
        if (JSON.stringify(portrait.plan) !== JSON.stringify(landscape.plan)) differ++;
      }
    }
    // The way up changes the choice for some example, so the test sees the scorer at work.
    expect(differ).toBeGreaterThan(0);
  });
});

describe('determinism and the charts that are never folded', () => {
  it('gives the same layout, to the byte, every time', () => {
    for (const { recipe, theme, set, layout, where } of every()) {
      const again = computeLayout(recipe, { theme, sheet: set.shape ? { shape: set.shape } : undefined });
      expect(JSON.stringify(again), where).toBe(JSON.stringify(layout));
    }
  }, 60_000);

  it('folds a chart with ingredient-side: right only into two stacks of whole containers', () => {
    let folded = 0;
    for (const { slug, recipe } of SHIPPED) {
      for (const style of STYLES) {
        for (const side of [{ 'ingredient-side': 'right' }] as Record<string, string>[]) {
          for (const set of [...SHEETS, ...PINNED.filter((s) => s.values.columns !== '1')]) {
            const theme = themeOf(style, { ...set.values, ...side });
            const layout = computeLayout(recipe, { theme, sheet: set.shape ? { shape: set.shape } : undefined });
            const where = `${slug}, ${style}, ${JSON.stringify(side)}, ${set.name}`;
            // Two stacks at most, cut between two containers: nothing broken, every container whole.
            expect(layout.plan!.columns, where).toBeLessThanOrEqual(2);
            expect(layout.plan!.broken, where).toBe(0);
            if (layout.plan!.columns === 1) continue;
            folded++;
            expect(layout.containers.some((c) => c.box.id.startsWith('component:')), where).toBe(true);
            expect(checkGeometry(layout, readTheme(theme), recipe).flaws, where).toEqual([]);
          }
        }
      }
    }
    // Some example does stand in two stacks, so the test sees the fold.
    expect(folded).toBeGreaterThan(0);
  }, 60_000);
});

describe('the routes only a fold has', () => {
  /** A flat recipe of `n` steps, each with an ingredient (so none goes to a third column). */
  const spine = (n: number, extra: Record<number, string> = {}): string =>
    `# Long spine\n\n${Array.from({ length: n }, (_, i) => `## Step ${i + 1}\n\n${extra[i + 1] ?? ''}- ${i + 1}0 g item ${i + 1}\n\nDo it.\n`).join('\n')}`;
  const edge = (l: DetailedLayout, from: string, to: string) => l.edges.find((e) => e.from === from && e.to === to)!;

  it('folds a long spine on a landscape sheet, the spine entering each next column at the middle of its head\'s top', () => {
    const recipe = parse(spine(12));
    const theme: DagTheme = { name: 'flow', values: {} };
    const layout = computeLayout(recipe, { theme, sheet: { shape: 'landscape' } });
    checkInvariants(recipe, layout, theme);
    expect(checkGeometry(layout, readTheme(theme), recipe).flaws).toEqual([]);
    expect(layout.plan!.columns).toBeGreaterThan(1);
    const columns = columnsOf(layout);
    expect(columns).toHaveLength(layout.plan!.columns);
    // Each column after the first: its head is the step after the last of the column before.
    let cuts = 0;
    for (let i = 1; i < 12; i++) {
      const from = box(layout, `step-${i}`);
      const to = box(layout, `step-${i + 1}`);
      if (from.x === to.x) continue;
      cuts++;
      expect(to.x).toBeGreaterThan(from.x);
      expect(to.y).toBe(Math.min(...columns.find((c) => c[0].x === to.x)!.map((b) => b.y)));
      const points = edge(layout, `step-${i}`, `step-${i + 1}`).points;
      const end = points.at(-1)!;
      expect(end.x).toBeCloseTo(to.x + to.width / 2, 2);
      expect(end.y).toBeCloseTo(to.y, 2);
      // It comes down into the top: its last segment is vertical, from above.
      const before = points.at(-2)!;
      expect(before.x).toBeCloseTo(end.x, 2);
      expect(before.y).toBeLessThan(end.y);
    }
    expect(cuts).toBe(layout.plan!.columns - 1);
    // Upright, the same chart prints larger unfolded.
    expect(computeLayout(recipe, { theme, sheet: { shape: 'portrait' } }).plan!.columns).toBe(1);
  });

  it('carries an edge from the first column to the third over the top of the second, above every node', () => {
    // Step 12 takes what step 1 made: in three columns, the edge passes over the second.
    const recipe = parse(spine(12, { 12: '- [step 1](#step-1)\n' }));
    expect(buildGraph(recipe).edges.some((e) => e.from === 'step-1' && e.to === 'step-12')).toBe(true);
    const theme: DagTheme = { name: 'flow', values: { columns: '3', 'third-column': 'never' } };
    const layout = computeLayout(recipe, { theme });
    checkInvariants(recipe, layout, theme);
    expect(checkGeometry(layout, readTheme(theme), recipe).flaws).toEqual([]);
    expect(layout.plan!.columns).toBe(3);
    const columns = columnsOf(layout);
    expect(columns[0].map((b) => b.id)).toContain('step-1');
    expect(columns[2].map((b) => b.id)).toContain('step-12');
    const over = edge(layout, 'step-1', 'step-12');
    const highest = Math.min(...over.points.map((p) => p.y));
    const nodes = layout.boxes.filter((b) => b.kind === 'operation' || b.kind === 'ingredients');
    expect(highest).toBeLessThan(Math.min(...nodes.map((b) => b.y)));
  });
});
