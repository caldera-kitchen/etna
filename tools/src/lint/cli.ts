// `etna lint <path...> [--json] [--quiet] [--unit-candidates]`

import { existsSync } from 'node:fs';

import { hasErrors } from './index.ts';
import { formatResults, formatUnitCandidates, lintPath, unitCandidates, type FileResult, type UnitCandidate } from './node.ts';

const HELP = `Usage: etna lint <path...> [options]

Check recipes against the linter rules in rules.yaml (SPEC §9).

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories.

Options:
  --json              Print findings as JSON instead of text.
  --quiet             Show errors only; warnings and notes are counted but not listed.
  --unit-candidates   Instead of linting, list the most common first words of items that
                      have a quantity but no unit: likely gaps in the units registry.
  --help              Show this help.

A finding is an error, a warning, or info (a note: a hint for review, never a problem).

Exit code: 1 when any recipe has an error, otherwise 0 (warnings and notes never fail). 2 on a usage error.`;

const UNIT_CANDIDATE_LIMIT = 25;

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let json = false;
  let quiet = false;
  let candidates = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    } else if (arg === '--json') json = true;
    else if (arg === '--quiet') quiet = true;
    else if (arg === '--unit-candidates') candidates = true;
    else if (arg.startsWith('-') && arg !== '-') {
      console.error(`etna lint: unknown option ${arg}\n\n${HELP}`);
      return 2;
    } else paths.push(arg);
  }

  if (paths.length === 0) {
    console.error(`etna lint: no path given\n\n${HELP}`);
    return 2;
  }
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna lint: no such file or directory: ${p}`);
    return 2;
  }

  const format = json ? 'json' : 'text';

  if (candidates) {
    console.log(formatUnitCandidates(mergeCandidates(paths.map((p) => unitCandidates(p, Infinity))), format));
    return 0;
  }

  const results: FileResult[] = paths.flatMap((p) => lintPath(p));
  console.log(formatResults(results, format, { quiet }));
  return results.some((r) => hasErrors(r.findings)) ? 1 : 0;
}

/** Combine the reports of several paths into one, most common first. */
function mergeCandidates(reports: UnitCandidate[][]): UnitCandidate[] {
  const byWord = new Map<string, UnitCandidate>();
  for (const c of reports.flat()) {
    const seen = byWord.get(c.word);
    if (!seen) byWord.set(c.word, { ...c, examples: [...c.examples] });
    else {
      seen.count += c.count;
      for (const e of c.examples) if (seen.examples.length < 3 && !seen.examples.includes(e)) seen.examples.push(e);
    }
  }
  return [...byWord.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)).slice(0, UNIT_CANDIDATE_LIMIT);
}
