// renderListCard: a shopping list of several recipes as a paged card, in the page shell renderCard uses.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { cardCsp, pagingScript, parseTheme, renderCard, renderListCard } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { loadDensities } from '../../src/density/node.ts';
import { consolidate } from '../../src/list/index.ts';
import { ETNA_ROOT, loadUnits, readRecipe } from '../../src/node/files.ts';

const units = loadUnits();
const count = (text: string, needle: string) => text.split(needle).length - 1;

const recipe = (title: string, lines: string[]) =>
  parseRecipe(`---\netna: 1\n---\n\n# ${title}\n\n## Mix\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nMix.\n`, { units });

const sources = () => [
  { id: 'a/bread', title: 'Bread <script>alert(1)</script>', recipe: recipe('Bread', ['120 g all-purpose flour', '2 tsp cinnamon', '8 oz water']) },
  { id: 'a/cake', title: 'Cake & "Co"', recipe: recipe('Cake', ['1 cup all-purpose flour', '5 g cinnamon', '1 cup water']) },
];

const shopping = loadTheme('shopping');

describe('renderListCard', () => {
  const list = consolidate(sources(), { densities: loadDensities(), units });
  const html = renderListCard(list, shopping);

  it('titles the card "Shopping list" and names the recipes, escaped', () => {
    expect(html).toContain('<title>Shopping list</title>');
    expect(html).toContain('<h1 class="card-title">Shopping list</h1>');
    expect(html).toContain('<span class="meta-label">For</span> Bread &lt;script&gt;alert(1)&lt;/script&gt;</span>');
    expect(html).toContain('Cake &amp; &quot;Co&quot;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<p class="card-kicker">2 recipes</p>');
  });

  it('marks a total made through a density, and says what it was made from', () => {
    expect(html).toMatch(/<td class="ingr-qty">≈ 240<\/td><td class="ingr-unit">g<\/td><td class="ingr-item">all-purpose flour<span class="ingr-note list-from"> \(120 g \+ 1 cup\)<\/span>/);
  });

  it('prints the footer: no density, and oz of a liquid', () => {
    expect(html).toContain('<footer class="notes"><p class="list-footer">No density for: cinnamon — amounts left as written</p>');
    expect(html).toContain('<p class="list-footer">Measured in oz, by weight or fluid ounces? water — amounts left as written</p>');
  });

  it('is paged, with the same CSP and the one script renderCard uses', () => {
    const script = pagingScript();
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${cardCsp(script.hash)}">`);
    expect(count(html, '<script')).toBe(1);
    expect(html).toContain(`<script>${script.text}</script>`);
    expect(html).toMatch(/<html lang="en" data-paper="letter" data-fit="auto" data-size="14pt" data-fit-rule="[^"]+">/);
    // The shell is renderCard's: everything up to the card's own content matches.
    const single = renderCard(recipe('Bread', ['1 g salt']), shopping);
    const head = (doc: string) => doc.slice(doc.indexOf('<meta charset'), doc.indexOf('<title>'));
    expect(head(html)).toBe(head(single));
    const flow = renderListCard(list, shopping, { paging: false });
    expect(count(flow, '<script')).toBe(0);
    expect(flow).toContain(`content="${cardCsp(null)}"`);
  });

  it('takes the paper and size options', () => {
    expect(renderListCard(list, shopping, { paper: 'index-4x6' })).toContain('data-paper="index-4x6"');
    expect(renderListCard(list, shopping, { size: '13pt' })).toContain('data-fit="off" data-size="13pt"');
  });

  it('says which recipe and step each item is for when uses is on', () => {
    expect(html).not.toContain('<span class="list-uses">');
    const withUses = renderListCard(list, shopping, { slots: { uses: true } });
    expect(withUses).toContain('<span class="list-uses">Bread &lt;script&gt;alert(1)&lt;/script&gt; (Mix); Cake &amp; &quot;Co&quot; (Mix)</span>');
  });

  it('refuses a theme that does not print lists', () => {
    expect(() => renderListCard(list, loadTheme('mise'))).toThrow(/does not print shopping lists/);
  });

  it('puts the recipe names and footer somewhere in a list theme without meta or notes slots', () => {
    const bare = parseTheme({
      'theme.yaml': 'name: Bare\noptions:\n  layout: list\n',
      'card.html': '<article class="card"><h1>{{title}}</h1><div class="ingredients">{{ingredients}}</div></article>',
      'card.css': '',
    });
    const out = renderListCard(list, bare, { paging: false });
    expect(out).toContain('<p class="card-meta"><span class="meta-item"><span class="meta-label">For</span> Bread');
    expect(out).toContain('<p class="list-footer">No density for: cinnamon');
  });

  it('prints real recipes, from the ones that ship', () => {
    const real = ['next-day-soft-cinnamon-rolls', 'malted-chocolate'].map((slug) => {
      const r = readRecipe(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'));
      return { id: slug, title: r.title?.text ?? slug, recipe: r };
    });
    const out = renderListCard(consolidate(real, { densities: loadDensities(), units }), shopping);
    expect(out).toContain('Next-Day Soft Cinnamon Rolls');
    expect(count(out, 'class="ingr list-item"')).toBeGreaterThan(10);
  });
});

describe('emphasis on the shopping-list card', () => {
  it('prints a reference note plain, as an ingredient note already is', () => {
    const r = parseRecipe(`---\netna: 1\n---\n\n# Soup\n\n## Mix\n\n- 1 cup [stock](../stock/), *hot* — *or water*\n- 2 *large* potatoes\n\nMix.\n`, { units });
    const card = renderListCard(consolidate([{ id: 'a/soup', title: 'Soup', recipe: r }], { densities: loadDensities(), units }), shopping);
    const html = /<table class="ingr-table list-table">[\s\S]*?<\/table>/.exec(card)![0];
    expect(html).not.toContain('<em>');
    expect(html).not.toMatch(/\*/);
    expect(html).toContain('<span class="ingr-note">, hot</span>');
    expect(html).toContain('or water');
    expect(html).toContain('potatoes');
  });
});
