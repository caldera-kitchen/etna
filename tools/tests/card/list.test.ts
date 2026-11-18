// The `list` layout (a shopping list on a card) and the bundled `shopping` theme.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { checkTheme, parseTheme, recipeShoppingList, renderCardParts, shoppingListHtml } from '../../src/card/index.ts';
import { loadTheme, readThemeFiles, THEMES_DIR } from '../../src/card/node.ts';
import { consolidate } from '../../src/list/index.ts';
import { ETNA_ROOT, findRecipes, loadUnits, readRecipe } from '../../src/node/files.ts';

const units = loadUnits();
const count = (text: string, needle: string) => text.split(needle).length - 1;

const STRUCTURED = `---
etna: 1
yield: 6 buns
---

# Buns

## Sponge

- 105 g bread flour, King Arthur
- 1 egg

Stir.

## Dough

- 595 g bread flour
- 2 eggs, beaten
- 1 pinch kosher salt
- 1.5 g kosher salt
- [stock](../stock/)
- [sponge](#sponge)

Knead.

## Finish

- flour, for dusting
- 1 1/2 tbsp butter

Shape.
`;

const LIST_FILES = (options = '') => ({
  'theme.yaml': `name: L\noptions:\n  layout: list\n${options}`,
  'card.html': '<article class="card">{{title}}<div class="ingredients">{{ingredients}}</div>{{#directions}}<div class="d">{{directions}}</div>{{/directions}}{{#components}}<div class="c">{{components}}</div>{{/components}}</article>',
  'card.css': '',
});

describe('layout: list', () => {
  const recipe = parseRecipe(STRUCTURED, { units });
  const theme = parseTheme(LIST_FILES());

  it('prints one consolidated table and no directions or components', () => {
    const { html } = renderCardParts(recipe, theme);
    expect(html).toContain('<table class="ingr-table list-table">');
    expect(html).not.toContain('class="d"');
    expect(html).not.toContain('class="c"');
    expect(html).not.toContain('direction');
    expect(html).not.toContain('Knead.');
    // bread flour, egg, kosher salt, flour, butter + the stock recipe; the internal reference is not shopping.
    expect(count(html, '<tr class="ingr')).toBe(6);
    expect(html).not.toContain('sponge');
  });

  it('totals amounts and keeps the ingredient table columns, after a checkbox', () => {
    const { html } = renderCardParts(recipe, theme);
    expect(html).toContain(
      '<tr class="ingr list-item"><td class="list-check" aria-hidden="true"><span class="list-box"></span></td>' +
        '<td class="ingr-qty">700</td><td class="ingr-unit">grams</td>' +
        '<td class="ingr-item">bread flour<span class="ingr-note">, 105 grams: King Arthur</span></td></tr>',
    );
    // Singular and plural merged, named for the total.
    expect(html).toContain('<td class="ingr-qty">3</td><td class="ingr-unit"></td><td class="ingr-item">eggs<span class="ingr-note">, 2: beaten</span></td>');
    // Never quantified: empty amount cells.
    expect(html).toContain('<td class="ingr-qty"></td><td class="ingr-unit"></td><td class="ingr-item">flour<span class="ingr-note">, for dusting</span></td>');
    // No form control: a box drawn in CSS.
    expect(html).not.toMatch(/<input|<form/);
  });

  it('stacks two amounts in different units, the second led by +', () => {
    const { html } = renderCardParts(recipe, theme, { display: { units: 'symbol' } });
    expect(html).toContain(
      '<td class="ingr-qty"><span class="list-amount">1</span><span class="list-amount"><span class="list-plus">+ </span>1.5</span></td>' +
        '<td class="ingr-unit"><span class="list-amount">pinch</span><span class="list-amount">g</span></td>' +
        '<td class="ingr-item">kosher salt</td>',
    );
  });

  it('follows the display options', () => {
    expect(renderCardParts(recipe, theme).html).toContain('<td class="ingr-qty">1 ½</td><td class="ingr-unit">tablespoons</td>');
    const ascii = renderCardParts(recipe, theme, { display: { fractions: 'ascii', units: 'symbol' } }).html;
    expect(ascii).toContain('<td class="ingr-qty">1 1/2</td><td class="ingr-unit">tbsp</td>');
  });

  it('puts other recipes in their own labeled group', () => {
    const { html } = renderCardParts(recipe, theme);
    expect(html).toContain(
      '<tbody class="ingr-group list-recipes"><tr><th class="ingr-group-label" colspan="4" scope="rowgroup">Other recipes</th></tr>' +
        '<tr class="ingr ingr-reference list-item">',
    );
    expect(html).toContain('<span class="ingr-ref ingr-ref-external" data-target="../stock/">stock</span>');
    const relabeled = renderCardParts(recipe, theme, { labels: { 'other-recipes': 'Andere Rezepte' } }).html;
    expect(relabeled).toContain('>Andere Rezepte</th>');
  });

  it('prints the steps that use each item only when the uses slot is on', () => {
    expect(renderCardParts(recipe, theme).html).not.toContain('list-uses');
    const on = parseTheme(LIST_FILES('  slots:\n    uses: true\n'));
    const { html } = renderCardParts(recipe, on);
    expect(html).toContain('bread flour<span class="ingr-note">, 105 grams: King Arthur</span><span class="list-uses">Sponge, Dough</span>');
    expect(renderCardParts(recipe, theme, { slots: { uses: true } }).html).toContain('<span class="list-uses">Finish</span>');
  });

  it('works for a traditional recipe too', () => {
    const traditional = parseRecipe(
      '---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n- 1 g salt\n\n**Garnish**\n\n- 2 g salt\n- pepper\n\n## Directions\n\n1. Mix.\n',
      { units },
    );
    const { html } = renderCardParts(traditional, theme);
    expect(count(html, '<tr class="ingr')).toBe(2);
    expect(html).toContain('<td class="ingr-qty">3</td><td class="ingr-unit">grams</td><td class="ingr-item">salt</td>');
    expect(html).not.toContain('Mix.');
    // The other layouts are unchanged by the theme's choice: a caller may still ask for one.
    expect(renderCardParts(traditional, theme, { layout: 'hoisted' }).html).toContain('direction-list');
  });

  it('keeps the list-to-HTML step separate from building the list, for several recipes later', () => {
    const other = parseRecipe('---\netna: 1\n---\n\n# Other\n\n## Mix\n\n- 5 g bread flour\n\nMix.\n', { units });
    const list = consolidate([
      { id: 'buns', title: 'Buns', recipe },
      { id: 'other', title: 'Other', recipe: other },
    ]);
    const html = shoppingListHtml(list, { display: { units: 'symbol', fractions: 'unicode', range: 'dash' }, otherRecipes: 'Other recipes', uses: true });
    expect(html).toContain('<td class="ingr-qty">705</td><td class="ingr-unit">g</td>');
    expect(html).toContain('<span class="list-uses">Buns (Sponge, Dough); Other (Mix)</span>');
    expect(recipeShoppingList(recipe).items.map((i) => i.item)).toEqual(['bread flour', 'eggs', 'kosher salt', 'flour', 'butter']);
    expect(shoppingListHtml({ sources: [], items: [], recipes: [], unconverted: [] } as never, { display: { units: 'symbol', fractions: 'unicode', range: 'dash' }, otherRecipes: 'x', uses: false })).toBe('');
  });

  it('escapes what the recipe wrote', () => {
    const evil = parseRecipe('---\netna: 1\n---\n\n# E\n\n## Mix\n\n- 1 g <b>salt</b>, "x"\n- [r](javascript:alert(1))\n\nMix.\n', { units });
    const { html } = renderCardParts(evil, theme);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;salt&lt;/b&gt;');
    expect(html).not.toContain('javascript:');
  });
});

describe('the checker and list themes', () => {
  it('does not demand a directions slot from a list theme, and counts its rows right', () => {
    const files = { ...LIST_FILES(), 'card.html': '<article class="card">{{title}}{{ingredients}}</article>', 'README.md': '# L\n' };
    const report = checkTheme({ ...files, 'theme.yaml': `etna-theme: 1\nkind: card\ndescription: x\n${files['theme.yaml']}` }, { units });
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).not.toContain('components');
    // The same skeleton in a hoisted theme is missing its directions.
    const hoisted = checkTheme({ ...files, 'theme.yaml': 'name: H\n' }, { units });
    expect(hoisted.errors.join('\n')).toContain('{{directions}} is missing');
  });
});

describe('the shopping theme', () => {
  const dir = join(THEMES_DIR, 'shopping');

  it('passes etna theme check with no errors and no warnings', () => {
    const report = checkTheme(readThemeFiles(dir), { units });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('is a letter list with the same fonts as Mise', () => {
    const theme = loadTheme('shopping');
    expect(theme.name).toBe('Shopping list');
    expect(theme.layout).toBe('list');
    expect((theme.manifest.page as { size: string }).size).toBe('letter');
    expect(theme.webfonts).toEqual(loadTheme('mise').webfonts);
  });

  it('prints the title, the yield and the list, and no directions', () => {
    const doc = renderCardParts(readRecipe(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md')), loadTheme('shopping')).html;
    expect(doc).toContain('<p class="card-kicker">Shopping list</p>');
    expect(doc).toContain('<h1 class="card-title">Next-Day Soft Cinnamon Rolls</h1>');
    expect(doc).toMatch(/<span class="meta-label">Makes<\/span> 12 rolls/);
    expect(doc).toContain('<td class="ingr-qty">700</td><td class="ingr-unit">g</td><td class="ingr-item">bread flour');
    expect(doc).not.toContain('direction-list');
    expect(doc).not.toContain('class="step');
  });

  it('renders every recipe that ships with each ingredient once, an optional set\'s too', () => {
    const theme = loadTheme('shopping');
    for (const example of findRecipes(join(ETNA_ROOT, 'cookbook')).filter((r) => r.file !== null)) {
      const recipe = readRecipe(example.file!);
      const list = recipeShoppingList(recipe);
      const { html } = renderCardParts(recipe, theme);
      const sets = (list.sets ?? []).reduce((n, s) => n + s.items.length, 0);
      expect(count(html, '<tr class="ingr'), example.slug).toBe(list.items.length + list.recipes.length + sets);
    }
  });
});
