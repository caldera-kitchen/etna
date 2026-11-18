// A chart fitted to a page whose body text prints small, and how large the Dense style prints it
// (ADR 0020). One rule for both places that say so: the line under
// the page in the app's chart tab (web/dense-hint.ts, the Dense half in the chart's worker) and
// the note `etna dag` writes on standard error (dag/cli.ts). Pure, and worker-safe: it imports
// nothing of the Markdown parser's or the page's.

import type { Recipe } from '../core/index.ts';
import { layoutDag } from './index.ts';
import type { DagOptions } from './theme.ts';
import { printScale, SMALL_PRINT, TIE } from './layout/fit.ts';
import { chartBox, chartMargin, chartPaper, chartShape, type ChartMargin, type ChartPaper, type ChartShape } from './sheet.ts';
import { readTheme } from './theme.ts';

/** What a chart is fitted to: the screen (shape left out or `screen`), or a sheet. */
export type SmallPrintSheet = { paper?: ChartPaper; margin?: ChartMargin; shape?: ChartShape };

/** What the line says: the body text as it prints now, and as Dense prints it, in points. */
export interface DenseHint {
  now: number;
  dense: number;
}

/**
 * What laying Dense out takes: the size the chart's text prints at now (under SMALL_PRINT),
 * the Dense chart's render options (the chart's own, with Dense for its style), and the sheet
 * both are fitted to. The app sends it to the chart's worker, so there it is plain data.
 */
export interface DenseAsk<R extends DagOptions = DagOptions> {
  now: number;
  render: R;
  sheet: SmallPrintSheet;
}

/** The chart as drawn: its layout's size (an SVG's viewBox), its style's `font-size` as drawn, and its sheet. */
export interface SmallPrintChart {
  width: number;
  height: number;
  fontSize: number;
  sheet: SmallPrintSheet;
  /** Whether the chart is already in the built-in Dense style: then no line. */
  dense: boolean;
}

/** A size as the line gives it: to a tenth of a point, rounded down, so it never says more than prints. */
export const pointsText = (points: number): string => `${(Math.floor(points * 10 + 1e-9) / 10).toFixed(1)} pt`;

/**
 * Points of body text a chart of `width` × `height` units prints at, fitted as `sheet` says:
 * the print scale (fit.ts `printScale`, into the sheet's printable box) times the style's
 * `font-size`, as the chart was drawn (in the card's fonts, the size matched to them).
 */
export function bodyPoints(width: number, height: number, fontSize: number, sheet: SmallPrintSheet): number {
  const box = chartBox(chartPaper(sheet.paper), chartMargin(sheet.margin));
  return printScale(width, height, box, chartShape(sheet.shape)) * fontSize;
}

/**
 * The quick half of the rule: what to lay Dense out with, or null when no line can show. It
 * holds when all of these do:
 * - the chart is fitted to a page (not the screen);
 * - its body text prints under `SMALL_PRINT`;
 * - the style is not the built-in Dense, and Dense is available (`denseRender` gives its
 *   render options, or null when it has none: missing or broken).
 * `denseRender` is called only when the first two hold.
 */
export function denseAskFor<R extends DagOptions>(chart: SmallPrintChart, denseRender: () => R | null): DenseAsk<R> | null {
  if (chartShape(chart.sheet.shape) === 'screen' || chart.dense) return null;
  const now = bodyPoints(chart.width, chart.height, chart.fontSize, chart.sheet);
  if (now >= SMALL_PRINT) return null;
  const render = denseRender();
  return render ? { now, render, sheet: chart.sheet } : null;
}

/**
 * The slow half: lay the chart out in Dense. The line, when Dense prints the same chart larger
 * by more than the engine's tie (`TIE`, 2%), so a suggestion that does not help is not made;
 * else null.
 */
export function denseHintFor(recipe: Recipe, ask: DenseAsk): DenseHint | null {
  let layout: { width: number; height: number };
  try {
    layout = layoutDag(recipe, ask.render);
  } catch {
    return null;
  }
  const points = bodyPoints(layout.width, layout.height, readTheme(ask.render.theme).num('font-size'), ask.sheet);
  return points > ask.now * (1 + TIE) ? { now: ask.now, dense: points } : null;
}

/** Both halves at once, as `etna dag` asks: the line for the chart, or null. */
export function smallPrintHint<R extends DagOptions>(recipe: Recipe, chart: SmallPrintChart, denseRender: () => R | null): DenseHint | null {
  const ask = denseAskFor(chart, denseRender);
  return ask ? denseHintFor(recipe, ask) : null;
}
