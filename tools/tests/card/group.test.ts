// A link to a group on a card keeps naming the group as written (SPEC §7 "Groups").

import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { renderCardParts } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const theme = loadTheme('binder');

const SOURCE = `---
etna: 1
---

# Test Tart

## Fillings

### Custard

#### Cook the custard

- 250 g milk

Cook until thick.

### Jam

#### Simmer the jam

- 200 g raspberries

Simmer until it coats a spoon.

## Assembly

### Fill

- [fillings](#fillings)
- 1/2 [the jam](#jam)

Spread the jam and pour the custard over it.
`;

describe('group links on a card', () => {
  it('points at the group by the name written, not at its sub-components', () => {
    const { html } = renderCardParts(parseRecipe(SOURCE, { units }), theme);
    const link = /<a class="ingr-ref ingr-ref-internal" href="#[^"]*fillings">fillings<\/a> <span class="ingr-ref-pointer">\(([^)]*)\)<\/span>/.exec(html);
    expect(link?.[1]).toBe('above');
    // A sub-component link still says where it comes from.
    expect(html).toMatch(/>the jam<\/a> <span class="ingr-ref-pointer">\(from Jam, above\)<\/span>/);
  });
});
