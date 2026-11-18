// `etna list <recipe-path>… [--format text|markdown|json] [--long-units] [--unicode-fractions] [--uses] [--sort] [--out file]`

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { findCollectionRoot, loadDensities } from '../density/node.ts';
import { findRecipes, loadUnits, readRecipe } from '../node/files.ts';
import { consolidate, formatListMarkdown, formatListText, sortList, type ListFormat, type ListSource } from './index.ts';

const HELP = `Usage: etna list <recipe-path...> [options]

Make a shopping list: the ingredients of one or more recipes as a single list, with amounts
totaled where the item and the unit are the same. Several recipes make one combined list.

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories.

Options:
  --format <f>          text (default), markdown (a - [ ] checklist) or json.
  --long-units          Write units out: grams, tablespoons.
  --unicode-fractions   Show fractions as glyphs: 1 ½.
  --uses                Say which recipe and step each item is for.
  --no-notes            Leave out the notes (softened, King Arthur).
  --sort                List items alphabetically instead of in order of first use.
  --no-convert          Do not total a weight with a volume through the density table.
                        (Amounts of one kind in different units, tbsp + cup or g + lb,
                        are always totaled.)
  --out <file>          Write the list to this file instead of standard output.
  --help                Show this help.

Densities come from etna/registries/densities.md, overlaid by the collection's own
densities.md when the first path is inside a collection that has one. Items listed by weight
and by volume with no density are named below the list.

Exit code: 0 on success, 1 when a recipe could not be read, 2 on a usage error.`;

const FORMATS = ['text', 'markdown', 'json'] as const;
type Format = (typeof FORMATS)[number];

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let format: Format = 'text';
  let out: string | undefined;
  let sort = false;
  let convert = true;
  const options: ListFormat = {};

  const fail = (message: string): number => {
    console.error(`etna list: ${message}\n\n${HELP}`);
    return 2;
  };

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inlineValue: string | undefined;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (eq !== -1) {
      inlineValue = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    }
    if (arg === '--format' || arg === '--out') {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value === '') return fail(`${arg} needs a value`);
      if (arg === '--out') out = value;
      else if ((FORMATS as readonly string[]).includes(value)) format = value as Format;
      else return fail(`unknown format "${value}" (expected text, markdown or json)`);
      continue;
    }
    if (inlineValue !== undefined) return fail(`${arg} takes no value`);
    if (arg === '--long-units') options.units = 'long';
    else if (arg === '--unicode-fractions') options.fractions = 'unicode';
    else if (arg === '--uses') options.uses = true;
    else if (arg === '--no-notes') options.notes = false;
    else if (arg === '--sort') sort = true;
    else if (arg === '--no-convert') convert = false;
    else if (arg.startsWith('-') && arg !== '-') return fail(`unknown option ${arg}`);
    else paths.push(arg);
  }

  if (paths.length === 0) return fail('no recipe path given');
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna list: no such file or directory: ${p}`);
    return 2;
  }

  const sources: ListSource[] = [];
  const seen = new Set<string>();
  let failed = 0;
  for (const path of paths) {
    for (const found of findRecipes(path)) {
      if (found.file === null) {
        console.error(`etna list: ${found.dir}: no recipe.md`);
        failed++;
        continue;
      }
      if (seen.has(found.file)) continue;
      seen.add(found.file);
      try {
        const recipe = readRecipe(found.file);
        sources.push({ id: found.slug, title: recipe.title?.text ?? found.slug, recipe });
      } catch (error) {
        console.error(`etna list: ${found.file}: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }
  }
  if (failed > 0) return 1;
  if (sources.length === 0) {
    console.error('etna list: no recipes found');
    return 1;
  }

  let densities = null;
  if (convert) {
    try {
      densities = loadDensities(findCollectionRoot(paths[0]));
    } catch (error) {
      console.error(`etna list: cannot read the density table: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    for (const p of densities.problems) console.error(`etna list: ${p.file ?? 'densities.md'}:${p.line}: ${p.reason} (row ignored)`);
  }
  let list = consolidate(sources, { densities, units: loadUnits() });
  if (sort) list = sortList(list);
  const text =
    format === 'json' ? `${JSON.stringify(list, null, 2)}\n` : format === 'markdown' ? formatListMarkdown(list, options) : formatListText(list, options);

  if (out === undefined) {
    process.stdout.write(text);
    return 0;
  }
  const target = resolve(out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  console.error(`etna list: wrote ${target}`);
  return 0;
}
