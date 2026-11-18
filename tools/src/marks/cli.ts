// `etna marks <recipe-path...> [--format text|json]`

import { existsSync } from 'node:fs';
import { relative } from 'node:path';

import { findRecipes, loadKindRegistries, readRecipe, type RecipeFile } from '../node/files.ts';
import { addSummaries, marksOf, recipeText, summaryText, type RecipeMarks } from './index.ts';

const HELP = `Usage: etna marks <recipe-path...> [options]

Show what each step's chart box will say, without drawing it: the step's heading, then each
word run its instruction marks with *asterisks* (SPEC §5.3), with the kind of thing the mark
says, read from its own words and the registries:

  duration     a number with a time unit, or overnight      15-25 minutes, about 2 hours
  temperature  a number with °F, °C or degrees, and whether  at 350°F (to set),
               its words say to set it or to reach it        to 190°F internal (to reach)
  setting      a level, a speed or a mode                    medium-low, on high, speed 6
  tool         a tool in registries/tools.yaml, with its     in a Vitamix (machine),
               kind                                          dough hook (utensil)
  cue          opens with until, till or when                until doubled
  action       opens with an operation                       Reduce heat, rotate the tray

A mark may hold more than one (speed 6 for 6-8 minutes). A mark that matches nothing is
"untyped": that is not an error, and the chart draws it as always. A kind never changes a
chart or a card; it is there to check a recipe. A temperature whose own words do not say
(a bare 425°F) has its role "unknown": write "at 425°F" or "until it registers 190°F".

Each step also shows the lines its box takes, counted as \`etna lint\` counts them, and says
when that is over five (lint's chart-box-long). A summary ends each recipe: steps with
marks and without, marks by kind, untyped marks, temperatures whose role is unknown; and
the whole run, when there is more than one recipe.

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories. Only structured recipes have boxes: a recipe in the
traditional form is skipped with a note.

Options:
  --format <format>  text (the default, made to be read) or json.
  --help             Show this help.

Exit code: 0 on success, 1 when no structured recipe was read, 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let format: 'text' | 'json' = 'text';
  const fail = (message: string): number => {
    console.error(`etna marks: ${message}\n\n${HELP}`);
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
    if (arg === '--format') {
      const value = inlineValue ?? argv[++i];
      if (value !== 'text' && value !== 'json') return fail(`--format must be text or json, not ${value ?? '(nothing)'}`);
      format = value;
    } else if (arg.startsWith('-') && arg !== '-') return fail(`unknown option ${arg}`);
    else paths.push(arg);
  }
  if (paths.length === 0) return fail('no recipe path given');
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna marks: no such file or directory: ${p}`);
    return 2;
  }

  const recipes: (RecipeFile & { file: string })[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    for (const found of findRecipes(path)) {
      if (found.file === null) {
        console.error(`etna marks: ${found.dir}: no recipe.md, skipped`);
        continue;
      }
      if (seen.has(found.file)) continue;
      seen.add(found.file);
      recipes.push({ ...found, file: found.file });
    }
  }

  const registries = loadKindRegistries();
  const read: { name: string; report: RecipeMarks }[] = [];
  let traditional = 0;
  let failed = 0;
  for (const recipe of recipes) {
    try {
      const parsed = readRecipe(recipe.file);
      if (parsed.form === 'traditional') {
        traditional++;
        continue;
      }
      // The path as given from here, when the recipe is under the working directory.
      const near = relative(process.cwd(), recipe.file);
      read.push({ name: near !== '' && !near.startsWith('..') ? near : recipe.file, report: marksOf(parsed, registries) });
    } catch (error) {
      console.error(`etna marks: ${recipe.file}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }
  if (traditional > 0) console.error(`etna marks: skipped ${traditional} recipe${traditional === 1 ? '' : 's'} in the traditional form (no chart)`);

  const total = addSummaries(read.map((r) => r.report.summary));
  if (format === 'json') {
    const recipesJson = read.map(({ name, report }) => ({
      path: name,
      title: report.title,
      steps: report.steps.map((s) => ({ ...s, marks: s.marks.map((m) => ({ text: m.text, kinds: m.kinds.map(({ start: _s, end: _e, ...k }) => k) })) })),
      summary: report.summary,
    }));
    console.log(JSON.stringify({ recipes: recipesJson, summary: total }, null, 2));
  } else if (read.length > 0) {
    const blocks = read.map(({ name, report }) => recipeText(name, report));
    if (read.length > 1) blocks.push(summaryText(total, `All ${read.length} recipes`));
    console.log(blocks.join('\n\n'));
  }
  return read.length === 0 || failed > 0 ? 1 : 0;
}
