// A remark after ` — ` on an ingredient line (SPEC §6): kept apart from the prep note by the
// parser, printed after it by the card and the chart's `full` mode, and dropped by the
// chart's `name` mode and the shopping list. `fmt` only respaces it.

import { describe, expect, it } from 'vitest';
import { parseRecipe, type IngredientLine } from '../../src/core/index.ts';
import { renderCardParts } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { tableRows } from '../../src/dag/text.ts';
import { consolidate } from '../../src/list/index.ts';
import { formatRecipe } from '../../src/fmt/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const LINES = ['611 g Water, 115°F — 52%', '23.5 g Flour — 2%', '2 tbsp butter, melted', '[biga](../biga/), cold — 30%'];
const SOURCE = `---\netna: 1\nform: traditional\n---\n\n# Bread\n\n## Ingredients\n\n${LINES.map((l) => `- ${l}`).join('\n')}\n\n## Directions\n\n1. Mix.\n`;
const recipe = parseRecipe(SOURCE, { units });
const lines = recipe.traditional!.ingredients!.items[0].items as IngredientLine[];

describe('the remark after an em dash', () => {
  it('is a field of its own, on ingredients and references alike', () => {
    expect(lines.map((l) => [l.kind === 'ingredient' ? l.item : l.label, l.note, l.remark])).toEqual([
      ['Water', '115°F', '52%'],
      ['Flour', null, '2%'],
      ['butter', 'melted', null],
      ['biga', 'cold', '30%'],
    ]);
  });

  it('prints after the prep note on the card, in its own element', () => {
    const html = renderCardParts(recipe, loadTheme('binder')).html;
    expect(html).toContain('Water<span class="ingr-note">, 115°F</span><span class="ingr-remark"> — 52%</span>');
    expect(html).toContain('Flour<span class="ingr-remark"> — 2%</span>');
    expect(html).toContain('butter<span class="ingr-note">, melted</span></td>');
  });

  it('is dropped by the chart in name mode and kept in full mode', () => {
    expect(tableRows(lines, 5, 'name').map((r) => r.text)).toEqual(['Water', 'Flour', 'butter', 'biga']);
    expect(tableRows(lines, 5, 'full').map((r) => r.text)).toEqual(['Water, 115°F — 52%', 'Flour — 2%', 'butter, melted', 'biga, cold — 30%']);
  });

  it('is ignored by the shopping list', () => {
    const list = consolidate([{ id: 'r', title: 'Bread', recipe }]);
    expect(list.items.map((i) => [i.item, i.notes.map((n) => n.text)])).toEqual([
      ['Water', ['115°F']],
      ['Flour', []],
      ['butter', ['melted']],
    ]);
    expect(list.recipes.map((r) => [r.label, r.note])).toEqual([['biga', 'cold']]);
  });

  it('is left alone by fmt, apart from its spacing', () => {
    const out = formatRecipe(SOURCE.replace('— 52%', '—  52%,  by weight').replace('- 23.5 g', '- 23.5  g'), { units }).output;
    expect(out).toContain('- 611 g Water, 115°F — 52%, by weight\n');
    expect(out).toContain('- 23.5 g Flour — 2%\n');
    expect(formatRecipe(SOURCE, { units }).output).toBe(SOURCE);
  });

  it('fmt does not turn a spaced hyphen in a part heading into a qualifier', () => {
    const source = `---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n### Day 1 - Dough\n\n- 1 g flour\n\n## Directions\n\n### Day 1 - Dough\n\n1. Mix.\n`;
    expect(formatRecipe(source, { units }).output).toBe(source);
  });
});
