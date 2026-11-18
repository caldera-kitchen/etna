// The two rules about marks (SPEC §9; ADR 0021): a chart box longer than five lines, and an
// asterisk left in an instruction as text.

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { lintRecipe, type Finding } from '../../src/lint/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const step = (prose: string, heading = 'Simmer', form = '') =>
  `---\netna: 1\n${form}---\n\n# Soup\n\n## ${heading}\n\n- 1 l stock\n\n${prose}\n`;
const found = (source: string, rule: string): Finding[] => lintRecipe(parseRecipe(source, { units })).filter((f) => f.rule === rule);

describe('chart-box-long', () => {
  it('warns on a box of more than five lines, names the step and the count, and says to mark fewer words', () => {
    expect(found(step('Simmer *gently* on *medium-low* another *15-25 minutes*, until *the potatoes are tender* and *the soup is thick*.'), 'chart-box-long')).toEqual([
      {
        rule: 'chart-box-long',
        severity: 'warning',
        message: 'The step "Simmer" draws a chart box of 6 lines, more than five: mark fewer words.',
        line: 7,
        column: 1,
        at: 'Simmer',
      },
    ]);
  });

  it('is silent at five lines', () => {
    expect(found(step('Simmer on *medium-low* another *15-25 minutes*, until *tender* and *thick*.'), 'chart-box-long')).toEqual([]);
  });

  it('never warns on an unmarked step, however long its heading', () => {
    const heading = 'Simmer the soup slowly over a very low flame with the lid half on, stirring now and then so nothing sticks';
    expect(found(step('Simmer.', heading), 'chart-box-long')).toEqual([]);
  });
});

describe('stray-asterisk', () => {
  it('warns where an unclosed mark leaves an asterisk as text', () => {
    const f = found(step('Simmer on *medium-low another 15 minutes.'), 'stray-asterisk');
    expect(f.map((x) => [x.line, x.column, x.at])).toEqual([[11, 11, 'Simmer']]);
    expect(f[0].message).toBe('An asterisk in the instruction of "Simmer" is not part of a mark and prints as an asterisk: close the mark (*like this*), or write \\* for an asterisk.');
  });

  it('finds the asterisk on a later line of the paragraph', () => {
    expect(found(step('Simmer on low\nfor 2 * 10 minutes.'), 'stray-asterisk').map((x) => [x.line, x.column])).toEqual([[12, 7]]);
  });

  it('is silent on marks, bold, an escaped asterisk and code', () => {
    expect(found(step('Simmer on *low*, **covered**, ***still***, 2 \\* 3 minutes, `a*b`.'), 'stray-asterisk')).toEqual([]);
  });

  it('reads only instructions: not a callout, an ingredient line, the notes or a traditional recipe', () => {
    expect(found(step('Simmer.\n\n> **Note** — a * here.\n\n## Notes\n\nA * there.'), 'stray-asterisk')).toEqual([]);
    expect(found(`---\netna: 1\nform: traditional\n---\n\n# Soup\n\n## Ingredients\n\n- 1 l stock\n\n## Directions\n\n1. Simmer. *Or not.\n`, 'stray-asterisk')).toEqual([]);
  });
});
