// Traditional form: parts as real headings (SPEC §4.1).
//
// The older spelling marked an ingredient group with a bold line (`**Beans**`) and used a
// bold lead on a direction (`1. **Beans** — …`) both to name one step and to head a run of
// steps. This pass rewrites a recipe into the current spelling, where a part is a `###`
// heading in both sections and numbering restarts in each direction part:
//
//   - a bold-line ingredient group always becomes a `###` heading;
//   - the direction labels of a recipe are classified together. A label is a part when it
//     names an ingredient group of the recipe, or when an unlabeled step follows it; if any
//     label is a part, all are. Otherwise they are step names and stay as they are;
//   - when the classification is not certain, the directions are left as written and a note
//     says why, so the author can decide.
//
// Like every other pass it works by targeted edits and proves its own work: the recipe must
// read the same afterward (`partsMeaningOf`), or nothing is changed.

import { parseRecipe, partKey, type Direction, type Recipe, type UnitRegistry } from '../core/index.ts';
import { applyEdits, type Edit } from './edits.ts';
import type { FormatNote } from './index.ts';
import { partsMeaningOf } from './meaning.ts';
import type { ScaleContext } from './temperature.ts';

/** Every note about directions left in the older spelling starts with this. */
export const PARTS_UNDECIDED = 'parts undecided';

/** How a recipe's direction labels read. */
export type LabelReading =
  | { kind: 'none' } // no labels, or the directions already have part headings
  | { kind: 'steps' } // every label names its one step
  | { kind: 'parts' } // every label heads a part
  | { kind: 'undecided'; reason: string; line: number };

const ITEM_RE = /^([ \t]*)(\d{1,9})([.)])([ \t]+)/;
const LEAD_RE = /^(\*\*|__)(.+?)\1[ \t]*(?:—|–|--|-|:)[ \t]+/;

/** True for a label that has nothing in it but punctuation and spaces. */
function isEmptyLabel(label: string): boolean {
  return label.replace(/[\p{P}\p{S}\s]/gu, '') === '';
}

/** Classify a traditional recipe's direction labels (see the head of this file). */
/** Text that Markdown would read as a block of another kind at the start of a list item. */
const BLOCK_START_RE = /^(?:#{1,6}(?:\s|$)|[-+*](?:\s|$)|>|\d{1,9}[.)](?:\s|$)|`{3,}|~{3,}|<|\||(?:[-*_][ \t]*){3,}(?=\n|$))/;
/** A reference to a step by its number: `step 2`, `steps 3 and 4`, `Step #5`. */
const STEP_REFERENCE_RE = /\bsteps?\s+#?\d+/i;

export function readLabels(recipe: Recipe): LabelReading {
  const t = recipe.traditional;
  const d = t?.directions;
  if (!t || !d) return { kind: 'none' };
  if (d.parts.some((p) => p.heading !== null)) return { kind: 'none' };
  const items = d.items;
  const labeled = items.filter((x) => x.label !== null);
  if (labeled.length === 0) return { kind: 'none' };
  const undecided = (reason: string, at: Direction = labeled[0]): LabelReading => ({ kind: 'undecided', reason, line: at.pos.start.line });

  const empty = labeled.find((x) => isEmptyLabel(x.label!));
  if (empty) return undecided(`the label "${empty.label}" is empty or only punctuation`, empty);
  const seen = new Map<string, Direction>();
  for (const x of labeled) {
    const key = partKey(x.label!);
    if (seen.has(key)) return undecided(`the label "${x.label}" is used twice (steps ${seen.get(key)!.number} and ${x.number})`, x);
    seen.set(key, x);
  }

  const groups = new Set((t.ingredients?.items ?? []).flatMap((g) => (g.label === null ? [] : [partKey(g.label)])));
  const matching = labeled.filter((x) => groups.has(partKey(x.label!)));
  const heading = labeled.filter((x) => {
    const next = items[items.indexOf(x) + 1];
    return next !== undefined && next.label === null;
  });
  if (matching.length === 0 && heading.length === 0) return { kind: 'steps' };

  // Refinements: the two signals disagree, or there is too little to go on.
  // Every label stands on a step of its own, so only the group names speak for parts. When
  // fewer than half the labels are group names, the rest read as step names just as well.
  if (heading.length === 0 && matching.length * 2 < labeled.length) {
    return undecided(
      `every labeled step stands alone and only ${matching.length} of ${labeled.length} labels name an ingredient group (${matching.map((x) => `"${x.label}"`).join(', ')}): step names, or parts of one step each?`,
    );
  }
  if (labeled.length === 1 && matching.length === 0 && items[0] === labeled[0]) {
    return undecided(`the only label, "${labeled[0].label}", is on the first step and names no ingredient group: does it name that step or head them all?`);
  }
  // A label followed by a lower-case word is the start of its sentence ("**Preheat** — oven
  // to 410°F"): lifted into a heading it would leave half a sentence behind.
  const sentence = labeled.find((x) => /^\p{Ll}/u.test(x.text.trimStart()));
  if (sentence) return undecided(`the label "${sentence.label}" reads as the start of its sentence ("${sentence.label} ${sentence.text.trimStart().split(/\s+/).slice(0, 3).join(' ')}…")`, sentence);
  // With its label lifted away, a step's text stands at the start of the list item, where
  // Markdown reads some openings as a block of another kind (`# of beans…` as a heading,
  // `- soak` as a list, `2. …` as a second number).
  const blocky = labeled.find((x) => BLOCK_START_RE.test(x.raw.trimStart()));
  if (blocky) return undecided(`without its label, step ${blocky.number} ("${blocky.label}") would start with Markdown syntax ("${blocky.raw.trimStart().slice(0, 12)}…")`, blocky);
  // Parts restart their numbering, so a step that names another by number would point elsewhere.
  const pointing = items.find((x) => STEP_REFERENCE_RE.test(x.text) || (x.more !== null && STEP_REFERENCE_RE.test(x.more)));
  if (pointing) {
    return undecided(`step ${pointing.number} refers to a step by number ("${STEP_REFERENCE_RE.exec(pointing.text + ' ' + (pointing.more ?? ''))![0]}"), and numbering each part from 1 would change which step that is`, pointing);
  }
  // The rewrite itself must be plain: no stray blocks to place, no nested content to re-indent.
  if (d.other.length > 0) {
    const o = d.other[0];
    return undecided(`the directions hold ${d.other.length === 1 ? 'a block' : `${d.other.length} blocks`} between or around the numbered steps (a ${o.nodeType} on line ${o.pos.start.line})`);
  }
  const nested = labeled.find((x) => x.more !== null);
  if (nested) return undecided(`the labeled step ${nested.number} ("${nested.label}") has nested content`, nested);
  return { kind: 'parts' };
}

/**
 * Rewrite a traditional recipe's parts into `###` headings and number every direction part
 * 1…n. Returns the text unchanged for any other recipe. Notes (when given) say what was left
 * in the older spelling, and why.
 */
export function migrateParts(text: string, units: UnitRegistry, context: ScaleContext, notes: FormatNote[] | null): string {
  const recipe = parseRecipe(text, { units });
  const t = recipe.traditional;
  if (!t) return text;
  const note = (line: number, message: string) => notes?.push({ line, message });

  const groupEdits = ingredientEdits(recipe, note);
  let reading = readLabels(recipe);
  let direction: { edits: Edit[]; starts: Set<Direction> } = { edits: [], starts: new Set() };
  if (reading.kind === 'parts') {
    const planned = partEdits(recipe);
    if (typeof planned === 'string') {
      reading = { kind: 'undecided', reason: planned, line: t.directions!.items.find((d) => d.label !== null)!.pos.start.line };
    } else direction = planned;
  } else if (reading.kind !== 'undecided') direction = { edits: numberingEdits(recipe), starts: new Set() };

  const before = (starts: Set<Direction>) => partsMeaningOf(recipe, context, (d) => starts.has(d));
  const attempt = (edits: Edit[], starts: Set<Direction>): string | null => {
    if (edits.length === 0) return text;
    const out = applyEdits(text, edits);
    const after = parseRecipe(out, { units });
    if (partsMeaningOf(after, context) !== before(starts)) return null;
    // Numbering restarts at 1 in every part that was given a heading.
    if (starts.size > 0) {
      for (const p of after.traditional?.directions?.parts ?? []) if (p.steps.some((s, i) => s.number !== i + 1)) return null;
    }
    return out;
  };

  if (reading.kind === 'undecided') note(reading.line, `${PARTS_UNDECIDED}: ${reading.reason}`);
  const both = attempt([...groupEdits, ...direction.edits], direction.starts);
  if (both !== null) return both;
  if (direction.edits.length > 0 && reading.kind === 'parts') {
    note(t.directions!.items[0].pos.start.line, `${PARTS_UNDECIDED}: rewriting them as part headings would have changed how the recipe reads`);
  }
  const groupsOnly = attempt(groupEdits, new Set());
  if (groupsOnly !== null) return groupsOnly;
  note(t.ingredients!.pos.start.line, 'ingredient groups left as bold lines: rewriting them as headings would have changed how the recipe reads');
  return text;
}

/** `**Beans**` → `### Beans`, for every bold-line group whose label is plain enough. */
function ingredientEdits(recipe: Recipe, note: (line: number, message: string) => void): Edit[] {
  const edits: Edit[] = [];
  for (const g of recipe.traditional?.ingredients?.items ?? []) {
    if (!g.legacy || !g.labelPos || g.label === null) continue;
    const raw = recipe.source.slice(g.labelPos.start.offset, g.labelPos.end.offset);
    const m = /^(\*\*|__)([^\n]*)\1$/.exec(raw);
    const inner = m?.[2].trim() ?? '';
    if (!m || isEmptyLabel(g.label) || inner === '') {
      note(g.labelPos.start.line, `ingredient group "${g.label}" left as a bold line: it cannot be written as a heading`);
      continue;
    }
    edits.push({ start: g.labelPos.start.offset, end: g.labelPos.end.offset, text: `### ${inner}` });
  }
  return edits;
}

/** The written number of a direction, and where its digits are. */
function marker(source: string, d: Direction): { lineStart: number; indent: string; digits: [number, number]; delimiter: string; end: number } | null {
  const lineStart = source.lastIndexOf('\n', d.pos.start.offset - 1) + 1;
  const indent = source.slice(lineStart, d.pos.start.offset);
  if (!/^[ \t]*$/.test(indent)) return null;
  const m = ITEM_RE.exec(source.slice(d.pos.start.offset));
  if (!m) return null;
  const at = d.pos.start.offset + m[1].length;
  return { lineStart, indent, digits: [at, at + m[2].length], delimiter: m[3], end: d.pos.start.offset + m[0].length };
}

/**
 * Edits that turn every label into a part heading and renumber each part from 1, or the
 * reason they cannot be made.
 */
function partEdits(recipe: Recipe): { edits: Edit[]; starts: Set<Direction> } | string {
  const source = recipe.source;
  const edits: Edit[] = [];
  const starts = new Set<Direction>();
  let number = 0;
  for (const d of recipe.traditional!.directions!.items) {
    const mk = marker(source, d);
    if (!mk) return `step ${d.number} is not written as a plain numbered item`;
    if (d.label === null) {
      number++;
      edits.push({ start: mk.digits[0], end: mk.digits[1], text: String(number) });
      continue;
    }
    const lead = LEAD_RE.exec(source.slice(mk.end, d.pos.end.offset));
    if (!lead || lead[2] !== d.label) {
      return `the label "${d.label}" carries formatting or an unusual separator`;
    }
    starts.add(d);
    number = 1;
    edits.push({ start: mk.lineStart, end: mk.end + lead[0].length, text: `\n${mk.indent}### ${d.label.trim()}\n\n${mk.indent}1${mk.delimiter} ` });
  }
  return { edits, starts };
}

/**
 * Write each direction's number as it renders, 1…n in each part, where that is already how
 * it renders (`1. 1. 1.` → `1. 2. 3.`). A part whose numbers render otherwise (a list
 * restarted after a stray block) is left as written: renumbering it would change it.
 */
function numberingEdits(recipe: Recipe): Edit[] {
  const edits: Edit[] = [];
  for (const p of recipe.traditional?.directions?.parts ?? []) {
    if (p.steps.some((s, i) => s.number !== i + 1)) continue;
    const part: Edit[] = [];
    for (const [i, s] of p.steps.entries()) {
      const mk = marker(recipe.source, s);
      if (!mk) {
        part.length = 0;
        break;
      }
      part.push({ start: mk.digits[0], end: mk.digits[1], text: String(i + 1) });
    }
    edits.push(...part);
  }
  return edits;
}
