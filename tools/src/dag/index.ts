// Flow-chart (DAG) rendering for structured recipes. Pure and browser-safe: no file system,
// no font measuring (built-in width tables), the same output for the same input.
//
// This is the rendering track only (layout, edge routing, shapes, theme). What an operation
// node says is `nodeText`: the step's heading, then the words its instruction marks.
//
// Its code takes core's functions from their own modules (core/graph.ts, not core/index.ts),
// so the GUI's chart worker, which runs it, does not load the Markdown parser: one of the
// parser's packages needs a `document`, which a worker does not have.

import type { Recipe } from '../core/index.ts';
import { computeLayout, layoutDag as layoutDagWith } from './layout/index.ts';
import type { DagLayout } from './layout/types.ts';
import { drawSvg } from './svg.ts';
import { leadFamily } from './pdf-fonts.ts';
import { readTheme, type DagOptions, type DagTheme, type ThemeReader } from './theme.ts';

export {
  checkDagTheme,
  DAG_THEME_CONTRACT,
  defaultDagTheme,
  parseDagTheme,
  type DagOptions,
  type DagTheme,
  type DagThemeProblem,
} from './theme.ts';
export { computeLayout } from './layout/index.ts';
export type { DetailedLayout, DagLayout, LayoutBox, LayoutEdge, Point } from './layout/types.ts';
export { SCHEMA as dagThemeValues, valuesTable as dagThemeValuesTable, type ValueSpec as DagThemeValue } from './schema.ts';
export {
  appColors,
  applyAppPalette,
  APP_PALETTE_VARIABLES,
  contrast,
  mix,
  readAppPalette,
  separation,
  themePalette,
  type AppPalette,
} from './palette.ts';
export { applyCardType, CARD_INGREDIENT_WEIGHT, cardTypeValues, chartCanUse, chartHasCardFonts, NOMINAL_TEXT, nominalWidth, stackMeasure, themeFonts, xHeightFactor, type CardType } from './card-type.ts';
export { nodeText, NODE_MAX_LINES, NODE_WRAP, type IngredientTextMode } from './text.ts';

/**
 * An SVG document as a string. Throws an Error with a clear message for `form: traditional`
 * (no per-step ingredients, so no chart).
 */
export function renderDag(recipe: Recipe, options: DagOptions = {}): string {
  const layout = computeLayout(recipe, options);
  const label = recipe.title ? `Flow chart: ${recipe.title.text}` : 'Flow chart';
  const t = readTheme(options.theme);
  return drawSvg(layout, t, label, embeddedFontCss(t, options.fonts));
}

/** The chart's geometry (layout/). */
export function layoutDag(recipe: Recipe, options: DagOptions = {}): DagLayout {
  return layoutDagWith(recipe, options);
}

/**
 * The free fonts the theme's charts are set in: the first family of `font-family` and of
 * `title-font-family`, each once. What a caller reads from its font cache for `fonts.css`.
 */
export function chartFontFamilies(theme?: DagTheme): string[] {
  const t = readTheme(theme);
  return [...new Set([leadFamily(t.str('font-family')), leadFamily(t.str('title-font-family'))])];
}

/** The font css to embed: the caller's, when the mode (the caller's, else the theme's) is `embedded`. */
function embeddedFontCss(t: ThemeReader, fonts: DagOptions['fonts']): string {
  const mode = fonts?.mode ?? t.str('font-embedding');
  const css = mode === 'embedded' ? (fonts?.css ?? '') : '';
  // It goes into the SVG's style block as it is: nothing that could end the block or the XML.
  if (/[<>&]|\/\*/.test(css)) throw new Error('chart font css must be @font-face rules only');
  return css;
}
