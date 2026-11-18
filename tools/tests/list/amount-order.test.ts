// A total that mixes measured lines with a line that has no amount prints the measured amounts
// first and the amount-less part last, whatever order the lines come in (a cake that greases
// its pans with butter before it measures the butter for the batter).

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { consolidate, formatListText } from '../../src/list/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const list = (body: string) => consolidate([{ id: 'r', title: 'Cake', recipe: parseRecipe(`---\netna: 1\n---\n\n# Cake\n\n${body}`, { units }) }]);

describe('the order of an item\'s amounts', () => {
  it('puts the amount-less part last when its line comes first', () => {
    const l = list('## Grease the pans\n\n- cold unsalted butter — for the pans\n\nButter the pans.\n\n## Make the cake\n\n- 378 g cold unsalted butter\n\nMix.\n');
    expect(l.items[0].amounts.map((a) => a.quantity?.raw ?? 'some')).toEqual(['378', 'some']);
    expect(formatListText(l)).toContain('378 g + some  cold unsalted butter — some: for the pans');
  });

  it('keeps the measured amounts in order of first use, and an order already right as it was', () => {
    const l = list('## Mix\n\n- sugar — for dusting\n- 1 cup sugar\n- 50 g sugar\n\nMix.\n\n## Top\n\n- 50 g butter\n- butter — for the pan\n\nTop.\n');
    expect(l.items[0].amounts.map((a) => a.unit?.name ?? 'some')).toEqual(['cup', 'gram', 'some']);
    expect(l.items[1].amounts.map((a) => a.quantity?.raw ?? 'some')).toEqual(['50', 'some']);
  });
});
