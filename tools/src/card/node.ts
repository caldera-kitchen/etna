// Node-only: loading a theme from disk.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { ETNA_ROOT } from '../node/files.ts';
import { DEFAULT_THEME, parseTheme, type Theme } from './index.ts';

/** Where the bundled themes live: `themes/` at the root of the etna repository. */
export const THEMES_DIR = join(ETNA_ROOT, 'themes');

/** The files a theme is made of: its manifest, skeleton, stylesheets and README. */
const THEME_FILE_RE = /\.(ya?ml|html?|css|md)$/i;

/**
 * The kind of theme a folder holds, from `kind:` in its theme.yaml: `card`, `chart`, or null
 * when it holds no theme. A theme.yaml without `kind:` is a card theme if it has a card.html.
 */
export function themeKind(dir: string): string | null {
  const manifest = join(dir, 'theme.yaml');
  if (!existsSync(manifest)) return null;
  let kind: unknown;
  try {
    kind = (parseYaml(readFileSync(manifest, 'utf8')) as { kind?: unknown } | null)?.kind;
  } catch {
    return null;
  }
  if (typeof kind === 'string') return kind;
  return existsSync(join(dir, 'card.html')) ? 'card' : null;
}

/** Names of the bundled card themes (`kind: card`); flow-chart themes are left out. */
export function listThemes(): string[] {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && themeKind(join(THEMES_DIR, d.name)) === 'card')
    .map((d) => d.name)
    .sort();
}

/** Where a theme named or given as a path lives. Throws when there is no such folder. */
export function themeDir(nameOrDir: string = DEFAULT_THEME): string {
  const isPath = isAbsolute(nameOrDir) || /[\\/]/.test(nameOrDir) || nameOrDir.startsWith('.');
  const dir = isPath ? resolve(nameOrDir) : join(THEMES_DIR, nameOrDir);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    const known = listThemes();
    const hint = !isPath && known.length > 0 ? ` (available: ${known.join(', ')})` : '';
    throw new Error(`theme not found: ${isPath ? dir : nameOrDir}${hint}`);
  }
  return dir;
}

/** A theme folder's files, file name → text: what parseTheme and checkTheme take. */
export function readThemeFiles(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && THEME_FILE_RE.test(entry.name)) files[entry.name] = readFileSync(join(dir, entry.name), 'utf8');
  }
  return files;
}

/**
 * Load a theme by name (a folder under `etna/themes/`) or from a directory path.
 * A bare name is looked up among the bundled themes; anything with a path separator, or
 * an absolute path, is taken as a directory.
 */
export function loadTheme(nameOrDir: string = DEFAULT_THEME): Theme {
  return parseTheme(readThemeFiles(themeDir(nameOrDir)));
}
