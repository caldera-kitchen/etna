// Papers, page geometry and fit limits: what a theme's `page:` and `fit:` say, resolved for one
// print. Pure and browser-safe. Documented for theme authors in themes/README.md.

import { record, text, type Theme } from './theme.ts';

/** The papers themes are designed for. Index cards are used landscape. */
export const PAPERS = ['letter', 'a4', 'half-letter', 'index-4x6', 'index-5x7'] as const;
export type PaperName = (typeof PAPERS)[number];

/** Width and height of every paper a theme may name (`legal` and `a5` for `page.size` only, as in contract 1). */
const PAPER_SIZES: Record<string, { width: string; height: string; landscape?: boolean }> = {
  letter: { width: '8.5in', height: '11in' },
  a4: { width: '210mm', height: '297mm' },
  'half-letter': { width: '5.5in', height: '8.5in' },
  'index-4x6': { width: '6in', height: '4in', landscape: true },
  'index-5x7': { width: '7in', height: '5in', landscape: true },
  legal: { width: '8.5in', height: '14in' },
  a5: { width: '148mm', height: '210mm' },
};

const LENGTH_RE = /^\d+(\.\d+)?(in|cm|mm|pt|px|pc)$/;
const PT_PER: Record<string, number> = { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12 };

/** A length such as `10.5pt` or `14px` in points; null for anything else (em, %, nonsense). */
export function toPoints(value: string | null | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)(pt|px|in|cm|mm|pc)$/.exec((value ?? '').trim());
  return m ? Number(m[1]) * PT_PER[m[2]] : null;
}

/** One to four lengths, as for the CSS `margin` shorthand; anything else is null. */
export function pageMargin(value: string | null): string | null {
  if (value === null) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4 || !parts.every((p) => p === '0' || LENGTH_RE.test(p))) return null;
  return parts.join(' ');
}

/** A margin shorthand as its four sides: top, right, bottom, left. */
export function marginSides(margin: string): [string, string, string, string] {
  const p = margin.split(/\s+/);
  const [t, r = t, b = t, l = r] = p;
  return [t, r, b, l];
}

/**
 * How fitting may change a card, and when it tries (all fractions of the page's content height).
 * `min` and `max` are also the range of sizes offered to the reader.
 */
export interface FitLimits {
  /** The theme's size for this paper, in points: where fitting starts, and the size when it is off. */
  base: number;
  /** Smallest and largest text size fitting may choose, in points. */
  min: number;
  max: number;
  /** A last page filled less than this is nearly empty: shrink to pull the card onto one page fewer. */
  nearlyEmpty: number;
  /** A one-page card filled less than this is short: it keeps its size, never inflated. */
  short: number;
  /** Growing stops before the last page is filled beyond this (only with `grow`). */
  full: number;
  /** The steps sizes are tried in, in points. */
  step: number;
  /**
   * The theme's opt-in (`fit.grow: true`) to growing a card up to `max` to fill its pages.
   * False by default: fitting then only ever shrinks, and `max` bounds the sizes a reader may
   * pick (`--size`, the GUI's Size control).
   */
  grow: boolean;
}

/** The defaults behind `fit:` in theme.yaml. `min` and `max` default to the base size −15 % and +10 %. */
export const FIT_DEFAULTS = { nearlyEmpty: 0.3, short: 0.5, full: 0.9, step: 0.1, shrink: 0.85, grow: 1.1 } as const;

/** Everything one print needs to know about its page. */
export interface PageSetup {
  paper: string;
  width: string;
  height: string;
  /** The `@page size` value. */
  size: string;
  /** The page margins, as a CSS margin shorthand. */
  margin: string;
  /** The text size, as the theme wrote it (`10.5pt`). */
  fontSize: string;
  /** Fit limits; null when the theme's size is not in absolute units (fitting is then off). */
  fit: FitLimits | null;
}

const DEFAULT_MARGIN = '0.5in';
const FONT_SIZE_RE = /^\d+(\.\d+)?(pt|px|em|rem|mm|cm|in|%)$/;
export const DEFAULT_FONT_SIZE = '11pt';

/** The default paper and the papers a theme supports, with each paper's own settings (`page.papers`). */
export function themePapers(theme: Theme): { default: string; papers: string[]; settings: Record<string, Record<string, unknown>> } {
  const page = record(theme.manifest.page);
  const declared = page.papers;
  const settings: Record<string, Record<string, unknown>> = {};
  if (Array.isArray(declared)) {
    for (const name of declared) if (typeof name === 'string') settings[name.trim().toLowerCase()] = {};
  } else if (declared !== null && typeof declared === 'object') {
    for (const [name, value] of Object.entries(declared)) settings[name.trim().toLowerCase()] = record(value);
  }
  const papers = Object.keys(settings).filter((name) => Object.hasOwn(PAPER_SIZES, name));
  const own = ownPaperName(page);
  if (papers.length === 0) return { default: own, papers: [own], settings: { [own]: {} } };
  return { default: papers.includes(own) ? own : papers[0], papers, settings };
}

/** The paper `page.size` / `page.width` names: `custom` for a width and height. */
function ownPaperName(page: Record<string, unknown>): string {
  if (LENGTH_RE.test(text(page.width)?.trim() ?? '') && LENGTH_RE.test(text(page.height)?.trim() ?? '')) return 'custom';
  const name = (text(page.size) ?? 'letter').trim().toLowerCase();
  return Object.hasOwn(PAPER_SIZES, name) ? name : 'letter';
}

/** A paper the theme does not support, as an error that lists those it does. */
export function paperError(theme: Theme, paper: string): Error {
  const { papers } = themePapers(theme);
  const known = (PAPERS as readonly string[]).includes(paper);
  return new Error(
    `theme "${theme.name}" does not support ${known ? 'the paper' : 'an unknown paper'} "${paper}" ` +
      `(it supports: ${papers.join(', ')}${known ? '' : `; papers: ${PAPERS.join(', ')}`})`,
  );
}

/**
 * The page setup for one print: the paper's size, the theme's margins, size and fit limits for
 * it. Throws (paperError) when the theme does not support `paper`.
 */
export function pageSetup(theme: Theme, paper?: string): PageSetup {
  const page = record(theme.manifest.page);
  const { default: fallback, papers, settings } = themePapers(theme);
  const name = (paper ?? fallback).trim().toLowerCase();
  if (!papers.includes(name)) throw paperError(theme, name);
  const own = (Object.hasOwn(settings, name) ? settings[name] : undefined) ?? {};
  const landscape = page.orientation === 'landscape';

  let width: string;
  let height: string;
  let size: string;
  if (name === 'custom') {
    [width, height] = [text(page.width)!.trim(), text(page.height)!.trim()];
    if (landscape) [width, height] = [height, width];
    size = `${width} ${height}`;
  } else {
    const p = PAPER_SIZES[name];
    const turned = landscape && !p.landscape;
    [width, height] = turned ? [p.height, p.width] : [p.width, p.height];
    // CSS names letter, legal, a4 and a5; the others are given by their dimensions.
    size = ['letter', 'legal', 'a4', 'a5'].includes(name) ? `${name}${turned ? ' landscape' : ''}` : `${width} ${height}`;
  }

  const margin = pageMargin(text(own.margin)) ?? pageMargin(text(page.margin)) ?? DEFAULT_MARGIN;
  const options = record(theme.manifest.options);
  const sizeText = (text(own['font-size']) ?? text(options['font-size']) ?? '').trim();
  const fontSize = FONT_SIZE_RE.test(sizeText) ? sizeText : DEFAULT_FONT_SIZE;
  return { paper: name, width, height, size, margin, fontSize, fit: fitLimits(fontSize, record(theme.manifest.fit), record(own.fit)) };
}

/** The text sizes fitting may use, in points, whatever a theme asks for. */
export const FIT_SIZE_RANGE = { min: 4, max: 72 } as const;

/** `fit:` in theme.yaml, with a paper's own `fit:` over it, around the base size. */
export function fitLimits(fontSize: string, themeFit: Record<string, unknown>, paperFit: Record<string, unknown> = {}): FitLimits | null {
  const stated = toPoints(fontSize);
  if (stated === null || !Number.isFinite(stated)) return null;
  // Whatever a theme says, the sizes tried stay within what a card can be printed at: the
  // fitting loop walks this range in steps of a tenth of a point.
  const sane = (p: number) => Math.min(FIT_SIZE_RANGE.max, Math.max(FIT_SIZE_RANGE.min, p));
  const base = sane(stated);
  const pick = (key: string) => paperFit[key] ?? themeFit[key];
  const pts = (key: string, fallback: number) => {
    const v = pick(key);
    const p = typeof v === 'number' ? v : toPoints(text(v));
    return sane(p !== null && Number.isFinite(p) && p > 0 ? p : fallback);
  };
  const frac = (key: string, fallback: number) => {
    const v = pick(key);
    return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
  };
  const round = (x: number) => Math.round(x * 10) / 10;
  const min = round(Math.min(pts('min', base * FIT_DEFAULTS.shrink), base));
  const max = round(Math.max(pts('max', base * FIT_DEFAULTS.grow), base));
  return {
    base: round(base),
    min,
    max,
    nearlyEmpty: frac('nearly-empty', FIT_DEFAULTS.nearlyEmpty),
    short: frac('short', FIT_DEFAULTS.short),
    full: frac('full', FIT_DEFAULTS.full),
    step: FIT_DEFAULTS.step,
    grow: pick('grow') === true,
  };
}

/** Problems with `page.papers` and `fit:` in a theme.yaml, for the checker. */
export function pagingProblems(manifest: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const page = record(manifest.page);
  const papers = page.papers;
  if (papers !== undefined) {
    const names = Array.isArray(papers) ? papers : papers !== null && typeof papers === 'object' ? Object.keys(papers) : null;
    if (names === null || names.length === 0) problems.push('page.papers must list papers (letter, a4, half-letter, index-4x6, index-5x7)');
    else {
      for (const n of names) {
        if (typeof n !== 'string' || !(PAPERS as readonly string[]).includes(n)) problems.push(`page.papers: unknown paper ${JSON.stringify(n)} (${PAPERS.join(', ')})`);
      }
      if (!Array.isArray(papers)) {
        for (const [n, v] of Object.entries(record(papers))) {
          const s = record(v);
          for (const key of Object.keys(s)) if (!['margin', 'font-size', 'fit'].includes(key)) problems.push(`unknown key "page.papers.${n}.${key}"`);
          if (s.margin !== undefined && pageMargin(text(s.margin)) === null) problems.push(`page.papers.${n}.margin must be one to four lengths`);
          if (s['font-size'] !== undefined && toPoints(text(s['font-size'])) === null) problems.push(`page.papers.${n}.font-size must be a size in pt or px`);
          problems.push(...fitProblems(record(s.fit), `page.papers.${n}.fit`));
        }
      }
    }
  }
  if (manifest.fit !== undefined) problems.push(...fitProblems(record(manifest.fit), 'fit'));
  return problems;
}

function fitProblems(fit: Record<string, unknown>, where: string): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(fit)) {
    if (key === 'min' || key === 'max') {
      const size = toPoints(text(value));
      if (size === null || !Number.isFinite(size)) problems.push(`${where}.${key} must be a size in pt or px (9pt)`);
      else if (size < FIT_SIZE_RANGE.min || size > FIT_SIZE_RANGE.max) problems.push(`${where}.${key} must be between ${FIT_SIZE_RANGE.min}pt and ${FIT_SIZE_RANGE.max}pt`);
    } else if (key === 'nearly-empty' || key === 'short' || key === 'full') {
      if (typeof value !== 'number' || value < 0 || value > 1) problems.push(`${where}.${key} must be a fraction of the page, 0 to 1`);
    } else if (key === 'grow') {
      if (typeof value !== 'boolean') problems.push(`${where}.grow must be true or false`);
    } else problems.push(`unknown key "${where}.${key}"`);
  }
  const min = toPoints(text(fit.min));
  const max = toPoints(text(fit.max));
  if (min !== null && max !== null && min > max) problems.push(`${where}.min is larger than ${where}.max`);
  return problems;
}
