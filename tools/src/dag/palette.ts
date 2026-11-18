// "Match the app": a chart theme's colors taken from the app's appearance (Settings >
// Appearance, tools/src/web/palettes.css). A theme that says `palette: app` (flow, dense) has its
// color values replaced by ones made from the appearance's CSS variables; a theme that says
// `palette: own` (ink, station, and any theme that says nothing) keeps its own. The GUI reads
// the variables from the page at render time; `etna dag` has no app and draws the theme's own.
//
// Pure: colors in, colors out. Mixing is a straight linear blend of sRGB channels, rounded to
// #rrggbb, so the same palette always gives the same chart.

import { parseColor, type Rgba } from './color.ts';
import { SPECS } from './schema.ts';
import type { DagTheme } from './theme.ts';

/** The app's colors, as its CSS variables give them (`--ground` → ground, `--on-accent` → onAccent). */
export interface AppPalette {
  ground: string;
  paper: string;
  ink: string;
  inkSoft: string;
  hairline: string;
  accent: string;
  onAccent?: string;
  rule?: string;
  accentSoft?: string;
}

/** The CSS variable behind each palette entry. */
export const APP_PALETTE_VARIABLES: Record<keyof AppPalette, string> = {
  ground: '--ground',
  paper: '--paper',
  ink: '--ink',
  inkSoft: '--ink-soft',
  hairline: '--hairline',
  accent: '--accent',
  onAccent: '--on-accent',
  rule: '--rule',
  accentSoft: '--accent-soft',
};

const REQUIRED: readonly (keyof AppPalette)[] = ['ground', 'paper', 'ink', 'inkSoft', 'hairline', 'accent'];

/**
 * The palette from a computed style (`getComputedStyle(document.documentElement)`), or null when
 * a required variable is missing or is not a color.
 */
export function readAppPalette(style: { getPropertyValue(name: string): string }): AppPalette | null {
  const out: Partial<AppPalette> = {};
  for (const [key, variable] of Object.entries(APP_PALETTE_VARIABLES) as [keyof AppPalette, string][]) {
    const value = style.getPropertyValue(variable).trim();
    if (value !== '' && parseColor(value) !== null) out[key] = value;
  }
  return REQUIRED.every((k) => out[k] !== undefined) ? (out as AppPalette) : null;
}

/** The theme's `palette` value: `app` or `own` (the schema's default when it says nothing). */
export function themePalette(theme: DagTheme | undefined | null): 'app' | 'own' {
  const value = theme?.values.palette ?? SPECS.get('palette')?.default;
  return value === 'app' ? 'app' : 'own';
}

// ------------------------------------------------------------------ color arithmetic

const opaque = (text: string): Rgba => {
  const c = parseColor(text);
  if (c === null) throw new Error(`not a color: "${text}"`);
  return c;
};

const hex = (c: Rgba): string =>
  '#' +
  [c.r, c.g, c.b]
    .map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0'))
    .join('');

/** `a` blended `t` of the way toward `b` (0: a, 1: b), channel by channel in sRGB, as #rrggbb. */
export function mix(a: string, b: string, t: number): string {
  const x = opaque(a);
  const y = opaque(b);
  return hex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: 1 });
}

/** How far apart two colors are: the straight-line distance of their sRGB channels, 0 to 441 (0–255 each). */
export function separation(a: string, b: string): number {
  const x = opaque(a);
  const y = opaque(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) * 255;
}

/** WCAG 2 relative luminance of a color (alpha ignored). */
export function luminance(text: string): number {
  const c = opaque(text);
  const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** WCAG 2 contrast ratio of two colors, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ------------------------------------------------------------------ the mapping
//
// Only the appearance's own surface roles are used, so the chart carries no hue the app does not
// show itself: operations are solid accent nodes with on-accent text, like the app's primary
// buttons; ingredients sit on the soft accent, as a selected row does; everything that draws a
// line or a word is the ink, the rule or the soft ink.

/** How far a missing `--accent-soft` is made from the paper toward the accent. */
export const SOFT_TINT = 0.12;
/** How far a missing `--rule` is made from the hairline toward the ink. */
export const RULE_TINT = 0.4;
/** The contrast text keeps on every fill, at least (WCAG AA for normal text). */
export const MIN_TEXT_CONTRAST = 4.5;

/** Every color value of a chart, made from the app palette. */
export function appColors(p: AppPalette): Record<string, string> {
  const reads = (text: string, fill: string): boolean => contrast(text, fill) >= MIN_TEXT_CONTRAST;
  // Steps of 0.05, rounded, so the result never drifts.
  const step = (t: number): number => Math.round((t + 0.05) * 100) / 100;
  const soft = p.accentSoft ?? mix(p.paper, p.accent, SOFT_TINT);
  const rule = p.rule ?? mix(p.hairline, p.ink, RULE_TINT);

  // Operations: solid accent with on-accent text, when that reads; otherwise (an appearance
  // whose on-accent does not reach 4.5:1 on its accent) the soft accent with ink text.
  const solid = p.onAccent !== undefined && reads(p.onAccent, p.accent);
  const operationFill = solid ? p.accent : soft;
  const operationText = solid ? (p.onAccent as string) : p.ink;

  // Ingredients: ink on the soft accent; leaned toward the paper if the ink would not read on
  // it. With soft operations (the fallback) they take the paper itself, to stay apart.
  let ingredientFill = solid ? soft : p.paper;
  for (let t = 0.05; !reads(p.ink, ingredientFill) && t <= 1; t = step(t)) ingredientFill = mix(soft, p.paper, t);

  // A preparation step joins nothing and is drawn apart: on the paper, in the ink, inside its
  // dashed accent outline, so it never passes for an operation.

  return {
    background: p.ground,
    'text-color': p.ink,
    'title-fill': p.paper,
    'title-stroke': p.ink,
    'ingredient-fill': ingredientFill,
    'ingredient-stroke': rule,
    'ingredient-text-color': p.ink,
    'operation-fill': operationFill,
    'operation-stroke': p.accent,
    'operation-text-color': operationText,
    'prep-fill': p.paper,
    'prep-text-color': p.ink,
    'edge-stroke': p.ink,
    'caption-color': p.inkSoft,
    'component-fill': p.paper,
    'component-stroke': rule,
    'component-title-fill': p.paper,
    'choose-stroke': p.ink,
    'checkpoint-fill': p.paper,
    'checkpoint-stroke': p.ink,
  };
}

/**
 * The theme with its colors taken from the app palette, when it says `palette: app`; the theme
 * itself, unchanged, when it says `palette: own` (or nothing). Values that are not colors are
 * left as they are.
 */
export function applyAppPalette(theme: DagTheme, palette: AppPalette): DagTheme {
  if (themePalette(theme) !== 'app') return theme;
  return { name: theme.name, values: { ...theme.values, ...appColors(palette) } };
}
