// A heading whose optional qualifier is written wrongly, so it is not read (decision D3; SPEC §6,
// §9 `optional-near-miss`). Only slips of the form: the author's own words are left alone.

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { lintRecipe } from '../../src/lint/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const findings = (body: string) =>
  lintRecipe(parseRecipe(`---\netna: 1\n---\n\n# Test\n\n${body}`, { units }))
    .filter((f) => f.rule === 'optional-near-miss')
    .map((f) => f.message);
const component = (heading: string, extra = '') => `## ${heading}\n\n${extra}### Warm it\n\n- 2 tbsp honey\n\nWarm.\n\n## Serve\n\nServe.\n`;

describe('optional-near-miss', () => {
  it('is quiet about a designation and about other qualifiers', () => {
    for (const h of ['Glaze — optional', 'Glaze — Optional', 'Glaze — if desired', 'Glaze — if using', 'Glaze — optional, for shine', 'Dough — Day 1', 'Glaze', 'Options for the glaze']) {
      expect(findings(component(h)), h).toEqual([]);
    }
  });

  it('reports optional written another way, with the qualifier to write', () => {
    for (const h of ['Glaze (optional)', 'Glaze - optional', 'Glaze – optional', 'Glaze —optional', 'Glaze, if desired', 'Glaze [optional]']) {
      expect(findings(component(h)), h).toEqual([`The heading "${h}" is not read as optional: only a qualifier after a spaced em dash designates it. Write \`Glaze — optional\`.`]);
    }
  });

  it('reports a qualifier that misspells it or runs on', () => {
    for (const q of ['optinal', 'Optoinal', 'optional if you like']) {
      expect(findings(component(`Glaze — ${q}`)), q).toHaveLength(1);
    }
    expect(findings(component('Glaze — optinal'))[0]).toContain('write `Glaze — optional`');
  });

  it('leaves the author\'s own words alone: a heading that begins Optionally, and an Optional callout', () => {
    expect(findings('## Optionally freeze a loaf\n\nFreeze one loaf.\n')).toEqual([]);
    expect(findings(component('Glaze', '> **Optional** — leave it off.\n\n'))).toEqual([]);
    expect(findings(component('Glaze — optional', '> **Optional** — leave it off.\n\n'))).toEqual([]);
  });
});
