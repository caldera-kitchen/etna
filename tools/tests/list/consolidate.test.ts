import { describe, expect, it } from 'vitest';
import { formatQuantity, parseQuantity, parseRecipe, type Quantity } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { consolidate, ingredientLines, itemKey, sortList, type Amount, type ListItem, type ShoppingList } from '../../src/list/index.ts';
import { addRanges, rangeOf, toQuantity } from '../../src/list/rational.ts';

const units = loadUnits();

/** A structured recipe from `## heading` → bullet lines. */
function structured(title: string, steps: Record<string, string[]>, preamble: string[] = []): string {
  const body = Object.entries(steps)
    .map(([h, lines]) => `## ${h}\n\n${lines.map((l) => `- ${l}`).join('\n')}${lines.length ? '\n\n' : ''}Do it.`)
    .join('\n\n');
  const pre = preamble.length ? `${preamble.map((l) => `- ${l}`).join('\n')}\n\n` : '';
  return `---\netna: 1\n---\n\n# ${title}\n\n${pre}${body}\n`;
}

function traditional(title: string, groups: Record<string, string[]>): string {
  const body = Object.entries(groups)
    .map(([label, lines]) => `${label ? `**${label}**\n\n` : ''}${lines.map((l) => `- ${l}`).join('\n')}`)
    .join('\n\n');
  return `---\netna: 1\nform: traditional\n---\n\n# ${title}\n\n## Ingredients\n\n${body}\n\n## Directions\n\n1. Cook.\n`;
}

const src = (id: string, source: string) => {
  const recipe = parseRecipe(source, { units });
  return { id, title: recipe.title?.text ?? id, recipe };
};

const list1 = (source: string) => consolidate([src('r', source)]);
const find = (list: ShoppingList, item: string): ListItem => {
  const found = list.items.find((i) => itemKey(i.item) === itemKey(item));
  if (!found) throw new Error(`no item ${item}`);
  return found;
};
const amountText = (a: Amount) => `${a.quantity ? formatQuantity(a.quantity) : 'some'}${a.unit ? ` ${a.unit.name}` : ''}`;
const amounts = (item: ListItem) => item.amounts.map(amountText);
/** An item's notes, each led by the amounts of the lines that carry it when not every line does. */
const notes = (item: ListItem) => item.notes.map((n) => (n.amounts.length === 0 ? n.text : `${n.amounts.map(amountText).join(' + ')}: ${n.text}`));

const sum = (...qs: string[]): Quantity => {
  const ranges = qs.map((q) => rangeOf(parseQuantity(q)!.quantity));
  return toQuantity(ranges.reduce(addRanges));
};

describe('exact arithmetic', () => {
  it.each([
    [['1/2', '1/3'], '5/6', 'fraction'],
    [['1 1/2', '1/2'], '2', 'integer'],
    [['1 1/2', '3/4'], '2 1/4', 'mixed'],
    [['1.5', '1/2'], '2', 'integer'],
    [['0.75', '1.4'], '2.15', 'decimal'],
    [['0.1', '0.2'], '0.3', 'decimal'],
    [['1.4', '1.4'], '2.8', 'decimal'],
    [['2-3', '1'], '3-4', 'integer'],
    [['1/2-1', '1/4'], '3/4-1 1/4', 'fraction'],
    [['½', '1½'], '2', 'integer'],
    [['1,000', '250'], '1250', 'integer'],
    [['.5', '1'], '1.5', 'decimal'],
    [['0.5', '1/3'], '5/6', 'fraction'], // a non-terminating decimal stays exact as a fraction
  ])('%j → %s', (inputs, expected, style) => {
    const q = sum(...inputs);
    expect(formatQuantity(q)).toBe(expected);
    expect(q.min.style).toBe(style);
    expect(q.raw).toBe(expected);
  });

  it('formats a summed fraction with unicode glyphs on request', () => {
    expect(formatQuantity(sum('1', '1/2'), { fractions: 'unicode' })).toBe('1 ½');
  });
});

describe('consolidate: identity and totals', () => {
  it('totals the same item in the same unit across steps', () => {
    const list = list1(structured('T', { One: ['240 g heavy cream', '1 g salt'], Two: ['240 g Heavy  Cream, cold'] }));
    const cream = find(list, 'heavy cream');
    expect(cream.item).toBe('heavy cream');
    expect(amounts(cream)).toEqual(['480 gram']);
    expect(cream.amounts[0].lines).toBe(2);
    expect(notes(cream)).toEqual(['240 gram: cold']);
    expect(cream.uses).toEqual([
      { source: 'r', step: 'One' },
      { source: 'r', step: 'Two' },
    ]);
    expect(list.items.map((i) => i.item)).toEqual(['heavy cream', 'salt']);
  });

  it('totals weights in grams and volumes by unit size, but never weight with volume without a table', () => {
    const list = list1(structured('T', { A: ['113 g butter', '2 tbsp butter', '1 kg butter', '1 tbsp butter'] }));
    expect(amounts(find(list, 'butter'))).toEqual(['1113 gram', '3 tablespoon']);
    expect(list.unconverted).toEqual([]);
  });

  it('does not stem or fuzzy-match qualified names', () => {
    const list = list1(structured('T', { A: ['50 g butter', '50 g unsalted butter', '10 g salted butter', '1 g sugar', '2 g brown sugar', '5 g water', '5 g boiling water'] }));
    expect(list.items.map((i) => i.item)).toEqual(['butter', 'unsalted butter', 'salted butter', 'sugar', 'brown sugar', 'water', 'boiling water']);
  });

  it('treats size, piece, container and approximate units like any other unit', () => {
    const list = list1(
      structured('T', {
        A: ['2 large eggs', '1 large eggs', '2 eggs', '1 clove garlic', '2 cloves garlic', '1 can tomatoes', '1 pinch salt', '2 pinches salt'],
      }),
    );
    expect(amounts(find(list, 'eggs'))).toEqual(['3 large', '2']);
    expect(amounts(find(list, 'garlic'))).toEqual(['3 clove']);
    expect(amounts(find(list, 'tomatoes'))).toEqual(['1 can']);
    expect(amounts(find(list, 'salt'))).toEqual(['3 pinch']);
  });

  it('totals unitless counts with each other', () => {
    expect(amounts(find(list1(structured('T', { A: ['2 eggs'], B: ['1 eggs'] })), 'eggs'))).toEqual(['3']);
  });

  it('keeps an unquantified use next to the total', () => {
    const list = list1(structured('T', { A: ['salt', '1 g salt'], B: ['2 g salt', 'salt, to taste'], C: ['flour, for dusting'] }));
    const salt = find(list, 'salt');
    expect(amounts(salt)).toEqual(['3 gram', 'some']);
    expect(salt.amounts.map((a) => a.lines)).toEqual([2, 2]);
    expect(notes(salt)).toEqual(['some: to taste']);
    expect(amounts(find(list, 'flour'))).toEqual(['some']);
  });

  it('keeps the quantity as written when only one line went in', () => {
    const q = find(list1(structured('T', { A: ['1½ cups milk'] })), 'milk').amounts[0].quantity!;
    expect(q.raw).toBe('1½');
    expect(q.min.unicode).toBe(true);
  });

  it('adds ranges end to end', () => {
    expect(amounts(find(list1(structured('T', { A: ['2-3 cups flour'], B: ['1 cup flour'] })), 'flour'))).toEqual(['3-4 cup']);
  });

  it('collects distinct notes in order, case-insensitively', () => {
    const list = list1(structured('T', { A: ['56 g butter, softened', '56 g butter, Softened', '10 g butter, King Arthur', '1 g butter'] }));
    expect(notes(find(list, 'butter'))).toEqual(['56 gram + 56 gram: softened', '10 gram: King Arthur']);
  });

  it('prints once a note every line carries, and leads one only some lines carry by their amounts (SPEC §8)', () => {
    const every = list1(structured('T', { A: ['56 g butter, softened'], B: ['20 g butter, Softened'] }));
    expect(notes(find(every, 'butter'))).toEqual(['softened']);
    const some = list1(structured('T', { A: ['40 g whole milk, room temperature'], B: ['515 g whole milk'] }));
    expect(amounts(find(some, 'whole milk'))).toEqual(['555 gram']);
    expect(notes(find(some, 'whole milk'))).toEqual(['40 gram: room temperature']);
    const two = list1(structured('T', { A: ['100 g butter, softened'], B: ['50 g butter, melted'], C: ['butter, softened'] }));
    expect(notes(find(two, 'butter'))).toEqual(['100 gram + some: softened', '50 gram: melted']);
  });

  it('counts a line whose note is only "optional" as a line without a note', () => {
    const list = list1(structured('T', { A: ['10 g sprinkles, optional', '5 g sprinkles, rainbow'] }));
    expect(notes(find(list, 'sprinkles'))).toEqual(['5 gram: rainbow']);
  });
});

describe('consolidate: references', () => {
  it('skips internal references and lists other recipes apart', () => {
    const list = list1(
      structured('T', {
        Yudane: ['10 g flour'],
        Mix: ['[yudane](#yudane)', '80 g [mango chutney](../mango-chutney/), warm', '1 recipe pie dough', '5 g flour'],
      }),
    );
    expect(list.items.map((i) => i.item)).toEqual(['flour']);
    expect(amounts(list.items[0])).toEqual(['15 gram']);
    expect(list.recipes).toHaveLength(2);
    expect(list.recipes[0]).toMatchObject({ label: 'mango chutney', target: '../mango-chutney/', source: 'r', note: 'warm', step: 'Mix' });
    expect(list.recipes[0].unit?.name).toBe('gram');
    expect(formatQuantity(list.recipes[0].quantity!)).toBe('80');
    expect(list.recipes[1]).toMatchObject({ label: 'pie dough', target: null, source: 'r', step: 'Mix' });
    expect(list.recipes[1].unit?.kind).toBe('recipe');
  });
});

describe('consolidate: forms and sources', () => {
  it('walks every group of a traditional recipe, the step being the part it is listed under', () => {
    const list = list1(traditional('Cake', { '': ['2 cups flour', '1 tsp salt'], Frosting: ['1 cup sugar', '1/2 cup flour'] }));
    expect(list.items.map((i) => i.item)).toEqual(['flour', 'salt', 'sugar']);
    expect(amounts(find(list, 'flour'))).toEqual(['2 1/2 cup']);
    expect(find(list, 'flour').uses).toEqual([
      { source: 'r', step: null },
      { source: 'r', step: 'Frosting' },
    ]);
    expect(find(list, 'sugar').uses).toEqual([{ source: 'r', step: 'Frosting' }]);
  });

  it('names the part of a traditional recipe written with part headings', () => {
    const source = '---\netna: 1\nform: traditional\n---\n\n# Test Beans\n\n## Ingredients\n\n### Beans\n\n- 100 g beans\n\n### Sauce\n\n- 28 g oil\n\n## Directions\n\n### Beans\n\n1. Soak.\n';
    const recipe = parseRecipe(source, { units });
    expect(ingredientLines(recipe).map((l) => [l.line.raw, l.step])).toEqual([
      ['100 g beans', 'Beans'],
      ['28 g oil', 'Sauce'],
    ]);
  });

  it('walks nested components, component-level bullets and the preamble', () => {
    const source = `# T\n\n- 1 g preamble salt\n\n## Dough\n\n- 2 g loose yeast\n\n### Mix\n\n- 100 g flour\n\nMix.\n\n### Knead\n\n#### Fold\n\n- 50 g flour\n\nFold.\n`;
    const recipe = parseRecipe(source, { units });
    expect(ingredientLines(recipe).map((l) => [l.line.raw, l.step])).toEqual([
      ['1 g preamble salt', null],
      ['2 g loose yeast', 'Dough'],
      ['100 g flour', 'Mix'],
      ['50 g flour', 'Fold'],
    ]);
    const list = consolidate([{ id: 'r', title: 'T', recipe }]);
    expect(amounts(find(list, 'flour'))).toEqual(['150 gram']);
  });

  it('totals across several recipes and records where each came from', () => {
    const a = src('a', structured('A', { Mix: ['1 1/2 cups milk', '2 large eggs'] }));
    const b = src('b', traditional('B', { '': ['1/2 cup milk', '1 large eggs', 'pepper'] }));
    const list = consolidate([a, b]);
    expect(list.sources).toEqual([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]);
    expect(list.items.map((i) => i.item)).toEqual(['milk', 'eggs', 'pepper']);
    expect(amounts(find(list, 'milk'))).toEqual(['2 cup']);
    expect(amounts(find(list, 'eggs'))).toEqual(['3 large']);
    expect(find(list, 'milk').uses).toEqual([
      { source: 'a', step: 'Mix' },
      { source: 'b', step: null },
    ]);
  });

  it('keeps first-appearance order; sortList sorts alphabetically without mutating', () => {
    const list = list1(structured('T', { A: ['1 g zest', '1 g Apple', '1 g banana', '1 g apple butter'] }));
    expect(list.items.map((i) => i.item)).toEqual(['zest', 'Apple', 'banana', 'apple butter']);
    expect(sortList(list).items.map((i) => i.item)).toEqual(['Apple', 'apple butter', 'banana', 'zest']);
    expect(list.items[0].item).toBe('zest');
  });

  it('gives an empty list for no sources', () => {
    expect(consolidate([])).toEqual({ sources: [], items: [], recipes: [], unconverted: [] });
  });
});

describe('the Notes section of a structured recipe', () => {
  it('adds nothing to the list, though its bullets look like ingredients', () => {
    const recipe = parseRecipe(`${structured('Shake', { Blend: ['300 g milk'] })}\n## Notes\n\n- 100 g oat milk works too\n`, { units });
    expect(ingredientLines(recipe).map((l) => l.line.raw)).toEqual(['300 g milk']);
  });
});
