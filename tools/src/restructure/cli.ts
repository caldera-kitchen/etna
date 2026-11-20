// `etna restructure check <original recipe.md> <structured recipe.md> [--json]`

import { relative } from 'node:path';

import { linkProblem, loadUnits, readRecipe } from '../node/files.ts';
import { checkRestructure, formatReport } from './index.ts';

const HELP = `Usage: etna restructure check <original recipe.md> <structured recipe.md> [--json]

Prove that a structured conversion kept a traditional recipe. Compares the two and reports,
with line numbers:

  - every ingredient line of the original: kept once with the same amount, unit, item and
    note; or split into portions that sum exactly to it, never across two branches of one
    Choose; or, with no amount, listed at each step it enters; or listed in full in each
    of two or more branches of one Choose. Anything else is missing, added, changed or
    duplicated;
  - every sentence of the directions: present word for word (white space and temperature
    notation aside), in the same order within its part. Otherwise missing, added,
    altered or reordered;
  - the title, the frontmatter (apart from form:), the text before the first heading, and
    the notes: word for word in the structured recipe's ## Notes section. A note found
    anywhere else (before the first step, inside a step) is reported as misplaced. The one
    title difference accepted is a twin's: the original titled as the structured recipe
    followed by exactly " (Traditional Form)", as the cookbook keeps both forms;
  - and lists what is new by necessity: step and component headings, link bullets,
    callout keywords.

Accepted, and listed for review: a direction's own leading number ("1. 1) Beat…") left out
("inner number dropped"); a line naming something the recipe makes, written as a link to
that component with the same amount (133 g [dry mix](#dry-mix)); and the recipe's own
separator sentence ("OR"), written between two alternative methods, moved into the Choose
callout that precedes them; and a paragraph note written as one "- " list item in the
Notes section with the same words, or the reverse ("note listed"). A number inside a
direction ("…lid. 2. Add flour") must stay.

A bare name listed again (Vanilla) that could stand for lines of two parts is paired with
the line of its own part (the original's ### part against the component it became), else
with the line listed nearest before it; when neither decides, it is listed for review. A
bullet list written under a direction is read item by item, after that direction: write
its items as prose sentences, in order, in the step that holds the direction.

The steps to follow when converting are in docs/structuring-playbook.md.

Options:
  --json    Print the report as JSON.
  --help    Show this help.

Exit code: 0 when nothing was lost or altered, 1 otherwise, 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(HELP);
    return sub ? 0 : 2;
  }
  if (sub !== 'check') {
    console.error(`etna restructure: unknown subcommand "${sub}"\n\n${HELP}`);
    return 2;
  }
  let json = false;
  const paths: string[] = [];
  for (const arg of rest) {
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    }
    if (arg === '--json') json = true;
    else if (arg.startsWith('-')) {
      console.error(`etna restructure check: unknown option ${arg}\n\n${HELP}`);
      return 2;
    } else paths.push(arg);
  }
  if (paths.length !== 2) {
    console.error(`etna restructure check: needs two files, the original and the structured recipe\n\n${HELP}`);
    return 2;
  }
  const units = loadUnits();
  const recipes = [];
  for (const p of paths) {
    const problem = linkProblem(p);
    if (problem) {
      console.error(`etna restructure check: ${problem}`);
      return 2;
    }
    try {
      recipes.push(readRecipe(p, units));
    } catch (e) {
      console.error(`etna restructure check: cannot read ${p}: ${e instanceof Error ? e.message : String(e)}`);
      return 2;
    }
  }
  const report = checkRestructure(recipes[0], recipes[1]);
  const names = { original: display(paths[0]), structured: display(paths[1]) };
  if (json) console.log(JSON.stringify({ ...names, ...report }, null, 2));
  else console.log(formatReport(report, names));
  return report.ok ? 0 : 1;
}

function display(p: string): string {
  const r = relative(process.cwd(), p);
  return r.startsWith('..') ? p : r;
}
