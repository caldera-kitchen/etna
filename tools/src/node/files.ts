// Node-only helpers: loading registries and walking a collection on disk.

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import { createUnitRegistry, parseRecipe, type Recipe, type UnitRegistry } from '../core/index.ts';
import { createKindRegistries, type KindRegistries } from '../core/kinds.ts';

/** The root of the `etna` standard: the directory holding SPEC.md, rules.yaml and registries/. */
export const ETNA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let cachedUnits: UnitRegistry | null = null;

export function loadUnits(root: string = ETNA_ROOT): UnitRegistry {
  if (root === ETNA_ROOT && cachedUnits) return cachedUnits;
  const registry = createUnitRegistry(parseYaml(readFileSync(join(root, 'registries', 'units.yaml'), 'utf8')));
  if (root === ETNA_ROOT) cachedUnits = registry;
  return registry;
}

let cachedKinds: KindRegistries | null = null;

/** The registries a mark's kinds are read with (SPEC §5.3, "Kinds"; §11). */
export function loadKindRegistries(root: string = ETNA_ROOT): KindRegistries {
  if (root === ETNA_ROOT && cachedKinds) return cachedKinds;
  const read = (name: string) => parseYaml(readFileSync(join(root, 'registries', name), 'utf8'));
  const registries = createKindRegistries({
    operations: read('operations.yaml'),
    tools: read('tools.yaml'),
    modifiers: read('modifiers.yaml'),
    stopConditions: read('stop-conditions.yaml'),
  });
  if (root === ETNA_ROOT) cachedKinds = registries;
  return registries;
}

export interface RuleDef {
  id: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
}

export function loadRules(root: string = ETNA_ROOT): RuleDef[] {
  const data = parseYaml(readFileSync(join(root, 'rules.yaml'), 'utf8')) as { rules: RuleDef[] };
  return data.rules;
}

export interface RecipeFile {
  /** Directory name. */
  slug: string;
  /** Absolute path of the recipe directory. */
  dir: string;
  /** Absolute path of recipe.md, or null when the directory has none. */
  file: string | null;
}

/**
 * Find the recipes under `path`, which may be:
 *  - a recipe.md file,
 *  - a recipe directory (containing recipe.md),
 *  - a collection root (containing `recipes/`), or
 *  - a directory of recipe directories.
 * `archive/` is never scanned.
 */
export function findRecipes(path: string, note: (message: string) => void = defaultNote): RecipeFile[] {
  const abs = resolve(path);
  const st = statSync(abs);
  const direct = (dir: string, file: string): RecipeFile[] => {
    const problem = linkProblem(file, dir);
    if (problem) note(problem);
    return [{ slug: basenameOf(dir), dir, file: problem ? null : file }];
  };
  if (st.isFile()) return direct(dirname(abs), abs);
  if (existsSync(join(abs, 'recipe.md'))) return direct(abs, join(abs, 'recipe.md'));
  const base = existsSync(join(abs, 'recipes')) ? join(abs, 'recipes') : abs;
  const realRoot = realpathSync(abs);
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const dir = join(base, d.name);
      const file = join(dir, 'recipe.md');
      return { slug: d.name, dir, file: existsSync(file) && isInside(file, realRoot) ? file : null };
    })
    // Code-point order, so every tool lists recipes the same way on every machine.
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * True when `file`, with links followed, is inside the folder `realRoot` (itself a real path).
 * A collection may come from someone else's repository: a `recipe.md` that is a link to a
 * file elsewhere on the computer is not read, listed or rewritten.
 */
export function isInside(file: string, realRoot: string): boolean {
  try {
    return realpathSync(file).startsWith(realRoot + sep);
  } catch {
    return false;
  }
}

/**
 * The files directly in a recipe's `image/` folder (SPEC §4.3), sorted by name: each one's name,
 * path and size. Empty when there is no such folder. Sub-folders are left out, and so is a link
 * that leads out of the recipe directory `dir`, or a file that cannot be read.
 */
export function imageFolder(dir: string): { name: string; path: string; size: number }[] {
  const folder = join(dir, 'image');
  let names: string[];
  let realDir: string;
  try {
    if (!statSync(folder).isDirectory()) return [];
    names = readdirSync(folder);
    realDir = realpathSync(dir);
  } catch {
    return [];
  }
  const out: { name: string; path: string; size: number }[] = [];
  for (const name of names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const path = join(folder, name);
    try {
      const st = statSync(path);
      if (st.isFile() && isInside(path, realDir)) out.push({ name, path, size: st.size });
    } catch {
      // Unreadable: left out, as if it were not there.
    }
  }
  return out;
}

function defaultNote(message: string): void {
  console.error(`etna: ${message}`);
}

/**
 * Why the recipe file `file`, named directly rather than found by walking a collection, must
 * not be read or rewritten; null when it may. The same rule as the collection walk: with links
 * followed, the file must lie inside its collection (see findCollectionRoot), or, outside any
 * collection, inside `dir` (the directory it was named in; by default its own).
 */
export function linkProblem(file: string, dir: string = dirname(resolve(file))): string | null {
  const abs = resolve(file);
  const root = findCollectionRoot(abs) ?? dir;
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return null; // Missing: the read itself reports it.
  }
  if (!existsSync(abs) || isInside(abs, realRoot)) return null;
  return `skipping ${abs}: it is a link to a file outside ${findCollectionRoot(abs) ? 'its collection' : 'its folder'}`;
}

/**
 * The collection a path belongs to: the nearest directory, from the path upward, that holds a
 * `recipes/` directory containing the path (or is given directly). Null when there is none.
 */
export function findCollectionRoot(path: string): string | null {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  if (existsSync(join(dir, 'recipes')) && statSync(join(dir, 'recipes')).isDirectory()) return dir;
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) return null;
    if (dir.split(/[\\/]/).pop() === 'recipes' && existsSync(dir) && statSync(dir).isDirectory()) return parent;
    dir = parent;
  }
}

/**
 * Write `content` to `target` without ever writing through a symbolic link: refuse when `target`
 * is a link, or (with `root`) when its folder, links followed, is not `root` or inside it. The
 * content goes to a temporary file in the same folder, which is then renamed over the target.
 */
export function writeFileSafely(target: string, content: string, root: string | null = null): void {
  const abs = resolve(target);
  let link = false;
  try {
    link = lstatSync(abs).isSymbolicLink();
  } catch {
    // Not there yet.
  }
  if (link) throw new Error(`refusing to write ${abs}: it is a symbolic link`);
  const dir = realpathSync(dirname(abs));
  if (root !== null) {
    const realRoot = realpathSync(root);
    if (dir !== realRoot && !dir.startsWith(realRoot + sep)) throw new Error(`refusing to write ${abs}: it is outside the collection ${realRoot}`);
  }
  const final = join(dir, basename(abs));
  const temp = join(dir, `.${basename(abs)}.${process.pid}.tmp`);
  let mode: number | undefined;
  try {
    mode = statSync(final).mode & 0o777;
  } catch {
    mode = undefined;
  }
  try {
    writeFileSync(temp, content, mode === undefined ? undefined : { mode });
    renameSync(temp, final);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

function basenameOf(dir: string): string {
  return dir.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

export function readRecipe(file: string, units: UnitRegistry = loadUnits()): Recipe {
  return parseRecipe(readFileSync(file, 'utf8'), { units });
}
