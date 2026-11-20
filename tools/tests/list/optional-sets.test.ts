// The ingredients of a component or step designated optional (`## Glaze — optional`, SPEC §6)
// are one set on the shopping list: bought all together or not at all (SPEC §8).

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { shoppingListHtml } from '../../src/card/index.ts';
import { consolidate, formatListMarkdown, formatListText, sortList, type ListItem, type ShoppingList } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const source = (id: string, body: string) => ({ id, title: id, recipe: parseRecipe(`---\netna: 1\n---\n\n# ${id}\n\n${body}`, { units }) });
const step = (level: number, name: string, lines: string[]) => `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}\nDo it.\n\n`;
const amounts = (i: ListItem | undefined) => i?.amounts.map((a) => `${a.quantity?.raw ?? 'some'} ${a.unit?.symbol ?? a.unit?.name ?? ''}`.trim());
const find = (items: ListItem[], name: string) => items.find((i) => i.item === name);
const set = (list: ShoppingList, name: string) => list.sets?.find((s) => s.name === name);

const TART = source(
  'Tart',
  '## Dough\n\n' +
    step(3, 'Rub in the butter', ['200 g flour', '100 g butter']) +
    '## Glaze — optional\n\n' +
    step(3, 'Warm the glaze', ['2 tbsp apricot jam', '15 g butter', '1 tsp lemon zest — optional', '1 tbsp water — or brandy']) +
    '## Crumble — optional\n\n' +
    step(3, 'Rub the crumble', ['50 g oats', '30 g butter']) +
    step(2, 'Bake', ['[dough](#dough)', '[glaze](#glaze--optional)', '[crumble](#crumble--optional)', '1 tsp sugar — optional']),
);

describe('an optional set', () => {
  it('takes its lines out of what is needed, and carries its own amounts', () => {
    const list = consolidate([TART]);
    expect(amounts(find(list.items, 'butter'))).toEqual(['100 g']);
    expect(amounts(find(set(list, 'Glaze')!.items, 'butter'))).toEqual(['15 g']);
    expect(amounts(find(set(list, 'Crumble')!.items, 'butter'))).toEqual(['30 g']);
    expect(list.items.map((i) => i.item)).toEqual(['flour', 'butter', 'sugar']);
  });

  it('is one per optional component, in recipe order, named without its qualifier', () => {
    const list = consolidate([TART]);
    expect(list.sets?.map((s) => [s.source, s.name, s.anchor, s.items.map((i) => i.item)])).toEqual([
      ['Tart', 'Glaze', 'glaze--optional', ['apricot jam', 'butter', 'lemon zest', 'water']],
      ['Tart', 'Crumble', 'crumble--optional', ['oats', 'butter']],
    ]);
  });

  it('marks a line that is optional by itself "(optional)" inside the set, and outside it as before', () => {
    const list = consolidate([TART]);
    const glaze = set(list, 'Glaze')!;
    expect(find(glaze.items, 'lemon zest')?.optional).toBe(true);
    expect(find(glaze.items, 'apricot jam')?.optional).toBe(false);
    expect(find(list.items, 'sugar')?.optional).toBe(true);
    expect(find(list.items, 'butter')?.optional).toBe(false);
  });

  it('prints the remarks of its lines, as the list does', () => {
    expect(formatListText(consolidate([TART]))).toContain('1 tbsp  water — or brandy');
  });

  it('reads in the text list as a heading and its items, after what is needed', () => {
    expect(formatListText(consolidate([TART]))).toBe(
      [
        'Shopping list: Tart',
        '',
        '200 g   flour',
        '100 g   butter',
        '1 tsp   sugar (optional)',
        '',
        'Glaze — optional, all or none',
        '2 tbsp  apricot jam',
        '15 g    butter',
        '1 tsp   lemon zest (optional)',
        '1 tbsp  water — or brandy',
        '',
        'Crumble — optional, all or none',
        '50 g    oats',
        '30 g    butter',
        '',
      ].join('\n'),
    );
  });

  it('is a heading of its own in the Markdown checklist, and a group of its own on the card', () => {
    const list = consolidate([TART]);
    const md = formatListMarkdown(list);
    expect(md).toContain('## Glaze — optional, all or none\n\n- [ ] 2 tbsp apricot jam\n- [ ] 15 g butter\n');
    const html = shoppingListHtml(list, { display: { units: 'symbol', fractions: 'ascii', range: 'dash' }, otherRecipes: 'Other recipes', uses: false });
    expect(html).toContain('<tbody class="ingr-group list-set" data-set="glaze--optional"><tr><th class="ingr-group-label list-set-label" colspan="4" scope="rowgroup">Glaze<span class="list-set-note"> — optional, all or none</span></th></tr>');
    expect(html.indexOf('list-set')).toBeGreaterThan(html.indexOf('list-items'));
    const local = shoppingListHtml(list, { display: { units: 'symbol', fractions: 'ascii', range: 'dash' }, otherRecipes: 'Autres recettes', uses: false, optionalSet: 'facultatif : tout ou rien' });
    expect(local).toContain('<span class="list-set-note"> — facultatif : tout ou rien</span>');
  });

  it('keeps sets of several recipes apart, each naming its recipe, never summed together', () => {
    const pie = source('Pie', '## Glaze — optional\n\n' + step(3, 'Brush', ['10 g butter', '1 egg']) + step(2, 'Bake', ['50 g butter', '[glaze](#glaze--optional)']));
    const list = consolidate([TART, pie]);
    expect(list.sets?.map((s) => `${s.source}: ${s.name}`)).toEqual(['Tart: Glaze', 'Tart: Crumble', 'Pie: Glaze']);
    expect(amounts(find(list.items, 'butter'))).toEqual(['150 g']);
    expect(amounts(find(set(list, 'Glaze')!.items, 'butter'))).toEqual(['15 g']);
    expect(amounts(find(list.sets![2].items, 'butter'))).toEqual(['10 g']);
    const text = formatListText(list);
    expect(text).toContain('Glaze, for Tart — optional, all or none');
    expect(text).toContain('Glaze, for Pie — optional, all or none');
  });

  it('makes no set of one item: it is an optional item among what is needed', () => {
    const toast = (rest: string[]) => source('Salad', '## Toppings\n\n### Walnuts\n\n' + step(4, 'Toast the walnuts — optional', ['50 g walnut halves']) + step(2, 'Dress', ['[toppings](#toppings)', ...rest, '200 g leaves']));
    const alone = consolidate([toast([])]);
    expect('sets' in alone).toBe(false);
    expect([amounts(find(alone.items, 'walnut halves')), find(alone.items, 'walnut halves')?.optional]).toEqual([['50 g'], true]);
    expect(formatListText(alone)).toContain('50 g   walnut halves (optional)\n');
    // One line that needs it makes it needed, as for any optional line: the amounts are totaled.
    const both = consolidate([toast(['20 g walnut halves'])]);
    expect('sets' in both).toBe(false);
    expect([amounts(find(both.items, 'walnut halves')), find(both.items, 'walnut halves')?.optional]).toEqual([['70 g'], false]);
  });

  it('takes a nested optional heading into the outer set, its lines optional within it', () => {
    const bowl = source('Bowl', '## Toppings — optional\n\n### Pickles\n\n' + step(4, 'Slice', ['1 red onion']) + '### Herbs — optional\n\n' + step(4, 'Chop', ['1 bunch parsley']) + step(2, 'Build', ['200 g rice', '[toppings](#toppings--optional)']));
    const list = consolidate([bowl]);
    expect(list.sets?.map((s) => [s.name, s.items.map((i) => [i.item, i.optional])])).toEqual([
      ['Toppings', [['red onion', false], ['parsley', true]]],
    ]);
  });

  it('leaves an optional step inside a Choose branch to the branch, its lines optional within it', () => {
    const eggs = source('Eggs', '## Finish\n\n> **Choose** — one.\n\n' + step(3, 'Peel', ['4 eggs']) + '### Devilled\n\n' + step(4, 'Devil the yolks — optional', ['2 tbsp mayonnaise', '1 tsp capers']) + step(4, 'Fill', ['1 pinch paprika']));
    const list = consolidate([eggs]);
    expect(list.items).toEqual([]);
    expect(list.sets?.map((s) => [s.name, s.branch?.name, s.items.map((i) => [i.item, i.optional])])).toEqual([
      ['Finish', 'Peel', [['eggs', false]]],
      ['Finish', 'Devilled', [['mayonnaise', true], ['capers', true], ['paprika', false]]],
    ]);
  });

  it('keeps another recipe used inside a set in the set, said to be another recipe', () => {
    const plate = source('Plate', '## Relish — optional\n\n' + step(3, 'Spoon', ['80 g [chutney](../chutney/)', '1 tsp mustard seeds']) + step(2, 'Serve', ['200 g cheese', '[relish](#relish--optional)', '1 [crackers](../crackers/)']));
    const list = consolidate([plate]);
    expect(list.recipes.map((r) => r.label)).toEqual(['crackers']);
    expect(list.sets?.[0].recipes.map((r) => r.label)).toEqual(['chutney']);
    const text = formatListText(list);
    expect(text).toContain('Other recipes:\n1      crackers\n');
    expect(text).toContain('Relish — optional, all or none\n1 tsp  mustard seeds\n80 g   chutney (another recipe)\n');
    expect(formatListMarkdown(list)).toContain('- [ ] 80 g [chutney](../chutney/) (another recipe)');
  });

  it('is absent when nothing is designated optional, and sorted within itself with --sort', () => {
    const plain = consolidate([source('Plain', step(2, 'Mix', ['1 egg']))]);
    expect('sets' in plain).toBe(false);
    const sorted = sortList(consolidate([TART]));
    expect(set(sorted, 'Glaze')!.items.map((i) => i.item)).toEqual(['apricot jam', 'butter', 'lemon zest', 'water']);
    expect(set(sorted, 'Crumble')!.items.map((i) => i.item)).toEqual(['butter', 'oats']);
  });
});
