import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { renderCardParts } from '../../src/card/index.ts';
import { columnProperties, columnWidths, textWidth } from '../../src/card/columns.ts';
import { loadTheme } from '../../src/card/node.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const recipe = (source: string) => parseRecipe(source, { units });

/** Three parts, each its own ingredient table when paired: "g", "pinch" and "large". */
const PARTS = `---
etna: 1
form: traditional
---

# Three Tables

## Ingredients

### Dough

- 500 g flour
- 1 pinch salt

### Filling

- 2 large eggs
- 1 1/2 to 2 1/2 cups milk

## Directions

### Dough

1. Mix the flour and salt.

### Filling

1. Whisk the eggs into the milk.
`;

const property = (css: string, name: string): number | null => {
  const m = css.match(new RegExp(`--${name}: ([0-9.]+)ch;`));
  return m ? Number(m[1]) : null;
};

describe('ingredient columns', () => {
  it('estimates wider text wider', () => {
    expect(textWidth('g')).toBeLessThan(textWidth('tbsp'));
    expect(textWidth('tbsp')).toBeLessThan(textWidth('pinch'));
    expect(textWidth('pinch')).toBeLessThan(textWidth('large') + 0.5);
    expect(textWidth('12')).toBe(2);
  });

  it('finds the widest quantity and unit in a card', () => {
    const html =
      '<table class="ingr-table"><tbody class="ingr-group"><tr class="ingr"><td class="ingr-qty">500</td><td class="ingr-unit">g</td><td class="ingr-item">flour</td></tr></tbody></table>' +
      '<table class="ingr-table"><tbody class="ingr-group"><tr class="ingr"><td class="ingr-qty">1</td><td class="ingr-unit">pinch</td><td class="ingr-item">salt</td></tr>' +
      '<tr class="ingr"><td class="ingr-qty"></td><td class="ingr-unit"></td><td class="ingr-item">pepper</td></tr></tbody></table>';
    expect(columnWidths(html)).toEqual({ qty: 3, unit: textWidth('pinch') });
    expect(columnWidths('<p>no table</p>')).toEqual({ qty: null, unit: null });
    expect(columnProperties('<p>no table</p>')).toBe('');
  });

  it('sets one width for every table on the card, from the widest unit there', () => {
    for (const name of ['mise', 'folio', 'grid']) {
      const { html, css } = renderCardParts(recipe(PARTS), loadTheme(name), { parts: 'paired' });
      // Each part is its own table, and every unit printed is in the measurement.
      expect(html.split('<table class="ingr-table">').length - 1).toBe(2);
      for (const unit of [name === 'folio' ? 'grams' : 'g', 'pinch', 'large']) expect(html).toContain(`<td class="ingr-unit">${unit}</td>`);
      const unit = property(css, 'ingr-unit-width');
      const qty = property(css, 'ingr-qty-width');
      // "pinch" and "large" are the widest units: the column fits them, for every table alike.
      expect(unit).toBeGreaterThanOrEqual(textWidth('large'));
      expect(unit).toBeGreaterThanOrEqual(textWidth('pinch'));
      expect(qty).toBeGreaterThanOrEqual(textWidth('1 ½–2 ½'));
      // Declared once, on :root, ahead of the core stylesheet and the theme that reads it.
      const root = css.indexOf(':root {');
      const at = css.indexOf('--ingr-unit-width');
      expect(root).toBeGreaterThanOrEqual(0);
      expect(at).toBeGreaterThan(root);
      expect(at).toBeLessThan(css.indexOf('}', root));
      expect(css).toContain('var(--ingr-unit-width');
    }
  });

  it('leaves the properties out when the card prints no units', () => {
    const { css } = renderCardParts(recipe('---\netna: 1\nform: traditional\n---\n\n# Plain\n\n## Ingredients\n\n- salt\n\n## Directions\n\n1. Salt.\n'), loadTheme('mise'));
    expect(css).not.toContain('--ingr-unit-width:');
    expect(css).not.toContain('--ingr-qty-width:');
  });

  it('every card theme with ingredient columns reads both widths', () => {
    for (const name of ['mise', 'folio', 'grid', 'galley', 'countertop', 'binder']) {
      const { css } = renderCardParts(recipe(PARTS), loadTheme(name));
      expect(css, name).toContain('var(--ingr-unit-width');
      expect(css, name).toContain('var(--ingr-qty-width');
    }
  });
});
