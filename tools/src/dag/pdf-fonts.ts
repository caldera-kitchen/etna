// The free fonts a flow chart carries: which faces a theme needs, and what stands in for a face
// that is not to hand. A theme's font is the first family of its `font-family` (and of
// `title-font-family` for the title): the screen's font, the one the SVG embeds, and the one
// the PDF embeds. Pure and browser-safe; the files come from the font cache (`etna fonts`,
// card/fonts.ts) in Node, and from the web bundle in the GUI.

import { fontFamilies } from './schema.ts';
import type { ThemeReader } from './theme.ts';

/** One static face: a Google Fonts family at one weight. */
export interface PdfFace {
  family: string;
  weight: number;
}

/** The text roles of a chart, each with the family and weight it is set in. */
export type PdfRole = 'text' | 'ingredient' | 'operation' | 'title';

/** The family and weight each role is set in, by the theme. */
export function pdfRoles(t: ThemeReader): Record<PdfRole, PdfFace> {
  const text = leadFamily(t.str('font-family'));
  return {
    text: { family: text, weight: t.num('font-weight') },
    ingredient: { family: text, weight: t.num('ingredient-font-weight') },
    operation: { family: text, weight: t.num('operation-font-weight') },
    title: { family: leadFamily(t.str('title-font-family')), weight: t.num('title-font-weight') },
  };
}

/** The first family of a font stack: the theme's own font. */
export const leadFamily = (stack: string): string => fontFamilies(stack)[0];

/**
 * The families the theme's SVG embeds, each with the weights it is drawn at: the css2 spec
 * `etna fonts` caches as WOFF2 (`Nunito+Sans:wght@300;500;600`).
 */
export function svgFontSpecs(t: ThemeReader): { family: string; spec: string }[] {
  const weights = new Map<string, Set<number>>();
  for (const face of Object.values(pdfRoles(t))) {
    if (!weights.has(face.family)) weights.set(face.family, new Set());
    weights.get(face.family)!.add(face.weight);
  }
  return [...weights].map(([family, set]) => ({ family, spec: `${family.replace(/ /g, '+')}:wght@${[...set].sort((a, b) => a - b).join(';')}` }));
}

/** Every face the theme's PDF embeds, each once, sorted. */
export function pdfFaces(t: ThemeReader): PdfFace[] {
  const seen = new Map<string, PdfFace>();
  for (const face of Object.values(pdfRoles(t))) seen.set(`${face.family}|${face.weight}`, face);
  return [...seen.values()].sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);
}

/**
 * The bundled font that stands in, by `text-measure`, when a theme names a PDF font that is
 * not cached: one whose widths the layout's measure was made for (a monospace at 0.6 em, or a
 * sans the width table covers). There is no serif one yet; a serif theme falls back to the sans.
 */
export const PDF_FALLBACK_FAMILY: Record<string, string> = {
  mono: 'JetBrains Mono',
  sans: 'Arimo',
  serif: 'Arimo',
};

/**
 * The face to use for `want` among those `available`: the family itself at the nearest weight
 * (the heavier on a tie), else the fallback family the same way; null when neither is there.
 */
export function pickPdfFace(want: PdfFace, available: readonly PdfFace[], fallbackFamily: string): PdfFace | null {
  for (const family of [want.family, fallbackFamily]) {
    const faces = available.filter((f) => f.family === family);
    if (faces.length === 0) continue;
    return faces.reduce((best, f) => {
      const d = Math.abs(f.weight - want.weight);
      const bd = Math.abs(best.weight - want.weight);
      return d < bd || (d === bd && f.weight > best.weight) ? f : best;
    });
  }
  return null;
}
