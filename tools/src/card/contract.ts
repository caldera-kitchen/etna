// The theme contract: what a card theme may contain, and what the renderer gives it.
// Documented for theme authors in themes/README.md — keep the two in step.
//
// Pure and browser-safe. Nothing here imports the renderer, so the renderer and the checker
// can both build on it.

/** The newest version of the theme contract this renderer knows (`etna-theme:` in theme.yaml). */
export const THEME_CONTRACT = 2;
// Contract 2 (paged cards): page.papers, fit:, page boxes (.sheet, .sheet-box, .sheet-content),
// `rem` as the card's text size; a traditional recipe's parts (options.parts,
// the part-* classes, direction-alone). A contract-1 theme is still read and paged; its
// @page border and padding show only on the unpaged flow.

/**
 * How a structured recipe lays out its steps (`options.layout`).
 * `hoisted`: one ingredient table per run of steps, grouped by step, then the directions.
 * `paired`: each step is one block — its heading, its own ingredients, its direction.
 * `list`: a shopping list — one consolidated ingredient list, amounts totaled, no directions
 * (list.ts). Applies to traditional recipes too.
 * To add a layout, add its name here and teach body.ts (or list.ts) to write it.
 */
export const LAYOUTS = ['hoisted', 'paired', 'list'] as const;
export type LayoutName = (typeof LAYOUTS)[number];
export const DEFAULT_LAYOUT: LayoutName = 'hoisted';

/** A layout name, or an error naming the known ones. */
export function layoutName(value: unknown, where: string): LayoutName {
  if (value === undefined || value === null) return DEFAULT_LAYOUT;
  if ((LAYOUTS as readonly unknown[]).includes(value)) return value as LayoutName;
  throw new Error(`${where}: unknown layout "${String(value)}" (known layouts: ${LAYOUTS.join(', ')})`);
}

/**
 * How a traditional recipe's parts (SPEC §4.1) are arranged (`options.parts`).
 * `sections`: the classic card — one ingredient table, the parts as its group labels; then the
 * directions, each part a titled run of steps.
 * `paired`: part after part, each part's ingredients beside its steps. Used only when at least
 * one named part has both ingredients and steps; otherwise the classic sections.
 * A layout-`list` theme prints no directions, so the option does nothing there.
 */
export const PARTS = ['sections', 'paired'] as const;
export type PartsName = (typeof PARTS)[number];
export const DEFAULT_PARTS: PartsName = 'sections';

/** A parts arrangement, or an error naming the known ones. */
export function partsName(value: unknown, where: string): PartsName {
  if (value === undefined || value === null) return DEFAULT_PARTS;
  if ((PARTS as readonly unknown[]).includes(value)) return value as PartsName;
  throw new Error(`${where}: unknown parts arrangement "${String(value)}" (known: ${PARTS.join(', ')})`);
}

/**
 * Every word the renderer prints, in English. `theme.yaml` `labels:` overrides any of them; a
 * skeleton prints one with `{{label.<name>}}`. Callout labels are a map, `labels.callouts`.
 */
export const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  ingredients: 'Ingredients',
  directions: 'Directions',
  notes: 'Notes',
  yield: 'Yield',
  source: 'Source',
  version: 'Version',
  license: 'License',
  choose: 'Choose one',
  option: 'Option',
  see: 'see',
  from: 'from',
  above: 'above',
  below: 'below',
  divided: 'divided',
  optional: 'optional',
  'optional-set': 'optional, all or none',
  'other-recipes': 'Other recipes',
};

/** Label names that are not printable with `{{label.…}}`. */
export const NON_SLOT_LABELS: ReadonlySet<string> = new Set(['callouts']);

/** Slots the renderer fills (besides `label.<name>`). */
export const SLOTS = [
  'title',
  'ingredients',
  'directions',
  'components',
  'intro',
  'notes',
  'yield',
  'source',
  'version',
  'license',
  'meta',
  'theme',
] as const;

/** Slots a skeleton must contain: without them some recipe would print without its core. */
export const REQUIRED_SLOTS = ['title', 'ingredients', 'directions'] as const;

/** The slots a skeleton must contain for a theme of this layout: a `list` theme prints no directions. */
export function requiredSlots(layout: LayoutName): readonly string[] {
  return layout === 'list' ? ['title', 'ingredients'] : REQUIRED_SLOTS;
}

/** Optional slots that `options.slots` (and CardOptions.slots) switch, with their defaults. */
export const SLOT_SWITCHES: Readonly<Record<string, boolean>> = {
  intro: true,
  notes: true,
  yield: false,
  source: false,
  version: false,
  license: false,
  /** Layout `list`: under each item, the steps that use it. */
  uses: false,
};

// ------------------------------------------------------------ forbidden content
//
// A theme is markup and styling, nothing else. It cannot run code, load anything from the
// network, or replace the page the renderer builds. These checks are a plain deny list over
// the text, not a sanitizer: anything that matches is refused, and the theme is not used.
// The page's Content-Security-Policy is the second wall behind them.

const SKELETON_TAGS: [RegExp, string][] = [
  [/<!doctype/i, 'a document type: card.html is a fragment, the renderer writes the page around it'],
  [/<\s*(html|head|body|title)\b/i, 'a <$1> element: card.html is a fragment, the renderer writes the page around it'],
  [/<\s*(script)\b/i, 'a <$1> element: a theme cannot run code'],
  [/<\s*(iframe|frame|frameset|object|embed|applet|portal)\b/i, 'an <$1> element: a theme cannot embed other documents'],
  [/<\s*(link|meta|base)\b/i, 'a <$1> element: the renderer writes the page head'],
  [/<\s*(style)\b/i, 'a <$1> element: styles belong in the theme stylesheet'],
  [/<\s*(form)\b/i, 'a <$1> element: a card is not a form'],
  [/<\s*(a|area)\b/i, 'an <$1> element: a theme carries no links of its own'],
  [/<\s*(img|image|picture|source|track|video|audio|feimage)\b/i, 'an <$1> element: a theme loads no images or media (use url(data:…) in the stylesheet)'],
  [/<\s*input\b[^>]*\btype\s*=\s*["']?\s*image\b/i, 'an <input type="image"> element: a theme loads no images'],
];

/**
 * Attributes that name something to load or go to. A theme may give one only a `data:` URL
 * (`href` and `xlink:href`: only a `#fragment`, as an SVG `<use>` does).
 */
const URL_ATTRIBUTES = /(?:^|[\s"'/])(src|srcset|imagesrcset|href|xlink:href|poster|data|action|formaction|background|ping|cite|longdesc|manifest|lowsrc|dynsrc|codebase)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]*))/gi;

/** A `style="…"` attribute's value. */
const STYLE_ATTRIBUTE = /(?:^|[\s"'/])style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]*))/gi;

/** Text with character references decoded, so `&#106;avascript:` reads as `javascript:`. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&(colon|tab|newline);/gi, (_m, name: string) => ({ colon: ':', tab: '\t', newline: '\n' })[name.toLowerCase()]!);
}

/** Reasons a skeleton is refused; empty when it is acceptable. */
export function skeletonProblems(skeleton: string): string[] {
  const problems: string[] = [];
  for (const [re, reason] of SKELETON_TAGS) {
    const m = re.exec(skeleton);
    if (m) problems.push(`contains ${reason.replace('$1', (m[1] ?? '').toLowerCase())}`);
  }
  // Event handlers: an attribute whose name starts with "on". Looked for anywhere in the text,
  // not only inside what reads as a tag: a `>` inside a quoted value would end a tag pattern
  // early and hide the attributes after it.
  const handler = /(?:^|[\s"'/])on([a-z-]+)\s*=/i.exec(skeleton);
  if (handler) problems.push(`contains an event-handler attribute (on${handler[1].toLowerCase()}=): a theme cannot run code`);
  // A named element (`<img name="createElement">`) shadows that property of `document`, and
  // would break the page's own paging script.
  if (/(?:^|[\s"'/])name\s*=/i.test(skeleton)) problems.push('contains a name= attribute: a named element can shadow the page\'s own script');
  const decoded = decodeEntities(skeleton).replace(/[\u0000- ]+/g, '');
  const scheme = /(javascript|vbscript):/i.exec(decoded);
  if (scheme) problems.push(`contains a ${scheme[1].toLowerCase()}: URL: a theme cannot run code`);
  for (const m of skeleton.matchAll(URL_ATTRIBUTES)) {
    const name = m[1].toLowerCase();
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '').replace(/[\u0000- ]+/g, '');
    const fragment = name === 'href' || name === 'xlink:href' ? /^#/.test(value) : false;
    if (!fragment && !/^data:/i.test(value)) {
      problems.push(`contains a ${name}= attribute that is not a data: URL: a theme loads nothing and links nowhere`);
      break;
    }
  }
  // An inline style is CSS like the stylesheet's, and is held to the same rules.
  for (const m of skeleton.matchAll(STYLE_ATTRIBUTE)) {
    const css = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '');
    const found = stylesheetProblems(css);
    if (found.length > 0) {
      problems.push(`has a style= attribute that ${found[0]}`);
      break;
    }
  }
  return problems;
}

/**
 * CSS with escapes decoded, so `\75 rl(` reads as `url(`. Comments are deliberately left in:
 * telling a comment from a string or an escaped slash takes a real tokenizer (`content: "/*"`
 * is not a comment, nor is `\/*`), and a stripper that gets it wrong hides live CSS. So what a
 * theme may not contain, it may not contain in a comment either.
 */
function plainCss(css: string): string {
  return css
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd))
    .replace(/\\(.)/g, '$1');
}

/** Reasons a stylesheet is refused; empty when it is acceptable. */
export function stylesheetProblems(css: string): string[] {
  const text = plainCss(css);
  const problems: string[] = [];
  if (/@import\b/i.test(text)) problems.push('contains @import: a theme cannot load other stylesheets');
  if (/expression\s*\(/i.test(text)) problems.push('contains expression(): a theme cannot run code');
  if (/(^|[\s;{])(-moz-)?(behavior|binding)\s*:/i.test(text)) problems.push('contains a behavior or -moz-binding property: a theme cannot run code');
  if (/(^|[^a-z-])(-webkit-)?image-set\s*\(|(^|[^a-z-])src\s*\(/i.test(text)) {
    problems.push('contains image-set() or src(): use url(data:…) for an image');
  }
  for (const m of text.matchAll(/url\(\s*(["']?)\s*([^"')]*)/gi)) {
    if (!/^data:/i.test(m[2].trim())) {
      problems.push(`contains url(${m[1]}${m[2].trim().slice(0, 40)}${m[1]}): a theme can only use data: URLs, nothing is loaded`);
      break;
    }
  }
  return problems;
}

// ------------------------------------------------------------------ the shell

/** The Content-Security-Policy of a card page: no script runs, nothing loads. */
export const CARD_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:";

/**
 * A card's own icon: empty, as a data: URL its policy admits. A card opened as a tab (the app's
 * Print tab) would otherwise make the browser ask its origin for /favicon.ico, which the policy
 * (img-src data:) refuses and Firefox reports as an error. It loads nothing.
 */
export const CARD_ICON = '<link rel="icon" href="data:,">';

/** The same for a card whose fonts come from Google Fonts (`webfonts.mode: web`): those two hosts, nothing else. */
export const CARD_CSP_WEB =
  "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:";

/**
 * The policy of a card page: CARD_CSP (CARD_CSP_WEB when `web`, the card's fonts coming from
 * Google Fonts), and the one script whose hash is given (`sha256-…`, of the exact text between
 * <script> and </script>). Nothing else may run — no other inline script, no script file, no
 * event handler, no eval.
 */
export function cardCsp(scriptHash: string | null, web = false): string {
  const policy = web ? CARD_CSP_WEB : CARD_CSP;
  if (scriptHash === null) return policy;
  if (!/^sha256-[A-Za-z0-9+/]{43}=$/.test(scriptHash)) throw new Error(`not a sha256 hash source: ${scriptHash}`);
  return policy.replace("default-src 'none';", `default-src 'none'; script-src '${scriptHash}';`);
}
