// Chart layout: where every box sits and how every edge runs. Pure and deterministic.
//
// The layout is the "snake" of the hand-made reference charts:
//
//   column 1  ingredient boxes, all one width, left edges aligned
//   column 2  the spine: one operation per row, beside its ingredient box
//   column 3  operations that take no new ingredients, so need no row of their own
//
// A component that is made apart (a side branch) gets its own rows above the spine it joins,
// and its output runs down a lane between columns 2 and 3 to the step that consumes it.
// A recipe of several real components draws each as a titled container holding its own
// snake; edges between containers run down a gutter on the right.
//
// A chart is laid out for what it is fitted to, a screen or a sheet: every layout the style
// allows is made in full (with and without the third column, in one column and folded into
// several) and the one that prints largest is taken; a tie goes to fewer columns, then to the
// third column (fit.ts).
//
// The stages of one layout, in order (each file says what it reads and writes):
//
//   sizes.ts      measure      once per chart: texts, heights, tables, widths, title
//   structure.ts  arrange      rows and snakes, with a fresh Op for every step
//   routes.ts     classify     each edge's type, spine ports and the turn
//   place.ts      size rows, frame
//   fold.ts       the cut into columns; then classify and size rows again
//   routes.ts     inner gutters, drops, port claims
//   place.ts      the band over the columns, vertical positions, forks' exits, lanes, horizontal positions
//   emit.ts       boxes, captions, edges, in the frame
//   turn.ts       onto the page: the mirror (`ingredient-side: right`)
//   place.ts      when edges cross: the lanes reordered, and that chart kept if it crosses fewer
//
// Then, on the one layout taken (fit.ts), captions moved clear (labels.ts): nothing before
// reads where a caption is, so the other candidates never need theirs moved.
//
// Everything after `measure` works on the model `arrange` makes, so every candidate shares
// one `Sizes`.

import type { Recipe } from '../../core/index.ts';
import { buildGraph } from '../../core/graph.ts';
import { chartBox, chartMargin, chartPaper, chartShape } from '../sheet.ts';
import { readTheme, type DagOptions } from '../theme.ts';
import { emitLayout } from './emit.ts';
import { choose, FULL_SIZE, type Candidate } from './fit.ts';
import { foldColumns } from './fold.ts';
import { bandY, crossingCount, entryY, exitY, frameOf, placeBand, placeHorizontal, placeLanes, placeVertical, roomForEntries, sharedRuns, sizeRows, spreadExits, followLanes } from './place.ts';
import { claimPorts, classifyRoutes, dropRoutes, innerGutters, spinePorts } from './routes.ts';
import { measure } from './sizes.ts';
import { arrange } from './structure.ts';
import { toPage, type OnPage } from './turn.ts';
import type { DagLayout, DetailedLayout, Sizes } from './types.ts';

/** The most columns a chart is folded into. */
const MAX_COLUMNS = 6;

/**
 * The chart, laid out for what it is fitted to (`options.sheet`: a screen unless a sheet is
 * asked for): every layout the style allows is made in full and the one that prints largest
 * is taken; a tie goes to fewer columns, then to the third column (fit.ts). On a screen, which
 * scrolls, the largest is the narrowest, so a chart is not folded there.
 */
export function computeLayout(recipe: Recipe, options: DagOptions = {}): DetailedLayout {
  const name = recipe.title?.text ?? 'this recipe';
  if (recipe.form === 'traditional') {
    throw new Error(
      `No flow chart for "${name}": it is written in the traditional form (form: traditional), ` +
        'which has no per-step ingredients. Only structured recipes have a chart.',
    );
  }
  const graph = buildGraph(recipe);
  if (graph.steps.length === 0) throw new Error(`No flow chart for "${name}": the recipe has no steps.`);
  const t = readTheme(options.theme);
  const box = chartBox(chartPaper(options.sheet?.paper), chartMargin(options.sheet?.margin));
  const shape = chartShape(options.sheet?.shape);
  // Measured once: every candidate reads the same `Sizes`.
  const sizes = measure(recipe, graph, t, options);

  const thirds = sizes.thirdColumn === 'always' ? [true] : sizes.thirdColumn === 'never' ? [false] : [true, false];
  const pinned = sizes.columns;
  const candidates: Candidate<OnPage>[] = [];
  let usesThird = true;
  for (const third of thirds) {
    // Without a third column to drop, the second pass would only repeat the first.
    if (!third && thirds.length > 1 && !usesThird) break;
    const made: Candidate<OnPage>[] = [];
    for (let columns = 1; columns <= (pinned || (shape === 'screen' ? 1 : MAX_COLUMNS)); columns++) {
      const got = layoutFor(sizes, third, columns);
      if (!got) continue;
      if (third && columns === 1) usesThird = got.usedThird;
      const { out } = got.page;
      made.push({ plan: out.plan!, width: out.width, height: out.height, value: got.page });
    }
    // A pinned number of columns: the layout with that many, or with as many as the chart allows.
    candidates.push(...(pinned ? made.slice(-1) : made));
  }
  const best = choose(candidates, box, shape, FULL_SIZE / sizes.fontSize);
  // Captions are moved clear on the layout taken alone: the choice reads no caption (turn.ts).
  best.value.clearCaptions();
  best.value.out.plan = { ...best.plan, scale: Math.round(best.scale * 10000) / 10000 };
  return best.value.out;
}

/**
 * One layout of the chart, over the measured `sizes`: with or without the third column, in a
 * given number of columns, on the page with its captions not yet moved clear; `null` when it
 * cannot be folded so.
 */
function layoutFor(sizes: Sizes, third: boolean, columns: number): { page: OnPage; usedThird: boolean } | null {
  const arrangement = arrange(sizes, third);
  const { snakes, contained } = arrangement;
  let routes = classifyRoutes(sizes.graph, arrangement);
  spinePorts(routes);
  sizeRows(sizes, snakes);
  const frame = frameOf(sizes, snakes);
  let folded = { columnCount: 1, broken: 0 };
  if (columns > 1) {
    const cut = foldColumns(sizes, frame, arrangement, routes, columns);
    if (!cut) return null;
    folded = cut;
    // Again, on the columns.
    routes = classifyRoutes(sizes.graph, arrangement);
    spinePorts(routes);
    sizeRows(sizes, snakes);
  }
  innerGutters(snakes, routes, contained);
  dropRoutes(snakes, routes);
  claimPorts(routes);
  if (roomForEntries(sizes, frame, snakes, routes, contained)) sizeRows(sizes, snakes);
  // The band first, then vertical positions, then lanes (packed by height), then horizontal
  // positions (the channel is as wide as its lanes).
  const bandHeight = placeBand(sizes, routes);
  const vertical = placeVertical(sizes, frame, snakes, routes, folded.columnCount, contained, bandHeight);
  spreadExits(sizes, routes);
  // Lanes, packed again (at most twice) while a fork's exits change order to follow them.
  const lanes = (reorder: boolean): number[] => {
    let got = placeLanes(sizes, snakes, routes, folded.columnCount, vertical, reorder);
    for (let again = 0; again < 2 && followLanes(sizes, routes); again++) got = placeLanes(sizes, snakes, routes, folded.columnCount, vertical, reorder);
    return got;
  };
  const gutterLanes = lanes(false);
  const horizontal = placeHorizontal(sizes, frame, snakes, folded.columnCount, contained, gutterLanes);
  let page = toPage(sizes, emitLayout(sizes, arrangement, routes, { frame, vertical, horizontal }), horizontal);
  // The lanes again, in an order that crosses fewer edges by the packing's own count: kept only
  // when the chart as drawn crosses fewer edges and runs no more of them along one line. (The
  // same number of lanes, so the same widths.)
  const crossings = crossingCount(page.out.edges);
  if (crossings > 0) {
    const reordered = lanes(true);
    const h = placeHorizontal(sizes, frame, snakes, folded.columnCount, contained, reordered);
    const other = toPage(sizes, emitLayout(sizes, arrangement, routes, { frame, vertical, horizontal: h }), h);
    if (crossingCount(other.out.edges) < crossings && sharedRuns(other.out.edges) <= sharedRuns(page.out.edges)) page = other;
  }
  page.out.plan = { third, columns: folded.columnCount, broken: folded.broken, scale: 0 };
  return { page, usedThird: frame.usesThird };
}

/** The positioned chart before drawing, for tests. */
export function layoutDag(recipe: Recipe, options: DagOptions = {}): DagLayout {
  const { width, height, boxes, edges } = computeLayout(recipe, options);
  return { width, height, boxes, edges };
}
