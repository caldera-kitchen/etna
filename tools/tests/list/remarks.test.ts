// Remarks on the shopping list (SPEC §8): every line's remark prints, and a total names the
// lines a remark belongs to when not every line carries it.

import { describe, expect, it } from 'vitest';

import { renderListCard, shoppingListHtml } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { loadDensities } from '../../src/density/node.ts';
import { consolidate, formatAmount, formatListMarkdown, formatListText, listRemark, ledText } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const src = (id: string, body: string) => {
  const recipe = parseRecipe(`---\netna: 1\n---\n\n# ${id}\n\n${body}\n`, { units });
  return { id, title: id, recipe };
};
const step = (heading: string, lines: string[]) => `## ${heading}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nGo.\n`;
const item = (list: ReturnType<typeof consolidate>, name: string) => list.items.find((i) => i.item === name)!;
const display = { units: 'symbol' as const, fractions: 'ascii' as const, range: 'dash' as const };
const html = (list: ReturnType<typeof consolidate>) => shoppingListHtml(list, { display, otherRecipes: 'Other recipes', uses: false });

const ROAST = src('Roast', step('Cut', ['500 g carrots, peeled — or parsnips', '1 tbsp honey — or maple syrup']));
const SOUP = src('Soup', step('Simmer', ['500 g carrots', '1 tbsp honey — or maple syrup', '2 tbsp honey — for drizzling']));
const STEW = src('Stew', step('Brown', ['200 g carrots — Or Parsnips', 'flour — for dusting', '300 g flour']));

describe('listRemark', () => {
  it('keeps a remark as written, white space collapsed', () => {
    expect(listRemark('or  parsnips ')).toBe('or parsnips');
    expect(listRemark('75%')).toBe('75%');
    expect(listRemark('about 120 g, sifted')).toBe('about 120 g, sifted');
    expect(listRemark(null)).toBeNull();
  });

  it('takes off an optional word that leads it, which "(optional)" says', () => {
    expect(listRemark('optional')).toBeNull();
    expect(listRemark('If desired.')).toBeNull();
    expect(listRemark('optional, for topping')).toBe('for topping');
    expect(listRemark('if using; see note')).toBe('see note');
    // Not an optional head: kept whole.
    expect(listRemark('optionally strained')).toBe('optionally strained');
    expect(listRemark('about 120 g, optional')).toBe('about 120 g, optional');
  });
});

describe('consolidate: remarks', () => {
  it('gives a one-line item its remark, applying to the whole amount', () => {
    expect(item(consolidate([ROAST]), 'carrots').remarks).toEqual([{ text: 'or parsnips', amounts: [] }]);
  });

  it('applies a remark that every line carries to the total, without amounts', () => {
    const honey = item(consolidate([ROAST, src('Glaze', step('Warm', ['1 tbsp honey — or maple syrup']))]), 'honey');
    expect(honey.remarks).toEqual([{ text: 'or maple syrup', amounts: [] }]);
  });

  it('names the amounts of the lines that carry a remark when another line does not', () => {
    const carrots = item(consolidate([ROAST, SOUP]), 'carrots');
    expect(carrots.amounts.map((a) => a.quantity?.min.text)).toEqual(['1000']);
    expect(carrots.remarks!.map((r) => [r.text, ledText([r], (a) => formatAmount(a))])).toEqual([['or parsnips', '500 g: or parsnips']]);
  });

  it('keeps different remarks apart, each with its own lines, and merges two that differ in case only', () => {
    const list = consolidate([ROAST, SOUP, STEW]);
    expect(item(list, 'honey').remarks!.map((r) => [r.text, r.amounts.length])).toEqual([
      ['or maple syrup', 2],
      ['for drizzling', 1],
    ]);
    // `Or Parsnips` joins `or parsnips`, first spelling kept: two of the three lines.
    expect(item(list, 'carrots').remarks!.map((r) => [r.text, r.amounts.length])).toEqual([['or parsnips', 2]]);
  });

  it('gives a line without a quantity an amount without one', () => {
    const flour = item(consolidate([STEW]), 'flour');
    expect(flour.remarks).toEqual([{ text: 'for dusting', amounts: [{ quantity: null, unit: null, lines: 1 }] }]);
  });

  it('never lets "optional, for topping" beside a needed line make the item optional', () => {
    const list = consolidate([src('Cake', step('Top', ['1 tbsp butter, melted — optional, for brushing'])), src('Bread', step('Mix', ['100 g butter']))]);
    const butter = item(list, 'butter');
    expect(butter.optional).toBe(false);
    expect(butter.remarks!.map((r) => r.text)).toEqual(['for brushing']);
    const text = formatListText(list);
    expect(text).toContain('butter, 1 tbsp: melted — 1 tbsp: for brushing\n');
    expect(text).not.toContain('optional');
  });

  it('carries a reference\'s remark, less an optional head', () => {
    const list = consolidate([src('Bread', step('Mix', ['200 g [biga](../biga/) — 30%', '[pesto](../pesto/) — if using', '1 recipe glaze — optional, for the top']))]);
    expect(list.recipes.map((r) => [r.label, r.optional, r.remark])).toEqual([
      ['biga', false, '30%'],
      ['pesto', true, null],
      ['glaze', true, 'for the top'],
    ]);
  });
});

describe('the list forms print the remarks', () => {
  const list = consolidate([ROAST, SOUP, STEW]);
  const text = formatListText(list);

  it('in plain text: after the item, its notes and "(optional)", led by an em dash', () => {
    expect(text).toMatch(/1200 g +carrots, 500 g: peeled — 500 g \+ 200 g: or parsnips\n/);
    expect(text).toContain('honey — 1 tbsp + 1 tbsp: or maple syrup; 2 tbsp: for drizzling\n');
    expect(text).toMatch(/300 g \+ some +flour — some: for dusting\n/);
  });

  it('prints a whole-item remark once, without amounts', () => {
    expect(formatListText(consolidate([ROAST]))).toContain('500 g   carrots, peeled — or parsnips\n');
  });

  it('keeps the remarks with notes off', () => {
    expect(formatListText(consolidate([ROAST]), { notes: false })).toContain('500 g   carrots — or parsnips\n');
  });

  it('puts what a converted total was made from before the remark', () => {
    const conv = consolidate([src('Cake', step('Mix', ['1 cup all-purpose flour — weight after sifting', '100 g all-purpose flour']))], { densities: loadDensities(), units });
    expect(formatListText(conv)).toMatch(/all-purpose flour \(1 cup \+ 100 g\) — 1 cup: weight after sifting\n/);
  });

  it('in Markdown, before the uses', () => {
    const md = formatListMarkdown(consolidate([ROAST]), { uses: true });
    expect(md).toContain('- [ ] 500 g carrots, peeled — or parsnips — for: Cut\n');
  });

  it('under "Other recipes"', () => {
    const refs = consolidate([src('Bread', step('Mix', ['200 g [biga](../biga/) — 30%']))]);
    expect(formatListText(refs)).toContain('200 g  biga — 30%\n');
    expect(formatListMarkdown(refs)).toContain('- [ ] 200 g [biga](../biga/) — 30%\n');
    expect(html(refs)).toContain('>biga</span><span class="ingr-remark list-remark"> — 30%</span></td>');
  });

  it('on the list card, as the recipe card prints a remark', () => {
    const h = html(list);
    expect(h).toContain('<td class="ingr-item">carrots<span class="ingr-note">, 500 g: peeled</span><span class="ingr-remark list-remark"> — 500 g + 200 g: or parsnips</span></td>');
    expect(h).toContain('flour<span class="ingr-remark list-remark"> — some: for dusting</span></td>');
    expect(h).not.toContain('— optional');
  });

  it('on the paged list card the GUI shows, escaped', () => {
    const card = renderListCard(consolidate([src('X', step('Mix', ['1 cup sugar — <b>light</b> or dark']))]), loadTheme('shopping'));
    expect(card).toContain('<span class="ingr-remark list-remark"> — &lt;b&gt;light&lt;/b&gt; or dark</span>');
  });
});
