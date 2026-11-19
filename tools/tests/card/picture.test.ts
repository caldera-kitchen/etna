// A card and the recipe's picture (SPEC §4.3, §8): the picture line's words are not the
// recipe's introduction; image/etna.jpg prints where the theme has a place for it, and a card
// without one is the card it was before pictures.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { run } from '../../src/card/cli.ts';
import { renderCard, renderCardParts, type CardOptions } from '../../src/card/index.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import { parseRecipe, pictureDataAddress } from '../../src/core/index.ts';
import { ETNA_ROOT, loadUnits, readRecipe } from '../../src/node/files.ts';

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

// ------------------------------------------------------------ the card's picture

const JPEG = new Uint8Array(readFileSync(join(ETNA_ROOT, 'tests', 'linter', 'collection-picture-file', 'input', 'test-soup', 'image', 'markdown.jpg')));
const PNG = new Uint8Array(readFileSync(join(ETNA_ROOT, 'tests', 'linter', 'clean-picture', 'input', 'test-soup', 'image', 'etna.png')));
const SRC = pictureDataAddress(JPEG)!;
const figures = (card: string) => card.match(/<figure class="card-picture">/g)?.length ?? 0;
const NO_LINE = STRUCTURED.replace('![A bowl of potato soup](image/markdown.jpg)\n\n', '');

describe('pictureDataAddress', () => {
  it('writes a JPEG and a PNG as base64 data addresses of their kind', () => {
    expect(SRC).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString('base64')}`);
    expect(pictureDataAddress(PNG)).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    // Every padding: lengths that leave one, two and no bytes over.
    for (const n of [0, 1, 2]) {
      const bytes = PNG.subarray(0, PNG.length - n);
      expect(pictureDataAddress(bytes)).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
    }
  });

  it('gives null for bytes that are neither', () => {
    expect(pictureDataAddress(new TextEncoder().encode('not a picture at all'))).toBeNull();
    expect(pictureDataAddress(new Uint8Array())).toBeNull();
    expect(pictureDataAddress(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('a card with a picture', () => {
  const recipe = (source: string) => parseRecipe(source, { units });
  const card = (source: string, themeName: string, options: CardOptions = {}) => renderCardParts(recipe(source), loadTheme(themeName), { picture: { src: SRC }, ...options }).html;

  it('prints one figure in each theme with a place for it, described by the picture line', () => {
    for (const name of ['mise', 'folio', 'binder', 'countertop', 'grid']) {
      const html = card(STRUCTURED, name);
      expect(figures(html), name).toBe(1);
      expect(html, name).toContain(`<figure class="card-picture"><img src="${SRC}" alt="A bowl of potato soup"></figure>`);
    }
  });

  it('is described by the title when the recipe has no picture line', () => {
    expect(card(NO_LINE, 'mise')).toContain(`<img src="${SRC}" alt="Potato Soup">`);
    const quoted = NO_LINE.replace('# Potato Soup', '# "Best" <Soup>');
    expect(card(quoted, 'mise')).toContain('alt="&quot;Best&quot; &lt;Soup&gt;"');
  });

  it('prints none when the caller turns it off, none is given, the theme has no place, or it is a shopping list', () => {
    expect(figures(card(STRUCTURED, 'mise', { slots: { picture: false } }))).toBe(0);
    expect(figures(renderCardParts(recipe(STRUCTURED), loadTheme('mise')).html)).toBe(0);
    expect(figures(card(STRUCTURED, 'galley'))).toBe(0);
    expect(figures(card(STRUCTURED, 'galley', { slots: { picture: true } }))).toBe(0);
    expect(figures(card(STRUCTURED, 'shopping'))).toBe(0);
    expect(figures(card(STRUCTURED, 'mise', { layout: 'list' }))).toBe(0);
  });

  it('prints none in a theme that does not say picture: true, even with a {{picture}} slot', () => {
    const mise = loadTheme('mise');
    const slots = { ...(mise.manifest.options as { slots: Record<string, boolean> }).slots };
    delete slots.picture;
    const quiet = { ...mise, manifest: { ...mise.manifest, options: { ...(mise.manifest.options as object), slots } } };
    expect(figures(renderCardParts(recipe(STRUCTURED), quiet, { picture: { src: SRC } }).html)).toBe(0);
  });

  it('never writes an address that is not a JPEG or PNG base64 data address', () => {
    for (const src of ['https://example.com/soup.jpg', 'image/etna.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg,raw', 'data:image/png;base64,', `${SRC}"><script>`, `javascript:${SRC}`]) {
      const html = card(STRUCTURED, 'mise', { picture: { src } });
      expect(figures(html), src).toBe(0);
      expect(html, src).not.toContain('<img');
    }
  });

  it('leaves a card without a picture as it was, in every bundled theme', () => {
    for (const name of listThemes()) {
      const theme = loadTheme(name);
      for (const slug of ['potato-soup', 'potato-soup-traditional-form', 'next-day-soft-cinnamon-rolls', 'deviled-eggs']) {
        const r = readRecipe(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'));
        // The stylesheet names the picture's classes; the card itself has none of it.
        expect(renderCardParts(r, theme).html, `${name} ${slug}`).not.toMatch(/card-picture|has-picture|<img/);
        expect(renderCard(r, theme), `${name} ${slug}`).toBe(renderCard(r, theme, { picture: { src: SRC }, slots: { picture: false } }));
      }
    }
  });

  it('stands first in Binder\'s heading, whatever heads the card', () => {
    const hoisted = card(STRUCTURED, 'binder');
    const paired = card(STRUCTURED, 'binder', { layout: 'paired' });
    for (const html of [hoisted, paired]) expect(html).toContain('class="card-frame has-picture"');
    for (const html of [hoisted, paired]) expect(html).toMatch(/<header class="card-header">\s*<figure class="card-picture">[\s\S]*<\/figure>\s*<h1 class="card-title">/);
    // The notes stay outside the body, so a one-page card can keep them at its foot.
    const notes = card(`${STRUCTURED}\n## Notes\n\nKeeps two days.\n`, 'binder', { notes: true });
    expect(notes).toMatch(/<\/div>\s*<footer class="notes">/);
  });

  it('stands first in a Mise card, before the heading, whose line is words beside values', () => {
    const html = card(STRUCTURED.replace('etna: 1\n', 'etna: 1\nyield: 4 bowls\nsource: A test kitchen\n'), 'mise');
    expect(html).toMatch(/<article class="card card-mise has-picture">\s*<figure class="card-picture">[\s\S]*<\/figure>\s*<header class="card-header">/);
    expect(html).toContain('<span class="meta-value">4 bowls</span>');
    expect(html).toContain('<span class="meta-value">A test kitchen</span>');
    expect(card(STRUCTURED, 'mise', { slots: { picture: false } })).toContain('<article class="card card-mise">');
  });
});

describe('etna card and the picture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-card-picture-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const folder = (name: string, files: Record<string, Uint8Array>): string => {
    const recipeDir = join(dir, name);
    mkdirSync(join(recipeDir, 'image'), { recursive: true });
    writeFileSync(join(recipeDir, 'recipe.md'), STRUCTURED);
    for (const [file, bytes] of Object.entries(files)) writeFileSync(join(recipeDir, 'image', file), bytes);
    return recipeDir;
  };
  async function cli(args: string[]): Promise<{ code: number; html: string; notes: string[] }> {
    const out: string[] = [];
    const notes: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation((m) => void notes.push(String(m)));
    const std = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    try {
      const code = await run([...args, '--fonts', 'none']);
      return { code, html: out.join(''), notes };
    } finally {
      err.mockRestore();
      std.mockRestore();
    }
  }

  it('prints image/etna.jpg, or else image/etna.png, from the recipe folder', async () => {
    const jpg = await cli([folder('jpg', { 'etna.jpg': JPEG, 'etna.png': PNG })]);
    expect(jpg.code).toBe(0);
    expect(figures(jpg.html)).toBe(1);
    expect(jpg.html).toContain(`<img src="${SRC}" alt="A bowl of potato soup">`);
    expect(jpg.notes).toEqual([]);
    const png = await cli([folder('png', { 'etna.png': PNG }), '--theme', 'folio']);
    expect(png.html).toContain(`<img src="${pictureDataAddress(PNG)}"`);
  });

  it('leaves it out with --no-picture, in a theme without a place, and for a loose file', async () => {
    const recipeDir = folder('off', { 'etna.jpg': JPEG });
    expect(figures((await cli([recipeDir, '--no-picture'])).html)).toBe(0);
    expect(figures((await cli([recipeDir, '--theme', 'galley'])).html)).toBe(0);
    const loose = join(dir, 'off', 'soup.md');
    writeFileSync(loose, STRUCTURED);
    expect(figures((await cli([loose])).html)).toBe(0);
  });

  it('prints none, and says why, for a file over 1024 KiB or one that is not what its ending says', async () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(JPEG);
    const large = await cli([folder('large', { 'etna.jpg': big })]);
    expect(large.code).toBe(0);
    expect(figures(large.html)).toBe(0);
    expect(large.notes).toEqual([`etna card: ${join(dir, 'large', 'recipe.md')}: image/etna.jpg is larger than 1024 KiB: the card has no picture`]);
    const exact = new Uint8Array(1024 * 1024);
    exact.set(JPEG);
    expect(figures((await cli([folder('exact', { 'etna.jpg': exact })])).html)).toBe(1);
    const wrong = await cli([folder('wrong', { 'etna.jpg': PNG })]);
    expect(figures(wrong.html)).toBe(0);
    expect(wrong.notes).toEqual([`etna card: ${join(dir, 'wrong', 'recipe.md')}: image/etna.jpg is not a JPEG: the card has no picture`]);
  });
});
