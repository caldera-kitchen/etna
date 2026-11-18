// Everything that turns recipe text into chart text: node labels, the ingredient table,
// the title. Widths come from a `Measure` (measure.ts); by default one character is one cell.

import type { IngredientLine, Step } from '../core/index.ts';
import { nodeName } from '../core/qualifier.ts';
import type { Measure } from './measure.ts';

/**
 * Cells (characters, in a monospace font) per line of an operation node.
 * The one width: the chart, `etna lint` (`chart-box-long`) and `etna marks` all wrap with it,
 * through `nodeText`.
 */
export const NODE_WRAP = 24;

const count: Measure = (text) => text.length;

/**
 * Break text into lines at most `max` cells wide, at spaces. With `balance`, the lines are
 * evened out (the narrowest wrap that keeps the same number of lines), which reads better
 * centered in a node. A word longer than `max` stays whole on its own line.
 */
export function wrapText(text: string, max: number, balance = true, measure: Measure = count): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const greedy = (limit: number): string[] => {
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      if (current === '') current = word;
      else if (measure(current + ' ' + word) <= limit) current += ' ' + word;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines;
  };
  const base = greedy(Math.max(1, max));
  if (!balance || base.length === 1) return base;
  let best = base;
  for (let limit = max - 1; limit >= 1; limit--) {
    const attempt = greedy(limit);
    if (attempt.length !== base.length) break;
    best = attempt;
  }
  return best;
}

/**
 * The lines drawn inside an operation node (SPEC §8): the step heading, wrapped; then each of
 * the step's marks (SPEC §5, "Marks"), wrapped by the same measure and width, each starting a
 * line of its own. Nothing is shortened or dropped: the writer controls the box by what is
 * marked. A step with no marks shows its heading alone.
 */
export function nodeText(step: Step, measure: Measure = count): string[] {
  return [nodeName(step), ...step.marks].flatMap((text) => wrapText(text, NODE_WRAP, true, measure));
}

/** Lines a box may have before lint warns (`chart-box-long`): the most any box has in the hand-drawn charts Etna's chart follows. */
export const NODE_MAX_LINES = 5;

/** A recipe title split into its main line(s) and an optional subtitle. */
export function titleParts(title: string): { main: string; sub: string | null } {
  const text = title.trim().replace(/\s+/g, ' ');
  const dash = /^(.+?)\s+(?:--|—|–)\s+(.+)$/.exec(text);
  if (dash) return { main: dash[1], sub: dash[2] };
  const style = /^(.+?)\s+(in the style of\s.+)$/i.exec(text);
  if (style) return { main: style[1], sub: style[2] };
  return { main: text, sub: null };
}

/** One line of an ingredient box, as table cells. */
export interface TableRow {
  quantity: string;
  unit: string;
  /** The item with its note (`water, at 110°F`), unwrapped; the name alone with `ingredient-text: name`. */
  text: string;
  /**
   * True when the unit is too long for the unit column (`teaspoon`, `tablespoons`): it then leads
   * the item text, which starts in the unit column (`2 tablespoons sugar`), so one long unit does
   * not push every item in the box to the right.
   */
  inline: boolean;
  /** `text` wrapped to the box by the layout; continuation lines sit under the item column. */
  item: string[];
}

/** How much of an ingredient line its box shows (the `ingredient-text` theme value). */
export type IngredientTextMode = 'full' | 'name';

/**
 * The table rows of a step's ingredient box: its raw ingredients, plus references to other
 * recipes (which have no node in this chart to draw an edge from). References to this
 * recipe's own components are edges, not rows.
 *
 * With `text: 'name'` a row keeps its quantity, unit and the name the parser gives; the note
 * and anything else from the first comma on is dropped (`611 g Water, 115°F` → `611 g Water`),
 * and so is a remark after ` — ` (`611 g Water — 52%` → `611 g Water`). `full` prints all three.
 */
export function tableRows(lines: IngredientLine[], unitWidth: number, text: IngredientTextMode = 'full'): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of lines) {
    if (line.kind === 'reference' && line.internal) continue;
    const name = line.kind === 'ingredient' ? line.item || line.raw : line.label;
    const full = `${name}${line.note ? `, ${line.note}` : ''}${line.remark ? ` — ${line.remark}` : ''}`;
    const item = text === 'name' ? beforeComma(name) : full;
    const unit = line.unit?.raw ?? '';
    const inline = unit.length > unitWidth;
    rows.push({
      quantity: line.quantity?.raw ?? '',
      unit: inline ? '' : unit,
      text: inline ? `${unit} ${item}` : item,
      inline,
      item: [],
    });
  }
  return rows;
}

/** Text up to its first comma, trimmed; the whole text when that would leave nothing. */
function beforeComma(text: string): string {
  const cut = text.split(',')[0].trim();
  return cut === '' ? text.trim() : cut;
}
