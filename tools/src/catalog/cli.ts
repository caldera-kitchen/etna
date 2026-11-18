// `etna catalog <collection> [--out file] [--stdout]`
// `etna search <collection...> <query> [--limit N] [--json]`
//
// Both commands arrive here with the subcommand as argv[0].

import { existsSync } from 'node:fs';
import { basename } from 'node:path';

import { findRecipes } from '../node/files.ts';
import { createSearch } from './index.ts';
import { buildCatalog, collectionRoot, serializeCatalog, writeCatalog } from './node.ts';

const CATALOG_HELP = `Usage: etna catalog <collection> [options]

Build catalog.json for a collection: one entry per recipe with its slug, title, form,
source, yield, license, ingredient names, method text and path. The web GUI loads this file
for browsing and search. The output is deterministic — recipes sorted by slug, no
timestamps — so it only changes when a recipe does.

<collection> is a collection root (holding recipes/) or a directory of recipe directories.
archive/ is not included.

Options:
  --out <file>   Write here instead of <collection>/catalog.json.
  --stdout       Print the catalog instead of writing a file.
  --help         Show this help.`;

const SEARCH_HELP = `Usage: etna search <collection...> <query> [options]

Search one or more collections by recipe name, ingredient and words in the method — the
same search the web GUI runs, for trying it from a terminal. The catalogs are built in
memory; nothing is written. Quote a query of several words: etna search . "dutch oven".

Options:
  --limit <n>    Show at most n hits (default 10).
  --source <s>   Only show hits from this collection (the name shown in the results).
  --json         Print the hits as JSON.
  --help         Show this help.`;

const DEFAULT_LIMIT = 10;

export async function run(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === 'catalog') return catalog(rest);
  if (command === 'search') return search(rest);
  console.error(`etna: expected "catalog" or "search", got ${command === undefined ? 'nothing' : `"${command}"`}`);
  return 2;
}

interface Args {
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
}

/** Split argv into positionals, boolean flags and `--name value` / `--name=value` options. */
function parseArgs(argv: string[], flagNames: string[], valueNames: string[]): Args | string {
  const args: Args = { positional: [], flags: new Set(), values: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') args.flags.add('--help');
    else if (!arg.startsWith('--')) args.positional.push(arg);
    else {
      const eq = arg.indexOf('=');
      const name = eq < 0 ? arg : arg.slice(0, eq);
      if (flagNames.includes(name) && eq < 0) args.flags.add(name);
      else if (valueNames.includes(name)) {
        const value = eq < 0 ? argv[++i] : arg.slice(eq + 1);
        if (value === undefined) return `${name} needs a value`;
        args.values.set(name, value);
      } else return `unknown option ${arg}`;
    }
  }
  return args;
}

function catalog(argv: string[]): number {
  const usage = (message: string) => {
    console.error(`etna catalog: ${message}\n\n${CATALOG_HELP}`);
    return 2;
  };
  const args = parseArgs(argv, ['--stdout', '--help'], ['--out']);
  if (typeof args === 'string') return usage(args);
  if (args.flags.has('--help')) {
    console.log(CATALOG_HELP);
    return 0;
  }
  if (args.positional.length !== 1) return usage(args.positional.length === 0 ? 'no collection given' : 'expected one collection');
  if (args.flags.has('--stdout') && args.values.has('--out')) return usage('use either --out or --stdout, not both');
  const [path] = args.positional;
  if (!existsSync(path)) {
    console.error(`etna catalog: no such file or directory: ${path}`);
    return 2;
  }

  if (args.flags.has('--stdout')) {
    process.stdout.write(serializeCatalog(buildCatalog(path)));
    return 0;
  }
  const found = findRecipes(path);
  const skipped = found.filter((f) => !f.file);
  let written: string;
  try {
    written = writeCatalog(path, args.values.get('--out'));
  } catch (error) {
    console.error(`etna catalog: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const count = found.length - skipped.length;
  console.log(`${written}: ${count} ${count === 1 ? 'recipe' : 'recipes'}`);
  if (skipped.length > 0) console.error(`etna catalog: skipped ${skipped.length} without recipe.md: ${skipped.map((f) => f.slug).join(', ')}`);
  return 0;
}

function search(argv: string[]): number {
  const usage = (message: string) => {
    console.error(`etna search: ${message}\n\n${SEARCH_HELP}`);
    return 2;
  };
  const args = parseArgs(argv, ['--json', '--help'], ['--limit', '--source']);
  if (typeof args === 'string') return usage(args);
  if (args.flags.has('--help')) {
    console.log(SEARCH_HELP);
    return 0;
  }
  if (args.positional.length < 2) return usage('expected at least one collection and a query');
  const paths = args.positional.slice(0, -1);
  const query = args.positional[args.positional.length - 1];
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna search: no such file or directory: ${p}`);
    console.error('The last argument is the query; quote it when it has several words.');
    return 2;
  }
  let limit = DEFAULT_LIMIT;
  if (args.values.has('--limit')) {
    limit = Number(args.values.get('--limit'));
    if (!Number.isInteger(limit) || limit < 1) return usage('--limit needs a whole number of 1 or more');
  }

  // Each collection is labeled by its directory name; by its path as given when two share a name.
  const names = paths.map((p) => basename(collectionRoot(p)));
  const labels = paths.map((p, i) => (names.indexOf(names[i]) === names.lastIndexOf(names[i]) ? names[i] : p));
  const source = args.values.get('--source');
  if (source !== undefined && !labels.includes(source)) return usage(`--source must be one of: ${labels.join(', ')}`);

  const engine = createSearch(paths.map((p, i) => ({ source: labels[i], catalog: buildCatalog(p) })));
  const hits = engine.search(query, { limit, source });

  if (args.flags.has('--json')) {
    console.log(JSON.stringify(hits, null, 2));
    return 0;
  }
  if (hits.length === 0) {
    console.log(`No recipes match "${query}" (${engine.size} searched).`);
    return 0;
  }
  const many = paths.length > 1;
  hits.forEach((h, i) => {
    const where = many ? `${h.source}/${h.slug}` : h.slug;
    console.log(`${String(i + 1).padStart(2)}. ${h.title}  [${where}]  ${h.score.toFixed(1)}  ${h.fields.join(', ')}`);
    if (h.ingredients.length > 0) console.log(`      ingredients: ${h.ingredients.join('; ')}`);
    if (h.excerpt) console.log(`      ${h.excerpt}`);
  });
  return 0;
}
