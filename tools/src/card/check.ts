// The theme checker: does a theme keep the contract? Used by `etna theme check`, and by the
// GUI before it uses a theme fetched from someone's repository. Pure and browser-safe.

import { parse as parseYaml } from 'yaml';

import { menuNameWarning, parseRecipe, type UnitRegistry } from '../core/index.ts';
import {
  DEFAULT_LABELS,
  LAYOUTS,
  PARTS,
  NON_SLOT_LABELS,
  requiredSlots,
  SLOT_SWITCHES,
  SLOTS,
  skeletonProblems,
  stylesheetProblems,
  THEME_CONTRACT,
} from './contract.ts';
import { KEYWORDS } from '../lint/callouts.ts';
import { recipeShoppingList } from './list.ts';
import { pageSetup, PAPERS, pagingProblems, themePapers } from './paper.ts';
import { pageMargin, renderCard } from './render.ts';
import { slotNames } from './template.ts';
import { parseTheme, record, STYLESHEET, type Theme } from './theme.ts';
import { webfontProblems } from './webfonts.ts';

export interface ThemeReport {
  /** Each starts with the file it is about. A theme with errors is refused by `parseTheme` or prints wrongly. */
  errors: string[];
  /** Each starts with the file it is about. Worth fixing; the theme works. */
  warnings: string[];
  /** The parsed theme, when `parseTheme` accepted it. */
  theme: Theme | null;
}

export interface CheckOptions {
  /** A unit registry. With one, the checker also renders two sample recipes with the theme. */
  units?: UnitRegistry;
}

const TOP_KEYS = new Set(['etna-theme', 'kind', 'name', 'description', 'lang', 'page', 'skeleton', 'options', 'labels', 'webfonts', 'fit']);
const PAGE_KEYS = new Set(['size', 'orientation', 'width', 'height', 'margin', 'papers']);
const OPTION_KEYS = new Set(['fonts', 'font-size', 'layout', 'parts', 'slots', 'display']);
const DISPLAY_VALUES: Record<string, string[]> = { units: ['long', 'symbol'], fractions: ['unicode', 'ascii'], range: ['to', 'dash'] };
const LENGTH_RE = /^\d+(\.\d+)?(in|cm|mm|pt|px|pc)$/;
const FONT_SIZE_RE = /^\d+(\.\d+)?(pt|px|em|rem|mm|cm|in|%)$/;
const GENERIC_FAMILY_RE = /(^|[\s,])(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|math|emoji|fangsong)$/;

/** Check a theme, given as file name → text, against the theme contract. */
export function checkTheme(files: Record<string, string>, options: CheckOptions = {}): ThemeReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const has = (file: string) => Object.hasOwn(files, file) && typeof files[file] === 'string';

  // ---------------------------------------------------------------- theme.yaml
  if (!has('theme.yaml')) return { errors: ['theme.yaml: missing'], warnings, theme: null };
  let parsed: unknown;
  try {
    parsed = parseYaml(files['theme.yaml']);
  } catch (error) {
    return { errors: [`theme.yaml: not valid YAML: ${(error as Error).message.split('\n')[0]}`], warnings, theme: null };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { errors: ['theme.yaml: must be a map of keys'], warnings, theme: null };
  }
  const m = parsed as Record<string, unknown>;
  const yerr = (message: string) => errors.push(`theme.yaml: ${message}`);
  const ywarn = (message: string) => warnings.push(`theme.yaml: ${message}`);

  if (m.kind === 'chart') {
    return { errors: ['theme.yaml: kind is "chart": this is a flow-chart theme (etna dag), not a card theme'], warnings, theme: null };
  }
  for (const key of Object.keys(m)) if (!TOP_KEYS.has(key)) yerr(`unknown key "${key}"`);

  const version = m['etna-theme'];
  if (version === undefined) ywarn(`no etna-theme: version; read as contract 1 (add "etna-theme: ${THEME_CONTRACT}")`);
  else if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) yerr('etna-theme must be a whole number');
  else if (version > THEME_CONTRACT) yerr(`etna-theme ${version} is newer than this renderer (it knows contract ${THEME_CONTRACT})`);

  if (m.kind === undefined) ywarn('no kind:; read as "kind: card"');
  else if (m.kind !== 'card') yerr(`kind must be "card", not ${JSON.stringify(m.kind)}`);

  if (typeof m.name !== 'string' || m.name.trim() === '') yerr('name: a theme needs a name');
  else {
    const long = menuNameWarning(m.name);
    if (long) ywarn(long);
  }
  if (m.description === undefined) ywarn('no description: (etna theme list shows it)');
  else if (typeof m.description !== 'string') yerr('description must be text');
  if (m.lang !== undefined && (typeof m.lang !== 'string' || !/^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i.test(m.lang))) {
    yerr('lang must be a language tag such as en or fr-CA');
  }

  // page
  if (m.page !== undefined) {
    const page = mapOf(m.page, 'page', yerr);
    for (const key of Object.keys(page)) if (!PAGE_KEYS.has(key)) yerr(`unknown key "page.${key}"`);
    if (page.size !== undefined && ![...PAPERS, 'legal', 'a5'].includes(String(page.size).toLowerCase())) {
      yerr(`page.size must be ${PAPERS.join(', ')}, legal or a5, not ${JSON.stringify(page.size)}`);
    }
    if (page.papers !== undefined && page.size !== undefined && !Array.isArray(page.papers) && typeof page.papers === 'object' && page.papers !== null) {
      if (!Object.hasOwn(page.papers, String(page.size).toLowerCase())) yerr(`page.size ${JSON.stringify(page.size)} is not one of page.papers`);
    }
    if (page.orientation !== undefined && !['portrait', 'landscape'].includes(page.orientation as string)) {
      yerr('page.orientation must be portrait or landscape');
    }
    if ((page.width === undefined) !== (page.height === undefined)) yerr('page.width and page.height go together');
    for (const key of ['width', 'height']) {
      if (page[key] !== undefined && !LENGTH_RE.test(String(page[key]))) yerr(`page.${key} must be a length such as 8.5in or 210mm`);
    }
    if (page.margin !== undefined && pageMargin(String(page.margin)) === null) {
      yerr('page.margin must be one to four lengths, as for CSS margin (0.6in 0.65in 0.8in)');
    }
  }

  for (const problem of pagingProblems(m)) yerr(problem);

  if (m.skeleton !== undefined && typeof m.skeleton !== 'string') yerr('skeleton must be a file name');

  // options
  const o = mapOf(m.options, 'options', yerr);
  for (const key of Object.keys(o)) {
    if (!OPTION_KEYS.has(key)) yerr(`unknown key "options.${key}"`);
  }
  if (o.layout !== undefined && !(LAYOUTS as readonly unknown[]).includes(o.layout)) {
    yerr(`options.layout "${String(o.layout)}" is not a known layout (${LAYOUTS.join(', ')})`);
  }
  if (o.parts !== undefined && !(PARTS as readonly unknown[]).includes(o.parts)) {
    yerr(`options.parts "${String(o.parts)}" is not a known arrangement of a traditional recipe's parts (${PARTS.join(', ')})`);
  }
  if (o['font-size'] !== undefined && !FONT_SIZE_RE.test(String(o['font-size']).trim())) yerr('options.font-size must be a size such as 11pt');
  const fonts = mapOf(o.fonts, 'options.fonts', yerr);
  for (const [role, stack] of Object.entries(fonts)) {
    if (role === 'title-weight') {
      if (!(typeof stack === 'number' && Number.isInteger(stack) && stack >= 100 && stack <= 900 && stack % 100 === 0)) {
        yerr('options.fonts.title-weight must be a weight from 100 to 900 in hundreds, such as 300 or 700');
      }
    } else if (role !== 'body' && role !== 'title') yerr(`unknown key "options.fonts.${role}" (body, title, title-weight)`);
    else if (typeof stack !== 'string') yerr(`options.fonts.${role} must be a font stack`);
    else if (!GENERIC_FAMILY_RE.test(stack.trim())) yerr(`options.fonts.${role} must end in a generic family (serif, sans-serif, monospace …), so something prints when no listed font is installed`);
  }
  for (const [name, on] of Object.entries(mapOf(o.slots, 'options.slots', yerr))) {
    if (!Object.hasOwn(SLOT_SWITCHES, name)) yerr(`unknown slot switch "options.slots.${name}" (${Object.keys(SLOT_SWITCHES).join(', ')})`);
    else if (typeof on !== 'boolean') yerr(`options.slots.${name} must be true or false`);
  }
  for (const [name, value] of Object.entries(mapOf(o.display, 'options.display', yerr))) {
    if (!Object.hasOwn(DISPLAY_VALUES, name)) yerr(`unknown key "options.display.${name}" (${Object.keys(DISPLAY_VALUES).join(', ')})`);
    else if (!DISPLAY_VALUES[name].includes(value as string)) yerr(`options.display.${name} must be ${DISPLAY_VALUES[name].join(' or ')}`);
  }

  // webfonts
  const fontProblems = webfontProblems(m.webfonts);
  for (const problem of fontProblems) yerr(problem);
  if (fontProblems.length === 0 && Array.isArray(m.webfonts)) {
    const stacks = Object.values(fonts).filter((v): v is string => typeof v === 'string').join(',');
    const named = new Set(stacks.split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase()));
    for (const entry of m.webfonts as { family: string }[]) {
      if (!named.has(entry.family.toLowerCase())) ywarn(`webfonts: ${entry.family} is in no font stack (options.fonts), so it is loaded and never used`);
    }
  }

  // labels
  const labels = mapOf(m.labels, 'labels', yerr);
  const customLabels = new Set<string>();
  for (const [name, value] of Object.entries(labels)) {
    if (name === 'callouts') {
      for (const [keyword, label] of Object.entries(mapOf(value, 'labels.callouts', yerr))) {
        if (typeof label !== 'string') yerr(`labels.callouts.${keyword} must be text`);
        else if (!KEYWORDS.includes(keyword)) ywarn(`labels.callouts.${keyword} is never used: only a keyword (${KEYWORDS.join(', ')}) takes a theme's label; any other callout prints its own`);
      }
    } else if (typeof value !== 'string' && typeof value !== 'number') yerr(`labels.${name} must be text`);
    else if (!/^[a-z][a-z0-9-]*$/.test(name)) yerr(`labels.${name}: a label name is lower-case words joined by hyphens`);
    else if (!Object.hasOwn(DEFAULT_LABELS, name)) customLabels.add(name);
  }

  // ---------------------------------------------------------------- the files
  const skeletonFile = typeof m.skeleton === 'string' ? m.skeleton : 'card.html';
  const used = new Set<string>(['theme.yaml', skeletonFile, STYLESHEET, 'README.md']);
  if (!has(skeletonFile)) errors.push(`${skeletonFile}: missing`);
  if (!has(STYLESHEET)) errors.push(`${STYLESHEET}: missing`);
  if (!has('README.md')) warnings.push('README.md: missing (say what the theme is for, and its fonts)');

  if (has(STYLESHEET)) {
    for (const problem of stylesheetProblems(files[STYLESHEET])) errors.push(`${STYLESHEET}: ${problem}`);
    if (/<\/style/i.test(files[STYLESHEET])) warnings.push(`${STYLESHEET}: contains "</style"; it is escaped, but say it another way`);
  }
  for (const file of Object.keys(files)) {
    if (!used.has(file) && /\.(css|html?)$/i.test(file)) warnings.push(`${file}: not used by theme.yaml`);
  }

  // ------------------------------------------------------------- the skeleton
  if (has(skeletonFile)) {
    const skeleton = files[skeletonFile];
    const serr = (message: string) => errors.push(`${skeletonFile}: ${message}`);
    for (const problem of skeletonProblems(skeleton)) serr(problem);

    const names = slotNames(skeleton);
    for (const name of names) {
      if (name.startsWith('label.')) {
        const label = name.slice('label.'.length);
        const known = (Object.hasOwn(DEFAULT_LABELS, label) && !NON_SLOT_LABELS.has(label)) || customLabels.has(label);
        if (!known) serr(`{{${name}}}: no such label (give it a value under labels: in theme.yaml, or use one of ${printableLabels().join(', ')})`);
      } else if (name === 'css') {
        serr('{{css}}: the renderer writes the <style> element itself since theme contract 1; remove the slot');
      } else if (!(SLOTS as readonly string[]).includes(name)) {
        serr(`{{${name}}}: no such slot (${SLOTS.join(', ')}, label.<name>)`);
      }
    }
    const layout = (LAYOUTS as readonly unknown[]).includes(o.layout) ? (o.layout as (typeof LAYOUTS)[number]) : 'hoisted';
    for (const name of requiredSlots(layout)) {
      if (!names.includes(name)) {
        serr(`{{${name}}} is missing: every card prints the title, ingredients${layout === 'list' ? '' : ' and directions'}`);
      }
    }
    if (!names.includes('components') && layout !== 'list') {
      warnings.push(`${skeletonFile}: no {{components}} slot; a recipe's components (and paired steps) print inside {{directions}}`);
    }
    for (const name of names) {
      const opens = skeleton.split(`{{#${name}}}`).length - 1;
      const closes = skeleton.split(`{{/${name}}}`).length - 1;
      if (opens !== closes) serr(`{{#${name}}} and {{/${name}}} do not pair up (${opens} opening, ${closes} closing)`);
    }
    if (!/class\s*=\s*["'][^"']*\bcard\b/.test(skeleton)) {
      warnings.push(`${skeletonFile}: no element with class "card"; the core stylesheet styles the card through it`);
    }
    const words = printedWords(skeleton);
    if (words.length > 0) {
      warnings.push(`${skeletonFile}: prints the words ${words.map((w) => `"${w}"`).join(', ')}; make them labels ({{label.<name>}}) so they can be translated`);
    }
    for (const name of customLabels) {
      if (!names.includes(`label.${name}`)) ywarn(`labels.${name} is not a renderer word and ${skeletonFile} does not use it`);
    }
  }

  // ----------------------------------------------------------- does it work?
  let theme: Theme | null = null;
  try {
    theme = parseTheme(files);
  } catch (error) {
    const message = (error as Error).message;
    if (errors.length === 0) errors.push(`theme: ${message}`); // otherwise already reported above, more precisely
  }
  if (theme !== null && theme.contract < 2) {
    if (/@page[^{]*\{[^}]*(@(top|bottom|left|right)-|border|padding)/.test(theme.css)) {
      warnings.push(
        `${STYLESHEET}: @page margin boxes, borders and padding show only on a card printed without the paging script; ` +
          'style .sheet-box for paged cards (theme contract 2, themes/README.md#pages)',
      );
    }
  }
  if (theme !== null) {
    for (const paper of themePapers(theme).papers) {
      try {
        pageSetup(theme, paper);
      } catch (error) {
        errors.push(`theme.yaml: paper ${paper}: ${(error as Error).message}`);
      }
    }
  }
  if (theme !== null && options.units !== undefined) {
    for (const sample of ['traditional', 'structured'] as const) {
      let recipe;
      try {
        recipe = parseRecipe(SAMPLES[sample], { units: options.units });
      } catch {
        continue; // the samples are ours; a failure here is not the theme's
      }
      // A list theme prints each ingredient once, other recipes in their own group, each set
      // (an optional part, a branch of a Choose) in its own group, internal references not at all.
      const shopping = recipeShoppingList(recipe);
      const rowsOf = (g: { items: unknown[]; recipes: unknown[] }) => g.items.length + g.recipes.length;
      const expected = theme.layout === 'list' ? rowsOf(shopping) + (shopping.sets ?? []).reduce((n, set) => n + rowsOf(set), 0) : SAMPLE_INGREDIENTS[sample];
      const where = `sample ${sample} recipe`;
      try {
        // With the notes asked for, so that every slot the skeleton has is filled once.
        const doc = renderCard(recipe, theme, { notes: true });
        if (/\{\{[#/]?[a-z][a-z0-9.-]*\}\}/.test(doc)) errors.push(`${skeletonFile}: slot syntax left in the ${where}`);
        if (!doc.includes(SAMPLE_TITLE[sample])) errors.push(`${skeletonFile}: the title is not printed in the ${where}`);
        const rows = doc.split('<tr class="ingr').length - 1;
        if (rows !== expected) {
          errors.push(`${skeletonFile}: the ${where} prints ${rows} of its ${expected} ingredients`);
        }
      } catch (error) {
        errors.push(`theme: the ${where} does not render: ${(error as Error).message}`);
      }
    }
  }
  return { errors, warnings, theme };
}

function mapOf(value: unknown, key: string, err: (message: string) => void): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    err(`${key} must be a map of keys`);
    return {};
  }
  return record(value);
}

function printableLabels(): string[] {
  return Object.keys(DEFAULT_LABELS).filter((n) => !NON_SLOT_LABELS.has(n));
}

/** Words a skeleton prints itself, outside slots and tags. */
function printedWords(skeleton: string): string[] {
  const textOnly = skeleton
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ');
  return [...new Set(textOnly.match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [])];
}

// ------------------------------------------------------------------ samples
// Two small recipes that between them reach every slot and most classes. They are only for
// checking a theme renders; they are not recipes anyone should cook.

const SAMPLE_TITLE = { traditional: 'Sample Soup', structured: 'Sample Noodle Bowl' } as const;
const SAMPLE_INGREDIENTS = { traditional: 5, structured: 5 } as const;

const SAMPLES: Record<keyof typeof SAMPLE_TITLE, string> = {
  traditional: `---
etna: 1
form: traditional
yield: 4 bowls
source: The theme checker
version: v1
license: CC0
---

# Sample Soup

A short introduction.

## Ingredients

### Soup

- 1 1/2 tbsp olive oil
- 2-3 cloves garlic, minced
- 1 l water

- salt

### Garnish

- 1/4 tsp pepper

## Directions

### Soup

1. **Start** — Warm the oil and soften the garlic.
2. Add the water and simmer.

### Garnish

1. Grind the pepper over each bowl.

## Notes

Keeps for three days.
`,
  structured: `---
etna: 1
yield: 2 bowls
---

# Sample Noodle Bowl

## Broth

### Simmer

- 1000 g water

Simmer for 20 minutes.

> **Checkpoint** — it should taste of something.

## Noodles

> **Choose** — one noodle.

### Wheat noodles

- 200 g wheat noodles

Boil for 4 minutes.

### Rice noodles

- 200 g rice noodles

Soak for 10 minutes.

## Assembly

### Combine

- [broth](#broth)
- 2 scallions, sliced

Ladle the broth over the noodles.

### Rest

Rest.

## Notes

Keeps for a day.
`,
};
