// The catalog's search text leaves out the picture line's words (SPEC §4.3).

import { describe, expect, it } from 'vitest';

import { catalogEntry } from '../../src/catalog/index.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });

describe('a catalog entry of a recipe with a picture line', () => {
  it('searches the introduction, not the picture line', () => {
    const source = `---\netna: 1\n---\n\n# Potato Soup\n\n![A bowl of potato soup](image/markdown.jpg)\n\nA soup for cold days.\n\n## Simmer\n\n- 1 kg potatoes\n\nSimmer until soft.\n`;
    const text = catalogEntry(parse(source), 'potato-soup').text;
    expect(text).toContain('A soup for cold days.');
    expect(text).not.toContain('bowl');
  });

  it('keeps the words of an image at any other address, as it keeps any text', () => {
    const source = `---\netna: 1\n---\n\n# Potato Soup\n\n![A bowl of potato soup](image/etna.jpg)\n\n## Simmer\n\nSimmer until soft.\n`;
    expect(catalogEntry(parse(source), 'potato-soup').text).toContain('A bowl of potato soup');
  });
});
