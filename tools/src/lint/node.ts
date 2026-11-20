// The linter on disk: one recipe file, one recipe directory, or a whole collection.

import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { allSteps, isValidSlug, parseRecipe } from '../core/index.ts';
import type { IngredientLine, Recipe } from '../core/index.ts';
import { findRecipes, imageFolder, loadUnits, type RecipeFile } from '../node/files.ts';
import { finding, hasErrors, lintRecipe, type Finding, type PictureFile } from './index.ts';

export interface FileResult {
  /** Recipe directory name. */
  slug: string;
  /** Absolute path of recipe.md, or null when the directory has none. */
  file: string | null;
  findings: Finding[];
}

/** Lint every recipe under `path` (see `findRecipes` for what a path may be), adding the collection-level rules. */
export function lintPath(path: string): FileResult[] {
  const units = loadUnits();
  return findRecipes(path).map((entry) => {
    const findings: Finding[] = [];

    // The directory name is a slug only where the directory is a recipe directory: a loose
    // Markdown file (`drafts/idea.md`) says nothing about the folder it sits in.
    const isRecipeDir = entry.file === null || basename(entry.file) === 'recipe.md';
    if (isRecipeDir && !isValidSlug(entry.slug)) {
      findings.push(finding('invalid-slug', `The directory name "${entry.slug}" is not a valid slug (lowercase letters, digits and hyphens).`));
    }

    if (entry.file === null) {
      findings.push(finding('missing-recipe-file', `The recipe directory "${entry.slug}" contains no recipe.md.`));
      return { slug: entry.slug, file: null, findings };
    }

    const recipe = parseRecipe(readFileSync(entry.file, 'utf8'), { units });
    // The picture belongs to the recipe directory: a loose Markdown file has none to check.
    const pictures = isRecipeDir ? pictureFiles(entry.dir) : undefined;
    findings.push(...lintRecipe(recipe, { resolveExternal: externalResolver(entry), pictures }));
    findings.sort((a, b) => a.line - b.line || a.column - b.column);
    return { slug: entry.slug, file: entry.file, findings };
  });
}

/** A picture file larger than this (1024 KiB) is read only as far as `PICTURE_HEAD`: its size comes from the file system. */
const PICTURE_READ_WHOLE = 1024 * 1024;
/** How much of a large picture file is read (256 KiB): a JPEG's frame header and Exif data, and a PNG's chunks before its image data, come early. */
const PICTURE_HEAD = 256 * 1024;

/**
 * The files directly in `<dir>/image/` (SPEC §4.3), an empty list when there is no such folder.
 * Sub-folders are left out, and so is a link that leads out of the recipe directory.
 */
function pictureFiles(dir: string): PictureFile[] {
  const out: PictureFile[] = [];
  for (const { name, path, size } of imageFolder(dir)) {
    try {
      out.push({ name, bytes: readHead(path, size > PICTURE_READ_WHOLE ? PICTURE_HEAD : size), size });
    } catch {
      // Unreadable: left out, as if it were not there.
    }
  }
  return out;
}

/** The first `length` bytes of a file. */
function readHead(path: string, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const fd = openSync(path, 'r');
  try {
    let read = 0;
    while (read < length) {
      const n = readSync(fd, bytes, read, length - read, read);
      if (n === 0) break;
      read += n;
    }
    return bytes.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

/**
 * An external reference is `../slug/`: a sibling recipe directory (SPEC §6). Anything else —
 * a path that leaves the collection, a path into `archive/`, a file — is not a recipe.
 */
function externalResolver(entry: RecipeFile): (target: string) => boolean {
  const collection = dirname(entry.dir);
  return (target) => {
    const m = /^\.\.\/([^/]+)\/?$/.exec(target);
    if (!m) return false;
    let slug: string;
    try {
      slug = decodeURIComponent(m[1]);
    } catch {
      return false;
    }
    if (slug === '.' || slug === '..') return false;
    return existsSync(join(collection, slug, 'recipe.md'));
  };
}

// -------------------------------------------------------------- unit candidates

export interface UnitCandidate {
  /** First word of the item, lower-cased. */
  word: string;
  /** Number of ingredient lines whose item starts with it. */
  count: number;
  /** A few of those lines, as written. */
  examples: string[];
}

const EXAMPLES_PER_WORD = 3;

/**
 * The most common first words of items that have a quantity but no unit (`2 heaping spoons
 * flour` → `heaping`). An unregistered unit looks exactly like that, so this is where the
 * units registry's gaps show up (SPEC §9).
 */
export function unitCandidates(path: string, limit = 25): UnitCandidate[] {
  const units = loadUnits();
  const byWord = new Map<string, UnitCandidate>();
  for (const entry of findRecipes(path)) {
    if (entry.file === null) continue;
    const recipe = parseRecipe(readFileSync(entry.file, 'utf8'), { units });
    for (const line of ingredientLines(recipe)) {
      if (line.kind !== 'ingredient' || line.quantity === null || line.unit !== null) continue;
      const word = firstWord(line.item);
      if (word === '') continue;
      let candidate = byWord.get(word);
      if (!candidate) byWord.set(word, (candidate = { word, count: 0, examples: [] }));
      candidate.count++;
      if (candidate.examples.length < EXAMPLES_PER_WORD && !candidate.examples.includes(line.raw)) candidate.examples.push(line.raw);
    }
  }
  return [...byWord.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, Math.max(0, limit));
}

/** Every ingredient line of a recipe, in either form. */
function ingredientLines(recipe: Recipe): IngredientLine[] {
  if (recipe.traditional) return recipe.traditional.ingredients?.items.flatMap((g) => g.items) ?? [];
  return allSteps(recipe.nodes).flatMap((s) => s.ingredients);
}

/** The first word of an item, lower-cased, without surrounding punctuation (`(14-oz)` → `14-oz`). */
function firstWord(item: string): string {
  const word = item.trim().split(/\s+/)[0] ?? '';
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

// ------------------------------------------------------------------- reporting

export interface FormatOptions {
  /** Leave warnings and info findings out of the listing. The summary still counts them. */
  quiet?: boolean;
}

export interface Summary {
  recipes: number;
  errors: number;
  warnings: number;
  /** Info findings: hints for review, never problems. */
  notes: number;
  /** Recipes with at least one error. */
  failed: number;
}

export function summarize(results: FileResult[]): Summary {
  const all = results.flatMap((r) => r.findings);
  const count = (severity: Finding['severity']) => all.filter((f) => f.severity === severity).length;
  return {
    recipes: results.length,
    errors: count('error'),
    warnings: count('warning'),
    notes: count('info'),
    failed: results.filter((r) => hasErrors(r.findings)).length,
  };
}

/** A path as the user would type it: relative to the working directory, unless that is the longer way round. */
function displayPath(file: string): string {
  const rel = relative(process.cwd(), resolve(file));
  return rel === '' || rel.length > file.length ? file : rel;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Text: one line per finding — `path:line:column  severity  rule  message` — then a summary
 * line. JSON: `{ summary, files: [{ slug, file, findings }] }`, listing only files that have
 * findings to show.
 */
export function formatResults(results: FileResult[], format: 'text' | 'json', options: FormatOptions = {}): string {
  const summary = summarize(results);
  const shown = results
    .map((r) => ({ ...r, findings: options.quiet ? r.findings.filter((f) => f.severity === 'error') : r.findings }))
    .filter((r) => r.findings.length > 0);

  if (format === 'json') return JSON.stringify({ summary, files: shown }, null, 2);

  const lines: string[] = [];
  for (const r of shown) {
    // A directory without recipe.md has no file to point into; name the directory instead.
    const where = r.file === null ? `${r.slug}/` : displayPath(r.file);
    for (const f of r.findings) {
      const position = r.file === null ? where : `${where}:${f.line}:${f.column}`;
      lines.push(`${position}  ${f.severity}  ${f.rule}  ${f.message}`);
    }
  }
  // Notes appear in the summary only when there are some.
  const notes = summary.notes > 0 ? `, ${plural(summary.notes, 'note')}` : '';
  const unlisted = options.quiet ? [summary.warnings > 0 && 'warnings', summary.notes > 0 && 'notes'].filter(Boolean) : [];
  const hidden = unlisted.length > 0 ? ` (${unlisted.join(' and ')} not shown)` : '';
  lines.push(`${plural(summary.recipes, 'recipe')} checked: ${plural(summary.errors, 'error')}, ${plural(summary.warnings, 'warning')}${notes}${hidden}.`);
  return lines.join('\n');
}

export function formatUnitCandidates(candidates: UnitCandidate[], format: 'text' | 'json'): string {
  if (format === 'json') return JSON.stringify(candidates, null, 2);
  if (candidates.length === 0) return 'No unit candidates: every ingredient with a quantity has a registered unit.';
  const width = Math.max(...candidates.map((c) => c.word.length), 4);
  const lines = [`${'count'.padStart(5)}  ${'word'.padEnd(width)}  examples`];
  for (const c of candidates) {
    lines.push(`${String(c.count).padStart(5)}  ${c.word.padEnd(width)}  ${c.examples.join(' | ')}`);
  }
  return lines.join('\n');
}
