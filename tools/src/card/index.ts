// Recipe cards: a recipe rendered to printable HTML + print CSS, driven by a theme.
//
// A theme is a card fragment with named slots, a stylesheet and a manifest. The
// renderer owns the page around it and a core stylesheet every theme builds on. The contract
// between the two is documented in themes/README.md and versioned (THEME_CONTRACT).
// Pure and browser-safe: a theme arrives as file name → text, however the caller got it.

/** The card theme used when none is named. */
export const DEFAULT_THEME = 'mise';

export { parseTheme, type Theme } from './theme.ts';
export { cardPaging, cardType, DEFAULT_TITLE_WEIGHT, renderCard, renderCardParts, renderListCard, type CardOptions, type CardPaging, type ListCardOptions } from './render.ts';
export { FIT_DEFAULTS, pageSetup, PAPERS, paperError, themePapers, toPoints, type FitLimits, type PageSetup, type PaperName } from './paper.ts';
export { decideFit, type FitDecision, type FitRule, type Layout } from './fit.ts';
export { pagingScript } from './script.ts';
export { checkTheme, type CheckOptions, type ThemeReport } from './check.ts';
export { recipeShoppingList, shoppingListHtml, type ListHtmlOptions } from './list.ts';
export {
  fontFaceRule,
  googleFontsHref,
  GOOGLE_FONTS_CSS,
  GOOGLE_FONTS_FILES,
  KEPT_SUBSETS,
  parseGoogleCss,
  specFamily,
  webfontProblems,
  type FontFace,
  type WebFont,
  type WebfontMode,
} from './webfonts.ts';
export { CARD_COLOR_ROLES, CORE_CSS } from './core-css.ts';
export {
  CARD_CSP,
  CARD_CSP_WEB,
  CARD_ICON,
  cardCsp,
  DEFAULT_LABELS,
  DEFAULT_LAYOUT,
  LAYOUTS,
  DEFAULT_PARTS,
  PARTS,
  REQUIRED_SLOTS,
  requiredSlots,
  SLOTS,
  SLOT_SWITCHES,
  THEME_CONTRACT,
  skeletonProblems,
  stylesheetProblems,
  type LayoutName,
  type PartsName,
} from './contract.ts';
