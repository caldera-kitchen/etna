// The Etna source formatter: rewrites a recipe.md into one canonical style.
//
// Pure and browser-safe. It works by targeted edits at the source positions the recipe
// model reports, never by re-serializing the document, so anything the format does not
// understand passes through byte for byte. Two safety nets back that up: every pass parses
// its own result and drops its edits if the recipe would read differently afterward.
//
// See SPEC §6, §9 and §13.

import { parseRecipe, type Recipe, type UnitRegistry } from '../core/index.ts';
import { formatOnce } from './pass.ts';

/** Every note about a temperature whose scale could not be decided starts with this. */
export { UNDECIDED_TEMPERATURE } from './temperature.ts';

/** Things left alone on purpose, e.g. "temperature undecided: 170 degrees: scale not stated, …". */
export interface FormatNote {
  line: number;
  message: string;
}

export interface FormatResult {
  output: string;
  changed: boolean;
  notes: FormatNote[];
}

/** The format version this formatter knows how to read. */
const ETNA_VERSION = 1;
/** One pass is expected to reach the canonical form; the second confirms it. The loop guarantees idempotence. */
const MAX_PASSES = 5;

export function formatRecipe(source: string, options: { units: UnitRegistry }): FormatResult {
  const { units } = options;
  // Line endings are layout too: CRLF (and a lone CR) become LF before anything is measured.
  let text = source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
  const recipe = parseRecipe(text, { units });

  const refusal = whyUnreadable(recipe);
  if (refusal) return { output: source, changed: false, notes: [{ line: 1, message: `${refusal}; file left unchanged` }] };

  const notes: FormatNote[] = [];
  let stable = false;
  for (let pass = 0; pass < MAX_PASSES && !stable; pass++) {
    const next = formatOnce(text, units, pass === 0 ? { recipe, notes } : null);
    stable = next === text;
    text = next;
  }
  // Formatting the result again must change nothing. If the passes never settled, hand the
  // file back as it came rather than a form that the next run would rewrite once more.
  if (!stable) return { output: source, changed: false, notes: [{ line: 1, message: 'no stable form reached; file left unchanged' }] };
  notes.sort((a, b) => a.line - b.line);
  return { output: text, changed: text !== source, notes };
}

/** Why the file cannot be read as an Etna recipe, or null when it can. */
function whyUnreadable(recipe: Recipe): string | null {
  const fm = recipe.frontmatter;
  if (fm.error) return `malformed frontmatter (${fm.error})`;
  if (fm.raw === null) return 'no frontmatter, so not an Etna recipe';
  if (recipe.etna === null) return 'no integer `etna` version in the frontmatter';
  if (recipe.etna !== ETNA_VERSION) return `unsupported format version etna: ${recipe.etna}`;
  if (recipe.formRaw !== null && recipe.formRaw !== 'structured' && recipe.formRaw !== 'traditional') {
    return `unknown form "${recipe.formRaw}"`;
  }
  return null;
}
