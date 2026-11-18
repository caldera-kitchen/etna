import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { CARD_ICON, cardType, parseTheme, renderCard, renderCardParts, type CardOptions } from '../../src/card/index.ts';
import { loadTheme } from '../../src/card/node.ts';
import { loadUnits } from '../../src/node/files.ts';

/** A card document without its paging script. */
const withoutScript = (doc: string) => doc.replace(/<script>[\s\S]*?<\/script>/, '');
// The card's own empty data: icon (contract.ts CARD_ICON) loads nothing; every other <link> would.
const withoutIcon = (doc: string) => doc.replace(CARD_ICON, '');

const units = loadUnits();
const theme = loadTheme('binder');
const recipe = (source: string) => parseRecipe(source, { units });
const parts = (source: string, options?: CardOptions) => renderCardParts(recipe(source), theme, options);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const TRADITIONAL = `---
etna: 1
form: traditional
source: Nonna
yield: 4 bowls
version: v3
license: CC BY 4.0
---

# Test Soup

## Ingredients

- 1 recipe Another Recipe
- 1 1/2 tbsp olive oil
- 2-3 cloves garlic, minced
- 227 g chicken breast, cooked
- 1 clove shallot
- salt

**Garnish**

- 1/4 tsp pepper

## Directions

1. **Day Before** — Make the stock.
2. Add *everything* and simmer.

## Notes

Keeps three days.

**Tip** — Freeze the rest.
`;

const STRUCTURED = `---
etna: 1
---

# Test Recipe

## Part A

### Do the first thing

- 265 g water, warm
- 11 g salt

Do the first thing.

### Do the second thing

- 285 g flour
- 20 g water

Do the second thing.

> **Checkpoint** — if it looks wrong, do it again.

## Part B

### Do the third thing

- 454 g sugar
- salt

Do the third thing.

## Assembly

### Do the last thing

- [part b](#part-b)
- [the first part](#part-a)
- 80 g [another recipe](../another-recipe/), strained

Do the last thing.
`;

const CHOOSE = `---
etna: 1
---

# Pudding

## Make the base

- 500 g milk

Whisk.

## Cook

> **Choose** — one method.

### Stovetop

- 1 pinch salt

Cook until thick.

### Microwave

#### Heat

Microwave 2 minutes.

#### Stir

- 10 g butter

Stir in the butter.

## Finish

- 5 g vanilla

Stir in the vanilla.
`;

describe('parseTheme', () => {
  it('loads the Binder theme', () => {
    expect(theme.name).toBe('Binder');
    expect(theme.css).toContain('Binder / Classic');
    expect(theme.skeleton).toContain('{{title}}');
    expect(theme.manifest.name).toBe('Binder');
  });

  it('reports what is missing', () => {
    expect(() => parseTheme({})).toThrow(/theme\.yaml/);
    expect(() => parseTheme({ 'theme.yaml': 'name: T\n' })).toThrow(/card\.html/);
    expect(() => parseTheme({ 'theme.yaml': 'name: T\n', 'card.html': '' })).toThrow(/card\.css is missing/);
  });
});

describe('traditional form', () => {
  const { html } = parts(TRADITIONAL, { notes: true });

  it('has the title, an ingredient table and a direction list', () => {
    expect(html).toContain('<h1 class="card-title">Test Soup</h1>');
    expect(count(html, '<table class="ingr-table">')).toBe(1);
    expect(count(html, '<ol class="direction-list">')).toBe(1);
    expect(html).not.toContain('class="components"');
  });

  it('sets quantity, unit and item in three columns, with Binder display defaults', () => {
    expect(html).toContain(
      '<tr class="ingr"><td class="ingr-qty">1 ½</td><td class="ingr-unit">tablespoons</td><td class="ingr-item">olive oil</td></tr>',
    );
    expect(html).toContain(
      '<td class="ingr-qty">2 to 3</td><td class="ingr-unit">cloves</td><td class="ingr-item">garlic<span class="ingr-note">, minced</span></td>',
    );
    expect(html).toContain('<td class="ingr-qty">227</td><td class="ingr-unit">grams</td>');
    expect(html).toContain('<td class="ingr-qty">1</td><td class="ingr-unit">clove</td>');
    expect(html).toContain('<td class="ingr-qty">1</td><td class="ingr-unit">recipe</td><td class="ingr-item">Another Recipe</td>');
    expect(html).toContain('<td class="ingr-qty"></td><td class="ingr-unit"></td><td class="ingr-item">salt</td>');
    expect(html).toContain('<td class="ingr-qty">¼</td><td class="ingr-unit">teaspoon</td>');
  });

  it('groups ingredients under bold labels', () => {
    expect(count(html, '<tbody class="ingr-group">')).toBe(2);
    expect(count(html, 'class="ingr-group-label"')).toBe(1);
    expect(html).toMatch(/<th class="ingr-group-label"[^>]*>Garnish<\/th>/);
  });

  it('numbers the directions and runs the step label in', () => {
    expect(count(html, '<li class="direction"')).toBe(2);
    expect(html).toContain('<span class="direction-number">1</span>');
    expect(html).toContain('<span class="direction-number">2</span>');
    expect(html).toContain('<p class="direction-text"><span class="direction-label">Day Before</span> Make the stock.</p>');
    expect(html).toContain('<p class="direction-text">Add everything and simmer.</p>');
  });

  it('prints the notes, with a labeled note', () => {
    expect(html).toContain('<footer class="notes">');
    expect(count(html, '<div class="note">')).toBe(2);
    expect(html).toContain('<div class="note"><p>Keeps three days.</p></div>');
    expect(html).toContain('<span class="note-label">Tip</span> Freeze the rest.');
  });

  it('omits the directions block for the _none_ placeholder', () => {
    const none = parts('---\netna: 1\nform: traditional\n---\n\n# Spice Mix\n\n## Ingredients\n\n- 2 tsp cumin\n\n## Directions\n\n_none_\n');
    expect(none.html).toContain('class="ingr-table"');
    expect(none.html).not.toContain('class="directions"');
    expect(none.html).not.toContain('direction-list');
    expect(none.html).not.toContain('none');
    expect(none.html).not.toContain('{{');
  });

  it('omits the ingredients block when there are none', () => {
    const bare = parts('---\netna: 1\nform: traditional\n---\n\n# Toast\n\n## Directions\n\n1. Toast the bread.\n');
    expect(bare.html).not.toContain('class="ingredients"');
    expect(bare.html).toContain('Toast the bread.');
    expect(bare.html).not.toContain('class="notes"');
  });

  it('prints a staple\'s use remark where its amount would be (`salt — to taste`)', () => {
    const { html: h } = parts('---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n- 2 cups flour\n- salt — to taste\n- oil — for the pan\n- butter — pea sized drop in each square\n\n## Directions\n\n1. Cook.\n');
    expect(h).toContain('<td class="ingr-qty ingr-use"><span class="ingr-use-text">to taste</span>&nbsp;</td><td class="ingr-unit"></td><td class="ingr-item">salt</td>');
    expect(h).toContain('<span class="ingr-use-text">for the pan</span>&nbsp;</td><td class="ingr-unit"></td><td class="ingr-item">oil</td>');
    // A long remark is not a use phrase: it stays after the item.
    expect(h).toContain('butter<span class="ingr-remark"> — pea sized drop in each square</span>');
  });

  it('keeps a use remark too long for the amount column after the item', () => {
    const { html: h } = parts('---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n- 2 cups flour\n- butter — for the pans\n- salt — for the pasta water\n\n## Directions\n\n1. Mix.\n');
    // Twelve characters still fit beside the widest amount; a longer phrase would overprint the item.
    expect(h).toContain('<span class="ingr-use-text">for the pans</span>&nbsp;</td><td class="ingr-unit"></td><td class="ingr-item">butter</td>');
    expect(h).toContain('<td class="ingr-qty"></td><td class="ingr-unit"></td><td class="ingr-item">salt<span class="ingr-remark"> — for the pasta water</span></td>');
  });

  it('hoists a staple listed at several steps as one row (`salt — to taste` twice)', () => {
    const { html: h } = parts(
      '---\netna: 1\n---\n\n# T\n\n## Brown\n\n- 1 lb beef\n- salt — to taste\n\nBrown.\n\n## Finish\n\n- 1 cup cream\n- salt — to taste\n- 1 tsp salt\n\nFinish.\n',
    );
    // Two use lines merge into one row standing for two; the measured salt stays its own row.
    expect(h.match(/<span class="ingr-use-text">to taste<\/span>/g)).toHaveLength(1);
    expect(h).toContain('data-lines="2"');
  });

  it('keeps a stray block between two numbered runs in its place', () => {
    const { html: h } = parts(
      '---\netna: 1\nform: traditional\n---\n\n# T\n\n## Directions\n\n1. One.\n2. Two.\n\n- a stray bullet\n\n3. Three.\n',
    );
    expect(h.indexOf('Two.')).toBeLessThan(h.indexOf('a stray bullet'));
    expect(h.indexOf('a stray bullet')).toBeLessThan(h.indexOf('Three.'));
    expect(h).toContain('<li class="direction-extra">');
    expect(h).toContain('<span class="direction-number">3</span>');
  });

  it('renders a stray indented list between directions as sibling items, not nested (easter-bread)', () => {
    const { html: h } = parts(
      '---\netna: 1\nform: traditional\n---\n\n# T\n\n## Directions\n\n1. Mix.\n\n  - Spiral mixer - speed 2.\n  - KitchenAid - lowest speed.\n\n2. Bake.\n',
    );
    expect(h).toContain('<ul class="md-list"><li>Spiral mixer - speed 2.</li><li>KitchenAid - lowest speed.</li></ul>');
  });
});

describe('structured form', () => {
  const { html } = parts(STRUCTURED);

  it('prints each component as a part: a group of the one ingredient table, a titled run of steps', () => {
    expect(html).not.toContain('class="component');
    expect(html).not.toContain('class="components"');
    expect(count(html, '<table class="ingr-table">')).toBe(1);
    expect(html).toMatch(/<th class="ingr-group-label"[^>]*>Part A<\/th>/);
    expect(html).toMatch(/<th class="ingr-group-label"[^>]*>Part B<\/th>/);
    expect(html).toMatch(/<th class="ingr-group-label"[^>]*>Assembly<\/th>/);
    expect(html).toContain('<section class="part" id="card-part-a"><h3 class="part-title">Part A</h3><ol class="direction-list">');
    expect(html).toContain('<section class="part" id="card-part-b"><h3 class="part-title">Part B</h3>');
    expect(count(html, '<ol class="direction-list">')).toBe(3);
    // The ingredients come first, then the directions, as on a traditional card.
    expect(html.indexOf('<div class="ingredients">')).toBeLessThan(html.indexOf('<div class="directions">'));
  });

  it('groups a part\'s ingredients under the part, and numbers its steps from 1', () => {
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect(count(table, '<tbody class="ingr-group">')).toBe(3);
    expect(table).not.toMatch(/ingr-group-label[^>]*>Do the first thing</);
    // Water enters at two steps of the first part, so it is listed twice.
    expect(count(table, '<td class="ingr-item">water')).toBe(2);
    const partB = html.slice(html.indexOf('id="card-part-b"'), html.indexOf('id="card-assembly"'));
    expect(partB).toContain('<li class="direction direction-alone" id="card-do-the-third-thing" value="1"><span class="direction-number">1</span>');
  });

  it('prints directions as the ordered step prose, labeled by the step heading', () => {
    expect(html).toContain(
      '<li class="direction" id="card-do-the-first-thing" value="1"><span class="direction-number">1</span>' +
        '<div class="direction-body"><p class="direction-text"><span class="direction-label">Do the first thing</span> Do the first thing.</p>',
    );
    expect(html).toContain('<li class="direction" id="card-do-the-second-thing" value="2">');
    // Ingredient bullets are not repeated inside the directions.
    const firstList = html.slice(html.indexOf('<ol class="direction-list">'), html.indexOf('</ol>'));
    expect(firstList).not.toContain('salt');
  });

  it('marks a Checkpoint as an aside under its step', () => {
    expect(html).toContain(
      '<aside class="callout callout-checkpoint"><p><span class="callout-label">Checkpoint</span> if it looks wrong, do it again.</p></aside>',
    );
    const step = html.slice(html.indexOf('id="card-do-the-second-thing"'), html.indexOf('id="card-part-b"'));
    expect(step).toContain('callout-checkpoint');
  });

  it('prints an internal reference as a pointer to its component', () => {
    expect(html).toContain('<a class="ingr-ref ingr-ref-internal" href="#card-part-b">part b</a> <span class="ingr-ref-pointer">(above)</span>');
    expect(html).toContain(
      '<a class="ingr-ref ingr-ref-internal" href="#card-part-a">the first part</a> <span class="ingr-ref-pointer">(from Part A, above)</span>',
    );
  });

  it('prints an external reference as "see <name>", keeping its quantity and note', () => {
    expect(html).toContain(
      '<tr class="ingr ingr-reference"><td class="ingr-qty">80</td><td class="ingr-unit">grams</td><td class="ingr-item">' +
        '<span class="ingr-ref-pointer">see</span> <span class="ingr-ref ingr-ref-external" data-target="../another-recipe/">another recipe</span>' +
        '<span class="ingr-note">, strained</span></td></tr>',
    );
    expect(html).not.toContain('href="../another-recipe/"');
  });

  it('puts a recipe without components in the flat ingredients and directions slots', () => {
    const flat = parts('---\netna: 1\n---\n\n# Malt\n\n## Blend\n\n- 240 g cream\n\nBlend.\n\n## Chill\n\nChill.\n\n## Fold\n\n- 240 g cream\n\nFold.\n');
    expect(flat.html).not.toContain('class="components"');
    expect(flat.html).not.toContain('class="component"');
    expect(count(flat.html, '<div class="ingredients">')).toBe(1);
    expect(count(flat.html, '<li class="direction"')).toBe(3);
    expect(flat.html).toContain('<span class="direction-label">Chill</span> Chill.');
  });

  it('hoists a recipe without components into one unlabeled list, in step order', () => {
    const flat = parts(
      '---\netna: 1\n---\n\n# Waffles\n\n## Cream butter and sugar\n\n- 113 g butter\n- 100 g sugar\n\nCream.\n\n' +
        '## Add flour and milk\n\n- 240 g flour\n- 240 g milk\n\nAdd.\n\n## Bake\n\nBake.\n',
    );
    expect(count(flat.html, '<tbody class="ingr-group">')).toBe(1);
    expect(flat.html).not.toContain('ingr-group-label');
    const items = [...flat.html.matchAll(/<td class="ingr-item">([^<]+)/g)].map((m) => m[1]);
    expect(items).toEqual(['butter', 'sugar', 'flour', 'milk']);
    // The step names still label the directions.
    expect(flat.html).toContain('<span class="direction-label">Cream butter and sugar</span> Cream.');
  });

  it('groups a recipe with components by component, never by step', () => {
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'));
    expect([...table.matchAll(/ingr-group-label[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Part A', 'Part B', 'Assembly']);
  });

  it('prints the lines of top-level steps outside any component ungrouped, where those steps fall', () => {
    const mixed = parts(
      '---\netna: 1\n---\n\n# Waffles\n\n## Preheat\n\n- 5 g oil\n\nHeat the iron.\n\n## Batter\n\n### Mix\n\n- 240 g flour\n\nMix.\n\n### Rest\n\nRest.\n\n' +
        '## Bake the waffles\n\n- 30 g butter\n\nBake.\n',
    );
    const table = mixed.html.slice(mixed.html.indexOf('<table'), mixed.html.indexOf('</table>'));
    const groups = [...table.matchAll(/<tbody class="ingr-group">(.*?)<\/tbody>/g)].map((m) => m[1]);
    expect(groups).toHaveLength(3);
    const items = (g: string) => [...g.matchAll(/<td class="ingr-item">([^<]+)/g)].map((m) => m[1]);
    expect(groups[0]).not.toContain('ingr-group-label');
    expect(items(groups[0])).toEqual(['oil']);
    expect(groups[1]).toMatch(/ingr-group-label[^>]*>Batter</);
    expect(items(groups[1])).toEqual(['flour']);
    expect(groups[2]).not.toContain('ingr-group-label');
    expect(items(groups[2])).toEqual(['butter']);
  });

  it('prints a top-level step after a component as its own titled run, outside that component', () => {
    const shaped = parts(
      '---\netna: 1\n---\n\n# Waffles\n\n## Batter\n\n### Cream butter and sugar\n\n- 113 g butter\n\nCream.\n\n### Add flour\n\n- 300 g flour\n\nAdd.\n\n' +
        '## Bake the waffles\n\n- vegetable oil, for the waffle plates\n\nBake.\n',
    );
    const d = shaped.html.slice(shaped.html.indexOf('<div class="directions">'));
    const batter = d.slice(d.indexOf('id="card-batter"'), d.indexOf('</section>'));
    expect(batter).not.toContain('Bake');
    expect(d).toContain(
      '<section class="part part-step"><h3 class="part-title part-step-title"><span class="direction-label">Bake the waffles</span></h3>',
    );
    // The heading is the title, so the direction is not labeled again.
    expect(d).not.toMatch(/direction-label">Bake the waffles<\/span> Bake/);
    expect(d.indexOf('</section>')).toBeLessThan(d.indexOf('part-step'));
    // The Batter part's own steps keep their run-in labels.
    expect(d).toContain('<span class="direction-label">Cream butter and sugar</span> Cream.');
  });

  it('merges an ingredient entering at two steps into one divided line when both amounts are stated', () => {
    const salt = parts(
      '---\netna: 1\n---\n\n# Stew\n\n## Season\n\n- 1/2 tsp kosher salt, fine\n- 1 lb beef\n\nSeason.\n\n## Finish\n\n- 1 tsp kosher salt, fine\n\nFinish.\n',
    );
    expect(count(salt.html, '<tr class="ingr')).toBe(2);
    expect(salt.html).toContain(
      '<tr class="ingr ingr-divided" data-lines="2"><td class="ingr-qty">1 ½</td><td class="ingr-unit">teaspoons</td>' +
        '<td class="ingr-item">kosher salt<span class="ingr-note">, fine, divided</span></td></tr>',
    );
    // The merged line takes the first line's place.
    expect(salt.html.indexOf('kosher salt')).toBeLessThan(salt.html.indexOf('beef'));
  });

  it('does not say divided twice when the recipe already says it at each step', () => {
    const oil = parts(
      '---\netna: 1\n---\n\n# Stew\n\n## Brown\n\n- 1 tbsp safflower oil, divided\n- 1 lb beef\n\nBrown.\n\n## Soften\n\n- 1 tbsp safflower oil, divided\n\nSoften.\n',
    );
    expect(oil.html).toContain(
      '<tr class="ingr ingr-divided" data-lines="2"><td class="ingr-qty">2</td><td class="ingr-unit">tablespoons</td>' +
        '<td class="ingr-item">safflower oil<span class="ingr-note">, divided</span></td></tr>',
    );
    expect(oil.html).not.toContain('divided, divided');
    // With another note beside it, and whatever its case, the note stays as the recipe wrote it.
    const butter = parts(
      '---\netna: 1\n---\n\n# Stew\n\n## Brown\n\n- 2 tbsp butter, softened, Divided\n\nBrown.\n\n## Finish\n\n- 1 tbsp butter, softened, Divided\n\nFinish.\n',
    );
    expect(butter.html).toContain('<td class="ingr-item">butter<span class="ingr-note">, softened, Divided</span></td>');
  });

  it('prints the lines as written, in order, when an amount is missing or the notes differ', () => {
    const some = parts('---\netna: 1\n---\n\n# Stew\n\n## Season\n\n- 1/2 tsp kosher salt\n\nSeason.\n\n## Finish\n\n- kosher salt\n\nTaste.\n');
    expect(some.html).not.toContain('divided');
    expect(count(some.html, '<td class="ingr-item">kosher salt</td>')).toBe(2);
    expect(some.html).toContain('<td class="ingr-qty">½</td>');
    const notes = parts('---\netna: 1\n---\n\n# Stew\n\n## Season\n\n- 1/2 tsp kosher salt, fine\n\nSeason.\n\n## Finish\n\n- 1 tsp kosher salt, flaky\n\nFinish.\n');
    expect(notes.html).not.toContain('divided');
    expect(notes.html.indexOf('fine')).toBeLessThan(notes.html.indexOf('flaky'));
  });

  it('names the steps of a component inside a part after it', () => {
    const nested = parts(
      '---\netna: 1\n---\n\n# Rolls\n\n## Dough\n\n### Yudane\n\n#### Stir\n\n- 105 g flour\n\nStir.\n\n### Mix\n\n- [yudane](#yudane)\n\nMix.\n\n' +
        '## Filling\n\n### Goo\n\n#### Cook\n\nCook.\n\n#### Cool\n\nCool.\n',
    );
    expect(nested.html).toContain('<section class="part" id="card-dough"><h3 class="part-title">Dough</h3>');
    expect(nested.html).toContain('<span class="direction-label">Yudane</span> Stir.');
    expect(nested.html).toContain('<span class="direction-label">Mix</span> Mix.');
    expect(nested.html).toContain('<span class="direction-label">Goo — Cook</span> Cook.');
    expect(nested.html).toContain('<span class="direction-label">Goo — Cool</span> Cool.');
    expect(nested.html).toContain('href="#card-yudane">yudane</a> <span class="ingr-ref-pointer">(above)</span>');
  });

  it('keeps titled component sections for a hoisted recipe with a Choose', () => {
    const nested = parts(
      '---\netna: 1\n---\n\n# Rolls\n\n## Dough\n\n### Yudane\n\n#### Stir\n\n- 105 g flour\n\nStir.\n\n### Mix\n\n- [yudane](#yudane)\n\nMix.\n\n' +
        '## Bake\n\n> **Choose** — one.\n\n### Oven\n\nBake.\n\n### Pan\n\nFry.\n',
    );
    expect(nested.html).toContain('<section class="component" id="card-dough"><h2 class="component-title">Dough</h2><section class="component" id="card-yudane"><h3 class="component-title">Yudane</h3>');
    expect(count(nested.html, '<div class="steps">')).toBe(4);
    expect(nested.html).not.toContain('class="part');
  });

  it('renders a Choose component as a "Choose one" block with labeled branches', () => {
    const { html: h } = parts(CHOOSE);
    expect(h).toContain('<section class="component choose" id="card-cook"><h2 class="component-title">Cook</h2>');
    expect(h).toContain('<p class="choose-label">Choose one<span class="choose-text"> — one method.</span></p>');
    expect(count(h, '<div class="choose-branch"')).toBe(2);
    expect(h).toContain('<span class="branch-marker">Option 1</span> Stovetop</h3>');
    expect(h).toContain('<span class="branch-marker">Option 2</span> Microwave</h3>');
    // The Choose callout is the block's label, not an aside.
    expect(h).not.toContain('callout-choose');
    // A single-step branch is named by its branch label alone.
    const stovetop = h.slice(h.indexOf('Option 1'), h.indexOf('Option 2'));
    expect(stovetop).not.toContain('direction-label');
    expect(stovetop).not.toContain('ingr-group-label');
    expect(stovetop).toContain('Cook until thick.');
    // A multi-step branch keeps its step labels.
    const microwave = h.slice(h.indexOf('Option 2'), h.indexOf('Stir in the vanilla'));
    expect(microwave).toContain('<span class="direction-label">Heat</span>');
    expect(microwave).toContain('<span class="direction-label">Stir</span>');
    // Steps before and after the Choose component keep their place around it.
    expect(h.indexOf('Whisk.')).toBeLessThan(h.indexOf('choose-label'));
    expect(h.indexOf('choose-label')).toBeLessThan(h.indexOf('Stir in the vanilla.'));
  });
});

describe('escaping', () => {
  const HOSTILE = `---
etna: 1
form: traditional
source: <img src=x onerror=alert(1)>
---

# <script>alert("t")</script> & </style><b>

## Ingredients

**<i>Group</i>**

- 1 cup <b>sugar</b>, "sifted" <br>
- [<u>link</u>](javascript:alert(1))

## Directions

1. **<em>Label</em>** — Mix <script>x()</script> & stir. [bad](javascript:alert(1)) [ok](https://example.com/?a=1&b=2) {{notes}}

## Notes

A <table> note with {{title}} and {{#notes}}braces{{/notes}}.
`;
  const doc = renderCard(recipe(HOSTILE), theme, { slots: { source: true }, notes: true });
  // The body without the renderer's own paging script, which is code, not recipe text.
  const body = withoutScript(doc.slice(doc.indexOf('<body')));

  it('never emits recipe text as markup', () => {
    for (const raw of ['<script>', '<b>', '<i>', '<u>', '<br>', '<img', '<table>', '<em>Label']) expect(body).not.toContain(raw);
    expect(body).toContain('&lt;script&gt;alert(&quot;t&quot;)&lt;/script&gt; &amp; &lt;/style&gt;&lt;b&gt;');
    expect(body).toContain('&lt;b&gt;sugar&lt;/b&gt;');
    expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(doc).not.toContain('javascript:');
  });

  it('keeps safe links and escapes their address', () => {
    // A link out of the card opens in a new window, never in the card's own frame.
    expect(body).toContain('<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a>');
    expect(body).toContain('bad');
  });

  it('prints protocol-relative links, and relative links that leave the recipe, as text', () => {
    const doc = renderCard(
      recipe(
        '---\netna: 1\nform: traditional\n---\n\n# Links\n\n## Ingredients\n\n- 1 egg\n\n## Directions\n\n' +
          '1. See [share](//attacker.example/share), [unc](\\\\host\\share), [up](../../../../etc/passwd), ' +
          '[up2](notes/%2e%2e/%2e%2e/x), [root](/etc/passwd), [here](photo.jpg), [anchor](#links) and [web](https://example.com/).\n',
      ),
      theme,
    );
    const body = withoutScript(doc.slice(doc.indexOf('<body')));
    for (const text of ['share', 'unc', 'up', 'up2', 'root']) expect(body).not.toMatch(new RegExp(`<a [^>]*>${text}</a>`));
    expect(body).not.toMatch(/href="(\/\/|\\|\.\.|\/etc)/);
    expect(body).toContain('See share, unc, up, up2, root,');
    expect(body).toContain('<a href="photo.jpg" target="_blank" rel="noopener noreferrer">here</a>');
    expect(body).toContain('<a href="#links">anchor</a>');
    expect(body).toContain('<a href="https://example.com/" target="_blank" rel="noopener noreferrer">web</a>');
  });

  it('does not let the title close the style element', () => {
    const style = doc.slice(doc.indexOf('<style>'), doc.indexOf('<style id="card-print-paged"'));
    expect(count(style, '</style>')).toBe(1);
    expect(style).not.toContain('<script>');
    expect(doc.slice(0, doc.indexOf('<style>'))).toContain('<title>&lt;script&gt;');
  });

  it('does not read recipe text as slot syntax', () => {
    expect(body).toContain('{{notes}}');
    expect(body).toContain('A &lt;table&gt; note with {{title}} and {{#notes}}braces{{/notes}}.');
  });
});

describe('stylesheet', () => {
  it('renders with its own stylesheet', () => {
    const { html, css } = parts(TRADITIONAL);
    expect(html).toContain('<article class="card">');
    expect(css).toContain('Binder / Classic');
    expect(css).toContain('@page { size: letter; margin: 0.45in 0.25in 0.5in; }');
    expect(css).toContain('.ingr-table');
    expect(html).toContain('<span class="direction-number">1</span>');
  });

  it('hides step numbers, as the original Binder pages do', () => {
    expect(parts(TRADITIONAL).css).toMatch(/\.direction-number \{ display: none; \}/);
  });
});

describe('slots', () => {
  it('Binder shows no notes or metadata by default', () => {
    const { html } = parts(TRADITIONAL);
    expect(html).not.toContain('class="notes"');
    expect(html).not.toContain('Keeps three days.');
    expect(html).not.toContain('Freeze the rest.');
    // Nothing says notes were left out: no heading, no placeholder.
    expect(html).not.toMatch(/notes/i);
    expect(html).not.toContain('card-meta');
    expect(html).not.toContain('Nonna');
    expect(html).not.toContain('4 bowls');
  });

  it('prints the notes only when asked, and a caller or theme can still turn them off', () => {
    expect(parts(TRADITIONAL, { notes: true }).html).toContain('Keeps three days.');
    expect(parts(TRADITIONAL, { notes: false }).html).not.toContain('Keeps three days.');
    // slots.notes alone does not ask for them; it can only turn them off.
    expect(parts(TRADITIONAL, { slots: { notes: true } }).html).not.toContain('Keeps three days.');
    const { html } = parts(TRADITIONAL, { notes: true, slots: { notes: false } });
    expect(html).not.toContain('class="notes"');
    expect(html).not.toContain('Keeps three days.');
    const options = theme.manifest.options as Record<string, unknown>;
    const off = { ...theme, manifest: { ...theme.manifest, options: { ...options, slots: { ...(options.slots as object), notes: false } } } };
    expect(renderCardParts(recipe(TRADITIONAL), off, { notes: true }).html).not.toContain('Keeps three days.');
  });

  it('turns metadata slots on one by one', () => {
    const one = parts(TRADITIONAL, { slots: { yield: true } }).html;
    expect(one).toContain('<p class="card-meta">');
    expect(one).toContain('<span class="meta-label">Yield</span> 4 bowls');
    expect(one).not.toContain('Nonna');

    const all = parts(TRADITIONAL, { slots: { yield: true, source: true, version: true, license: true } }).html;
    expect(all).toContain('<span class="meta-label">Source</span> Nonna');
    expect(all).toContain('<span class="meta-label">Version</span> v3');
    expect(all).toContain('<span class="meta-label">License</span> CC BY 4.0');
  });

  it('drops a slot that is on but has nothing to show', () => {
    const { html } = parts('---\netna: 1\nform: traditional\n---\n\n# T\n\n## Directions\n\n1. Do.\n', { slots: { yield: true, source: true } });
    expect(html).not.toContain('card-meta');
    expect(html).not.toContain('meta-label');
  });

  it('never drops the core, whatever the options say', () => {
    const { html } = parts(TRADITIONAL, { slots: { title: false, ingredients: false, directions: false } });
    expect(html).toContain('Test Soup');
    expect(html).toContain('ingr-table');
    expect(html).toContain('direction-list');
  });

  it('leaves no slot syntax behind', () => {
    for (const source of [TRADITIONAL, STRUCTURED, CHOOSE]) {
      const doc = renderCard(recipe(source), theme);
      expect(doc).not.toMatch(/\{\{[#/]?[a-z-]+\}\}/);
    }
  });

  it('still prints components for a skeleton without a {{components}} slot', () => {
    const plain = parseTheme({
      'theme.yaml': 'name: Plain\n',
      'card.html': '<h1>{{title}}</h1>{{#ingredients}}<div class="i">{{ingredients}}</div>{{/ingredients}}<div class="d">{{directions}}</div>',
      'card.css': '.x {}',
    });
    const { html } = renderCardParts(recipe(CHOOSE), plain);
    expect(html).not.toContain('class="i"');
    expect(html).toContain('<section class="component choose"');
    expect(html).toContain('Stir in the vanilla.');
  });
});

describe('display and font options', () => {
  it('writes units as symbols', () => {
    const { html } = parts(TRADITIONAL, { display: { units: 'symbol' } });
    expect(html).toContain('<td class="ingr-qty">227</td><td class="ingr-unit">g</td>');
    expect(html).toContain('<td class="ingr-qty">1 ½</td><td class="ingr-unit">tbsp</td>');
    expect(html).toContain('<td class="ingr-unit">cloves</td>');
  });

  it('writes fractions in ASCII and ranges with a dash', () => {
    const { html } = parts(TRADITIONAL, { display: { fractions: 'ascii', range: 'dash' } });
    expect(html).toContain('<td class="ingr-qty">1 1/2</td>');
    expect(html).toContain('<td class="ingr-qty">2–3</td>');
  });

  it('emits fonts and page size as custom properties', () => {
    const { css } = parts(TRADITIONAL);
    expect(css).toContain('--card-font-body: Jost, sans-serif;');
    expect(css).toContain('--card-font-title: Quicksand, sans-serif;');
    expect(css).toContain('--card-font-size: 11pt;');
    expect(css).toContain('--card-page-width: 8.5in;');
    expect(css).toContain('--card-page-height: 11in;');
  });

  it('overrides fonts from the options, and from theme.yaml', () => {
    const { css } = parts(TRADITIONAL, { fonts: { body: '"Gill Sans", sans-serif' } });
    expect(css).toContain('--card-font-body: "Gill Sans", sans-serif;');
    expect(css).toContain('--card-font-title: Quicksand, sans-serif;');

    const files = {
      'theme.yaml': 'name: T\npage:\n  size: a4\noptions:\n  font-size: 9pt\n  fonts:\n    title: Georgia, serif\n',
      'card.html': '{{title}}',
      'card.css': '',
    };
    const custom = renderCardParts(recipe(TRADITIONAL), parseTheme(files)).css;
    expect(custom).toContain('--card-font-title: Georgia, serif;');
    expect(custom).toContain('--card-font-title-weight: 700;');
    expect(custom).toContain('--card-font-size: 9pt;');
    expect(custom).toContain('@page { size: a4; margin: 0.5in; }');
    expect(custom).toContain('--card-page-width: 210mm;');
  });

  it('writes the title weight theme.yaml states', () => {
    const files = (weight: string) => ({
      'theme.yaml': `name: T\noptions:\n  fonts:\n    title: Georgia, serif\n    title-weight: ${weight}\n`,
      'card.html': '{{title}}',
      'card.css': '',
    });
    expect(renderCardParts(recipe(TRADITIONAL), parseTheme(files('300'))).css).toContain('--card-font-title-weight: 300;');
    // Not a weight in hundreds: a heading's weight, never the text as written.
    expect(renderCardParts(recipe(TRADITIONAL), parseTheme(files('"300; color: red"'))).css).toContain('--card-font-title-weight: 700;');
    expect(cardType(parseTheme(files('500')))).toEqual({ body: { stack: 'Futura, "Jost", "Avenir Next", "Century Gothic", sans-serif' }, title: { stack: 'Georgia, serif', weight: 500 } });
  });

  it('does not let a font value break out of its declaration', () => {
    const { css } = parts(TRADITIONAL, { fonts: { body: 'x; } body { display: none } </style><script>' } });
    const line = css.split('\n').find((l) => l.includes('--card-font-body'))!;
    expect(line).toBe('  --card-font-body: x  body  display none  stylescript;');
  });
});

describe('renderCard and renderCardParts', () => {
  it('renderCard gives a standalone document with the CSS inlined', () => {
    const doc = renderCard(recipe(TRADITIONAL), theme);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('<title>Test Soup</title>');
    expect(count(doc, '<style>')).toBe(1);
    expect(doc).toContain('@page {');
    expect(doc).toContain('<body class="card-page">');
    expect(count(doc, '<script>')).toBe(1); // the paging script, nothing else
    expect(withoutIcon(withoutScript(doc))).not.toMatch(/<link|<script|@import|url\(/);
    expect(withoutIcon(renderCard(recipe(TRADITIONAL), theme, { paging: false }))).not.toMatch(/<link|<script|@import|url\(/);
    expect(doc.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('renderCardParts gives the card and its CSS separately', () => {
    const { html, css } = parts(TRADITIONAL);
    expect(html.startsWith('<article class="card">')).toBe(true);
    expect(html.endsWith('</article>')).toBe(true);
    expect(html).not.toMatch(/<html|<head>|<body|<style|doctype/i);
    expect(css).toContain('.card-title');
    expect(css).not.toContain('<');
  });

  it('wraps a skeleton that is only a fragment', () => {
    const fragment = parseTheme({
      'theme.yaml': 'name: Frag\n',
      'card.html': '<div class="card"><h1>{{title}}</h1>{{ingredients}}{{directions}}</div>',
      'card.css': '.card { color: black; }',
    });
    const doc = renderCard(recipe(TRADITIONAL), fragment);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain('.card { color: black; }');
    expect(doc).toContain('<div class="card"><h1>Test Soup</h1><table class="ingr-table">');
    expect(renderCardParts(recipe(TRADITIONAL), fragment).html.startsWith('<div class="card">')).toBe(true);
  });

  it('renders a recipe with no title', () => {
    const { html } = parts('---\netna: 1\nform: traditional\n---\n\n## Directions\n\n1. Do.\n');
    expect(html).toContain('<h1 class="card-title">Untitled recipe</h1>');
  });
});

describe('informational callouts: any label, printed as written (SPEC §5.1)', () => {
  const step = (callouts: string) => parts(`---\netna: 1\n---\n\n# Test\n\n## Cook\n\nStir.\n\n${callouts}\n`).html;

  it('prints each label as written, all with the one class callout-aside', () => {
    const html = step(['Tip', 'Warning', 'Make ahead', 'Variation', 'Storage', 'note'].map((k) => `> **${k}** — text of ${k}.`).join('\n\n'));
    for (const k of ['Tip', 'Warning', 'Make ahead', 'Variation', 'Storage', 'note']) {
      expect(html).toContain(`<aside class="callout callout-aside"><p><span class="callout-label">${k}</span> text of ${k}.</p></aside>`);
    }
    expect(count(html, 'class="callout callout-aside"')).toBe(6);
    expect(html).not.toMatch(/callout-(tip|warning|make|variation|storage|note)\b/);
  });

  it('keeps a near-miss of a keyword an aside', () => {
    const html = step('> **checkpoint** — if thick, add water.');
    expect(html).toContain('<aside class="callout callout-aside"><p><span class="callout-label">checkpoint</span> if thick, add water.</p></aside>');
  });

  it('escapes the label, and a label that names a class is still only text', () => {
    const html = step('> **Salt & "pepper" <b>** — to finish.\n\n> **Label** — not a class.');
    expect(html).toContain('<span class="callout-label">Salt &amp; &quot;pepper&quot; &lt;b&gt;</span> to finish.');
    expect(html).toContain('<aside class="callout callout-aside"><p><span class="callout-label">Label</span> not a class.</p></aside>');
  });

  it('prints a lead longer than 32 characters as the aside\'s bold opening, not as a label', () => {
    const at = 'Watch it closely once it darkens'; // 32 characters: still a label
    expect(at.length).toBe(32);
    expect(step(`> **${at}** — it burns fast.`)).toContain(`<span class="callout-label">${at}</span> it burns fast.`);
    const long = 'Watch it closely once it darkens!';
    const html = step(`> **${long}** — it burns fast.`);
    expect(html).toContain(`<aside class="callout callout-aside"><p><strong>${long}</strong> — it burns fast.</p></aside>`);
    expect(html).not.toContain('callout-label');
    expect(step(`> **${long}**`)).toContain(`<aside class="callout callout-aside"><p><strong>${long}</strong></p></aside>`);
  });

  it('lets a long unbroken label wrap rather than run out of the card', () => {
    expect(parts('---\netna: 1\n---\n\n# T\n\n## Cook\n\nStir.\n').css).toContain('.callout-label { overflow-wrap: anywhere; }');
  });
});

describe('user text that names an Object.prototype member', () => {
  it('renders callouts keyed constructor, __proto__ and toString as their own words', () => {
    const doc = renderCard(
      recipe('---\netna: 1\n---\n\n# Proto\n\n## Mix\n\n- 2 g salt\n\nStir.\n\n> **constructor** — hello\n\n> **__proto__** — there\n\n> **toString** — again\n'),
      theme,
    );
    for (const word of ['constructor', 'proto', 'toString', 'hello', 'there', 'again']) expect(doc).toContain(word);
  });
});

describe('emphasis on a card: italic is for the chart, bold is for the card (ADR 0021)', () => {
  const MARKED = `---
etna: 1
---

# Soup

A *quick* soup, **really**.

## Stock

- 1 l water

Simmer.

## Simmer

- [the stock](#stock), *hot*
- 2 *large* potatoes

Simmer on *medium-low* another _15-25 minutes_, then ***stir*** and **taste *well***.

> **Checkpoint** — *thick* and **glossy**.

## Notes

- **Keeps** — a *week* in the fridge.
`;
  const html = parts(MARKED, { notes: true }).html;

  it('prints every emphasis as plain text: headnote, instruction, callout, note, ingredient note', () => {
    expect(html).not.toContain('<em>');
    expect(html).not.toMatch(/[*_]/);
    for (const words of ['A quick soup', 'Simmer on medium-low another 15-25 minutes, then', 'thick and', 'a week in the fridge', ', hot', '>large<', 'potatoes']) expect(html).toContain(words);
  });

  it('prints bold bold, also with emphasis inside or around it', () => {
    expect(html).toContain('<strong>really</strong>');
    expect(html).toContain('<strong>stir</strong>');
    expect(html).toContain('<strong>taste well</strong>');
    expect(html).toContain('<strong>glossy</strong>');
  });

  it('prints the card of a recipe without its marks exactly as the marked one', () => {
    const unmarked = MARKED.replace(/(?<![*_])[*_](?![*_])/g, '').replace(/\*\*\*(\w+)\*\*\*/g, '**$1**').replace('**taste well***', '**taste well**');
    expect(unmarked).toContain('Simmer on medium-low another 15-25 minutes');
    expect(parts(unmarked, { notes: true }).html).toBe(html);
  });
});
