// Where recipes come from. One small interface, several implementations:
// a folder served by `etna serve`, a public GitHub repo read straight from the browser, or the
// recipes a static build carries as its default source, read from the site itself.
// (Writing — branches and pull requests — will extend this interface later.)

import { parse as parseYaml } from 'yaml';

import { STYLESHEET } from '../card/theme.ts';
import { catalogFromSlugs, type Catalog, type CatalogEntry } from '../catalog/index.ts';
import { isValidSlug } from '../core/index.ts';
import { readOrder } from './listorder.ts';
import { parseRepo, REPO_RE } from './repo.ts';

export interface RepoSource {
  /** Stable id, unique among the open sources. Used in URLs. */
  id: string;
  /** Short name shown in the interface. */
  label: string;
  kind: 'local' | 'github' | 'site';
  /** Loads the catalog. `nameOnly` is true when the repo ships no catalog.json. */
  catalog(): Promise<{ catalog: Catalog; nameOnly: boolean }>;
  /** Reads a file by its path relative to the collection root. */
  read(path: string): Promise<string>;
  /** A link to the file on the web, when there is one. */
  link(path: string): string | null;
  /** Names of the card themes this source carries (from its catalog; empty when none or unknown). */
  themes(): Promise<string[]>;
  /** A theme's files: file name → text. Rejects if the theme is missing or too large. */
  themeFiles(name: string): Promise<Record<string, string>>;
  /**
   * The text of the collection's own `densities.md` (at its root), or null when it has none or
   * it cannot be had. Never rejects. Optional: a source without it has no table of its own.
   */
  densities?(): Promise<string | null>;
  /**
   * The order the source states for its recipes: slugs from its README (listorder.ts), or empty.
   * Never rejects. Optional: a source without it is listed alphabetically.
   */
  order?(): Promise<string[]>;
}

/** What a collection's densities.md may weigh. The real ones are a few kilobytes. */
export const DENSITIES_LIMIT = 256 * 1024;

/** The text of an optional file: null on any failure, a missing file, or one over `limit` bytes. */
async function optionalText(url: string, limit: number): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await textWithin(response, limit, 'densities.md');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- theme files

/**
 * What a theme fetched from a source may weigh. The same limits are kept by `etna serve` and
 * by the GitHub reader, so a theme behaves the same wherever it comes from.
 */
export const THEME_LIMITS = { files: 20, fileBytes: 256 * 1024, totalBytes: 1024 * 1024 } as const;

/** The file names a source theme may contain: one plain name, a theme file's extension. */
export const THEME_FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(yaml|yml|html|css|md)$/;

function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Throws when `files` breaks THEME_LIMITS; returns them otherwise. */
export function withinThemeLimits(name: string, files: Record<string, string>): Record<string, string> {
  const names = Object.keys(files);
  if (names.length > THEME_LIMITS.files) throw new Error(`theme "${name}" has ${names.length} files; at most ${THEME_LIMITS.files} are read`);
  let total = 0;
  for (const file of names) {
    if (typeof files[file] !== 'string') throw new Error(`theme "${name}": ${file} is not text`);
    const size = bytes(files[file]);
    if (size > THEME_LIMITS.fileBytes) throw new Error(`theme "${name}": ${file} is larger than ${THEME_LIMITS.fileBytes / 1024} KB`);
    total += size;
  }
  if (total > THEME_LIMITS.totalBytes) throw new Error(`theme "${name}" is larger than ${THEME_LIMITS.totalBytes / 1024 / 1024} MB in all`);
  return files;
}

/** Theme names as a source lists them, kept only when they are valid slugs; sorted, de-duplicated. */
function cleanThemeNames(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const valid = names.filter((n): n is string => typeof n === 'string' && isValidSlug(n));
  return [...new Set(valid)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The files a theme is made of, beside its theme.yaml: the skeleton the manifest names (or
 * card.html) and the stylesheet, card.css. A skeleton name that is not a plain theme-file name
 * (a path, `..`, another extension) is left out; the checker then reports the file as missing.
 */
export function themeManifestFiles(manifestText: string): string[] {
  let manifest: unknown;
  try {
    manifest = parseYaml(manifestText);
  } catch {
    return [];
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return [];
  const m = manifest as Record<string, unknown>;
  const wanted = [typeof m.skeleton === 'string' ? m.skeleton : 'card.html', STYLESHEET];
  return [...new Set(wanted)].filter((f) => THEME_FILE_NAME_RE.test(f) && f !== 'theme.yaml');
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return response;
}

// ------------------------------------------------- what a source may hand over
//
// A source is someone else's repository. Its catalog and recipe files are data to show, never
// instructions: sizes are bounded, and a path in a catalog is used only when it is a plain
// path to a recipe.md inside the collection.

/** What a recipe file and a catalog may weigh. Real ones are a few kilobytes, and well under a megabyte. */
export const SOURCE_LIMITS = { recipeBytes: 1024 * 1024, catalogBytes: 32 * 1024 * 1024, recipes: 20000 } as const;

/** The text of a response, refused when it is larger than `limit` bytes. */
async function textWithin(response: Response, limit: number, what: string): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length') ?? 0);
  if (declared > limit) throw new Error(`${what} is larger than ${Math.round(limit / 1024)} KB`);
  const text = await response.text();
  if (text.length > limit) throw new Error(`${what} is larger than ${Math.round(limit / 1024)} KB`);
  return text;
}

/** A path as a catalog may give it: plain folder names, then `recipe.md`. No `..`, no empty part, no leading slash. */
const RECIPE_PATH_RE = /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/){1,4}recipe\.md$/;

export function isRecipePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 300 && RECIPE_PATH_RE.test(path);
}

/**
 * A catalog as a source sent it, reduced to what the app can rely on: entries with a slug, a
 * title and a plain recipe path; text fields that are text. Anything else is dropped.
 */
export function cleanCatalog(raw: unknown): Catalog {
  const data = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const recipes: CatalogEntry[] = [];
  for (const item of Array.isArray(data.recipes) ? data.recipes.slice(0, SOURCE_LIMITS.recipes) : []) {
    if (item === null || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.slug !== 'string' || !isValidSlug(e.slug) || !isRecipePath(e.path)) continue;
    recipes.push({
      slug: e.slug,
      title: text(e.title) ?? e.slug,
      form: e.form === 'traditional' ? 'traditional' : 'structured',
      source: text(e.source),
      yield: text(e.yield),
      license: text(e.license),
      ingredients: Array.isArray(e.ingredients) ? e.ingredients.filter((i): i is string => typeof i === 'string') : [],
      text: text(e.text) ?? '',
      path: e.path,
    });
  }
  const themes = cleanThemeNames(data.themes);
  return themes.length > 0 ? { version: 1, themes, recipes } : { version: 1, recipes };
}

/** A collection folder served by `etna serve`. */
export class LocalSource implements RepoSource {
  readonly kind = 'local' as const;
  readonly id: string;
  readonly label: string;

  private loaded: Promise<{ catalog: Catalog; nameOnly: boolean }> | null = null;
  private table: Promise<string | null> | null = null;

  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }

  catalog() {
    this.loaded ??= fetchOk(`api/sources/${encodeURIComponent(this.id)}/catalog`).then(async (response) => ({
      catalog: cleanCatalog(JSON.parse(await textWithin(response, SOURCE_LIMITS.catalogBytes, 'the catalog'))),
      nameOnly: false,
    }));
    return this.loaded;
  }

  async order() {
    try {
      const response = await fetch(`api/sources/${encodeURIComponent(this.id)}/order`);
      return response.ok ? readOrder(JSON.parse(await textWithin(response, SOURCE_LIMITS.catalogBytes, 'the order'))) : [];
    } catch {
      return [];
    }
  }

  async themes() {
    return cleanThemeNames((await this.catalog()).catalog.themes);
  }

  async themeFiles(name: string) {
    if (!isValidSlug(name)) throw new Error(`not a theme name: ${name}`);
    const response = await fetchOk(`api/sources/${encodeURIComponent(this.id)}/theme?name=${encodeURIComponent(name)}`);
    const body = (await response.json()) as unknown;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error(`theme "${name}": unexpected answer from the server`);
    return withinThemeLimits(name, body as Record<string, string>);
  }

  async read(path: string) {
    if (!isRecipePath(path)) throw new Error('not a recipe file in this collection');
    const response = await fetchOk(`api/sources/${encodeURIComponent(this.id)}/file?path=${encodeURIComponent(path)}`);
    return textWithin(response, SOURCE_LIMITS.recipeBytes, 'the recipe file');
  }

  link() {
    return null;
  }

  densities() {
    this.table ??= optionalText(`api/sources/${encodeURIComponent(this.id)}/densities`, DENSITIES_LIMIT);
    return this.table;
  }
}

/**
 * The folder of a static build that holds its default source (`etna build-web --default-source`):
 * `catalog.json`, the recipes at their catalog paths, `densities.md` when there is one, and
 * `themes/<name>.json`, a theme's files by name (site-source.ts writes them).
 */
export const SITE_SOURCE_DIR = 'default-source';

/**
 * The recipes this site carries: its default source, read from the site itself by relative URLs
 * (under a sub-path too), so it asks no host but the one the page came from. The files were
 * written by the build, but they are read as any source's are: sizes bounded, the catalog cleaned.
 */
export class SiteSource implements RepoSource {
  readonly kind = 'site' as const;
  readonly id: string;
  readonly label: string;

  private loaded: Promise<{ catalog: Catalog; nameOnly: boolean }> | null = null;
  private table: Promise<string | null> | null = null;

  /** The order the build read from the folder's README (site-source.ts), or empty. */
  private readonly stated: string[];

  constructor(id: string, label: string, order: string[] = []) {
    this.id = id;
    this.label = label;
    this.stated = order;
  }

  async order() {
    return this.stated;
  }

  private url(path: string): string {
    return `${SITE_SOURCE_DIR}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  catalog() {
    this.loaded ??= fetchOk(this.url('catalog.json')).then(async (response) => ({
      catalog: cleanCatalog(JSON.parse(await textWithin(response, SOURCE_LIMITS.catalogBytes, 'the catalog'))),
      nameOnly: false,
    }));
    return this.loaded;
  }

  async themes() {
    return cleanThemeNames((await this.catalog()).catalog.themes);
  }

  async themeFiles(name: string) {
    if (!isValidSlug(name)) throw new Error(`not a theme name: ${name}`);
    const response = await fetchOk(this.url(`themes/${name}.json`));
    const body = JSON.parse(await textWithin(response, THEME_LIMITS.totalBytes * 2, `theme "${name}"`)) as unknown;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new Error(`theme "${name}": not a theme's files`);
    return withinThemeLimits(name, body as Record<string, string>);
  }

  async read(path: string) {
    if (!isRecipePath(path)) throw new Error('not a recipe file in this collection');
    return textWithin(await fetchOk(this.url(path)), SOURCE_LIMITS.recipeBytes, 'the recipe file');
  }

  link() {
    return null;
  }

  densities() {
    this.table ??= optionalText(this.url('densities.md'), DENSITIES_LIMIT);
    return this.table;
  }
}

/** The local sources offered by `etna serve`; empty when the app is hosted statically. */
export async function discoverLocalSources(): Promise<LocalSource[]> {
  try {
    const response = await fetch('api/sources');
    if (!response.ok) return [];
    const list = (await response.json()) as { id: string; label: string }[];
    return list.map((s) => new LocalSource(s.id, s.label));
  } catch {
    return [];
  }
}

export { parseRepo };

/**
 * A public GitHub repository, read without signing in.
 *
 * File contents come from raw.githubusercontent.com, which allows cross-origin requests and
 * is not subject to the API's limit of 60 unauthenticated requests per hour. The API is used
 * for at most one call — listing the tree — and only when the repo has no catalog.json.
 */
export class GitHubSource implements RepoSource {
  readonly kind = 'github' as const;
  readonly id: string;
  readonly label: string;
  private readonly ref: string;
  private loaded: Promise<{ catalog: Catalog; nameOnly: boolean }> | null = null;
  private table: Promise<string | null> | null = null;

  constructor(repo: string, ref = 'HEAD') {
    if (!REPO_RE.test(repo)) throw new Error(`not a GitHub repository: ${repo.slice(0, 80)}`);
    this.id = repo;
    this.label = repo;
    this.ref = ref;
  }

  private raw(path: string): string {
    return `https://raw.githubusercontent.com/${this.id}/${this.ref}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Loaded once: the themes are read from the same catalog (or the same tree listing). */
  catalog() {
    this.loaded ??= this.loadCatalog();
    return this.loaded;
  }

  private async loadCatalog() {
    const shipped = await fetch(this.raw('catalog.json'));
    if (shipped.ok) return { catalog: cleanCatalog(JSON.parse(await textWithin(shipped, SOURCE_LIMITS.catalogBytes, 'catalog.json'))), nameOnly: false };
    const response = await fetchOk(`https://api.github.com/repos/${this.id}/git/trees/${this.ref}?recursive=1`);
    const tree = (await response.json()) as { tree: { path: string }[] };
    const slugs: string[] = [];
    const themes: string[] = [];
    for (const t of tree.tree) {
      const recipe = /^recipes\/([^/]+)\/recipe\.md$/.exec(t.path);
      if (recipe && isValidSlug(recipe[1])) slugs.push(recipe[1]);
      const theme = /^themes\/([^/]+)\/theme\.yaml$/.exec(t.path);
      if (theme) themes.push(theme[1]);
    }
    const catalog = catalogFromSlugs(slugs);
    const names = cleanThemeNames(themes);
    return { catalog: names.length > 0 ? { ...catalog, themes: names } : catalog, nameOnly: true };
  }

  async themes() {
    return cleanThemeNames((await this.catalog()).catalog.themes);
  }

  /** theme.yaml first, then the files it names, then README.md if there is one. No API call. */
  async themeFiles(name: string) {
    if (!isValidSlug(name)) throw new Error(`not a theme name: ${name}`);
    const fetchText = async (file: string): Promise<string | null> => {
      const response = await fetch(this.raw(`themes/${name}/${file}`));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} — themes/${name}/${file}`);
      const length = Number(response.headers?.get?.('content-length') ?? 0);
      if (length > THEME_LIMITS.fileBytes) throw new Error(`theme "${name}": ${file} is larger than ${THEME_LIMITS.fileBytes / 1024} KB`);
      return response.text();
    };
    const manifest = await fetchText('theme.yaml');
    if (manifest === null) throw new Error(`no theme "${name}" in ${this.id}`);
    const files: Record<string, string> = { 'theme.yaml': manifest };
    withinThemeLimits(name, files);
    const wanted = [...themeManifestFiles(manifest), 'README.md'].filter((f, i, all) => all.indexOf(f) === i);
    for (const file of wanted) {
      // A missing file is left out: the checker then names it. A missing README is no error at all.
      const text = await fetchText(file);
      if (text !== null) files[file] = text;
      withinThemeLimits(name, files);
    }
    return files;
  }

  async read(path: string) {
    if (!isRecipePath(path)) throw new Error('not a recipe file in this collection');
    return textWithin(await fetchOk(this.raw(path)), SOURCE_LIMITS.recipeBytes, 'the recipe file');
  }

  link(path: string) {
    return isRecipePath(path) ? `https://github.com/${this.id}/blob/${this.ref}/${path}` : null;
  }

  /** One fetch of densities.md at the repository root, once; no API call. Missing or failed: null. */
  densities() {
    this.table ??= optionalText(this.raw('densities.md'), DENSITIES_LIMIT);
    return this.table;
  }
}
