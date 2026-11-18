// One ingredient line: `<quantity> <unit> <item>[, <prep>][ — <remark>]` (SPEC §6).

import type { Quantity, UnitMatch } from './model.ts';
import { parseQuantity } from './quantity.ts';
import type { UnitRegistry } from './units.ts';

export interface IngredientParts {
  quantity: Quantity | null;
  unit: UnitMatch | null;
  item: string;
  /** How the ingredient is prepared: the text after the first comma, or null. */
  note: string | null;
  /** A remark that is not preparation: the text after the first ` — ` (em dash), or null. */
  remark: string | null;
}

/** Split leading quantity and unit off `text`. A unit is only looked for after a quantity. */
export function parseAmount(
  text: string,
  units: UnitRegistry,
): { quantity: Quantity | null; unit: UnitMatch | null; rest: string } {
  const q = parseQuantity(text);
  if (!q) return { quantity: null, unit: null, rest: text };
  let rest = text.slice(q.length).replace(/^\s+/, '');
  const u = units.match(rest);
  if (!u) return { quantity: q.quantity, unit: null, rest };
  rest = rest.slice(u.length).replace(/^\s+/, '');
  return { quantity: q.quantity, unit: u.unit, rest };
}

/**
 * Split off a remark: the text after the first em dash with white space on both sides
 * (` — `) that is not inside parentheses (SPEC §6). The remark may hold commas and dashes of
 * its own. `Water, 115°F — 52%` → `{ text: 'Water, 115°F', remark: '52%' }`.
 */
export function splitRemark(text: string): { text: string; remark: string | null } {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === '\u2014' && depth === 0 && (i === 0 || /\s/.test(text[i - 1])) && i + 1 < text.length && /\s/.test(text[i + 1])) {
      const remark = text.slice(i + 1).trim();
      // A dash with nothing after it introduces nothing: the line is read as written.
      if (remark === '') break;
      return { text: text.slice(0, i).trim(), remark };
    }
  }
  return { text, remark: null };
}

/** Split `item, note` at the first comma that is not inside parentheses. */
export function splitNote(text: string): { item: string; note: string | null } {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      const note = text.slice(i + 1).trim();
      return { item: text.slice(0, i).trim(), note: note === '' ? null : note };
    }
  }
  return { item: text.trim(), note: null };
}

export function parseIngredientText(text: string, units: UnitRegistry): IngredientParts {
  const { quantity, unit, rest } = parseAmount(text.trim(), units);
  const { text: head, remark } = splitRemark(rest);
  const { item, note } = splitNote(head);
  return { quantity, unit, item, note, remark };
}

/**
 * A remark that says the ingredient may be left out: `optional`, `if desired` or `if using`, alone
 * or before a comma (`— optional, for topping`), case ignored. A shopping list says "optional" for
 * an item when every line that uses it says so (SPEC §8).
 */
export function isOptionalRemark(remark: string | null): boolean {
  if (remark === null) return false;
  const head = remark.trim().toLowerCase().split(/[,;]/)[0].trim().replace(/[.!]+$/, '');
  return /^\(?(optional|if desired|if using)\)?$/.test(head);
}

/**
 * A remark that says how a quantity-less staple is used rather than how much of it: `to taste`,
 * `as needed`, `optional`, `to serve`, `to cover`, `for dusting`, `for the pasta water`… at most four
 * words (SPEC §6). A card prints it where the amount would be.
 */
export function isUseRemark(remark: string | null): boolean {
  if (remark === null) return false;
  const r = remark.trim().toLowerCase();
  if (r.split(/\s+/).length > 4) return false;
  return /^(to taste|as needed|if desired|optional|to serve|to cover|to coat|for [a-z][a-z-]*( [a-z][a-z-]*){0,2})$/.test(r);
}
