// Node-only: the recipes a static build carries as its default source (`etna build-web
// --default-source <folder>`). The folder is read once, at build time, the way `etna serve` reads
// it, and written into the site under `default-source/` (SITE_SOURCE_DIR), so the app reads it
// from the site itself: same origin, no GitHub request. The app's side is SiteSource (sources.ts).

import { existsSync, realpathSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';

import { buildCatalog, collectionRoot, collectionThemes, serializeCatalog } from '../catalog/node.ts';
import { isValidSlug } from '../core/index.ts';
import { TWIN_SUFFIX } from '../restructure/index.ts';
import { readCollectionDensities, readCollectionTheme } from '../serve/server.ts';
import { isRecipePath, SOURCE_LIMITS } from './sources.ts';
import { SAMPLE_COUNT, type SiteWelcome } from './welcome.ts';

/** A default source as the build carries it: its id and label, and its files by their path inside SITE_SOURCE_DIR. */
export interface DefaultSource {
  /** The folder's name, a slug: the source's id in the app (URLs, `hide`, `order`, `removed`). */
  id: string;
  /** What the source list calls it: the folder's name, as `etna serve` names a folder. */
  label: string;
  /** `catalog.json`, each recipe at its catalog path, `densities.md` if any, and `themes/<name>.json`. */
  files: Record<string, string>;
  /** What the landing page says of it: the recipes it names first, in the folder's own order (welcome.ts). */
  welcome: SiteWelcome;
  /** The order its README states (statedOrder): the recipes it links from a list or a table, each traditional twin right after its dish; empty without a README. The recipe list follows it (listorder.ts). */
  order: string[];
}

/**
 * The default source made from `folder`: anything `etna serve` accepts (a collection root holding
 * `recipes/`, or a folder of recipe folders such as `cookbook/`). Throws, in words, when the
 * folder cannot be one: missing, no recipes, a name that is not a slug, or a recipe too large or
 * too deep for the app to read.
 */
export function defaultSourceFiles(folder: string): DefaultSource {
  const dir = resolve(folder);
  let real: string;
  try {
    real = realpathSync(dir);
    if (!statSync(real).isDirectory()) throw new Error('not a folder');
  } catch {
    throw new Error(`the default source must be a folder of recipes, and ${folder} is not a folder`);
  }
  const root = collectionRoot(real);
  const id = basename(root);
  if (!isValidSlug(id)) throw new Error(`the default source's folder name, "${id}", must be lower-case letters and digits joined by hyphens: it is the source's name in the app`);
  const catalog = buildCatalog(real);
  if (catalog.recipes.length === 0) throw new Error(`${folder} holds no recipe (no <name>/recipe.md, nor recipes/<name>/recipe.md)`);
  const files: Record<string, string> = { 'catalog.json': serializeCatalog(catalog) };
  for (const entry of catalog.recipes) {
    if (!isRecipePath(entry.path)) throw new Error(`${entry.path}: the app reads a recipe at most four folders deep, by plain folder names`);
    const text = readFileSync(join(root, entry.path), 'utf8');
    if (Buffer.byteLength(text) > SOURCE_LIMITS.recipeBytes) throw new Error(`${entry.path} is larger than ${SOURCE_LIMITS.recipeBytes / 1024} KB`);
    files[entry.path] = text;
  }
  const densities = readCollectionDensities(root);
  if (densities !== null) files['densities.md'] = densities;
  // Each theme as one file, its files by name: what `etna serve` answers for a theme.
  for (const name of collectionThemes(root)) files[`themes/${name}.json`] = JSON.stringify(readCollectionTheme(root, name));
  const readme = readReadme(root);
  return { id, label: id, files, welcome: siteWelcome(catalog.recipes, readme), order: statedOrder(readme, catalog.recipes) };
}

/** A collection's `README.md`, at its root, or null when it has none. */
function readReadme(root: string): string | null {
  const path = join(root, 'README.md');
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * The order a folder states for its recipes (statedOrder), or empty. What `etna serve` answers for
 * a folder, as the build writes it for a default source.
 */
export function folderOrder(folderRoot: string, recipes: readonly ListedRecipe[]): string[] {
  return statedOrder(readReadme(collectionRoot(folderRoot)), recipes);
}

/** What the list's order needs to know of a recipe. */
type ListedRecipe = { slug: string; path: string; title: string; form: string };

/**
 * The order a source's README states, as the recipe list follows it, for a static build's default
 * source and for a folder `etna serve` lists alike: the slugs the README links from a list item or
 * a table row (readmeOrder), with each traditional twin moved to right after its dish
 * (twinsAfterDishes). Empty without a README.
 */
export function statedOrder(readme: string | null, recipes: readonly ListedRecipe[]): string[] {
  return readme === null ? [] : twinsAfterDishes(readmeOrder(readme, recipes).map((l) => l.slug), recipes);
}

/**
 * An order with each traditional twin listed directly after its dish, wherever the order had it.
 * A twin is a recipe in the traditional form whose title is a structured recipe's title followed
 * by exactly ` (Traditional Form)` (the convention `etna restructure check` accepts, TWIN_SUFFIX). A
 * twin whose dish is not in the order stays where it was; a twin the order leaves out joins it
 * after its dish. An empty order stays empty.
 */
export function twinsAfterDishes(order: readonly string[], recipes: readonly { slug: string; title: string; form: string }[]): string[] {
  if (order.length === 0) return [];
  const byTitle = new Map<string, string>();
  for (const r of recipes) if (r.form !== 'traditional' && !byTitle.has(r.title)) byTitle.set(r.title, r.slug);
  const listed = new Set(order);
  const twinsOf = new Map<string, string[]>();
  const moved = new Set<string>();
  // Twins in the order's own sequence first, then the ones it leaves out, by slug.
  const rank = new Map(order.map((slug, i) => [slug, i]));
  const candidates = [...recipes].sort((a, b) => (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity) || a.slug.localeCompare(b.slug));
  for (const r of candidates) {
    if (r.form !== 'traditional' || !r.title.endsWith(TWIN_SUFFIX)) continue;
    const dish = byTitle.get(r.title.slice(0, -TWIN_SUFFIX.length));
    if (dish === undefined || !listed.has(dish)) continue;
    twinsOf.set(dish, [...(twinsOf.get(dish) ?? []), r.slug]);
    moved.add(r.slug);
  }
  const out: string[] = [];
  for (const slug of order) {
    if (moved.has(slug)) continue;
    out.push(slug, ...(twinsOf.get(slug) ?? []));
  }
  return out;
}

/**
 * The landing page's view of a default source. When the README has a section headed
 * `## Start with these`, the samples are the recipes its list links, in its order (startWith).
 * Otherwise they are the first four structured recipes in the README's order (the recipes it links
 * from a list or a table), or in the list's order when there is no such README. Either way at most
 * four, and only structured ones: a recipe in the traditional form has no flow chart, and so the
 * same dish written both ways is named once. Each keeps the first sentence the README says of it
 * (the rest of its list item in the section; else the rest of the list item, or the table row's
 * next cell, elsewhere in the README); without a README, a name alone: nothing is made up.
 */
export function siteWelcome(recipes: readonly { slug: string; title: string; form: string; path: string }[], readme: string | null): SiteWelcome {
  const linked = readme === null ? [] : readmeOrder(readme, recipes);
  const named = readme === null ? [] : startWith(readme, recipes);
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  const lineOf = new Map(linked.map((l) => [l.slug, l.line]));
  const ordered = linked.length > 0 || named.length > 0;
  const order =
    named.length > 0
      ? named.map((l) => ({ ...bySlug.get(l.slug)!, line: l.line ?? lineOf.get(l.slug) ?? null }))
      : ordered
        ? linked.map((l) => ({ ...bySlug.get(l.slug)!, line: l.line }))
        : recipes.map((r) => ({ ...r, line: null }));
  const shown = order.filter((r) => r.form === 'structured').slice(0, SAMPLE_COUNT);
  const example = shown[0] ?? null;
  return {
    samples: shown.map((r) => ({ slug: r.slug, title: r.title, line: r.line })),
    ordered,
    count: recipes.length,
    example: example && { slug: example.slug, title: example.title },
  };
}

/** The heading of the README section that names the welcome's samples (siteWelcome). */
export const START_WITH_HEADING = 'Start with these';

/**
 * A README split at its `## Start with these` section: the section's lines (null when there is
 * none) and the README without them. The section runs from that H2 (its text compared without
 * case) to the next H1 or H2. Headings inside code fences do not count.
 */
function splitStartWith(readme: string): { section: string | null; rest: string } {
  const lines = readme.split(/\r?\n/);
  let fence = false;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const heading = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(lines[i]);
    if (!heading) continue;
    if (start < 0) {
      if (heading[1] === '##' && heading[2].toLowerCase() === START_WITH_HEADING.toLowerCase()) start = i;
    } else if (heading[1].length <= 2) {
      end = i;
      break;
    }
  }
  if (start < 0) return { section: null, rest: readme };
  return { section: lines.slice(start + 1, end).join('\n'), rest: [...lines.slice(0, start), ...lines.slice(end)].join('\n') };
}

/**
 * The recipes a README's `## Start with these` section links from its list, in its order, each
 * with the first sentence of the rest of its item (null when there is none). Empty when the
 * README has no such section.
 */
export function startWith(readme: string, recipes: readonly { slug: string; path: string }[]): { slug: string; line: string | null }[] {
  const { section } = splitStartWith(readme);
  return section === null ? [] : linkedRecipes(section, recipes);
}

/**
 * The recipes a README links from a list item or a table row, in its order, each once (its first
 * such link), with one line on each: the first sentence of the rest of the list item, or of the
 * row's next cell, as plain text; null when there is none. A link counts when its target, relative
 * to the README, is a recipe's folder or its `recipe.md`. Links in running text do not count, and
 * neither does the `## Start with these` section, which names the welcome's samples, not the order.
 */
export function readmeOrder(readme: string, recipes: readonly { slug: string; path: string }[]): { slug: string; line: string | null }[] {
  return linkedRecipes(splitStartWith(readme).rest, recipes);
}

function linkedRecipes(readme: string, recipes: readonly { slug: string; path: string }[]): { slug: string; line: string | null }[] {
  const folders = new Map(recipes.map((r) => [r.path.replace(/\/recipe\.md$/, ''), r.slug]));
  const out: { slug: string; line: string | null }[] = [];
  const seen = new Set<string>();
  let fence = false;
  for (const raw of readme.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) fence = !fence;
    if (fence) continue;
    const row = /^\s*\|/.test(raw);
    const item = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(raw);
    if (!row && !item) continue;
    const cells = row ? splitRow(raw) : [raw.slice(item![0].length)];
    for (let i = 0; i < cells.length; i++) {
      const link = firstRecipeLink(cells[i], folders);
      if (!link) continue;
      if (seen.has(link.slug)) break;
      seen.add(link.slug);
      const rest = row ? (cells.slice(i + 1).find((c) => c.trim() !== '') ?? '') : cells[i].slice(link.end).replace(/^[\s\u2014\u2013:,-]+/, '');
      out.push({ slug: link.slug, line: firstSentence(plainText(rest)) });
      break;
    }
  }
  return out;
}

const LINK = /\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;

function firstRecipeLink(text: string, folders: Map<string, string>): { slug: string; end: number } | null {
  for (const m of text.matchAll(LINK)) {
    const target = m[2];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#') || target.startsWith('/')) continue;
    const folder = target.replace(/[#?].*$/, '').replace(/^(\.\/)+/, '').replace(/\/recipe\.md$/, '').replace(/\/+$/, '');
    const slug = folders.get(folder);
    if (slug) return { slug, end: m.index + m[0].length };
  }
  return null;
}

/** A table row's cells, split on the bars that are not escaped and not inside code. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let code = false;
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (c === '`') {
      code = !code;
      cell += c;
    } else if (c === '|' && !code) {
      cells.push(cell);
      cell = '';
    } else cell += c;
  }
  cells.push(cell);
  return cells;
}

/** Markdown inline text as plain text: links keep their words, marks go, and code stays in backticks (the welcome shows it as code). */
function plainText(markdown: string): string {
  const flat = (node: { type: string; value?: string; children?: unknown[] }): string =>
    node.type === 'inlineCode' ? `\`${node.value}\`` : node.children ? node.children.map((c) => flat(c as typeof node)).join(node.type === 'root' ? ' ' : '') : toString(node);
  return flat(fromMarkdown(markdown.trim())).replace(/\s+/g, ' ').trim();
}

/** The first sentence: up to the first `.`, `?` or `!` (and a closing quote or bracket) before a capital letter or the end. */
export function firstSentence(text: string): string | null {
  if (text === '') return null;
  const m = /^.*?[.?!]["\u201d\u2019')]?(?=\s+[A-Z\u201c"(]|$)/.exec(text);
  return (m ? m[0] : text).trim();
}
