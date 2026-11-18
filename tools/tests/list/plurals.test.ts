import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { consolidate, formatListMarkdown, type ListItem, type ShoppingList } from '../../src/list/index.ts';
import { isPluralOf, matchCase, pluralMerges, pluralsOf } from '../../src/list/inflect.ts';

const units = loadUnits();

describe('inflector', () => {
  it.each([
    ['egg', 'eggs'],
    ['yolk', 'yolks'],
    ['carrot', 'carrots'],
    ['tomato', 'tomatoes'],
    ['potato', 'potatoes'],
    ['avocado', 'avocados'],
    ['cherry', 'cherries'],
    ['berry', 'berries'],
    ['turkey', 'turkeys'],
    ['peach', 'peaches'],
    ['radish', 'radishes'],
    ['box', 'boxes'],
    ['leaf', 'leaves'],
    ['loaf', 'loaves'],
    ['half', 'halves'],
    ['knife', 'knives'],
    ['jalapeño', 'jalapeños'],
  ])('%s → %s', (singular, plural) => {
    expect(isPluralOf(singular, plural)).toBe(true);
  });

  it('rejects wrong plurals', () => {
    expect(isPluralOf('cherry', 'cherrys')).toBe(false);
    expect(isPluralOf('leaf', 'leafs')).toBe(false);
    expect(isPluralOf('peach', 'peachs')).toBe(false);
    expect(isPluralOf('egg', 'egg')).toBe(false);
  });

  it.each(['rice', 'molasses', 'asparagus', 'hummus', 'couscous', 'swiss', 'grits', 'fish'])('never inflects %s', (word) => {
    expect(pluralsOf(word)).toEqual([]);
  });

  it('never treats a mass noun ending in s as a plural', () => {
    expect(isPluralOf('molasse', 'molasses')).toBe(false);
    expect(isPluralOf('hummu', 'hummus')).toBe(false);
    expect(pluralMerges(['molasse', 'molasses', 'grit', 'grits'])).toEqual(new Map());
  });

  it('keeps apart pairs that name different things', () => {
    expect(pluralMerges(['pepper', 'peppers', 'green', 'greens', 'bitter', 'bitters'])).toEqual(new Map());
  });

  it('merges only when both forms occur, and only on the last word', () => {
    expect(pluralMerges(['egg', 'eggs', 'egg yolk', 'egg yolks', 'tomatoes', 'eggs benedict'])).toEqual(
      new Map([
        ['eggs', 'egg'],
        ['egg yolks', 'egg yolk'],
      ]),
    );
    expect(pluralMerges(['molasses'])).toEqual(new Map());
  });

  it('matches letter case', () => {
    expect(matchCase('eggs', 'Egg')).toBe('Eggs');
    expect(matchCase('eggs', 'EGG')).toBe('EGGS');
    expect(matchCase('eggs', 'egg')).toBe('eggs');
  });
});

const list = (...lines: string[][]): ShoppingList => {
  const body = lines.map((ls, i) => `## Step ${i + 1}\n\n${ls.map((l) => `- ${l}`).join('\n')}\n\nGo.`).join('\n\n');
  const recipe = parseRecipe(`# T\n\n${body}\n`, { units });
  return consolidate([{ id: 't', title: 'T', recipe }]);
};
const only = (l: ShoppingList): ListItem => {
  expect(l.items).toHaveLength(1);
  return l.items[0];
};

describe('merging singular and plural', () => {
  it('merges egg and eggs, totaling the count', () => {
    const item = only(list(['2 eggs'], ['1 egg, beaten']));
    expect(item.item).toBe('eggs');
    expect(item.forms).toEqual({ singular: 'egg', plural: 'eggs' });
    expect(item.amounts).toHaveLength(1);
    expect(item.amounts[0].lines).toBe(2);
    expect(item.notes.map((n) => [n.text, n.amounts.map((a) => a.quantity?.raw)])).toEqual([['beaten', ['1']]]);
    expect(item.uses.map((u) => u.step)).toEqual(['Step 1', 'Step 2']);
  });

  it.each([
    [['1/2 egg', '1/2 eggs'], 'egg', '1 egg'],
    [['1 egg', '1 eggs'], 'eggs', '2 eggs'],
    [['1/4 egg', '1/4 eggs'], 'egg', '1/2 egg'],
    [['0.25 egg', '0.25 eggs'], 'eggs', '0.5 eggs'],
    [['1-2 egg', '1 eggs'], 'eggs', '2-3 eggs'],
    [['1/2 large egg', '1/2 large eggs'], 'egg', '1 large egg'],
    [['2 large egg', '1 large eggs'], 'eggs', '3 large eggs'],
  ])('%j → %s', (lines, name, text) => {
    const l = list(lines);
    expect(only(l).item).toBe(name);
    expect(formatListMarkdown(l)).toContain(`- [ ] ${text}\n`);
  });

  it('uses the plural with a mass unit when any line wrote it, else the form as written', () => {
    expect(only(list(['100 g carrot', '200 g carrots', '1 carrot'])).amounts.map((a) => a.name)).toEqual(['carrots', 'carrot']);
    // A count agrees with its total, whichever way the line was written.
    expect(only(list(['300 g carrot'], ['1 carrots'])).amounts.map((a) => a.name)).toEqual(['carrot', 'carrot']);
    // An unquantified use follows the same rule (and prints after the counted one).
    expect(only(list(['carrots'], ['1 carrot'])).amounts.map((a) => a.name)).toEqual(['carrot', 'carrots']);
  });

  it('names an item with several amounts in the plural', () => {
    const item = only(list(['1 large egg', '50 g eggs']));
    expect(item.item).toBe('eggs');
    expect(item.amounts.map((a) => a.name)).toEqual(['egg', 'eggs']);
  });

  it('merges on the last word only, and keeps qualified names apart', () => {
    const l = list(['1 egg yolk', '2 egg yolks', '1 egg', '50 g butter', '50 g unsalted butter', '1 cherry', '10 cherries', '2 bay leaves', '1 bay leaf']);
    expect(l.items.map((i) => i.item)).toEqual(['egg yolks', 'egg', 'butter', 'unsalted butter', 'cherries', 'bay leaves']);
  });

  it('keeps the letter case of the first spelling seen', () => {
    expect(only(list(['1 Large Egg', '2 large eggs'])).item).toBe('Eggs');
    expect(only(list(['2 Tomatoes', '1 tomato'])).item).toBe('Tomatoes');
  });

  it('leaves an item written only one way exactly as written', () => {
    expect(only(list(['1 eggs'])).item).toBe('eggs');
    expect(only(list(['1 eggs', '1 eggs'])).item).toBe('eggs');
    expect(only(list(['3 egg'])).item).toBe('egg');
    expect(only(list(['3 egg'])).forms).toBeNull();
    expect(only(list(['2 tbsp molasses'])).item).toBe('molasses');
  });

  it('keeps black pepper and peppers apart', () => {
    expect(list(['1 pepper', '2 peppers']).items).toHaveLength(2);
  });
});

describe('words that name an Object.prototype member', () => {
  it('are pluralized by the rules, not looked up on the prototype', () => {
    expect(pluralsOf('constructor')).toEqual(['constructors']);
    expect(isPluralOf('constructor', 'constructors')).toBe(true);
  });
});
