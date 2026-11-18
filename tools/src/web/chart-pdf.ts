// The chart pane's PDF: the flow chart drawn by dag/pdf.ts, with the chart themes' fonts from
// the bundle. chart-job.ts imports this module only when PDF is first clicked (in the chart's
// worker, or on the page when it has none), so pdf-lib, fontkit and the font files (each its own
// lazy chunk) are not part of the GUI's first load.

import * as pdfFonts from 'virtual:etna-pdf-fonts';

import type { Recipe } from '../core/index.ts';
import { renderDagPdf, type PdfFonts } from '../dag/pdf.ts';
import type { DagOptions, DagTheme } from '../dag/theme.ts';

/** The fonts bundled for the chart PDFs (build.ts): each face's file is fetched when first embedded. */
const fonts: PdfFonts = {
  faces: pdfFonts.faces.map(({ family, weight }) => ({ family, weight })),
  async load(face) {
    const found = pdfFonts.faces.find((f) => f.family === face.family && f.weight === face.weight);
    if (!found) throw new Error(`no PDF font for ${face.family} ${face.weight} in this build`);
    const base64 = await found.load();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  },
};

/**
 * The chart as a PDF file's bytes: the same bytes `etna dag --pdf` writes for the same recipe and
 * options. `render.sheet` is the sheet it is laid out for and printed on (paper, margin, shape).
 */
export function chartPdfBytes(recipe: Recipe, render: { theme?: DagTheme; sheet?: DagOptions['sheet'] }): Promise<Uint8Array> {
  return renderDagPdf(recipe, { ...render, fonts });
}
