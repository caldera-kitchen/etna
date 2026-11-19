// The picture line (SPEC §4.3): one image alone in the first paragraph under the title, at
// image/markdown.jpg or image/markdown.png. It is read in both forms and is not the recipe's text.

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });

const structured = (under: string) => `---\netna: 1\n---\n\n# Potato Soup\n\n${under}\n\n## Simmer\n\n- 1 kg potatoes\n\nSimmer until soft.\n`;
const traditional = (under: string) =>
  `---\netna: 1\nform: traditional\n---\n\n# Potato Soup\n\n${under}\n\n## Ingredients\n\n- 1 kg potatoes\n\n## Directions\n\n1. Simmer until soft.\n`;

describe('the picture line', () => {
  for (const [form, build] of [['structured', structured], ['traditional', traditional]] as const) {
    it(`is read under the title and left out of the text before the first section (${form})`, () => {
      const r = parse(build('![A bowl of potato soup](image/markdown.jpg)\n\nA soup for cold days.'));
      const line = form === 'structured' ? 7 : 8;
      expect(r.picture).toMatchObject({ alt: 'A bowl of potato soup', address: 'image/markdown.jpg', pos: { start: { line, column: 1 } } });
      expect(r.preamble.map((b) => (b.kind === 'ingredients' ? null : b.text))).toEqual(['A soup for cold days.']);
    });

    it(`takes the PNG address too (${form})`, () => {
      const r = parse(build('![A bowl](image/markdown.png)'));
      expect(r.picture?.address).toBe('image/markdown.png');
      expect(r.preamble).toEqual([]);
    });

    it(`is not a picture line at any other address: it stays text (${form})`, () => {
      for (const address of ['image/etna.jpg', './image/markdown.jpg', 'https://example.com/soup.jpg', 'image/markdown.jpeg']) {
        const r = parse(build(`![A bowl](${address})`));
        expect(r.picture, address).toBeNull();
        expect(r.preamble.map((b) => [b.kind, b.kind === 'ingredients' ? null : b.text]), address).toEqual([['prose', 'A bowl']]);
      }
    });
  }

  it('is only the first thing under the title, alone in its paragraph', () => {
    expect(parse(structured('A soup.\n\n![A bowl](image/markdown.jpg)')).picture).toBeNull();
    expect(parse(structured('![A bowl](image/markdown.jpg) and more words')).picture).toBeNull();
    expect(parse(structured('![A bowl][bowl]\n\n[bowl]: image/markdown.jpg')).picture).toBeNull();
  });

  it('is not read when the title is not the first heading', () => {
    const r = parse(`---\netna: 1\n---\n\n## Simmer\n\nSimmer.\n\n# Potato Soup\n\n![A bowl](image/markdown.jpg)\n`);
    expect(r.picture).toBeNull();
  });

  it('leaves the steps alone', () => {
    const r = parse(structured('![A bowl](image/markdown.jpg)'));
    expect(r.nodes.map((n) => n.heading.text)).toEqual(['Simmer']);
  });
});
