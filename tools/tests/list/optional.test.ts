// "Optional" on the shopping list (SPEC §8): an item every line of which says it is optional.

import { describe, expect, it } from 'vitest';

import { formatQuantity, isOptionalRemark, parseRecipe } from '../../src/core/index.ts';
import { renderCardParts, shoppingListHtml } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { consolidate, formatListMarkdown, formatListText } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const src = (id: string, body: string) => {
  const recipe = parseRecipe(`---\netna: 1\n---\n\n# ${id}\n\n${body}\n`, { units });
  return { id, title: id, recipe };
};
const SAUCE = src('Sauce', '## Simmer\n\n- 800 g tomatoes\n- 6 leaves fresh basil — optional\n- 1 tbsp butter, melted — optional, for brushing\n- 1 tsp salt — to taste\n- rainbow sprinkles, optional\n- [pesto](../pesto/) — if using\n\nSimmer.');
const PIZZA = src('Pizza', '## Top\n\n- 4 leaves fresh basil\n\nScatter.');
const item = (list: ReturnType<typeof consolidate>, name: string) => list.items.find((i) => i.item === name)!;

describe('isOptionalRemark', () => {
  it('reads optional, if desired and if using, alone or before a comma', () => {
    for (const r of ['optional', 'Optional', 'optional, for topping', 'if desired', 'if using', '(optional)', 'optional.']) expect(isOptionalRemark(r), r).toBe(true);
    for (const r of [null, '', 'to taste', 'for dusting', 'optionally strained', 'or pinto beans', 'about 120 g, optional', '52%']) expect(isOptionalRemark(r), String(r)).toBe(false);
  });
});

describe('consolidate: optional', () => {
  it('marks an item optional when its only line says so, and nothing else', () => {
    const list = consolidate([SAUCE]);
    expect(item(list, 'fresh basil').optional).toBe(true);
    expect(item(list, 'butter').optional).toBe(true);
    expect(item(list, 'butter').notes).toEqual([{ text: 'melted', amounts: [] }]);
    expect(item(list, 'tomatoes').optional).toBe(false);
    expect(item(list, 'salt').optional).toBe(false);
  });

  it('takes a note that is only "optional" for the flag, and does not repeat it as a note', () => {
    const sprinkles = item(consolidate([SAUCE]), 'rainbow sprinkles');
    expect(sprinkles.optional).toBe(true);
    expect(sprinkles.notes).toEqual([]);
  });

  it('is not optional when another recipe, or another line, needs it', () => {
    const both = consolidate([SAUCE, PIZZA]);
    expect(item(both, 'fresh basil').optional).toBe(false);
    expect(item(both, 'fresh basil').amounts.map((a) => formatQuantity(a.quantity!))).toEqual(['10']);
    const twice = consolidate([src('Twice', '## A\n\n- 1 tsp yeast — optional\n\nMix.\n\n## B\n\n- 1 tsp yeast\n\nMix.')]);
    expect(item(twice, 'yeast').optional).toBe(false);
  });

  it('marks another recipe used as an ingredient optional by its own line', () => {
    expect(consolidate([SAUCE]).recipes.map((r) => [r.label, r.optional])).toEqual([['pesto', true]]);
  });
});

describe('the list forms say "(optional)"', () => {
  const list = consolidate([SAUCE]);

  it('in plain text', () => {
    const text = formatListText(list);
    expect(text).toContain('6 leaves  fresh basil (optional)\n');
    // The optional word that leads the remark is said by "(optional)"; the rest of it follows.
    expect(text).toContain('1 tbsp    butter, melted (optional) — for brushing\n');
    expect(text).toContain('          rainbow sprinkles (optional)\n');
    expect(text).toContain('pesto (optional)\n');
    expect(text).toContain('800 g     tomatoes\n');
    expect(text).toContain('1 tsp     salt — to taste\n');
    expect(text).not.toContain('— optional');
    expect(text).not.toContain('— if using');
    // Notes off: "optional" is not a note, so it stays, and so does the remark.
    expect(formatListText(list, { notes: false })).toContain('butter (optional) — for brushing\n');
  });

  it('in Markdown', () => {
    const md = formatListMarkdown(list, { uses: true });
    expect(md).toContain('- [ ] 6 leaves fresh basil (optional) — for: Simmer\n');
    expect(md).toContain('- [ ] [pesto](../pesto/) (optional) — for: Simmer\n');
    expect(md).toContain('- [ ] 800 g tomatoes — for: Simmer\n');
  });

  it('on the list card, with the theme\'s word', () => {
    const html = shoppingListHtml(list, { display: { units: 'symbol', fractions: 'ascii', range: 'dash' }, otherRecipes: 'Other recipes', uses: false });
    expect(html).toContain('<td class="ingr-item">fresh basil<span class="ingr-note list-optional"> (optional)</span></td>');
    expect(html).toContain('<td class="ingr-item">butter<span class="ingr-note">, melted</span><span class="ingr-note list-optional"> (optional)</span><span class="ingr-remark list-remark"> — for brushing</span></td>');
    expect(html).toContain('>pesto</span><span class="ingr-note list-optional"> (optional)</span></td>');
    expect(html).toContain('<td class="ingr-item">tomatoes</td>');
    const card = renderCardParts(SAUCE.recipe, loadTheme('shopping'), { labels: { optional: 'if you like' } }).html;
    expect(card).toContain('<span class="ingr-note list-optional"> (if you like)</span>');
  });
});
