// The sheet a flow chart prints on: paper, orientation, page margin and the box the chart may
// fill. Pure; shared by the GUI (engine.ts re-exports it) and the PDF (pdf.ts), in Node and the
// browser.

import { parseColor } from './color.ts';

/** Sheets a chart may print on; anything else falls back to letter. */
export type ChartPaper = 'letter' | 'a4';
const CHART_SHEETS: Record<ChartPaper, { width: number; height: number; unit: 'in' | 'mm' }> = {
  letter: { width: 8.5, height: 11, unit: 'in' },
  a4: { width: 210, height: 297, unit: 'mm' },
};
export const chartPaper = (paper: string | null | undefined): ChartPaper => (paper === 'a4' ? 'a4' : 'letter');

/** Page margins a chart may print with, in inches; `0.5` unless the reader asks for more room for a printer's border. */
export const CHART_MARGINS = ['0.5in', '0.75in', '1in'] as const;
export type ChartMargin = (typeof CHART_MARGINS)[number];
export const chartMargin = (value: string | null | undefined): ChartMargin => (CHART_MARGINS.includes(value as ChartMargin) ? (value as ChartMargin) : '0.5in');

/**
 * What a chart is fitted to. `screen` (the default): no sheet; a screen scrolls, so the chart
 * is as narrow as it can be. Or a sheet: `auto`, whichever way up prints the chart larger;
 * `portrait` or `landscape`, that way whatever the chart's proportions. The layout is made for
 * it (DagOptions.sheet), so the shape also shapes the chart. A PDF is always a sheet: a chart
 * fitted to the screen prints on `auto` (`pageShape`).
 */
export const CHART_SHAPES = ['screen', 'auto', 'portrait', 'landscape'] as const;
export type ChartShape = (typeof CHART_SHAPES)[number];
/** What a chart is fitted to: a screen, unless a sheet is asked for. */
export const chartShape = (value: string | null | undefined): ChartShape => (CHART_SHAPES.includes(value as ChartShape) ? (value as ChartShape) : 'screen');
/** The shape of the sheet a chart prints on: a chart fitted to the screen prints on `auto`. */
export const pageShape = (value: string | null | undefined): Exclude<ChartShape, 'screen'> => {
  const shape = chartShape(value);
  return shape === 'screen' ? 'auto' : shape;
};

/** A chart's sheet, in the sheet's own unit (`in` or `mm`) as CSS lengths, and in PDF points. */
export interface ChartSheet {
  width: string;
  height: string;
  /** The CSS `@page` size: `letter`, `A4 landscape`… */
  size: string;
  margin: ChartMargin;
  imgWidth: string;
  imgHeight: string;
  landscape: boolean;
  /** The same in points (1/72 in): the page, and the box the chart is fitted into, from the page's top left. */
  points: { width: number; height: number; box: { x: number; y: number; width: number; height: number } };
}

const POINTS = { in: 72, mm: 72 / 25.4 } as const;

/** The page margin and the further inset of the image, in the sheet's own unit. */
function marginAndInset(paper: ChartPaper, marginChoice: ChartMargin): { margin: number; inset: number } {
  const unit = CHART_SHEETS[paper].unit;
  const marginIn = parseFloat(marginChoice);
  return { margin: unit === 'in' ? marginIn : marginIn * 25.4, inset: unit === 'in' ? 0.125 : 3.2 };
}

/**
 * The box a chart may fill on the sheet, in points, with the sheet upright (portrait): the
 * same as `chartSheetFor(…, 'portrait').points.box`. Turned landscape, swap the two.
 */
export function chartBox(paper: ChartPaper, marginChoice: ChartMargin = '0.5in'): { width: number; height: number } {
  const sheet = CHART_SHEETS[paper];
  const { margin, inset } = marginAndInset(paper, marginChoice);
  const pt = POINTS[sheet.unit];
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return { width: round((sheet.width - 2 * (margin + inset)) * pt), height: round((sheet.height - 2 * (margin + inset)) * pt) };
}

/**
 * The sheet a chart of `width` × `height` prints on and the box the image may fill, in
 * physical units. The page margin is half an inch (or the margin chosen), more than any desktop
 * printer's unprintable border; the image is held a further eighth of an inch inside it on
 * every side, so nothing rests on the edge. With `shape` `auto` (the default) a chart wider
 * than tall turns the sheet landscape; `portrait` and `landscape` fix it.
 */
export function chartSheetFor(width: number, height: number, paper: ChartPaper, marginChoice: ChartMargin = '0.5in', shape: ChartShape = 'auto'): ChartSheet {
  const sheet = CHART_SHEETS[paper];
  const landscape = shape === 'landscape' || (shape !== 'portrait' && width > height);
  const [w, h] = landscape ? [sheet.height, sheet.width] : [sheet.width, sheet.height];
  const { margin, inset } = marginAndInset(paper, marginChoice);
  const fmt = (n: number): string => `${Math.round(n * 1000) / 1000}${sheet.unit}`;
  const pt = POINTS[sheet.unit];
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    width: fmt(w),
    height: fmt(h),
    size: `${paper === 'a4' ? 'A4' : 'letter'}${landscape ? ' landscape' : ''}`,
    margin: marginChoice,
    imgWidth: fmt(w - 2 * (margin + inset)),
    imgHeight: fmt(h - 2 * (margin + inset)),
    landscape,
    points: {
      width: round(w * pt),
      height: round(h * pt),
      box: { x: round((margin + inset) * pt), y: round((margin + inset) * pt), width: round((w - 2 * (margin + inset)) * pt), height: round((h - 2 * (margin + inset)) * pt) },
    },
  };
}

/** `chartSheetFor` with the chart's size read from an SVG's viewBox (portrait when it has none, unless `shape` says landscape). */
export function chartSheet(svg: string, paper: ChartPaper, marginChoice: ChartMargin = '0.5in', shape: ChartShape = 'auto'): ChartSheet {
  const vb = chartViewBox(svg);
  return chartSheetFor(vb?.width ?? 0, vb?.height ?? 0, paper, marginChoice, shape);
}

// A chart's SVG carries the recipe's own text (its title in `<title>` and `aria-label`, before
// the style block; its steps and amounts after it). Whatever is read back out of the text is
// therefore read from where only the renderer writes: the root element's viewBox, and the
// style block, whose values the schema checked.

/** The width and height of an SVG's viewBox, from its root element only; null when it has none or they are not positive. */
export function chartViewBox(svg: string): { width: number; height: number } | null {
  const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const vb = /\sviewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(root);
  if (!vb) return null;
  const width = Number(vb[1]);
  const height = Number(vb[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The chart's background color, from its style block (drawSvg's `.dag-background` rule), or
 * `fallback` when there is none or the value is not a color as the schema gives them. The
 * recipe's title comes before the style block and may hold the same text, so only the block is read.
 */
export function chartBackground(svg: string, fallback = '#fff'): string {
  const style = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
  const value = /\.etna-dag \.dag-background\{fill:([^;}]+)\}/.exec(style)?.[1].trim() ?? '';
  return value === 'none' || value === 'transparent' || parseColor(value) !== null ? value : fallback;
}
