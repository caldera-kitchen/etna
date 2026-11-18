// Node-only: the chart PDF fonts from the font cache (themes/.fonts, filled by `etna fonts`).

import { readFileSync } from 'node:fs';

import { cachedPdfFaces, familyFontCss, FONTS_DIR } from '../card/fonts.ts';
import { chartFontFamilies } from './index.ts';
import type { DagTheme } from './theme.ts';
import type { PdfFonts } from './pdf.ts';

/** Every cached TrueType face, read from disk when the PDF embeds it. */
export function cachedPdfFonts(dir: string = FONTS_DIR): PdfFonts {
  const faces = cachedPdfFaces(dir);
  return {
    faces: faces.map(({ family, weight }) => ({ family, weight })),
    async load(face) {
      const found = faces.find((f) => f.family === face.family && f.weight === face.weight);
      if (!found) throw new Error(`the font cache has no ${face.family} ${face.weight}: run "etna fonts"`);
      return new Uint8Array(readFileSync(found.path));
    },
  };
}

/**
 * The @font-face rules a chart SVG embeds for the theme (`renderDag`'s `fonts.css`): each of
 * its free fonts from the cache, WOFF2 where cached, else TrueType. Empty when none is cached.
 */
export function chartFontCss(theme?: DagTheme, dir: string = FONTS_DIR): string {
  return chartFontFamilies(theme)
    .map((family) => familyFontCss(family, dir))
    .join('');
}
