// One note per top-level list item in the Notes section (SPEC §4.2), read alike by the parser,
// the card, the formatter and the linter.

import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { renderCardParts } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { formatRecipe } from '../../src/fmt/index.ts';
import { lintRecipe } from '../../src/lint/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });
const theme = loadTheme('binder');
const notesHtml = (source: string) => renderCardParts(parse(source), theme, { notes: true }).html;

const traditional = (notes: string) =>
  `---\netna: 1\nform: traditional\n---\n\n# Test\n\n## Ingredients\n\n- 1 g salt\n\n## Directions\n\n1. Mix.\n\n## Notes\n\n${notes}\n`;
const structured = (notes: string) => `---\netna: 1\n---\n\n# Test\n\n## Mix\n\n- 1 g salt\n\nMix.\n\n## Notes\n\n${notes}\n`;

const THREE = '- Keeps a week in the fridge.\n- **Storage** — freeze the rest.\n- Halve it for two.';

describe('a list of notes', () => {
  for (const [form, build] of [
    ['traditional', traditional],
    ['structured', structured],
  ] as const) {
    it(`reads each top-level item as a note, with its lead (${form})`, () => {
      const notes = parse(build(THREE)).notes!;
      expect(notes.items.map((n) => [n.form, n.label, n.raw, n.text])).toEqual([
        ['item', null, 'Keeps a week in the fridge.', 'Keeps a week in the fridge.'],
        ['item', 'Storage', 'freeze the rest.', 'freeze the rest.'],
        ['item', null, 'Halve it for two.', 'Halve it for two.'],
      ]);
      expect(notes.other).toEqual([]);
    });
  }

  it('prints each item as a note of its own, the lead as its label', () => {
    const html = notesHtml(traditional(THREE));
    expect(html.split('<div class="note">').length - 1).toBe(3);
    expect(html).toContain('<div class="note"><p><span class="note-label">Storage</span> freeze the rest.</p></div>');
    expect(html).toContain('<div class="note"><p>Keeps a week in the fridge.</p></div>');
    expect(html).not.toContain('md-list');
  });

  it('keeps a nested list and a continuation paragraph with their item', () => {
    const source = structured('- **Swaps** — any of these:\n  - oat milk\n  - soy milk\n\n  Taste first.\n- Halve it.');
    const notes = parse(source).notes!;
    expect(notes.items).toHaveLength(2);
    const [swaps] = notes.items;
    expect(swaps.label).toBe('Swaps');
    expect(swaps.raw).toBe('any of these:');
    expect(swaps.more).toBe('- oat milk\n- soy milk\n\nTaste first.');
    expect(swaps.text).toBe('any of these:\noat milk\nsoy milk\nTaste first.');
    const html = notesHtml(source);
    expect(html).toContain(
      '<div class="note"><p><span class="note-label">Swaps</span> any of these:</p><ul class="md-list"><li>oat milk</li><li>soy milk</li></ul><p>Taste first.</p></div>',
    );
  });

  it('leaves a numbered list as one block', () => {
    const notes = parse(structured('1. First.\n2. Second.')).notes!;
    expect(notes.items).toEqual([]);
    expect(notes.other.map((o) => o.nodeType)).toEqual(['list']);
  });
});

describe('a paragraph note', () => {
  it('is a note as before, with its lead', () => {
    const notes = parse(traditional('**Tip** — freeze the rest.')).notes!;
    expect(notes.items.map((n) => [n.form, n.label, n.raw, n.more])).toEqual([['paragraph', 'Tip', 'freeze the rest.', null]]);
    expect(notesHtml(traditional('**Tip** — freeze the rest.'))).toContain('<div class="note"><p><span class="note-label">Tip</span> freeze the rest.</p></div>');
  });
});

describe('a mixed Notes section', () => {
  const MIXED = 'A paragraph first.\n\n- **Storage** — keeps three days.\n- Second item.\n\n> A quote.\n\nLast paragraph.';

  it('reads paragraphs and items as notes in source order, and a quote as an other-block', () => {
    const notes = parse(structured(MIXED)).notes!;
    expect(notes.items.map((n) => [n.form, n.label, n.text])).toEqual([
      ['paragraph', null, 'A paragraph first.'],
      ['item', 'Storage', 'keeps three days.'],
      ['item', null, 'Second item.'],
      ['paragraph', null, 'Last paragraph.'],
    ]);
    expect(notes.other.map((o) => o.nodeType)).toEqual(['blockquote']);
  });

  it('prints them in source order', () => {
    const html = notesHtml(structured(MIXED));
    const order = ['A paragraph first.', 'Storage</span> keeps three days.', 'Second item.', 'A quote.', 'Last paragraph.'].map((t) => html.indexOf(t));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('draws no finding: Notes hold any Markdown', () => {
    expect(lintRecipe(parse(structured(MIXED)))).toEqual([]);
  });
});

describe('fmt on a list note', () => {
  it('writes the lead of an item with the em dash, as for a paragraph', () => {
    const out = formatRecipe(structured('- **Storage** - keeps three days.\n- **Tip**: halve it.'), { units }).output;
    expect(out).toContain('## Notes\n\n- **Storage** — keeps three days.\n- **Tip** — halve it.\n');
    const trad = formatRecipe(traditional('* __Storage__ - keeps three days.'), { units }).output;
    expect(trad).toContain('## Notes\n\n- **Storage** — keeps three days.\n');
  });

  it('is idempotent', () => {
    const once = formatRecipe(structured('- **Storage** - keeps three days.'), { units }).output;
    expect(formatRecipe(once, { units }).output).toBe(once);
  });
});
