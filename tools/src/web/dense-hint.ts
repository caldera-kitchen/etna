// The line under a chart fitted to a page whose text prints small: how large its body text
// prints there, and how large the Dense style prints it (ADR 0020).
// Pure, over the engine's own render options, so the size it gives is the size that prints. The
// rule and the sizes are dag/small-print.ts's, which `etna dag` uses for its note too; this
// module turns the chart tab's choices into what that rule takes.

import type { Recipe } from '../core/index.ts';
import { chartViewBox } from '../dag/sheet.ts';
import { denseAskFor, denseHintFor, type DenseAsk, type DenseHint } from '../dag/small-print.ts';
import { readTheme } from '../dag/theme.ts';
import { chartRenderOptions, themeJoinEdges, type ChartJoinEdges, type ChartRender, type ChartSheetChoice, type ChartThemeEntry } from './engine.ts';
import type { CardType } from '../dag/index.ts';

/** The chart style the line suggests: the built-in Dense. */
export const DENSE_CHART_THEME = 'builtin:dense';

/** What the chart on screen was drawn with; the Dense chart is laid out with the same. */
export interface DenseHintOptions {
  /** The remembered choice; null: as each chart style has it. */
  joinEdges: ChartJoinEdges | null;
  sheet: ChartSheetChoice;
  cardType?: CardType | null;
}

/**
 * The line to show under a chart fitted to a page, or null for none: when it shows is
 * dag/small-print.ts's rule (a page, body text under `SMALL_PRINT`, not already Dense, Dense
 * available, and Dense printing it more than `TIE` larger).
 * `svg` is the chart as drawn with `entry` and `options` (its viewBox is the layout's size);
 * the Dense chart is laid out only when the first three hold. The GUI does the two halves
 * apart: denseAsk on the page, denseHintFor (laying Dense out) in the chart's worker.
 */
export function denseHint(recipe: Recipe, entry: ChartThemeEntry | null, all: ChartThemeEntry[], svg: string, options: DenseHintOptions): DenseHint | null {
  const ask = denseAsk(entry, all, svg, options);
  return ask ? denseHintFor(recipe, ask) : null;
}

/** The first three conditions of denseHint, quick to check: what to lay Dense out with, or null when no line can show. */
export function denseAsk(entry: ChartThemeEntry | null, all: ChartThemeEntry[], svg: string, options: DenseHintOptions): DenseAsk<ChartRender> | null {
  const vb = chartViewBox(svg);
  const shown = chartRenderOptions(entry, { joinEdges: options.joinEdges ?? themeJoinEdges(entry), cardType: options.cardType });
  if (!vb || !shown.ok) return null;
  const chart = { width: vb.width, height: vb.height, fontSize: readTheme(shown.value.theme).num('font-size'), sheet: options.sheet, dense: entry?.id === DENSE_CHART_THEME };
  return denseAskFor(chart, () => {
    const dense = all.find((e) => e.id === DENSE_CHART_THEME && e.theme !== null);
    if (!dense) return null;
    const render = chartRenderOptions(dense, { joinEdges: options.joinEdges ?? themeJoinEdges(dense), sheet: options.sheet, cardType: options.cardType });
    return render.ok ? render.value : null;
  });
}
