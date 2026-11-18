// `etna density check <collection> [--write] [--tolerance <percent>]` and `etna density list [<collection>]`

import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { findRecipes, loadUnits, readRecipe, writeFileSafely } from '../node/files.ts';
import type { ListSource } from '../list/index.ts';
import { checkCollection, formatCheckText, formatWantedSection, writeWantedSection } from './check.ts';
import { gramsPer, type DensityTable } from './index.ts';
import { toNumber } from '../list/rational.ts';
import { DEFAULT_DENSITIES, findCollectionRoot, loadDensities } from './node.ts';

const HELP = `Usage: etna density check <collection> [--write] [--tolerance <percent>]
       etna density list [<collection>]

check   Read every recipe in a collection and report what the density file needs:
          1. Needed: ingredients listed by weight and by volume in one recipe with no row.
          2. Probably covered: unmatched names close to a row's name, for its
             Aliases cell (never matched automatically).
          3. To verify: lines stating an amount both ways (\`2/3 cup sugar, 130 grams\`)
             that disagree with the reference row by more than the tolerance.
          4. Ounces used for liquids: \`oz\` lines for ingredients whose row says Liquid: yes.
          5. The water test: water stated at less than 233 g per cup.
        --write          Write the findings into the collection's own densities.md, in a
                         regenerated "Wanted" section (created if missing). Nothing outside
                         the section's markers is changed. Never writes the default table.
        --tolerance <n>  Allowed disagreement in percent. Default 5.

list    Print the reference rows as parsed — grams per cup and per tablespoon — any
        rows that cannot be used, and rows out of alphabetical order. With a collection,
        its own densities.md is laid over the default.

The table is etna/registries/densities.md, overlaid by <collection>/densities.md: one row
per ingredient under "## Reference densities", with the columns
  | Ingredient | Fact | Source | Aliases | Liquid | Note |
where Fact is "<volume> = <weight>" (\`1 cup = 120 g\`) and Source is required.
A collection's rows replace default rows of the same name. See etna/docs/densities.md.

Exit code: 0 on success, 1 when a recipe or table could not be read, 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const fail = (message: string): number => {
    console.error(`etna density: ${message}\n\n${HELP}`);
    return 2;
  };
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const [command, ...rest] = argv;
  if (command === undefined) return fail('no command given');
  if (command !== 'check' && command !== 'list') return fail(`unknown command "${command}"`);

  const paths: string[] = [];
  let write = false;
  let tolerance = 5;
  for (let i = 0; i < rest.length; i++) {
    let arg = rest[i];
    let inline: string | undefined;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (eq !== -1) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (arg === '--tolerance' && command === 'check') {
      const value = inline ?? rest[++i];
      const n = Number(value);
      if (value === undefined || value === '' || !Number.isFinite(n) || n < 0) return fail('--tolerance needs a percentage, e.g. 5');
      tolerance = n;
    } else if (arg === '--write' && command === 'check' && inline === undefined) write = true;
    else if (arg.startsWith('-')) return fail(`unknown option ${arg}`);
    else paths.push(arg);
  }
  if (paths.length > 1) return fail('give one collection');
  const path = paths[0];
  if (command === 'check' && path === undefined) return fail('no collection given');
  if (path !== undefined && !existsSync(path)) {
    console.error(`etna density: no such file or directory: ${path}`);
    return 2;
  }
  const collection = path === undefined ? null : (findCollectionRoot(path) ?? (statSync(path).isDirectory() ? resolve(path) : null));

  let table: DensityTable;
  try {
    table = loadDensities(collection);
  } catch (error) {
    console.error(`etna density: cannot read the density table: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (command === 'list') {
    process.stdout.write(formatRows(table));
    return 0;
  }

  for (const p of table.problems) console.error(`etna density: ${p.file ?? 'densities.md'}:${p.line}: ${p.reason} (row ignored)`);
  const units = loadUnits();
  const sources: ListSource[] = [];
  let failed = 0;
  for (const found of findRecipes(path!)) {
    if (found.file === null) continue;
    try {
      const recipe = readRecipe(found.file, units);
      sources.push({ id: found.slug, title: recipe.title?.text ?? found.slug, recipe });
    } catch (error) {
      console.error(`etna density: ${found.file}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }
  if (failed > 0) return 1;

  const report = checkCollection(sources, table, units, { tolerance: tolerance / 100 });
  process.stdout.write(formatCheckText(report));

  if (write) {
    if (collection === null) {
      console.error('etna density: --write needs a collection directory');
      return 2;
    }
    const target = join(collection, 'densities.md');
    if (resolve(target) === resolve(DEFAULT_DENSITIES())) {
      console.error('etna density: refusing to write the default table');
      return 2;
    }
    // A collection may come from someone else's repository: never read or write through a link.
    if (isLink(target)) {
      console.error(`etna density: refusing to write ${target}: it is a symbolic link`);
      return 1;
    }
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : null;
    const next = writeWantedSection(existing, formatWantedSection(report));
    try {
      if (next !== existing) writeFileSafely(target, next, collection);
    } catch (error) {
      console.error(`etna density: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    console.error(`etna density: ${next === existing ? 'unchanged' : 'wrote'} ${target}`);
  }
  return 0;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function formatRows(table: DensityTable): string {
  const units = loadUnits();
  const cup = units.find('cup')!;
  const tbsp = units.find('tbsp')!;
  const rows = table.rows.map((r) => [
    r.ingredient + (r.aliases.length ? ` (also: ${r.aliases.join('; ')})` : '') + (r.liquid ? ' [liquid]' : ''),
    `${round(toNumber(gramsPer(r, cup)!))} g`,
    `${round(toNumber(gramsPer(r, tbsp)!))} g`,
    r.source,
  ]);
  const header = ['Ingredient', 'per cup', 'per tbsp', 'Source'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const out = [line(header), ...rows.map(line)];
  const files = [...new Set(table.rows.map((r) => r.file).filter((f) => f !== null))];
  out.push('', `From: ${files.join(', ') || '(none)'}`);
  if (table.problems.length > 0) {
    out.push('', 'Problems (these rows are not used):');
    for (const p of table.problems) out.push(`  ${p.file ?? ''}:${p.line}${p.row !== null ? ` (row ${p.row})` : ''}: ${p.reason}`);
  }
  if (table.notes.length > 0) {
    out.push('', 'Notes:');
    for (const p of table.notes) out.push(`  ${p.file ?? ''}:${p.line}: ${p.reason}`);
  }
  return `${out.join('\n')}\n`;
}

function round(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}
