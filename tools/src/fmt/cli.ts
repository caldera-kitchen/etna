// `etna fmt <path...> [--check] [--diff]`

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { relative } from 'node:path';
import { createTwoFilesPatch } from 'diff';

import { findRecipes, loadUnits, writeFileSafely } from '../node/files.ts';
import { formatRecipe } from './index.ts';

const HELP = `Usage: etna fmt <path...> [options]

Rewrite recipes into the canonical source style: unit symbols (g, tbsp, lb), ASCII
fractions (1 1/2), hyphen ranges (2-3), temperatures as 350°F, em-dash labels and
callouts, a fixed frontmatter key order, one blank line between blocks and dash bullets
(the full list: SPEC.md §13). In a traditional recipe, parts become ### headings (numbered from 1 in each part). Instructions
are never reworded.

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories.

Run it on a committed tree and review the result as a diff.

Options:
  --check   Write nothing; list the files that would change. Exit code 1 if any would.
  --diff    Write nothing; print the changes as a unified diff.
  --help    Show this help.

Things left alone on purpose (a temperature with no scale stated, a file that cannot be
read) are reported on standard error and never affect the exit code.

Exit code: 0; with --check, 1 when a file would change. 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let check = false;
  let diff = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    } else if (arg === '--check') check = true;
    else if (arg === '--diff') diff = true;
    else if (arg.startsWith('-') && arg !== '-') {
      console.error(`etna fmt: unknown option ${arg}\n\n${HELP}`);
      return 2;
    } else paths.push(arg);
  }

  if (paths.length === 0) {
    console.error(`etna fmt: no path given\n\n${HELP}`);
    return 2;
  }
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna fmt: no such file or directory: ${p}`);
    return 2;
  }

  const units = loadUnits();
  const files = [...new Set(paths.flatMap((p) => findRecipes(p)).flatMap((r) => (r.file ? [r.file] : [])))];
  const write = !check && !diff;
  let changed = 0;
  let noted = 0;

  for (const file of files) {
    const name = relative(process.cwd(), file) || file;
    const source = readFileSync(file, 'utf8');
    const result = formatRecipe(source, { units });
    for (const note of result.notes) console.error(`${name}:${note.line}: ${note.message}`);
    noted += result.notes.length;
    if (!result.changed) continue;
    changed++;
    if (diff) process.stdout.write(createTwoFilesPatch(name, name, source, result.output, 'as written', 'formatted'));
    else console.log(name);
    // The real file (findRecipes has refused links that leave the collection), by temp file and rename.
    if (write) writeFileSafely(realpathSync(file), result.output);
  }

  const total = `${files.length} ${files.length === 1 ? 'recipe' : 'recipes'}`;
  const summary = write
    ? `${changed} of ${total} formatted, ${files.length - changed} already canonical`
    : `${changed} of ${total} would change, ${files.length - changed} already canonical`;
  // With --diff, standard output is the patch and nothing else.
  (diff ? console.error : console.log)(noted > 0 ? `${summary}; ${noted} ${noted === 1 ? 'note' : 'notes'}` : summary);
  return check && changed > 0 ? 1 : 0;
}
