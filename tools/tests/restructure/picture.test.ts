// The form check reads the picture line (SPEC §4.3) as no part of the text before the first
// section, so a pair that both carry it compare as they would without it.

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { checkRestructure } from '../../src/restructure/index.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });

const LINE = '![A bowl of potato soup](image/markdown.jpg)';
const ORIGINAL = `---
etna: 1
form: traditional
---

# Potato Soup (Traditional Form)

${LINE}

## Ingredients

- 1 kg potatoes
- 1 liter stock

## Directions

1. Simmer the potatoes in the stock until soft, about 20 minutes.
`;
const STRUCTURED = `---
etna: 1
---

# Potato Soup

${LINE}

## Simmer

- 1 kg potatoes
- 1 liter stock

Simmer the potatoes in the stock until soft, about 20 minutes.
`;

describe('restructure check and the picture line', () => {
  it('passes a traditional and structured pair that both carry the line', () => {
    const report = checkRestructure(parse(ORIGINAL), parse(STRUCTURED));
    expect(report.findings.filter((f) => f.severity === 'lost')).toEqual([]);
    const without = checkRestructure(parse(ORIGINAL.replace(`${LINE}\n\n`, '')), parse(STRUCTURED.replace(`${LINE}\n\n`, '')));
    const summary = (r: typeof report) => [r.ok, r.findings.map((f) => [f.severity, f.kind, f.message])];
    expect(summary(report)).toEqual(summary(without));
  });
});
