// Node-only: build a catalog from a collection on disk and write catalog.json.

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { isValidSlug } from '../core/index.ts';
import { findRecipes, imageFolder, loadUnits, readRecipe, writeFileSafely } from '../node/files.ts';
import { catalogEntry, compareSlugs } from './entry.ts';
import type { Catalog } from './types.ts';

/**
 * The directory that recipe paths are relative to and that catalog.json is written into.
 * `path` may be anything `findRecipes` accepts: a collection root (holding `recipes/`), the
 * `recipes/` directory itself, any directory of recipe directories, one recipe directory, or
 * a recipe.md file.
 */
export function collectionRoot(path: string): string {
  let dir = resolve(path);
  if (statSync(dir).isFile()) dir = dirname(dir);
  if (existsSync(join(dir, 'recipes')) && !existsSync(join(dir, 'recipe.md'))) return dir;
  if (existsSync(join(dir, 'recipe.md'))) dir = dirname(dir);
  return basename(dir) === 'recipes' ? dirname(dir) : dir;
}

/** One entry per recipe under `path`, sorted by slug. Directories without recipe.md are skipped. */
export function buildCatalog(path: string): Catalog {
  const root = collectionRoot(path);
  const units = loadUnits();
  const recipes = [];
  for (const found of findRecipes(path)) {
    if (!found.file) continue;
    const entry = catalogEntry(readRecipe(found.file, units), found.slug);
    entry.path = relative(root, found.file).split(sep).join('/');
    // The picture belongs to a recipe folder: a loose Markdown file has none.
    const image = basename(found.file) === 'recipe.md' ? imageFolder(dirname(found.file)).map((f) => f.name).filter((n) => !n.startsWith('.')) : [];
    if (image.length > 0) entry.image = image;
    recipes.push(entry);
  }
  // Code-point order, so the file is the same whatever the machine's locale.
  recipes.sort((a, b) => compareSlugs(a.slug, b.slug));
  const themes = collectionThemes(root);
  return themes.length > 0 ? { version: 1, themes, recipes } : { version: 1, recipes };
}

/**
 * The card themes a collection carries: names of the folders directly under `<root>/themes/`
 * that hold a `theme.yaml`, in code-point order. A folder whose name is not a valid slug, and a
 * symbolic link, is ignored.
 */
export function collectionThemes(root: string): string[] {
  const dir = join(root, 'themes');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isValidSlug(d.name) && existsSync(join(dir, d.name, 'theme.yaml')))
    .map((d) => d.name)
    .sort(compareSlugs);
}

/** The exact bytes of catalog.json: two-space indent, keys in a fixed order, one trailing newline. */
export function serializeCatalog(catalog: Catalog): string {
  const ordered: Catalog = catalog.themes && catalog.themes.length > 0
    ? { version: catalog.version, themes: catalog.themes, recipes: catalog.recipes }
    : { version: catalog.version, recipes: catalog.recipes };
  return JSON.stringify(ordered, null, 2) + '\n';
}

/**
 * Build the catalog for `path` and write it; by default to `<collection root>/catalog.json`.
 * Returns the path written. Never writes through a symbolic link, and the default file only
 * inside the collection (see writeFileSafely): a collection from someone else's repository may
 * carry a catalog.json that is a link to a file elsewhere.
 */
export function writeCatalog(path: string, outFile?: string): string {
  const root = collectionRoot(path);
  const out = resolve(outFile ?? join(root, 'catalog.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSafely(out, serializeCatalog(buildCatalog(path)), outFile === undefined ? root : null);
  return out;
}
