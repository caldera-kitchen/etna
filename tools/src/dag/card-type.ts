// "Match the card": a chart theme's type taken from a card style's two type roles.
// A card style states a body font and a title font with the title's weight (`options.fonts` in
// its theme.yaml; card/render.ts `cardType` reads them). A chart theme that says `fonts: card`
// (flow, dense) is then set in them: its title in the card's title font at the card's title
// weight, all other text in the card's body font, ingredients in its regular weight as on a
// card, and every text size scaled so the card's fonts stand as tall in lower case as the
// theme's own. Shapes, spacing and colors stay the chart theme's. A theme that says `fonts: own` (station, and any theme that says nothing)
// keeps its own. The GUI passes the card style the Font menu names (the one in use, or one
// pinned); `etna dag` only with `--card`.
//
// Pure: a card type in, theme values out. Widths come from the generated metrics
// (font-metrics.ts), so the same card always gives the same chart.

import { measurer, metricWeight, metricWeights, metricXHeight, type TextMeasure } from './measure.ts';
import { fontFamilies, SPECS, validateValue } from './schema.ts';
import { readTheme, type DagTheme } from './theme.ts';

/** A card style's type roles: the body and title font stacks, and the title's weight. */
export interface CardType {
  body: { stack: string };
  title: { stack: string; weight: number };
}

/** The theme's `fonts` value: `card` or `own` (the schema's default when it says nothing). */
export function themeFonts(theme: DagTheme | undefined | null): 'card' | 'own' {
  const value = theme?.values.fonts ?? SPECS.get('fonts')?.default;
  return value === 'card' ? 'card' : 'own';
}

/**
 * The width table for a stack whose first family has no metrics, from the generic family
 * that ends it: `mono` for monospace, `serif` for serif, `sans` for anything else.
 */
export function stackMeasure(stack: string): TextMeasure {
  const last = fontFamilies(stack).at(-1)?.toLowerCase();
  if (last === 'monospace' || last === 'ui-monospace') return 'mono';
  if (last === 'serif' || last === 'ui-serif') return 'serif';
  return 'sans';
}

/**
 * The text a font's nominal character is the mean advance of: the lowercase alphabet, each
 * letter once (the classic "average character width"). JetBrains Mono gives 0.6, Flow's own.
 */
export const NOMINAL_TEXT = 'abcdefghijklmnopqrstuvwxyz';

/**
 * The nominal character of a stack at `weight`, in em, to three places: the mean advance over
 * NOMINAL_TEXT in its first family's own widths (at the nearest weight there are metrics for),
 * else in the width table its generic family gives (0.6, one cell, for a monospace).
 */
export function nominalWidth(stack: string, weight: number): number {
  const family = fontFamilies(stack)[0];
  const fallback = stackMeasure(stack);
  if (metricWeight(family, weight) === null && fallback === 'mono') return 0.6;
  const em = measurer(fallback, weight, 1, family)(NOMINAL_TEXT) / [...NOMINAL_TEXT].length;
  return Math.round(em * 1000) / 1000;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The weight `family` is drawn at for `weight`: the nearest it has metrics (cached TrueType) for, else `weight`. */
const drawnWeight = (stack: string, weight: number): number => metricWeight(fontFamilies(stack)[0], weight) ?? weight;

/** The ingredient weight of a chart in a card's fonts: regular, as a card sets its ingredients. */
export const CARD_INGREDIENT_WEIGHT = 400;

/**
 * The factor a text size set in `theirs` at `theirWeight` is scaled by so that its x-height
 * (lower-case height) equals that of `own` at `ownWeight`: own x-height over theirs, each
 * from the first family's generated metrics at the face it is measured at. 1 when the first
 * families are the same, or when either has no x-height (no metrics).
 */
export function xHeightFactor(own: string, ownWeight: number, theirs: string, theirWeight: number): number {
  const a = fontFamilies(own)[0] ?? '';
  const b = fontFamilies(theirs)[0] ?? '';
  if (a === b) return 1;
  const x = metricXHeight(a, ownWeight);
  const y = metricXHeight(b, theirWeight);
  return x === null || y === null ? 1 : x / y;
}

/** The text sizes set in the body font, and those set in the title font. */
const BODY_SIZES = ['font-size', 'caption-font-size', 'component-title-font-size'] as const;
const TITLE_SIZES = ['title-font-size', 'subtitle-font-size'] as const;

/**
 * The type values of a chart in the card's fonts, over `theme`'s own:
 * - `font-family`, `text-measure`: the card's body stack, and the width table its generic
 *   family gives; `title-font-family`, `title-text-measure` the same for the title stack.
 * - `title-font-weight`: the card's title weight; `ingredient-font-weight`: regular (400), as
 *   on a card. The theme's other text weights (`font-weight`, `operation-font-weight`) are
 *   kept. Each is moved to the nearest weight its family is cached at, so the chart never asks
 *   for a face that is not there.
 * - `char-width`: the body font's nominal character (nominalWidth) at the ingredient weight,
 *   so the `*-wrap` counts stay counts of that font's characters.
 * - `title-wrap`: scaled by the title font's nominal character over `char-width`, so a title
 *   line holds as many of the title font's characters as the theme asks for.
 * - every text size (BODY_SIZES, TITLE_SIZES): times xHeightFactor, so the card's font has the
 *   x-height the theme's own has at the theme's size: the body sizes by the body fonts at the
 *   ingredient weights, the title sizes by the title fonts at the title weights; to two places,
 *   within the schema's range. Paddings, minimum sizes and strokes stay the theme's; boxes grow
 *   or shrink with the text measured in them.
 */
export function cardTypeValues(theme: DagTheme | undefined, card: CardType): Record<string, string | number> {
  const t = readTheme(theme);
  const body = card.body.stack;
  const title = card.title.stack;
  const ingredientWeight = drawnWeight(body, CARD_INGREDIENT_WEIGHT);
  const titleWeight = drawnWeight(title, card.title.weight);
  const spec = SPECS.get('char-width')!.spec as { min: number; max: number };
  const charWidth = clamp(nominalWidth(body, ingredientWeight), spec.min, spec.max);
  const titleWrap = clamp(Math.round((t.num('title-wrap') * nominalWidth(title, titleWeight)) / charWidth), 8, 80);
  const bodyFactor = xHeightFactor(t.str('font-family'), t.num('ingredient-font-weight'), body, ingredientWeight);
  const titleFactor = xHeightFactor(t.str('title-font-family'), t.num('title-font-weight'), title, titleWeight);
  const sizes: Record<string, number> = {};
  const scale = (keys: readonly string[], factor: number): void => {
    for (const key of keys) {
      const range = SPECS.get(key)!.spec as { min: number; max: number };
      sizes[key] = clamp(Math.round(t.num(key) * factor * 100) / 100, range.min, range.max);
    }
  };
  scale(BODY_SIZES, bodyFactor);
  scale(TITLE_SIZES, titleFactor);
  return {
    'font-family': body,
    'text-measure': stackMeasure(body),
    'font-weight': drawnWeight(body, t.num('font-weight')),
    'ingredient-font-weight': ingredientWeight,
    'operation-font-weight': drawnWeight(body, t.num('operation-font-weight')),
    'char-width': charWidth,
    'title-font-family': title,
    'title-text-measure': stackMeasure(title),
    'title-font-weight': titleWeight,
    'title-wrap': titleWrap,
    ...sizes,
  };
}

/** Whether both of the card's stacks are font stacks a chart theme may hold (the schema's `font`). */
export function chartCanUse(card: CardType): boolean {
  const font = SPECS.get('font-family')!;
  return [card.body.stack, card.title.stack].every((stack) => 'value' in validateValue(font, stack));
}

/**
 * Whether a chart can be set in the card's fonts and draw them as it measures them: both stacks
 * are ones a chart theme may hold (chartCanUse), and each first family has widths, which only a
 * font in the cache has (its TrueType files, which the PDF embeds). The GUI's Font menu offers
 * only such card styles.
 */
export function chartHasCardFonts(card: CardType): boolean {
  return chartCanUse(card) && [card.body.stack, card.title.stack].every((stack) => metricWeights(fontFamilies(stack)[0] ?? '').length > 0);
}

/**
 * The theme set in the card's fonts, when it says `fonts: card`; the theme itself, unchanged,
 * when it says `fonts: own` (or nothing), or when a card stack is not one a chart theme may
 * hold (the schema's font stack: plain family names, ending in a generic family).
 */
export function applyCardType(theme: DagTheme, card: CardType): DagTheme {
  if (themeFonts(theme) !== 'card' || !chartCanUse(card)) return theme;
  return { name: theme.name, values: { ...theme.values, ...cardTypeValues(theme, card) } };
}
