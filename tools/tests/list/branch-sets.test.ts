// The ingredients of each branch of a `Choose` (SPEC §5.2) are one set on the shopping list:
// the cook makes one branch, so two branches are never added together (SPEC §8).

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { renderCardParts, shoppingListHtml } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { consolidate, formatListMarkdown, formatListText, ingredientLines, sortList, type ListItem, type ShoppingList } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (id: string, body: string) => parseRecipe(`---\netna: 1\n---\n\n# ${id}\n\n${body}`, { units });
const source = (id: string, body: string) => ({ id, title: id, recipe: parse(id, body) });
const step = (level: number, name: string, lines: string[]) => `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}\nDo it.\n\n`;
const amounts = (i: ListItem | undefined) => i?.amounts.map((a) => `${a.quantity?.raw ?? 'some'} ${a.unit?.symbol ?? a.unit?.name ?? ''}`.trim());
const find = (items: ListItem[], name: string) => items.find((i) => i.item === name);
const branch = (list: ShoppingList, name: string) => list.sets?.find((s) => s.branch?.name === name);
const html = (list: ShoppingList, extra = {}) => shoppingListHtml(list, { display: { units: 'symbol', fractions: 'ascii', range: 'dash' }, otherRecipes: 'Other recipes', uses: false, ...extra });

const TART = source(
  'Tart',
  '## Dough\n\n> **Choose** — one dough.\n\n' +
    '### Short Dough\n\n' +
    step(4, 'Rub in the butter', ['200 g flour', '100 g butter']) +
    step(4, 'Bind', ['1 egg', '50 g flour']) +
    '### Quick Dough\n\n' +
    step(4, 'Stir', ['180 g flour', '80 g butter', '1 cup item']) +
    step(2, 'Fill and bake', ['[dough](#dough)', '300 g fruit', '20 g butter']),
);

describe('a branch of a Choose', () => {
  it('is a set of its own after what is needed, its lines totaled among themselves only', () => {
    const list = consolidate([TART]);
    expect(list.items.map((i) => [i.item, amounts(i)])).toEqual([
      ['fruit', ['300 g']],
      ['butter', ['20 g']],
    ]);
    expect(list.sets?.map((s) => [s.name, s.anchor, s.branch, s.items.map((i) => [i.item, amounts(i)])])).toEqual([
      [
        'Dough',
        'short-dough',
        { name: 'Short Dough', optional: false },
        [
          ['flour', ['250 g']],
          ['butter', ['100 g']],
          ['egg', ['1']],
        ],
      ],
      [
        'Dough',
        'quick-dough',
        { name: 'Quick Dough', optional: false },
        [
          ['flour', ['180 g']],
          ['butter', ['80 g']],
          ['item', ['1 cup']],
        ],
      ],
    ]);
  });

  it('reads in the text list under the component\'s name, "choose one" and the branch\'s name', () => {
    expect(formatListText(consolidate([TART]))).toBe(
      [
        'Shopping list: Tart',
        '',
        '300 g  fruit',
        '20 g   butter',
        '',
        'Dough — choose one: Short Dough',
        '250 g  flour',
        '100 g  butter',
        '1      egg',
        '',
        'Dough — choose one: Quick Dough',
        '180 g  flour',
        '80 g   butter',
        '1 cup  item',
        '',
      ].join('\n'),
    );
  });

  it('is a heading of its own in the Markdown checklist, and a group of its own on the card', () => {
    const list = consolidate([TART]);
    expect(formatListMarkdown(list)).toContain('## Dough — choose one: Short Dough\n\n- [ ] 250 g flour\n- [ ] 100 g butter\n- [ ] 1 egg\n\n## Dough — choose one: Quick Dough\n');
    const card = html(list);
    expect(card).toContain(
      '<tbody class="ingr-group list-set list-branch" data-set="short-dough"><tr><th class="ingr-group-label list-set-label" colspan="4" scope="rowgroup">Dough<span class="list-set-note"> — choose one: </span>Short Dough</th></tr>',
    );
    expect(card.indexOf('list-branch')).toBeGreaterThan(card.indexOf('list-items'));
    expect(html(list, { chooseSet: 'au choix' })).toContain('Dough<span class="list-set-note"> — au choix: </span>Short Dough</th>');
  });

  it('is printed by the shopping card style, which takes the words from its labels', () => {
    const recipe = TART.recipe;
    const shopping = loadTheme('shopping');
    expect(renderCardParts(recipe, shopping).html).toContain('Dough<span class="list-set-note"> — choose one: </span>Quick Dough</th>');
    expect(renderCardParts(recipe, shopping, { labels: { 'choose-set': 'one of' } }).html).toContain('<span class="list-set-note"> — one of: </span>Quick Dough');
  });

  it('is a set however few its lines', () => {
    const list = consolidate([TART]);
    const one = source('Toast', '## Spread\n\n> **Choose**\n\n' + step(3, 'Butter', ['10 g butter']) + step(3, 'Jam', ['1 tbsp jam']) + step(2, 'Eat', ['[spread](#spread)', '1 slice bread']));
    const spread = consolidate([one]);
    expect(spread.items.map((i) => i.item)).toEqual(['bread']);
    expect(spread.sets?.map((s) => [s.branch?.name, s.items.map((i) => [i.item, i.optional])])).toEqual([
      ['Butter', [['butter', false]]],
      ['Jam', [['jam', false]]],
    ]);
    expect(list.sets).toHaveLength(2);
  });

  it('is left out when it has nothing to buy', () => {
    const cook = source('Cook', '## Cook\n\n> **Choose**\n\n' + step(3, 'Bake', []) + step(3, 'Fry', ['1 cup oil']));
    expect(consolidate([cook]).sets?.map((s) => s.branch?.name)).toEqual(['Fry']);
  });

  it('keeps branches of several recipes apart, each naming its recipe', () => {
    const list = consolidate([TART, TART]);
    expect(list.sets).toHaveLength(4);
    expect(list.sets?.map((s) => amounts(find(s.items, 'flour')))).toEqual([['250 g'], ['180 g'], ['250 g'], ['180 g']]);
    expect(formatListText(consolidate([TART, source('Pie', '## Crust\n\n> **Choose**\n\n' + step(3, 'Pressed', ['100 g crumbs']) + step(3, 'Rolled', ['150 g flour']))]))).toContain(
      'Dough, for Tart — choose one: Short Dough',
    );
  });

  it('lists another recipe used inside it in the set', () => {
    const plate = source('Plate', '## Sauce\n\n> **Choose**\n\n' + step(3, 'Bought', ['1 [ketchup](../ketchup/)']) + step(3, 'Made', ['200 g item']));
    const list = consolidate([plate]);
    expect(list.recipes).toEqual([]);
    expect(branch(list, 'Bought')?.recipes.map((r) => r.label)).toEqual(['ketchup']);
    expect(formatListText(list)).toContain('Sauce — choose one: Bought\n1      ketchup (another recipe)\n');
  });

  it('sorts within itself with --sort', () => {
    expect(branch(sortList(consolidate([TART])), 'Quick Dough')!.items.map((i) => i.item)).toEqual(['butter', 'flour', 'item']);
  });

  it('is said on every placed line: the innermost branch around it', () => {
    const lines = ingredientLines(TART.recipe);
    expect(lines.map((l) => [l.line.raw, l.branch?.name ?? null])).toEqual([
      ['200 g flour', 'Short Dough'],
      ['100 g butter', 'Short Dough'],
      ['1 egg', 'Short Dough'],
      ['50 g flour', 'Short Dough'],
      ['180 g flour', 'Quick Dough'],
      ['80 g butter', 'Quick Dough'],
      ['1 cup item', 'Quick Dough'],
      ['[dough](#dough)', null],
      ['300 g fruit', null],
      ['20 g butter', null],
    ]);
  });
});

describe('a Choose nested with other sets', () => {
  it('inside a branch: its branches are the sets, and the outer branch keeps its own lines', () => {
    const r = source(
      'Bowl',
      '## Base\n\n> **Choose**\n\n### Rice\n\n' +
        step(4, 'Rinse', ['200 g rice']) +
        '#### Flavor\n\n> **Choose**\n\n' +
        step(5, 'Plain', ['1 tsp salt']) +
        step(5, 'Coconut', ['1 cup coconut milk', '1 tsp salt']) +
        step(3, 'Noodles', ['200 g noodles']),
    );
    const list = consolidate([r]);
    expect(list.sets?.map((s) => [s.name, s.branch?.name, s.items.map((i) => i.item)])).toEqual([
      ['Base', 'Rice', ['rice']],
      ['Flavor', 'Plain', ['salt']],
      ['Flavor', 'Coconut', ['coconut milk', 'salt']],
      ['Base', 'Noodles', ['noodles']],
    ]);
  });

  it('inside an optional set: each branch is still its own set, its heading ending with the optional words', () => {
    const r = source(
      'Cake',
      step(2, 'Bake', ['200 g flour']) +
        '## Topping — optional\n\n' +
        step(3, 'Whip', ['100 ml cream', '1 tbsp sugar']) +
        '### Crunch\n\n> **Choose**\n\n' +
        step(4, 'Streusel', ['50 g oats', '30 g butter']) +
        step(4, 'Nuts', ['40 g nuts']),
    );
    const list = consolidate([r]);
    expect(list.items.map((i) => i.item)).toEqual(['flour']);
    expect(list.sets?.map((s) => [s.name, s.branch, s.items.map((i) => i.item)])).toEqual([
      ['Topping', undefined, ['cream', 'sugar']],
      ['Crunch', { name: 'Streusel', optional: true }, ['oats', 'butter']],
      ['Crunch', { name: 'Nuts', optional: true }, ['nuts']],
    ]);
    const text = formatListText(list);
    expect(text).toContain('Topping — optional, all or none\n');
    expect(text).toContain('Crunch — choose one: Streusel — optional, all or none\n');
    expect(html(list)).toContain('Crunch<span class="list-set-note"> — choose one: </span>Nuts<span class="list-set-note"> — optional, all or none</span></th>');
  });

  it('a Choose designated optional itself: its branches say so in their headings', () => {
    const r = source('Soup', step(2, 'Simmer', ['1 l stock']) + '## Garnish — optional\n\n> **Choose**\n\n' + step(3, 'Herbs', ['1 bunch parsley']) + step(3, 'Croutons', ['2 slices bread']));
    const list = consolidate([r]);
    expect(list.sets?.map((s) => [s.name, s.branch])).toEqual([
      ['Garnish', { name: 'Herbs', optional: true }],
      ['Garnish', { name: 'Croutons', optional: true }],
    ]);
    expect(formatListText(list)).toContain('Garnish — choose one: Herbs — optional, all or none\n');
  });

  it('an optional branch, or an optional heading inside a branch: its lines say "(optional)" within the branch', () => {
    const r = source(
      'Fish',
      '## Cook\n\n> **Choose**\n\n' +
        step(3, 'Grill — optional', ['1 tbsp oil']) +
        '### Poach\n\n' +
        step(4, 'Simmer', ['500 ml stock']) +
        step(4, 'Finish — optional', ['10 g butter']),
    );
    const list = consolidate([r]);
    expect(list.sets?.map((s) => [s.name, s.branch, s.items.map((i) => [i.item, i.optional])])).toEqual([
      ['Cook', { name: 'Grill', optional: false }, [['oil', true]]],
      ['Cook', { name: 'Poach', optional: false }, [['stock', false], ['butter', true]]],
    ]);
  });
});
