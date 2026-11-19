// A card does not print the picture line's words as the recipe's introduction (SPEC §4.3).

import { describe, expect, it } from 'vitest';

import { renderCardParts } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const theme = loadTheme('binder');
const html = (source: string) => renderCardParts(parseRecipe(source, { units }), theme).html;

const STRUCTURED = `---\netna: 1\n---\n\n# Potato Soup\n\n![A bowl of potato soup](image/markdown.jpg)\n\nA soup for cold days.\n\n## Simmer\n\n- 1 kg potatoes\n\nSimmer until soft.\n`;
const TRADITIONAL = `---\netna: 1\nform: traditional\n---\n\n# Potato Soup\n\n![A bowl of potato soup](image/markdown.jpg)\n\n## Ingredients\n\n- 1 kg potatoes\n\n## Directions\n\n1. Simmer until soft.\n`;

describe('a card of a recipe with a picture line', () => {
  it('prints the introduction without the picture line (structured)', () => {
    const card = html(STRUCTURED);
    expect(card).toContain('A soup for cold days.');
    expect(card).not.toContain('A bowl of potato soup');
    expect(card).not.toContain('image/markdown.jpg');
  });

  it('prints no introduction made of the picture line alone (traditional)', () => {
    const card = html(TRADITIONAL);
    expect(card).not.toContain('A bowl of potato soup');
    expect(card).toBe(html(TRADITIONAL.replace('![A bowl of potato soup](image/markdown.jpg)\n\n', '')));
  });
});
