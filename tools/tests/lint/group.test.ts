// Linter rules around links to groups (SPEC §7 "Groups", §9).

import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { lintRecipe } from '../../src/lint/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const lint = (body: string) => lintRecipe(parseRecipe(`---\netna: 1\n---\n\n# Test\n\n${body}`, { units }));
const step = (level: number, name: string, lines: string[] = []) =>
  `${'#'.repeat(level)} ${name}\n\n${lines.map((l) => `- ${l}\n`).join('')}${lines.length ? '\n' : ''}Do it.\n\n`;
const brief = (body: string) => lint(body).map((f) => `${f.rule} @ ${f.at}`);

const FILLINGS = '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') + '### Jam\n\n' + step(4, 'Simmer the jam');

describe('quantity-on-group-reference', () => {
  it('warns on a quantity or a unit on a link to a group, naming the group and asking for the sub-component', () => {
    const findings = lint(FILLINGS + '## Assembly\n\n' + step(3, 'Fill', ['1/2 [fillings](#fillings)']));
    expect(findings.map((f) => [f.rule, f.severity, f.at])).toEqual([['quantity-on-group-reference', 'warning', 'Fill']]);
    expect(findings[0].message).toContain('the group "Fillings"');
    expect(findings[0].message).toContain('2 sub-components');
    expect(findings[0].message).toContain('link the sub-component the amount applies to');
    expect(brief(FILLINGS + '## Assembly\n\n' + step(3, 'Fill', ['200 g [fillings](#fillings)']))).toEqual(['quantity-on-group-reference @ Fill']);
  });

  it('says nothing for a plain group link, a quantity on a sub-component, or on a Choose', () => {
    expect(brief(FILLINGS + '## Assembly\n\n' + step(3, 'Fill', ['[fillings](#fillings)']))).toEqual([]);
    expect(brief(FILLINGS + '## Assembly\n\n' + step(3, 'Fill', ['1/2 [jam](#jam)', '[custard](#custard)']))).toEqual([]);
    const choose = '## Shell\n\n> **Choose** — one.\n\n### Bake\n\n' + step(4, 'Bake blind') + '### Fry\n\n' + step(4, 'Air-fry');
    expect(brief(choose + '## Assembly\n\n' + step(3, 'Fill', ['1 [shell](#shell)']))).toEqual([]);
  });

  it('warns for a component whose output ends in a group, and not for a group of one', () => {
    const ends = '## Dough\n\n' + step(3, 'Mix') + '### Toppings\n\n#### Nuts\n\n' + step(5, 'Toast nuts') + '#### Seeds\n\n' + step(5, 'Toast seeds');
    const f = lint(ends + '## Bake\n\n' + step(3, 'Bake it', ['1 [dough](#dough)']));
    expect(f.map((x) => x.rule)).toEqual(['quantity-on-group-reference']);
    expect(f[0].message).toContain('"Dough", which ends in a group');
    const one = '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard');
    expect(brief(one + '## Assembly\n\n' + step(3, 'Fill', ['1/2 [fillings](#fillings)']))).toEqual([]);
  });

  it('leaves an unresolved link to unresolved-reference alone', () => {
    expect(brief(FILLINGS + '## Assembly\n\n' + step(3, 'Fill', ['1/2 [fillings](#filings)']))).toEqual(['unresolved-reference @ Fill']);
  });
});

describe('links that would take in their own output', () => {
  it('reports a link to a group holding the linking step as unresolved-reference', () => {
    const findings = lint('## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') + '### Jam\n\n' + step(4, 'Simmer the jam', ['[fillings](#fillings)']));
    expect(findings.map((f) => [f.rule, f.at])).toEqual([['unresolved-reference', 'Simmer the jam']]);
    expect(findings[0].message).toContain('"Fillings", which holds this step');
  });

  it('reports a link to a nested group, at any depth, and to the step itself', () => {
    const deep = '## Fillings\n\n### Fruit\n\n#### Jam\n\n' + step(5, 'Simmer the jam', ['[fillings](#fillings)']) + '#### Berries\n\n' + step(5, 'Macerate');
    expect(brief(deep)).toEqual(['unresolved-reference @ Simmer the jam']);
    const self = lint(step(2, 'Stir', ['[stir](#stir)']));
    expect(self.map((f) => f.rule)).toEqual(['unresolved-reference']);
    expect(self[0].message).toContain('its own step');
  });

  it('does not add a quantity warning on top of the error', () => {
    const r = '## Fillings\n\n### Custard\n\n' + step(4, 'Cook the custard') + '### Jam\n\n' + step(4, 'Simmer the jam', ['1 [fillings](#fillings)']);
    expect(brief(r)).toEqual(['unresolved-reference @ Simmer the jam']);
  });
});
