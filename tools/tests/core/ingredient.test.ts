import { describe, expect, it } from 'vitest';
import { canonicalUnit, longUnit, parseIngredientText } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (text: string) => parseIngredientText(text, units);
const shape = (text: string) => {
  const p = parse(text);
  return [p.quantity?.raw ?? null, p.unit?.def.name ?? null, p.item, p.note];
};

describe('parseIngredientText', () => {
  it.each([
    ['240 g heavy cream', ['240', 'gram', 'heavy cream', null]],
    ['150 g russet potato, peeled and small-diced', ['150', 'gram', 'russet potato', 'peeled and small-diced']],
    ['2 large eggs', ['2', 'large', 'eggs', null]],
    ['2 eggs', ['2', null, 'eggs', null]],
    ['2 eggs, large', ['2', null, 'eggs', 'large']],
    ['1 1/2 tablespoons olive oil', ['1 1/2', 'tablespoon', 'olive oil', null]],
    ['2 Tbsp. butter', ['2', 'tablespoon', 'butter', null]],
    ['1 small bag chips', ['1', 'small bag', 'chips', null]],
    ['2 small onions, diced', ['2', 'small', 'onions', 'diced']],
    ['2 cloves garlic, minced', ['2', 'clove', 'garlic', 'minced']],
    ['1 recipe Homemade Chicken Stock', ['1', 'recipe', 'Homemade Chicken Stock', null]],
    ['salt', [null, null, 'salt', null]],
    ['flour, for dusting', [null, null, 'flour', 'for dusting']],
    ['3 quarts ginger ale, (liters)', ['3', 'quart', 'ginger ale', '(liters)']],
    ['2 cups (4 oz., drained) bread', ['2', 'cup', '(4 oz., drained) bread', null]],
    ['4 bay leaves', ['4', null, 'bay leaves', null]],
    ['1 gallon milk', ['1', 'gallon', 'milk', null]],
  ])('%s', (text, expected) => {
    expect(shape(text)).toEqual(expected);
  });

  it('only looks for a unit after a quantity', () => {
    expect(shape('pinch sea salt')).toEqual([null, null, 'pinch sea salt', null]);
  });

  it('does not take a unit that is only the start of a word', () => {
    expect(shape('2 cans tomatoes')[1]).toBe('can');
    expect(shape('2 candied cherries')[1]).toBeNull();
    expect(shape('1 large onion')[1]).toBe('large');
    expect(shape('1 largemouth bass')[1]).toBeNull();
  });
});

describe('canonical unit spelling', () => {
  const canon = (text: string) => {
    const p = parse(text);
    return canonicalUnit(p.unit!.def, p.quantity);
  };
  it('uses the symbol when there is one, never pluralized', () => {
    expect(canon('240 grams cream')).toBe('g');
    expect(canon('2 tablespoons oil')).toBe('tbsp');
    expect(canon('1 pound butter')).toBe('lb');
  });
  it('makes word units agree with the quantity', () => {
    expect(canon('1 cloves garlic')).toBe('clove');
    expect(canon('2 clove garlic')).toBe('cloves');
    expect(canon('1/2 cups milk')).toBe('cup');
    expect(canon('1 1/2 cup milk')).toBe('cups');
    expect(canon('2-3 pinch salt')).toBe('pinches');
    expect(canon('2 large eggs')).toBe('large');
  });
  it('can write a symbol unit out for display', () => {
    const p = parse('240 g cream');
    expect(longUnit(p.unit!.def, p.quantity)).toBe('grams');
    const one = parse('1 tsp salt');
    expect(longUnit(one.unit!.def, one.quantity)).toBe('teaspoon');
  });
});

describe('unit sizes', () => {
  const def = (name: string) => units.find(name)!;
  it('gives every mass unit its grams and every volume unit its milliliters', () => {
    for (const u of units.units) {
      if (u.kind === 'mass') expect(u.grams, u.name).toBeGreaterThan(0);
      else expect(u.grams, u.name).toBeNull();
      if (u.kind === 'volume') expect(u.ml, u.name).toBeGreaterThan(0);
      else expect(u.ml, u.name).toBeNull();
    }
  });
  it('follows the kitchen convention for US volume units', () => {
    expect([def('tsp').ml, def('tbsp').ml, def('fl oz').ml, def('cup').ml, def('quart').ml]).toEqual([5, 15, 30, 240, 960]);
    expect(def('cup').ml! / def('tbsp').ml!).toBe(16);
    expect(def('oz').grams).toBeCloseTo(28.3495);
    expect(def('lb').grams! / def('oz').grams!).toBeCloseTo(16);
  });
});

describe('a remark after an em dash', () => {
  const full = (text: string) => {
    const p = parse(text);
    return [p.quantity?.raw ?? null, p.unit?.def.name ?? null, p.item, p.note, p.remark];
  };
  it.each([
    ['butter, melted', [null, null, 'butter', 'melted', null]],
    ['23.5 g Flour — 2%', ['23.5', 'gram', 'Flour', null, '2%']],
    ['611 g Water, 115°F — 52%', ['611', 'gram', 'Water', '115°F', '52%']],
    ['1 cup flour — about 120 g', ['1', 'cup', 'flour', null, 'about 120 g']],
    // The dash is looked for first: a remark may hold commas and dashes of its own.
    ['1 cup flour — about 120 g, sifted — or 125 g', ['1', 'cup', 'flour', null, 'about 120 g, sifted — or 125 g']],
    ['2 eggs, beaten — 100 g, without shells', ['2', null, 'eggs', 'beaten', '100 g, without shells']],
    // Only a spaced em dash: a hyphen, an en dash or an unspaced dash stays in the text.
    ['1 g salt - kosher', ['1', 'gram', 'salt - kosher', null, null]],
    ['1 g salt – kosher', ['1', 'gram', 'salt – kosher', null, null]],
    ['1 g pain—levain', ['1', 'gram', 'pain—levain', null, null]],
    ['1 g salt (kosher — fine)', ['1', 'gram', 'salt (kosher — fine)', null, null]],
    ['1 g salt —', ['1', 'gram', 'salt —', null, null]],
  ])('%s', (text, expected) => {
    expect(full(text)).toEqual(expected);
  });
});
