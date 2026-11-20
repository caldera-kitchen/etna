// Rendering a shopping list as aligned plain text or a GitHub-style Markdown checklist.

import { canonicalUnit, formatQuantity, longUnit } from '../core/index.ts';
import type { Amount, ListItem, ListNote, ListRecipe, ListSet, ShoppingList } from './index.ts';

export interface ListFormat {
  /** `symbol` (default): `g`, `tbsp`, `2 cloves`. `long`: `grams`, `tablespoons`. */
  units?: 'symbol' | 'long';
  /** `ascii` (default): `1 1/2`. `unicode`: `1 ½`. */
  fractions?: 'ascii' | 'unicode';
  /** Say where each item is used. Default off. */
  uses?: boolean;
  /** Show the notes seen on the lines (`softened`, `King Arthur`). Default on. */
  notes?: boolean;
}

interface Resolved {
  units: 'symbol' | 'long';
  fractions: 'ascii' | 'unicode';
  uses: boolean;
  notes: boolean;
}

function resolve(options: ListFormat): Resolved {
  return {
    units: options.units ?? 'symbol',
    fractions: options.fractions ?? 'ascii',
    uses: options.uses ?? false,
    notes: options.notes ?? true,
  };
}

/** One amount: `480 g`, `1 1/2 cups`, `3 large`. An unquantified amount renders as `some`. */
export function formatAmount(amount: Amount, options: ListFormat = {}): string {
  const o = resolve(options);
  const unit = amount.unit ? (o.units === 'long' ? longUnit(amount.unit, amount.quantity) : canonicalUnit(amount.unit, amount.quantity)) : '';
  if (!amount.quantity) return unit === '' ? 'some' : `some ${unit}`;
  const q = formatQuantity(amount.quantity, { fractions: o.fractions });
  const approx = amount.converted?.approximate ? '≈ ' : '';
  return unit === '' ? `${approx}${q}` : `${approx}${q} ${unit}`;
}

/** What a combined amount was made from: `170 g + 3 tbsp`. */
function partsText(item: ListItem, o: Resolved): string {
  const parts = item.amounts.filter((a) => a.converted).map((a) => a.converted!.from.map((f) => formatAmount(f, o)).join(' + '));
  return parts.join('; ');
}

/** All of an item's amounts joined with `+`; empty when the item was never quantified. */
function amountsText(item: ListItem, o: Resolved): string {
  if (item.amounts.every((a) => a.quantity === null && a.unit === null)) return '';
  return item.amounts.map((a) => formatAmount(a, o)).join(' + ');
}

/** Said after an item or another recipe that every line marks optional (SPEC §8). */
const OPTIONAL = ' (optional)';

/** Said after an optional set's name (SPEC §8): its items are bought all together or not at all. */
export const OPTIONAL_SET = 'optional, all or none';

/** Said after another recipe used inside a set, where no "Other recipes" heading names it. */
const ANOTHER_RECIPE = ' (another recipe)';

/** Said between a `Choose` component's name and a branch's name (SPEC §8): the cook makes one branch. */
export const chooseOne = 'choose one';

/** The words a set's heading says: `optional` after an optional set's name, `choose` before a branch's name. */
export interface SetWords {
  optional?: string;
  choose?: string;
}

/**
 * A set's heading: its name, the recipe it is for when the list has several, and what it
 * means. `Glaze — optional, all or none`; `Glaze, for Roasted Root Vegetables — optional, all
 * or none`. A branch of a `Choose` says the branch's name after the words "choose one":
 * `Dough — choose one: Butter dough`; one that is optional as well ends with the optional
 * words, `Topping — choose one: Streusel — optional, all or none`.
 */
export function setHeading(set: ListSet, list: ShoppingList, words: SetWords = {}): string {
  const optional = words.optional ?? OPTIONAL_SET;
  if (!set.branch) return `${setName(set, list)} — ${optional}`;
  const head = `${setName(set, list)} — ${words.choose ?? chooseOne}: ${set.branch.name}`;
  return set.branch.optional ? `${head} — ${optional}` : head;
}

/** A set's name, with the recipe it is for when the list has several: `Glaze, for Roasted Root Vegetables`. */
export function setName(set: ListSet, list: ShoppingList): string {
  if (list.sources.length <= 1) return set.name;
  const title = list.sources.find((s) => s.id === set.source)?.title.trim() || set.source;
  return `${set.name}, for ${title}`;
}

/**
 * An item's notes or remarks as one text (SPEC §8): `or parsnips` when every line says it;
 * otherwise each led by the amounts of the lines that say it, `500 g: or parsnips; some: for
 * dusting`. Empty for none.
 */
export function ledText(texts: ListNote[] | undefined, amount: (a: Amount) => string): string {
  return (texts ?? []).map((r) => (r.amounts.length === 0 ? r.text : `${r.amounts.map(amount).join(' + ')}: ${r.text}`)).join('; ');
}

/** ` — ` and the remarks, or empty: the em dash the recipe wrote them after. */
function remarkTail(text: string): string {
  return text === '' ? '' : ` — ${text}`;
}

function itemText(item: ListItem, o: Resolved): string {
  const parts = partsText(item, o);
  const amount = (a: Amount) => formatAmount(a, o);
  const named = !o.notes || item.notes.length === 0 ? item.item : `${item.item}, ${ledText(item.notes, amount)}`;
  const optional = item.optional ? `${named}${OPTIONAL}` : named;
  const text = parts ? `${optional} (${parts})` : optional;
  return text + remarkTail(ledText(item.remarks, amount));
}

function recipeText(label: string, r: ListRecipe, o: Resolved): string {
  const text = o.notes && r.note ? `${label}, ${r.note}` : label;
  return (r.optional ? `${text}${OPTIONAL}` : text) + remarkTail(r.remark ?? '');
}

/**
 * Why some amounts were left side by side, or empty: `No density for: cinnamon — amounts left
 * as written`, and for a liquid measured in oz, `Measured in oz, by weight or fluid ounces?
 * water — amounts left as written`.
 */
export function unconvertedFooter(list: ShoppingList): string {
  const ounces = list.unconverted.filter((u) => u.reason === 'liquid-ounces');
  const missing = list.unconverted.filter((u) => u.reason === undefined);
  const lines: string[] = [];
  if (missing.length > 0) lines.push(`No density for: ${missing.map((u) => u.item).join(', ')} — amounts left as written`);
  if (ounces.length > 0) lines.push(`Measured in oz, by weight or fluid ounces? ${ounces.map((u) => u.item).join(', ')} — amounts left as written`);
  return lines.join('\n');
}

/** `Mix, Stir` for one recipe; `Cinnamon Rolls (Mix, Stir); Wedding Soup` across several. */
function usesText(uses: { source: string; step: string | null }[], list: ShoppingList): string {
  const bySource = new Map<string, string[]>();
  for (const u of uses) {
    const steps = bySource.get(u.source) ?? [];
    if (u.step !== null && !steps.includes(u.step)) steps.push(u.step);
    bySource.set(u.source, steps);
  }
  const title = (id: string) => list.sources.find((s) => s.id === id)?.title ?? id;
  if (list.sources.length <= 1) return [...bySource.values()].flat().join(', ');
  return [...bySource.entries()].map(([id, steps]) => (steps.length > 0 ? `${title(id)} (${steps.join(', ')})` : title(id))).join('; ');
}

function recipeAmount(r: ListRecipe, o: Resolved): string {
  if (!r.quantity) return '';
  return formatAmount({ quantity: r.quantity, unit: r.unit, lines: 1 }, o);
}

function headingText(list: ShoppingList): string {
  const titles = list.sources.map((s) => s.title);
  return titles.length === 0 ? 'Shopping list' : `Shopping list: ${titles.join(' + ')}`;
}

const MAX_COLUMN = 20;
const MAX_TEXT_COLUMN = 36;

/** Plain text: a heading line, then one item per line with the amounts in an aligned column; other recipes; then each set (optional, or a branch of a `Choose`) under its heading. */
export function formatListText(list: ShoppingList, options: ListFormat = {}): string {
  const o = resolve(options);
  type Row = { amount: string; text: string; uses: string };
  const itemRow = (item: ListItem): Row => ({ amount: amountsText(item, o), text: itemText(item, o), uses: o.uses ? usesText(item.uses, list) : '' });
  const recipeRow = (r: ListRecipe, inSet = false): Row => ({
    amount: recipeAmount(r, o),
    text: recipeText(r.label, r, o) + (inSet ? ANOTHER_RECIPE : ''),
    uses: o.uses ? usesText([{ source: r.source, step: r.step }], list) : '',
  });
  const rows = list.items.map(itemRow);
  const recipeRows = list.recipes.map((r) => recipeRow(r));
  const sets = (list.sets ?? []).map((set) => ({ heading: setHeading(set, list), rows: [...set.items.map(itemRow), ...set.recipes.map((r) => recipeRow(r, true))] }));
  const all = [...rows, ...recipeRows, ...sets.flatMap((s) => s.rows)];
  const width = Math.min(MAX_COLUMN, Math.max(0, ...all.map((r) => r.amount.length)));
  const textWidth = Math.min(MAX_TEXT_COLUMN, Math.max(0, ...all.map((r) => r.text.length)));
  const line = (r: Row) => {
    const pad = width === 0 ? '' : `${r.amount.padEnd(width)}  `;
    const uses = r.uses ? `${' '.repeat(Math.max(0, textWidth - r.text.length))}  for: ${r.uses}` : '';
    return `${pad}${r.text}${uses}`.trimEnd();
  };

  const out = [headingText(list), ''];
  out.push(...rows.map(line));
  if (recipeRows.length > 0) {
    if (rows.length > 0) out.push('');
    out.push('Other recipes:');
    out.push(...recipeRows.map(line));
  }
  for (const set of sets) {
    if (out.length > 2) out.push('');
    out.push(set.heading, ...set.rows.map(line));
  }
  const footer = unconvertedFooter(list);
  if (footer) out.push('', footer);
  return `${out.join('\n')}\n`;
}

/** A GitHub-style task list: `- [ ] 480 g heavy cream`, under a heading naming the recipes; each set (optional, or a branch of a `Choose`) under a heading of its own. */
export function formatListMarkdown(list: ShoppingList, options: ListFormat = {}): string {
  const o = resolve(options);
  const entry = (amount: string, text: string, uses: string) =>
    `- [ ] ${amount ? `${amount} ` : ''}${text}${uses ? ` — for: ${uses}` : ''}`;
  const recipeEntry = (r: ListRecipe, suffix = '') => {
    const label = r.target ? `[${r.label}](${r.target})` : r.label;
    return entry(recipeAmount(r, o), recipeText(label, r, o) + suffix, o.uses ? usesText([{ source: r.source, step: r.step }], list) : '');
  };
  const out = [`# ${headingText(list)}`, ''];
  for (const item of list.items) out.push(entry(amountsText(item, o), itemText(item, o), o.uses ? usesText(item.uses, list) : ''));
  if (list.recipes.length > 0) {
    if (list.items.length > 0) out.push('');
    out.push('## Other recipes', '');
    for (const r of list.recipes) out.push(recipeEntry(r));
  }
  for (const set of list.sets ?? []) {
    if (out.length > 2) out.push('');
    out.push(`## ${setHeading(set, list)}`, '');
    for (const item of set.items) out.push(entry(amountsText(item, o), itemText(item, o), o.uses ? usesText(item.uses, list) : ''));
    for (const r of set.recipes) out.push(recipeEntry(r, ANOTHER_RECIPE));
  }
  const footer = unconvertedFooter(list);
  if (footer) out.push('', footer.split('\n').map((l) => `_${l}_`).join('  \n'));
  return `${out.join('\n')}\n`;
}
