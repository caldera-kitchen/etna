// How large a chart prints, and which of several layouts of one chart to take.
//
// A chart is scaled as a whole: one factor for everything, text included. On a sheet it is
// scaled into the printable box; on a screen, which scrolls, into the width alone. The engine
// lays a chart out in several ways (with and without its third column, in one column or folded
// into several) and takes the one that prints largest. Layouts that print within a whisker of
// each other count as a tie, and a tie goes to fewer columns, then to the third column: a
// chart does not change its arrangement for one percent.

import type { ChartShape } from '../sheet.ts';

/** The box a chart may fill, in points, with the sheet upright. */
export interface PageBox {
  width: number;
  height: number;
}

/**
 * What the chart is fitted to: a `screen` (the box's width, and no end to its height), or a
 * sheet turned one way or the other; `auto` takes the way the chart prints larger.
 */
export type PageShape = ChartShape;

/** Points per chart unit when a chart of `width` × `height` is fitted as `shape` says. */
export function printScale(width: number, height: number, box: PageBox, shape: PageShape): number {
  if (shape === 'screen') return box.width / width;
  const upright = Math.min(box.width / width, box.height / height);
  const turned = Math.min(box.height / width, box.width / height);
  return shape === 'portrait' ? upright : shape === 'landscape' ? turned : Math.max(upright, turned);
}

/**
 * Body text, in points, at which a chart prints at full size on a sheet. Past it a larger
 * print is no reason to rearrange a chart: print scale counts up to this and no further. A
 * screen has no full size: there the narrowest chart is the largest, however large.
 */
export const FULL_SIZE = 12;

/**
 * Body text, in points, under which a chart fitted to a sheet prints small. It changes no
 * layout: under it, the app's chart tab says how large the text prints and offers the Dense
 * style when Dense prints it larger, and `etna dag` notes it (dag/small-print.ts). A screen
 * has no such size.
 */
export const SMALL_PRINT = 7;

/**
 * Two layouts whose print sizes are within this share of each other are tied (0.02: two per
 * cent). A tie goes to the layout that comes first in the order of preference.
 */
export const TIE = 0.02;

/** Which of its layouts a chart was given. */
export interface Plan {
  /** Whether steps without ingredients may sit in the third column. */
  third: boolean;
  /** How many columns the chart is folded into. */
  columns: number;
  /** Edges broken by the folds: 0 when every fold falls between two items. */
  broken: number;
}

export interface Candidate<T> {
  plan: Plan;
  width: number;
  height: number;
  value: T;
}

/** The order of preference among layouts: fewer columns first, then the third column. */
export const preferred = (a: Plan, b: Plan): number => a.columns - b.columns || Number(b.third) - Number(a.third);

/**
 * The candidate to take: the one that prints largest, or, of those tied with it (`TIE`), the
 * one that comes first in the order of preference. On a sheet, print scale counts up to
 * `fullScale` (the scale at which body text is `FULL_SIZE`) and no further. The choice is a
 * function of the chart and what it is fitted to alone.
 */
export function choose<T>(candidates: Candidate<T>[], box: PageBox, shape: PageShape, fullScale = Infinity): Candidate<T> & { scale: number } {
  if (candidates.length === 0) throw new Error('No layout to choose from.');
  const ceiling = shape === 'screen' ? Infinity : fullScale;
  const scored = [...candidates]
    .sort((a, b) => preferred(a.plan, b.plan))
    .map((c) => ({ ...c, scale: printScale(c.width, c.height, box, shape) }));
  const largest = Math.max(...scored.map((c) => Math.min(c.scale, ceiling)));
  return scored.find((c) => Math.min(c.scale, ceiling) >= largest / (1 + TIE) - 1e-12)!;
}
