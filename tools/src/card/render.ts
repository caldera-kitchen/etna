// Rendering a card: the theme's fragment filled with the recipe, inside the page the renderer owns.

import type { Recipe } from '../core/index.ts';
import { renderBody, type Display, type Labels } from './body.ts';
import { CARD_ICON, cardCsp, DEFAULT_LABELS, layoutName, NON_SLOT_LABELS, partsName, PICTURE_SRC, SLOT_SWITCHES, type LayoutName, type PartsName } from './contract.ts';
import { columnProperties } from './columns.ts';
import { CARD_COLOR_ROLES, CORE_CSS } from './core-css.ts';
import { esc } from './html.ts';
import { recipeShoppingList, shoppingListHtml } from './list.ts';
import { unconvertedFooter, type ConsolidateOptions, type ShoppingList } from '../list/index.ts';
import { marginSides, pageSetup, toPoints, type FitLimits, type PageSetup } from './paper.ts';
import { pagingScript } from './script.ts';
import { fillTemplate, usesSlot } from './template.ts';
import { record, text, type Theme } from './theme.ts';
import { googleFontsHref, GOOGLE_FONTS_FILES, type WebfontMode } from './webfonts.ts';
import type { CardType } from '../dag/card-type.ts';

export interface CardOptions {
  slots?: Record<string, boolean>; // overrides theme defaults
  display?: { units?: 'long' | 'symbol'; fractions?: 'unicode' | 'ascii'; range?: 'to' | 'dash' };
  fonts?: { body?: string; title?: string };
  /** Structured recipes: one ingredient table per run of steps (`hoisted`), or each step with its own (`paired`). Defaults to the theme's. */
  layout?: LayoutName;
  /**
   * Traditional recipes: `sections` (the classic card: one ingredient table, then the directions
   * part by part) or `paired` (each part's ingredients beside its steps). Defaults to the theme's.
   */
  parts?: PartsName;
  /**
   * Print the recipe's Notes section (either form). Notes are opt-in on every card: absent or
   * false leaves them out, and the card says nothing about them (no heading, no placeholder).
   * `true` prints them where the theme has a place for them (a `{{notes}}` slot); a theme whose
   * `options.slots.notes` is false, or a caller's `slots.notes: false`, still prints none.
   * Callouts inside steps (Note, Checkpoint…) are not the Notes section and always
   * print; so does a shopping list's footer.
   */
  notes?: boolean;
  /**
   * The recipe's picture (`image/etna.jpg`, SPEC §4.3), as the caller read it: `src` is a
   * `data:image/jpeg;base64,…` or `data:image/png;base64,…` address (pictureDataAddress in
   * core builds one from the file's bytes); anything else is ignored. It prints where the
   * theme has a place for it (`options.slots.picture: true` and a `{{picture}}` slot), unless
   * the caller's `slots.picture` is false. The description a screen reader gives is the
   * picture line's words, or the recipe's title. A shopping list shows no picture.
   */
  picture?: { src: string };
  /** Printed words, over the theme's `labels:` and the English defaults. */
  labels?: Record<string, string>;
  /**
   * How the theme's web fonts (`webfonts:` in theme.yaml) reach the page. Default `none`.
   * `none`: nothing is added; the font stacks fall back to what the machine has.
   * `web`: a Google Fonts stylesheet link for all of the theme's families (renderCard puts it
   * in the head, with preconnect hints; renderCardParts returns its URL in `links`). Needs the network when the card is shown.
   * `embedded`: `css` — @font-face rules with data: URLs, such as loadFontCss (fonts.ts) builds —
   * goes first in the card's CSS. Self-contained: prints and makes PDFs offline.
   */
  webfonts?: { mode: WebfontMode; css?: string };
  /**
   * The paper to print on: one of the theme's `page.papers` (letter, a4, half-letter, index-4x6,
   * index-5x7). Defaults to the theme's own. A paper the theme does not support is an error.
   */
  paper?: string;
  /**
   * `auto` (the default): the paging script chooses the text size within the theme's `fit:`
   * limits, so the card fills whole pages. `off`: the theme's size (or `size`).
   */
  fit?: 'auto' | 'off';
  /** An explicit text size (`10.5pt`, `14px`); implies `fit: 'off'`. */
  size?: string;
  /**
   * A `layout: list` theme: how the recipe's shopping list is totaled (`consolidate` options).
   * With `densities`, a weight and a volume of one ingredient are totaled through the table and
   * marked `≈`; without, they stay side by side.
   */
  shopping?: ConsolidateOptions;
  /**
   * renderCard only. `true` (the default): the document carries the paging script and shows
   * the card as page boxes. `false`: the plain flow with the browser's own print pages.
   */
  paging?: boolean;
}

/** What renderCard decided about the card's pages, before the script runs. */
export interface CardPaging {
  paper: string;
  fit: 'auto' | 'off';
  /** The size the card starts at, in points; also the size printed when fitting is off. */
  size: number | null;
  limits: FitLimits | null;
}

/** A link renderCard puts in the page head for the card's fonts. */
interface CardLink {
  rel: 'stylesheet' | 'preconnect';
  href: string;
  crossorigin?: boolean;
}

/** A complete, standalone HTML document: the renderer's page shell around the theme's card. */
export function renderCard(recipe: Recipe, theme: Theme, options: CardOptions = {}): string {
  return pageDocument(build(recipe, theme, options), options);
}

/** What renderListCard prints besides the list itself. */
export interface ListCardOptions extends CardOptions {
  /** The card's title. Default: the theme's `labels.shopping-list`, else `Shopping list`. */
  title?: string;
}

/**
 * A shopping list built from any number of recipes (`consolidate` in ../list), as a complete
 * card document in a `layout: list` theme: the same page shell, CSP, paging script, fonts,
 * paper and fitting as renderCard. The title is "Shopping list"; under it, the recipes it is
 * for; then the table; then why some amounts were left side by side (`unconvertedFooter`).
 * `options.slots.uses` says which recipe (and step) each item is for. A theme of another
 * layout is refused.
 */
export function renderListCard(list: ShoppingList, theme: Theme, options: ListCardOptions = {}): string {
  return pageDocument(buildList(list, theme, options), options);
}

/** The renderer's page around a built card: head, CSP, styles, the flow, and the paging script. */
function pageDocument(card: Built, options: CardOptions): string {
  // Inside a <style> element the text must not contain a closing tag.
  const css = card.css.replace(/<\/(style)/gi, '<\\/$1');
  const links = card.links.map((l) => `<link rel="${l.rel}" href="${esc(l.href)}"${l.crossorigin ? ' crossorigin' : ''}>\n`).join('');
  const paging = options.paging !== false;
  const script = paging ? pagingScript() : null;
  const p = card.paging;
  // The paging script's settings, as data on the root element: escaped text, never code.
  const attrs = paging
    ? ` data-paper="${esc(p.paper)}" data-fit="${p.fit}"` +
      (p.size === null ? '' : ` data-size="${p.size}pt"`) +
      (p.fit === 'auto' && p.limits !== null ? ` data-fit-rule="${esc(JSON.stringify(p.limits))}"` : '')
    : ` data-paper="${esc(p.paper)}"`;
  // In print, each sheet is one page: once the script has paged the card it switches these
  // rules on. The page takes the card's margins as its own and loses the flow's frame; the
  // sheet becomes the area inside the margins.
  const printPaged = paging ? `<style id="card-print-paged" media="not all">\n${pagedPageRule(card.page)}</style>\n` : '';
  return (
    `<!doctype html>\n<html lang="${esc(card.lang)}"${attrs}>\n<head>\n<meta charset="utf-8">\n` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<meta http-equiv="Content-Security-Policy" content="${cardCsp(script?.hash ?? null, options.webfonts?.mode === 'web')}">\n` +
    `${CARD_ICON}\n` +
    `<title>${card.slots.title}</title>\n${links}<style>\n${css}\n</style>\n${printPaged}</head>\n<body class="card-page">\n` +
    `<div class="card-flow">\n${card.html}\n</div>\n` +
    (script === null ? '' : `<script>${script.text}</script>\n`) +
    '</body>\n</html>\n'
  );
}

/** What a renderCard document will page at: paper, fitting, starting size and limits. */
export function cardPaging(theme: Theme, options: CardOptions = {}): CardPaging {
  return pagingOf(pageSetup(theme, options.paper), options);
}

function pagingOf(page: PageSetup, options: CardOptions): CardPaging {
  if (options.fit !== undefined && options.fit !== 'auto' && options.fit !== 'off') {
    throw new Error(`card options: fit must be auto or off, not "${String(options.fit)}"`);
  }
  const explicit = options.size !== undefined ? fontSizeOption(options.size) : null;
  const size = toPoints(explicit ?? page.fontSize);
  const fit = explicit !== null || page.fit === null ? 'off' : (options.fit ?? 'auto');
  return { paper: page.paper, fit, size: size === null ? null : Math.round(size * 100) / 100, limits: page.fit };
}

function fontSizeOption(value: string): string {
  const size = value.trim();
  const pt = toPoints(size);
  if (pt === null || pt < 4 || pt > 72) throw new Error(`card options: size must be a text size such as 10.5pt, not "${value}"`);
  return size;
}

/**
 * The rules for printing a paged card. The page has the paper's size and the card's margins,
 * as real page margins, and no frame of its own; each sheet is the area inside them, with no
 * padding.
 *
 * Real margins, not a sheet the size of the paper with its margins as padding: Safari's print
 * preview draws a sheet that has padding of its own in the wrong place (shifted up, its top
 * cut off), though what it prints is right. Checked in Safari 26, Chrome and Firefox.
 *
 * Every margin box is claimed and left empty. A browser that knows margin boxes (Chrome) then
 * prints no header or footer of its own in the margins; one that does not ignores them.
 *
 * The sheet is a hair shorter than the area inside the margins: one that fills it exactly
 * spills onto a page of its own in Safari.
 */
function pagedPageRule(page: PageSetup): string {
  const boxes = [
    'top-left-corner', 'top-left', 'top-center', 'top-right', 'top-right-corner',
    'bottom-left-corner', 'bottom-left', 'bottom-center', 'bottom-right', 'bottom-right-corner',
    'left-top', 'left-middle', 'left-bottom', 'right-top', 'right-middle', 'right-bottom',
  ];
  const body = `size: ${page.size}; margin: ${page.margin}; padding: 0; border: none;${boxes.map((b) => ` @${b} { content: ""; }`).join('')}`;
  const sheet =
    '@media print {\n' +
    '  .sheet {\n' +
    '    width: calc(var(--card-page-width) - var(--card-margin-left) - var(--card-margin-right));\n' +
    '    height: calc(var(--card-page-height) - var(--card-margin-top) - var(--card-margin-bottom) - 0.01in);\n' +
    '    padding: 0;\n' +
    '  }\n' +
    '}\n';
  return ['', ':first', ':left', ':right', ':blank'].map((sel) => `@page${sel} { ${body} }\n`).join('') + sheet;
}

/**
 * For embedding in another page: the card fragment and its CSS (core stylesheet included)
 * separately, and `links`: the stylesheet URLs the host must add to its head
 * (`<link rel="stylesheet" href="…">`) for the card's web fonts — empty unless
 * `webfonts.mode` is `web`.
 */
export function renderCardParts(recipe: Recipe, theme: Theme, options: CardOptions = {}): { html: string; css: string; links: string[] } {
  const card = build(recipe, theme, options);
  return { html: card.html, css: card.css, links: card.links.filter((l) => l.rel === 'stylesheet').map((l) => l.href) };
}

/**
 * The head links for a theme's web fonts in `web` mode: a preconnect to the font-file host
 * (the CSP allows fonts from it, and a preconnect fetches nothing), then the one stylesheet.
 * Empty when the theme declares no web fonts.
 */
function webfontLinks(theme: Theme): CardLink[] {
  const href = googleFontsHref(theme.webfonts);
  if (href === null) return [];
  return [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: GOOGLE_FONTS_FILES, crossorigin: true },
    { rel: 'stylesheet', href },
  ];
}

// -------------------------------------------------------------------- settings

/** Slots that are recipe metadata from the frontmatter. */
const META = ['yield', 'source', 'version', 'license'] as const;

const DEFAULT_FONTS = {
  body: 'Futura, "Jost", "Avenir Next", "Century Gothic", sans-serif',
  title: '"Yuppy SC", "Jost", Futura, "Avenir Next", sans-serif',
};

/** The title's weight when a theme does not state one (`options.fonts.title-weight`): a heading's. */
export const DEFAULT_TITLE_WEIGHT = 700;

/** `options.fonts.title-weight` as a CSS weight: 100 to 900 in hundreds; anything else is the default. */
function titleWeightOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 900 && value % 100 === 0 ? value : DEFAULT_TITLE_WEIGHT;
}

/**
 * A card style's two type roles, as its renderer sets them: the body and title
 * font stacks (`options.fonts.body`, `options.fonts.title`) and the title's weight
 * (`options.fonts.title-weight`). What a chart takes with "Match the card" (dag/card-type.ts).
 */
export function cardType(theme: Theme): CardType {
  const f = record(record(theme.manifest.options).fonts);
  return {
    body: { stack: fontStack(text(f.body), DEFAULT_FONTS.body) },
    title: { stack: fontStack(text(f.title), DEFAULT_FONTS.title), weight: titleWeightOf(f['title-weight']) },
  };
}

interface Settings {
  slots: Record<string, boolean>;
  display: Display;
  layout: LayoutName;
  parts: PartsName;
  labels: Labels;
  words: Record<string, string>;
  lang: string;
  /** The card's CSS up to the end of the :root declarations, and from their closing brace on. */
  css: { head: string; tail: string };
  links: CardLink[];
  page: PageSetup;
  paging: CardPaging;
}

function resolve(theme: Theme, options: CardOptions): Settings {
  const themeOptions = record(theme.manifest.options);

  const slots: Record<string, boolean> = { ...SLOT_SWITCHES };
  const themeSlots = record(themeOptions.slots);
  for (const [name, on] of Object.entries(themeSlots)) slots[name] = on === true;
  for (const [name, on] of Object.entries(options.slots ?? {})) slots[name] = on === true;
  // The notes print only when asked for, and never in a theme that has turned them off.
  slots.notes = options.notes === true && themeSlots.notes !== false && options.slots?.notes !== false;

  const d = record(themeOptions.display);
  const display: Display = {
    units: oneOf(options.display?.units ?? d.units, ['long', 'symbol'], 'long'),
    fractions: oneOf(options.display?.fractions ?? d.fractions, ['unicode', 'ascii'], 'unicode'),
    range: oneOf(options.display?.range ?? d.range, ['to', 'dash'], 'to'),
  };

  const layout = options.layout === undefined ? theme.layout : layoutName(options.layout, 'card options');
  // A theme object built by hand, without `parts`, gets the default.
  const parts = options.parts === undefined ? (theme.parts ?? 'sections') : partsName(options.parts, 'card options');
  // The picture prints only when one was given, in a theme that has a place for it; a shopping
  // list is not the recipe's page and shows none.
  slots.picture = hasPicture(options) && themeSlots.picture === true && options.slots?.picture !== false && layout !== 'list';

  const l = record(theme.manifest.labels);
  const words = wordsOf(theme, options);
  const callouts: Record<string, string> = Object.create(null);
  for (const [keyword, label] of Object.entries(record(l.callouts))) {
    const shown = text(label);
    if (shown !== null) callouts[keyword] = shown;
  }
  const labels: Labels = {
    choose: words.choose,
    option: words.option,
    see: words.see,
    from: words.from,
    above: words.above,
    below: words.below,
    divided: words.divided,
    callouts,
  };

  // The values the stylesheets read, as custom properties.
  const f = record(themeOptions.fonts);
  const fontBody = fontStack(options.fonts?.body ?? text(f.body), DEFAULT_FONTS.body);
  const fontTitle = fontStack(options.fonts?.title ?? text(f.title), DEFAULT_FONTS.title);
  const titleWeight = titleWeightOf(f['title-weight']);
  const page = pageSetup(theme, options.paper);
  const paging = pagingOf(page, options);
  const fontSize = options.size !== undefined ? fontSizeOption(options.size) : page.fontSize;
  const [mt, mr, mb, ml] = marginSides(page.margin);
  const lang = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i.test(text(theme.manifest.lang) ?? '') ? text(theme.manifest.lang)! : 'en';

  const mode = options.webfonts?.mode ?? 'none';
  if (!['none', 'web', 'embedded'].includes(mode)) throw new Error(`card options: unknown webfonts mode "${String(mode)}" (none, web, embedded)`);
  const fontCss = mode === 'embedded' && options.webfonts?.css ? `${options.webfonts.css.trimEnd()}\n\n` : '';
  const links = mode === 'web' ? webfontLinks(theme) : [];

  const head =
    fontCss +
    `@page { size: ${page.size}; margin: ${page.margin}; }\n` +
    ':root {\n' +
    `  --card-font-body: ${fontBody};\n` +
    `  --card-font-title: ${fontTitle};\n` +
    `  --card-font-title-weight: ${titleWeight};\n` +
    `  --card-font-size: ${fontSize};\n` +
    `  --card-page-width: ${page.width};\n` +
    `  --card-page-height: ${page.height};\n` +
    `  --card-sheet-margin: ${page.margin};\n` +
    `  --card-margin-top: ${mt};\n  --card-margin-right: ${mr};\n  --card-margin-bottom: ${mb};\n  --card-margin-left: ${ml};\n` +
    Object.entries(CARD_COLOR_ROLES)
      .map(([name, value]) => `  ${name}: ${value};\n`)
      .join('');
  const css = { head, tail: '}\n\n' + CORE_CSS + '\n' + theme.css };

  return { slots, display, layout, parts, labels, words, lang, css, links, page, paging };
}

interface Built {
  html: string;
  slots: Record<string, string>;
  css: string;
  lang: string;
  links: CardLink[];
  page: PageSetup;
  paging: CardPaging;
}

/** Words: the English defaults, then theme.yaml `labels:`, then the caller's. */
function wordsOf(theme: Theme, options: CardOptions): Record<string, string> {
  const words: Record<string, string> = { ...DEFAULT_LABELS };
  for (const source of [record(theme.manifest.labels), options.labels ?? {}]) {
    for (const [name, value] of Object.entries(source)) {
      const shown = text(value);
      if (name !== 'callouts' && shown !== null) words[name] = shown;
    }
  }
  return words;
}

function build(recipe: Recipe, theme: Theme, options: CardOptions): Built {
  const settings = resolve(theme, options);
  const list = settings.layout === 'list';
  const body = renderBody(recipe, settings.display, settings.labels, list ? 'hoisted' : settings.layout, settings.parts);
  if (list) {
    // A shopping list: one consolidated table in the ingredients slot, and no method.
    body.ingredients = shoppingListHtml(recipeShoppingList(recipe, 'recipe', options.shopping ?? {}), {
      display: settings.display,
      otherRecipes: settings.words['other-recipes'],
      uses: settings.slots.uses === true,
      optional: settings.words.optional,
      optionalSet: settings.words['optional-set'],
    });
    body.directions = '';
    body.components = '';
  }
  const on = (name: string, value: string) => (settings.slots[name] ? value : '');

  // A theme without a {{components}} slot still prints them, after its directions.
  const hasComponents = usesSlot(theme.skeleton, 'components');
  const slots: Record<string, string> = {
    // The core of every card: never switched off.
    title: esc(recipe.title?.text ?? 'Untitled recipe'),
    ingredients: body.ingredients,
    directions: hasComponents ? body.directions : body.directions + body.components,
    components: hasComponents ? body.components : '',
    // Optional slots.
    intro: on('intro', body.intro),
    notes: on('notes', body.notes),
    picture: on('picture', pictureFigure(recipe, options)),
    ...commonSlots(settings, theme),
  };

  const data = recipe.frontmatter.data ?? {};
  const meta: string[] = [];
  for (const name of META) {
    const value = data[name];
    const shown = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    slots[name] = on(name, esc(shown));
    if (slots[name] !== '') {
      meta.push(`<span class="meta-item"><span class="meta-label">${esc(settings.words[name])}</span> ${slots[name]}</span>`);
    }
  }
  // `meta` is filled when any metadata slot is shown: use {{#meta}} to wrap them, or {{meta}} for a ready-made line.
  slots.meta = meta.join(' ');

  return finish(theme, slots, settings);
}

/** The slots every card has: the theme's name and `label.<name>` for each printed word. */
function commonSlots(settings: Settings, theme: Theme): Record<string, string> {
  const slots: Record<string, string> = {
    theme: esc(theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')),
  };
  for (const [name, word] of Object.entries(settings.words)) {
    if (!NON_SLOT_LABELS.has(name)) slots[`label.${name}`] = esc(word);
  }
  return slots;
}

function finish(theme: Theme, slots: Record<string, string>, settings: Settings): Built {
  const html = fillTemplate(theme.skeleton, slots).trim();
  return {
    html,
    slots,
    // The ingredient columns, sized for the widest quantity and unit anywhere on this card.
    css: settings.css.head + columnProperties(html) + settings.css.tail,
    lang: settings.lang,
    links: settings.links,
    page: settings.page,
    paging: settings.paging,
  };
}

/**
 * A list card: "Shopping list", the recipes it is for (in the `meta` slot, else `intro`, else
 * above the table), the consolidated table in the ingredients slot, and the footer naming
 * items whose amounts were left side by side in the `notes` slot (else below the table). The
 * footer is printed whatever `slots.notes` says: it is what keeps a reader from trusting a
 * total that was not made. The kicker (`label.shopping-list`) says how many recipes.
 */
function buildList(list: ShoppingList, theme: Theme, options: ListCardOptions): Built {
  const words = wordsOf(theme, options);
  const title = options.title ?? words['shopping-list'] ?? 'Shopping list';
  const settings = resolve(theme, options);
  if (settings.layout !== 'list') {
    throw new Error(`theme "${theme.name}" does not print shopping lists (its layout is ${settings.layout}, not list)`);
  }
  const table = shoppingListHtml(list, {
    display: settings.display,
    otherRecipes: settings.words['other-recipes'],
    uses: settings.slots.uses === true,
    optional: settings.words.optional,
    optionalSet: settings.words['optional-set'],
  });

  const titles = list.sources.map((s) => s.title.trim() || s.id);
  const forWord = settings.words.for ?? 'For';
  const forLine = titles
    .map((t, i) => `<span class="meta-item">${i === 0 ? `<span class="meta-label">${esc(forWord)}</span> ` : ''}${esc(t)}</span>`)
    .join(' ');
  const footerLines = unconvertedFooter(list).split('\n').filter((line) => line !== '');
  const footer = footerLines.map((line) => `<p class="list-footer">${esc(line)}</p>`).join('');

  const slot = (name: string) => usesSlot(theme.skeleton, name);
  const forSlot = slot('meta') ? 'meta' : slot('intro') ? 'intro' : null;
  const notesSlot = slot('notes');
  const slots: Record<string, string> = {
    title: esc(title),
    ingredients: (forSlot === null && forLine !== '' ? `<p class="card-meta">${forLine}</p>` : '') + table + (notesSlot ? '' : footer),
    directions: '',
    components: '',
    intro: forSlot === 'intro' && forLine !== '' ? `<p class="card-meta">${forLine}</p>` : '',
    notes: notesSlot ? footer : '',
    ...commonSlots(settings, theme),
    'label.shopping-list': esc(titles.length === 1 ? '1 recipe' : `${titles.length} recipes`),
    meta: forSlot === 'meta' ? forLine : '',
  };
  for (const name of META) slots[name] = '';
  return finish(theme, slots, settings);
}

// --------------------------------------------------------------------- helpers

/**
 * True when cards in this theme show a recipe's picture: `options.slots.picture: true`, a
 * `{{picture}}` slot, and not a shopping list. A caller need not read a picture otherwise.
 */
export function hasPicturePlace(theme: Theme): boolean {
  return record(record(theme.manifest.options).slots).picture === true && usesSlot(theme.skeleton, 'picture') && theme.layout !== 'list';
}

/** True when the caller gave a picture the card may show: a JPEG or PNG `data:` address. */
function hasPicture(options: CardOptions): boolean {
  return typeof options.picture?.src === 'string' && PICTURE_SRC.test(options.picture.src);
}

/**
 * The `picture` slot: the whole figure, the image described by the picture line's words, or by
 * the recipe's title when it has none (SPEC §4.3). Empty without a picture.
 */
function pictureFigure(recipe: Recipe, options: CardOptions): string {
  if (!hasPicture(options)) return '';
  const words = recipe.picture?.alt.trim() ?? '';
  const alt = words !== '' ? words : (recipe.title?.text ?? 'Untitled recipe');
  return `<figure class="card-picture"><img src="${esc(options.picture!.src)}" alt="${esc(alt)}"></figure>`;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** A font stack, reduced to what a font-family list can contain, so it cannot break out of its declaration. */
function fontStack(value: string | null | undefined, fallback: string): string {
  if (value == null) return fallback;
  let stack = value.replace(/[^\p{L}\p{N} ,"'._-]/gu, '').trim();
  const unbalanced = (quote: string) => stack.split(quote).length % 2 === 0;
  if (unbalanced('"') || unbalanced("'")) stack = stack.replace(/["']/g, '');
  return stack === '' ? fallback : stack;
}

export { pageMargin } from './paper.ts';
