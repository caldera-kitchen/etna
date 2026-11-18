// The `list` layout: a shopping list on a card — every ingredient once, amounts totaled
// across the steps that use it, no directions (SPEC §8).
//
// Two functions, kept apart on purpose: `recipeShoppingList` builds the list from one recipe,
// `shoppingListHtml` turns any ShoppingList into the card's table. A printable list of several
// recipes is then `shoppingListHtml(consolidate(sources), …)`.
// Pure and browser-safe.

import { canonicalUnit, formatQuantity, longUnit, type Quantity, type Recipe, type UnitDef } from '../core/index.ts';
import { consolidate, ledText, OPTIONAL_SET, setName, type Amount, type ConsolidateOptions, type ListItem, type ListRecipe, type ListUse, type ShoppingList } from '../list/index.ts';
import type { Display } from './body.ts';
import { esc, inlineText, safeUrl } from './html.ts';

export interface ListHtmlOptions {
  display: Display;
  /** The label of the block of other recipes used as ingredients (`labels.other-recipes`). */
  otherRecipes: string;
  /** Under each item, the steps that use it (`options.slots.uses`). */
  uses: boolean;
  /** Said after an item every line marks optional (`labels.optional`); default "optional". */
  optional?: string;
  /** Said after an optional set's name (`labels.optional-set`); default "optional, all or none". */
  optionalSet?: string;
}

/**
 * One recipe's shopping list: its ingredients consolidated, in order of first use. `options`
 * as for `consolidate`: with a density table, a weight and a volume of one item are totaled.
 */
export function recipeShoppingList(recipe: Recipe, id = 'recipe', options: ConsolidateOptions = {}): ShoppingList {
  return consolidate([{ id, title: recipe.title?.text ?? '', recipe }], options);
}

/**
 * A shopping list as the card's ingredient table: a checkbox column (an empty box drawn in
 * CSS), then the ingredient table's quantity, unit and item columns. An item with amounts in
 * two units stacks them, the second led by `+`. Other recipes used as ingredients follow in
 * their own labeled group. Empty when the list is empty.
 */
export function shoppingListHtml(list: ShoppingList, options: ListHtmlOptions): string {
  const groups: string[] = [];
  if (list.items.length > 0) {
    groups.push(`<tbody class="ingr-group list-items">${list.items.map((item) => itemRow(item, list, options)).join('')}</tbody>`);
  }
  if (list.recipes.length > 0) {
    const label = `<tr><th class="ingr-group-label" colspan="4" scope="rowgroup">${esc(options.otherRecipes)}</th></tr>`;
    groups.push(`<tbody class="ingr-group list-recipes">${label}${list.recipes.map((r) => recipeRow(r, list, options)).join('')}</tbody>`);
  }
  // Each optional set after what is needed: a group headed by its name and "optional, all or none" (SPEC §8).
  for (const set of list.sets ?? []) {
    const word = options.optionalSet ?? OPTIONAL_SET;
    const label =
      `<tr><th class="ingr-group-label list-set-label" colspan="4" scope="rowgroup">${esc(setName(set, list))}` +
      `<span class="list-set-note"> — ${esc(word)}</span></th></tr>`;
    const rows = [...set.items.map((item) => itemRow(item, list, options)), ...set.recipes.map((r) => recipeRow(r, list, options))];
    groups.push(`<tbody class="ingr-group list-set" data-set="${esc(set.anchor)}">${label}${rows.join('')}</tbody>`);
  }
  return groups.length === 0 ? '' : `<table class="ingr-table list-table">${groups.join('')}</table>`;
}

/** Another recipe used as an ingredient, as a row. */
function recipeRow(r: ListRecipe, list: ShoppingList, options: ListHtmlOptions): string {
  const url = r.target === null ? null : safeUrl(r.target);
  const target = url === null ? '' : ` data-target="${esc(url)}"`;
  const note = (r.note === null || r.note.trim() === '' ? '' : `<span class="ingr-note">, ${esc(inlineText(r.note.trim()))}</span>`) + optionalHtml(r.optional, options);
  const amount = r.quantity === null ? [] : [{ quantity: r.quantity, unit: r.unit, lines: 1 }];
  const uses = options.uses ? usesHtml([{ source: r.source, step: r.step }], list) : '';
  return (
    '<tr class="ingr ingr-reference list-item">' +
    CHECK +
    amountCells(amount, options.display) +
    `<td class="ingr-item"><span class="ingr-ref ingr-ref-external"${target}>${esc(r.label)}</span>${note}${remarkHtml(inlineText(r.remark ?? ''))}${uses}</td></tr>`
  );
}

/** The checkbox cell: an empty box for a pen, not a form control. */
const CHECK = '<td class="list-check" aria-hidden="true"><span class="list-box"></span></td>';

function itemRow(item: ListItem, list: ShoppingList, options: ListHtmlOptions): string {
  const amount = (a: Amount) => amountText(a, options.display);
  const note = (item.notes.length === 0 ? '' : `<span class="ingr-note">, ${esc(ledText(item.notes, amount))}</span>`) + optionalHtml(item.optional, options);
  // A total made from amounts in other units says what it was made from, as the text list does.
  const parts = item.amounts
    .filter((a) => a.converted)
    .map((a) => a.converted!.from.map((f) => amountText(f, options.display)).join(' + '))
    .join('; ');
  const from = parts === '' ? '' : `<span class="ingr-note list-from"> (${esc(parts)})</span>`;
  const uses = options.uses ? usesHtml(item.uses, list) : '';
  const remark = remarkHtml(ledText(item.remarks, amount));
  return (
    '<tr class="ingr list-item">' +
    CHECK +
    amountCells(item.amounts, options.display) +
    `<td class="ingr-item">${esc(item.item)}${note}${from}${remark}${uses}</td></tr>`
  );
}

/** ` — or parsnips` after an item or recipe, as the card prints a remark (`ingr-remark`); empty for none. */
function remarkHtml(text: string): string {
  return text === '' ? '' : `<span class="ingr-remark list-remark"> — ${esc(text)}</span>`;
}

/** ` (optional)` after an item or recipe that every line marks optional; empty otherwise. */
function optionalHtml(optional: boolean | undefined, options: ListHtmlOptions): string {
  return optional ? `<span class="ingr-note list-optional"> (${esc(options.optional ?? 'optional')})</span>` : '';
}

/** `≈ ` before a total that was converted through a density or rounded; empty otherwise. */
function approx(a: Amount): string {
  return a.converted?.approximate ? '≈ ' : '';
}

/** One amount as plain text, for the list of what a converted total was made from. */
function amountText(a: Amount, display: Display): string {
  const unit = unitText(a.unit, a.quantity, display);
  if (a.quantity === null) return unit === '' ? 'some' : `some ${unit}`;
  const q = quantityText(a.quantity, display);
  return unit === '' ? q : `${q} ${unit}`;
}

/**
 * The quantity and unit cells. One amount: as in the ingredient table. Several: one line per
 * amount (`list-amount`), the second and later led by `+ `; an amount with no quantity reads
 * `some`. An item never quantified leaves both cells empty.
 */
function amountCells(amounts: Amount[], display: Display): string {
  const shown = amounts.filter((a) => a.quantity !== null || a.unit !== null);
  if (shown.length === 0) return '<td class="ingr-qty"></td><td class="ingr-unit"></td>';
  if (amounts.length === 1) {
    const [a] = amounts;
    return `<td class="ingr-qty">${esc(approx(a) + quantityText(a.quantity, display))}</td><td class="ingr-unit">${esc(unitText(a.unit, a.quantity, display))}</td>`;
  }
  const qty = amounts.map((a, i) => {
    const plus = i === 0 ? '' : '<span class="list-plus">+ </span>';
    const value = a.quantity === null ? '<span class="list-some">some</span>' : esc(approx(a) + quantityText(a.quantity, display));
    return `<span class="list-amount">${plus}${value}</span>`;
  });
  const unit = amounts.map((a) => `<span class="list-amount">${esc(unitText(a.unit, a.quantity, display)) || '&#8203;'}</span>`);
  return `<td class="ingr-qty">${qty.join('')}</td><td class="ingr-unit">${unit.join('')}</td>`;
}

function quantityText(q: Quantity | null, display: Display): string {
  if (q === null) return '';
  return formatQuantity(q, { fractions: display.fractions, range: display.range === 'to' ? ' to ' : '–' });
}

function unitText(unit: UnitDef | null, q: Quantity | null, display: Display): string {
  if (unit === null) return '';
  return display.units === 'long' ? longUnit(unit, q) : canonicalUnit(unit, q);
}

/** `Mix, Stir` for one recipe; `Cinnamon Rolls (Mix, Stir); Wedding Soup` across several. Empty when no step is named. */
function usesHtml(uses: ListUse[], list: ShoppingList): string {
  const bySource = new Map<string, string[]>();
  for (const u of uses) {
    const steps = bySource.get(u.source) ?? [];
    if (u.step !== null && !steps.includes(u.step)) steps.push(u.step);
    bySource.set(u.source, steps);
  }
  let text: string;
  if (list.sources.length <= 1) text = [...bySource.values()].flat().join(', ');
  else {
    const title = (id: string) => list.sources.find((s) => s.id === id)?.title || id;
    text = [...bySource.entries()].map(([id, steps]) => (steps.length > 0 ? `${title(id)} (${steps.join(', ')})` : title(id))).join('; ');
  }
  return text === '' ? '' : `<span class="list-uses">${esc(text)}</span>`;
}
