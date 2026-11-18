// Node-only: finding and loading flow-chart themes on disk.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { ETNA_ROOT } from '../node/files.ts';
import { parseDagTheme, type DagTheme } from './theme.ts';

/** Where the bundled themes live: `themes/` at the root of the etna repository. */
export const THEMES_DIR = join(ETNA_ROOT, 'themes');

/** Names of the bundled flow-chart themes (`kind: chart` in their theme.yaml), sorted. */
export function listDagThemes(): string[] {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && isChartTheme(join(THEMES_DIR, d.name)))
    .map((d) => d.name)
    .sort();
}

function isChartTheme(dir: string): boolean {
  const file = join(dir, 'theme.yaml');
  if (!existsSync(file)) return false;
  try {
    return (parseYaml(readFileSync(file, 'utf8')) as { kind?: unknown } | null)?.kind === 'chart';
  } catch {
    return false;
  }
}

/**
 * The folder of a theme given by name (a folder under `etna/themes/`) or as a path: an
 * absolute path, or anything with a path separator or a leading dot. Throws when it is missing.
 */
export function dagThemeDir(nameOrDir: string = 'flow'): string {
  const isPath = isAbsolute(nameOrDir) || /[\\/]/.test(nameOrDir) || nameOrDir.startsWith('.');
  const dir = isPath ? resolve(nameOrDir) : join(THEMES_DIR, nameOrDir);
  const file = join(dir, 'theme.yaml');
  if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(file)) {
    const known = isPath ? [] : listDagThemes();
    const hint = known.length > 0 ? ` (bundled chart themes: ${known.join(', ')})` : '';
    throw new Error(`flow-chart theme not found: ${isPath ? dir : nameOrDir} (looked for ${file})${hint}`);
  }
  return dir;
}

/** A theme folder's text files (name → text): what parseDagTheme and checkDagTheme take. */
export function readDagThemeFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(ya?ml|md)$/i.test(entry.name)) files[entry.name] = readFileSync(join(dir, entry.name), 'utf8');
  }
  return files;
}

/**
 * Load a flow-chart theme by name or from a directory (see `dagThemeDir`). Values it leaves
 * out fall back to the defaults when the chart is rendered. Throws, listing every error, when
 * the theme has errors (see `parseDagTheme`); warnings are not reported here.
 */
export function loadDagTheme(nameOrDir: string = 'flow'): DagTheme {
  const dir = dagThemeDir(nameOrDir);
  const { theme, problems } = parseDagTheme(readDagThemeFiles(dir));
  const errors = problems.filter((p) => p.level === 'error');
  if (errors.length > 0) {
    throw new Error(`${join(dir, 'theme.yaml')}: ${errors.map((e) => e.message).join('; ')}`);
  }
  return theme;
}
