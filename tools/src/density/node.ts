// Node side: loading densities.md files.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ETNA_ROOT, loadUnits } from '../node/files.ts';
import { mergeTables, parseDensities, type DensityTable } from './index.ts';

export const DEFAULT_DENSITIES = (root: string = ETNA_ROOT) => join(root, 'registries', 'densities.md');

/** Read one densities file, tagging rows and problems with its path. */
export function readDensityFile(file: string): DensityTable {
  const table = parseDensities(readFileSync(file, 'utf8'), loadUnits());
  for (const r of table.rows) r.file = file;
  for (const p of [...table.problems, ...table.notes]) p.file = file;
  return table;
}

/**
 * The density table to work to: `etna/registries/densities.md`, overlaid by the collection's own
 * `densities.md` when `collection` is given and has one (its rows replace default rows of the
 * same name).
 */
export function loadDensities(collection: string | null = null, root: string = ETNA_ROOT): DensityTable {
  const base = readDensityFile(DEFAULT_DENSITIES(root));
  if (collection === null) return base;
  const own = join(collection, 'densities.md');
  if (!existsSync(own)) return base;
  if (!isOwnFile(own, collection)) throw new Error(`${own} is a link to a file outside the collection; it is not read`);
  const table = readDensityFile(own);
  // A collection's file need not have a Reference section (it may hold only the Wanted section).
  table.problems = table.problems.filter((p) => p.code !== 'no-section');
  return mergeTables(base, table);
}

/** True when `file`, with links followed, is still a file directly in the folder `dir`. */
export function isOwnFile(file: string, dir: string): boolean {
  try {
    return dirname(realpathSync(file)) === realpathSync(dir);
  } catch {
    return false;
  }
}

export { findCollectionRoot } from '../node/files.ts';
