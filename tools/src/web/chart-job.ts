// The chart pane's work that can take long: laying out and drawing a flow chart (its SVG), and
// making its PDF. The GUI runs it in a Web Worker (chart-worker.ts, through chart-lane.ts), so a
// large recipe does not freeze the page; this module is what the worker runs, and what the page
// runs itself when it has no worker. It imports no GUI data (engine.ts and its bundled themes,
// fonts and registries): the job brings everything it needs, made on the page.

import type { Recipe } from '../core/index.ts';
import { renderDag } from '../dag/index.ts';
import type { ChartRender } from './engine.ts';
import { denseHintFor, type DenseAsk, type DenseHint } from '../dag/small-print.ts';

/**
 * A chart to make. `render` is what engine.ts's chartRenderOptions (the SVG) or
 * chartPdfRenderOptions (the PDF) made of the toolbar's and Settings' choices; `fontCss` the
 * chart's free fonts loaded so far (chart-fonts.ts). Everything in it survives being copied to
 * the worker (structured clone): plain data, no functions.
 */
export type ChartJob =
  | { kind: 'svg'; recipe: Recipe; render: ChartRender; fontCss: string }
  | { kind: 'pdf'; recipe: Recipe; render: ChartRender }
  | { kind: 'dense'; recipe: Recipe; ask: DenseAsk<ChartRender> };

/** What a job comes to: the SVG's text, the PDF's bytes, the Dense line (dag/small-print.ts), or the message of what went wrong. */
export type ChartAnswer = { ok: true; svg: string } | { ok: true; pdf: Uint8Array } | { ok: true; dense: DenseHint | null } | { ok: false; error: string };

/**
 * Make the chart. The SVG is engine.ts's `chart` exactly (renderDag with the same options and
 * the fonts' css), so it is the same bytes in the worker and on the page; the PDF is
 * chart-pdf.ts's, its code and fonts loaded on first use; the Dense line lays the chart out in
 * Dense (dag/small-print.ts), as slow as making the chart.
 */
export async function runChartJob(job: ChartJob): Promise<ChartAnswer> {
  try {
    if (job.kind === 'svg') return { ok: true, svg: renderDag(job.recipe, { ...job.render, fonts: { css: job.fontCss } }) };
    if (job.kind === 'dense') return { ok: true, dense: denseHintFor(job.recipe, job.ask) };
    const { chartPdfBytes } = await import('./chart-pdf.ts');
    return { ok: true, pdf: await chartPdfBytes(job.recipe, job.render) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
