// Every bundled card theme (a folder under themes/ with a card.html) loads and renders the
// recipes that ship (cookbook/) and a spread of the collection — so a new theme folder is covered as soon as it exists.
// Also: the `layout: paired` the newer themes use for structured recipes.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { CARD_COLOR_ROLES, CORE_CSS, parseTheme, renderCard, renderCardParts } from '../../src/card/index.ts';
import { NAMED_COLOR_NAMES } from '../../src/dag/color.ts';
import { listThemes, loadTheme, THEMES_DIR } from '../../src/card/node.ts';
import { ETNA_ROOT, findRecipes, loadUnits, readRecipe } from '../../src/node/files.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const COLLECTION = process.env.ETNA_COLLECTION ?? join(ETNA_ROOT, '..', 'recipe-collection');
const SAMPLE_SIZE = 40;

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The recipe lines an ingredient table stands for: a `divided` row counts every line merged into it. */
const lines = (html: string) => count(html, '<tr class="ingr') + [...html.matchAll(/data-lines="(\d+)"/g)].reduce((n, m) => n + Number(m[1]) - 1, 0);
const shipped = findRecipes(COOKBOOK).filter((r) => r.file !== null);
const collection = existsSync(COLLECTION) ? findRecipes(COLLECTION).filter((r) => r.file !== null) : [];
const stride = Math.max(1, Math.floor(collection.length / SAMPLE_SIZE));
const sample = collection.filter((_r, i) => i % stride === 0);

/** Render one recipe with a theme and check the card is whole. */
function check(themeName: string, file: string): void {
  const theme = loadTheme(themeName);
  const recipe = readRecipe(file);
  // Ingredient bullets only: a note is a `- ` item too (SPEC §4.2) and prints in the notes, not the table.
  const body = recipe.source.split(/^## Notes\s*$/m)[0];
  const bullets = recipe.traditional ? null : (body.match(/^- /gm) ?? []).length;
  const doc = renderCard(recipe, theme);
  expect(doc.startsWith('<!doctype html>'), file).toBe(true);
  expect(doc, file).toContain('class="card-title"');
  expect(doc, file).not.toMatch(/\{\{[#/]?[a-z-]+\}\}/); // no slot left unfilled
  expect(doc, file).not.toContain('undefined');
  expect(doc, file).not.toContain('[object Object]');
  // With every optional slot on, the card still fills cleanly.
  const { html, css } = renderCardParts(recipe, theme, {
    slots: { yield: true, source: true, version: true, license: true, intro: true, notes: true },
  });
  expect(html, file).not.toMatch(/\{\{[#/]?[a-z-]+\}\}/);
  // A card always has something under its title.
  expect(/ingr-table|direction-list|class="step/.test(html), file).toBe(true);
  // A structured recipe prints every ingredient bullet, whichever way its steps are laid out
  // (a shopping list prints each ingredient once, so it has its own tests in list.test.ts).
  if (bullets !== null && theme.layout !== 'list') expect(lines(html), file).toBe(bullets);
  expect(css, file).toContain('--card-font-body:');
}

describe('every bundled card theme', () => {
  const themes = listThemes();

  it('finds Binder and the themes beside it', () => {
    expect(themes).toContain('binder');
    for (const name of themes) expect(existsSync(join(THEMES_DIR, name, 'card.html')), name).toBe(true);
  });

  describe.each(themes)('%s', (name) => {
    it('loads', () => {
      const theme = loadTheme(name);
      expect(theme.skeleton).toContain('{{title}}');
      // The core of a card is always reachable from the skeleton.
      expect(theme.skeleton).toContain('{{ingredients}}');
      if (theme.layout !== 'list') expect(theme.skeleton).toContain('{{directions}}');
    });

    it('ends both font stacks in a generic family', () => {
      const fonts = (loadTheme(name).manifest.options as { fonts?: Record<string, string | number> } | undefined)?.fonts ?? {};
      for (const stack of [fonts.body, fonts.title]) expect(String(stack).trim()).toMatch(/(serif|sans-serif|monospace)$/);
      // The title's weight is stated beside its font.
      expect(fonts['title-weight']).toSatisfy((w: unknown) => typeof w === 'number' && w % 100 === 0 && w >= 100 && w <= 900);
    });

    it('has a README', () => {
      expect(existsSync(join(THEMES_DIR, name, 'README.md'))).toBe(true);
    });

    it.each(shipped.map((r) => [r.slug, r.file!]))('renders %s', (_slug, file) => {
      check(name, file);
    });

    it.skipIf(sample.length === 0)(`renders ${SAMPLE_SIZE} or so recipes spread across the collection`, () => {
      expect(sample.length).toBeGreaterThanOrEqual(Math.min(SAMPLE_SIZE, collection.length));
      for (const r of sample) check(name, r.file!);
    });

    // Notes are opt-in on every card, in both forms; a step's callouts are not notes.
    describe('notes', () => {
      const units = loadUnits();
      const STRUCTURED = parseRecipe(
        '---\netna: 1\n---\n\n# Shake\n\n## Blend\n\n- 300 g milk\n\nBlend until smooth.\n\n> **Note** — a cold glass helps.\n\n## Notes\n\nKeeps a day.\n\n- Oat milk works too.\n',
        { units },
      );
      const TRADITIONAL = parseRecipe(
        '---\netna: 1\nform: traditional\n---\n\n# Shake\n\n## Ingredients\n\n- 300 g milk\n\n## Directions\n\n1. Blend until smooth.\n\n## Notes\n\nKeeps a day.\n\n- Oat milk works too.\n',
        { units },
      );
      const theme = loadTheme(name);
      const list = theme.layout === 'list';
      it.each([
        ['structured', STRUCTURED],
        ['traditional', TRADITIONAL],
      ])('leaves out the notes of a %s recipe unless asked', (_form, recipe) => {
        const hidden = renderCardParts(recipe, theme).html;
        expect(hidden).not.toContain('Keeps a day.');
        expect(hidden).not.toContain('Oat milk');
        expect(hidden).not.toContain('class="notes"');
        expect(renderCard(recipe, theme)).not.toContain('Keeps a day.');
        const shown = renderCardParts(recipe, theme, { notes: true }).html;
        // A shopping list theme has no place for a recipe's notes.
        expect(shown.includes('Keeps a day.')).toBe(!list);
        expect(shown.includes('Oat milk works too.')).toBe(!list);
      });
      it.skipIf(list)('always prints a callout inside a step', () => {
        expect(renderCardParts(STRUCTURED, theme).html).toContain('a cold glass helps.');
      });
    });

    // A shopping list turns its notes off.
    it.skipIf(loadTheme(name).layout === 'list')('keeps the notes of a traditional recipe that has no directions', () => {
      const recipe = parseRecipe(
        '---\netna: 1\nform: traditional\n---\n\n# Mix\n\n## Ingredients\n\n- 1 g salt\n\n## Directions\n\n## Notes\n\nKeeps a year.\n',
        { units: loadUnits() },
      );
      const { html } = renderCardParts(recipe, loadTheme(name), { notes: true });
      expect(html).toContain('salt');
      expect(html).toContain('Keeps a year.');
    });
  });
});

// ----------------------------------------------------------------- layout: paired

const units = loadUnits();
const FILES = (options: string) => ({
  'theme.yaml': `name: Pair\noptions:\n${options}`,
  'card.html':
    '<article class="card">{{title}}{{#ingredients}}<div class="ingredients">{{ingredients}}</div>{{/ingredients}}' +
    '{{#directions}}<div class="directions">{{directions}}</div>{{/directions}}' +
    '{{#components}}<div class="components">{{components}}</div>{{/components}}</article>',
  'card.css': '',
});
const paired = parseTheme(FILES('  layout: paired\n'));
const hoisted = parseTheme(FILES('  layout: hoisted\n'));

const FLAT = `---
etna: 1
---

# Ice

## Blend the base

- 240 g cream
- 85 g egg yolk

Blend on high for 5 minutes.

> **Checkpoint** — it should coat a spoon.

## Chill

Chill.

## Wait 10 minutes

Wait for 10 minutes.

## Churn

Churn in an ice cream maker until thick.
`;

const NESTED = `---
etna: 1
---

# Bowl

## Broth

### Simmer

- 1000 g water

Simmer for 20 minutes.

## Noodles

> **Choose** — one noodle.

### Wheat noodles

- 200 g wheat noodles

Boil for 4 minutes.

### Rice noodles

- 200 g rice noodles

Soak for 10 minutes.

## Assembly

### Combine

- [broth](#broth)
- 2 scallions, sliced

Ladle the broth over the noodles.
`;

describe('layout: paired', () => {
  it('is off unless the theme or the caller asks for it', () => {
    const recipe = parseRecipe(FLAT, { units });
    const plain = parseTheme(FILES('  font-size: 11pt\n'));
    expect(renderCardParts(recipe, plain).html).not.toContain('steps-paired');
    expect(renderCardParts(recipe, hoisted).html).toBe(renderCardParts(recipe, plain).html);
    expect(renderCardParts(recipe, plain, { layout: 'paired' }).html).toContain('steps-paired');
    expect(renderCardParts(recipe, paired, { layout: 'hoisted' }).html).toBe(renderCardParts(recipe, plain).html);
    expect(plain.layout).toBe('hoisted');
    expect(paired.layout).toBe('paired');
  });

  it('refuses an unknown layout, naming the known ones', () => {
    const recipe = parseRecipe(FLAT, { units });
    expect(() => parseTheme(FILES('  layout: sideways\n'))).toThrow(/unknown layout "sideways" \(known layouts: hoisted, paired, list\)/);
    // @ts-expect-error -- not a layout
    expect(() => renderCardParts(recipe, hoisted, { layout: 'sideways' })).toThrow(/known layouts: hoisted, paired, list/);
    // An option the renderer does not know does nothing: the checker reports it.
    expect(parseTheme(FILES('  steps: paired\n')).layout).toBe('hoisted');
  });

  it('leaves Binder as it was: one hoisted table per run of steps', () => {
    const html = renderCardParts(parseRecipe(NESTED, { units }), loadTheme('binder')).html;
    expect(html).not.toContain('steps-paired');
    expect(html).not.toContain('<section class="step');
    expect(html).toContain('<ol class="direction-list">');
  });

  it('gives each step one block: heading, its own ingredients, its direction', () => {
    const { html } = renderCardParts(parseRecipe(FLAT, { units }), paired);
    expect(count(html, '<section class="step')).toBe(4);
    expect(html).toContain(
      '<section class="step step-with-ingredients" id="card-blend-the-base">' +
        '<header class="step-head"><span class="step-number">1</span><h2 class="step-title">Blend the base</h2></header>' +
        '<div class="step-ingredients"><table class="ingr-table"><tbody class="ingr-group">',
    );
    expect(html).toContain('<div class="step-body"><p class="direction-text">Blend on high for 5 minutes.</p><aside class="callout callout-checkpoint">');
    // No hoisted table and no direction list: the method is one slot.
    expect(html).not.toContain('direction-list');
    expect(html).not.toContain('ingr-group-label');
    expect(html).toContain('<div class="components"><div class="steps steps-paired">');
    expect(html).not.toContain('<div class="ingredients">');
    expect(html).not.toContain('<div class="directions">');
    expect(count(html, '<tr class="ingr')).toBe(2);
  });

  it('marks a step whose direction only repeats its heading', () => {
    const { html } = renderCardParts(parseRecipe(FLAT, { units }), paired);
    expect(html).toContain('<section class="step step-echo" id="card-chill">');
    // "Wait for 10 minutes." says a word the heading does not: hiding it would drop the author's text.
    expect(html).toContain('<section class="step" id="card-wait-10-minutes">');
    expect(html).toContain('<section class="step" id="card-churn">'); // says more than its heading
    expect(html).toContain('<section class="step step-with-ingredients" id="card-blend-the-base">');
    // The text is still there: hiding it is the theme's choice.
    expect(html).toContain('<p class="direction-text">Chill.</p>');
  });

  it('pairs steps inside components, with headings one level below the component', () => {
    const { html } = renderCardParts(parseRecipe(NESTED, { units }), paired);
    expect(html).toContain('<h2 class="component-title">Broth</h2><div class="steps steps-paired"><section class="step step-with-ingredients" id="card-simmer">');
    expect(html).toContain('<h3 class="step-title">Simmer</h3>');
    // References keep their link and their pointer.
    expect(html).toContain('<a class="ingr-ref ingr-ref-internal" href="#card-broth">broth</a> <span class="ingr-ref-pointer">(above)</span>');
  });

  it('prints a Choose branch as a bare step: the branch label names it', () => {
    const { html } = renderCardParts(parseRecipe(NESTED, { units }), paired);
    expect(count(html, '<div class="choose-branch">')).toBe(2);
    expect(html).toMatch(/<div class="choose-branch"><h3 class="branch-label">.*?Wheat noodles<\/h3><div class="steps steps-paired"><section class="step step-with-ingredients" id="card-wheat-noodles"><div class="step-ingredients">/);
    expect(html).not.toContain('class="step-title">Wheat noodles');
  });

  it('a skeleton without a components slot still prints paired steps, after its directions', () => {
    const files = FILES('  layout: paired\n');
    files['card.html'] = '<article>{{title}}<div class="d">{{directions}}</div></article>';
    const { html } = renderCardParts(parseRecipe(FLAT, { units }), parseTheme(files));
    expect(html).toContain('<div class="d"><div class="steps steps-paired">');
  });

  it('does not touch a traditional recipe', () => {
    const source = '---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n- 1 g salt\n\n## Directions\n\n1. Mix.\n';
    const recipe = parseRecipe(source, { units });
    expect(renderCardParts(recipe, paired).html).toBe(renderCardParts(recipe, hoisted).html);
  });

  it('every structured example keeps all its ingredients and all its step text when paired', () => {
    for (const example of shipped) {
      const recipe = readRecipe(example.file!);
      if (recipe.form !== 'structured') continue;
      const a = renderCardParts(recipe, hoisted).html;
      const b = renderCardParts(recipe, paired).html;
      expect(count(b, '<tr class="ingr'), example.slug).toBe(lines(a));
      expect(count(b, '<aside class="callout'), example.slug).toBe(count(a, '<aside class="callout'));
      expect(count(b, '<section class="step'), example.slug).toBe(count(a, '<li class="direction"') + count(a, '<li class="direction direction-alone"'));
    }
  });

  it('marks a step as an echo only when its heading prints the direction word for word', () => {
    const step = (heading: string, text: string) => `## ${heading}\n\n${text}\n`;
    const source = [
      '---\netna: 1\n---\n\n# Echo\n',
      step('Add beans and water', 'Add beans and water.'),
      step('Add the beans', 'Add beans.'),
      step('Combine & rest', 'Combine and rest.'),
      step('Or', 'OR -'),
      step('Combine dry ingredients', 'Combine the dry ingredients.'),
    ].join('\n');
    const { html } = renderCardParts(parseRecipe(source, { units }), paired);
    expect(html).toContain('<section class="step step-echo" id="card-add-beans-and-water">');
    for (const id of ['add-the-beans', 'combine--rest', 'or', 'combine-dry-ingredients']) expect(html).toContain(`<section class="step" id="card-${id}">`);
    // Every direction is in the card; only an echo's may be hidden by the theme.
    for (const text of ['Add beans and water.', 'Add beans.', 'Combine and rest.', 'OR -', 'Combine the dry ingredients.']) expect(html).toContain(`<p class="direction-text">${text}</p>`);
  });
});

// ------------------------------------------------- steps after a sub-component

const RESUMED = `---
etna: 1
---

# Test Recipe

## Part A

### Do the first thing

- 100 g flour

Do the first thing, then wait.

### Part B

#### Do the second thing

- 40 g sugar

Do the second thing, then wait.

#### Do the third thing

Do the third thing, then wait.

### Do the fourth thing

- 3 tbsp butter

Do the fourth thing, then wait.

### Do the fifth thing

- [part b](#part-b)

Do the fifth thing, then wait.

## Assembly

### Do the last thing

- [part a](#part-a)

Do the last thing, then wait.
`;

describe('steps that follow a sub-component', () => {
  const recipe = parseRecipe(RESUMED, { units });
  /** The text of the HTML, tags dropped, in order. */
  const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('print under their own component, not the sub-component, when paired', () => {
    const { html } = renderCardParts(recipe, paired);
    // The sub-component's section closes before the parent's next steps, which carry the parent's name again.
    expect(html).toContain(
      '</section></div></section><section class="component component-resumed"><h3 class="component-title">Part A</h3>' +
        '<div class="steps steps-paired"><section class="step step-with-ingredients" id="card-do-the-fourth-thing">',
    );
    expect(count(html, 'component-resumed')).toBe(1);
    const t = text(html);
    expect(t).toMatch(/Part B .*Do the third thing, then wait\. Part A 1 Do the fourth thing/);
    // Steps before the sub-component, and a component with no sub-component, are as they were.
    expect(html).toContain('<h2 class="component-title">Part A</h2><div class="steps steps-paired"><section class="step step-with-ingredients" id="card-do-the-first-thing">');
    expect(html).toContain('<h2 class="component-title">Assembly</h2><div class="steps steps-paired">');
    // No step is lost or printed twice.
    expect(count(html, '<section class="step')).toBe(6);
  });

  it('print under their own component in every bundled paired theme', () => {
    for (const name of listThemes()) {
      let theme;
      try {
        theme = loadTheme(name);
      } catch {
        continue; // a chart theme
      }
      if (theme.layout !== 'paired') continue;
      const { html } = renderCardParts(recipe, theme);
      expect(html, name).toMatch(/<section class="component component-resumed"><h\d class="component-title">Part A<\/h\d>/);
    }
  });

  it('print under their own component when hoisted (Binder): the part keeps them, sub-component steps carry its name', () => {
    const { html } = renderCardParts(recipe, loadTheme('binder'));
    expect(html).not.toContain('component-resumed');
    const t = text(html);
    const order = ['Do the first thing', 'Part B — Do the second thing', 'Part B — Do the third thing', 'Do the fourth thing', 'Do the fifth thing'];
    const at = order.map((s) => t.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // "Do the fourth thing" is a step of Part A, named on its own, not under Part B's name.
    expect(t).not.toContain('Part B — Do the fourth thing');
  });

  it('a top-level Choose keeps its branches and its own steps in order', () => {
    const source = RESUMED.replace('## Assembly', '## Topping\n\n> **Choose** — one.\n\n### Crumb\n\nCrumble.\n\n### Lattice\n\nWeave.\n\n## Assembly');
    const { html } = renderCardParts(parseRecipe(source, { units }), loadTheme('binder'));
    expect(html).toContain('component-resumed'); // a Choose recipe keeps its component sections when hoisted
    expect(count(html, '<div class="choose-branch"')).toBe(2);
  });
});

describe('theme files', () => {
  it('no theme stylesheet can close the <style> element it is inlined in', () => {
    for (const name of listThemes()) {
      const dir = join(THEMES_DIR, name);
      const theme = loadTheme(name);
      expect(theme.css, name).not.toMatch(/<\/style/i);
      expect(readFileSync(join(dir, 'theme.yaml'), 'utf8').length, name).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------------- color roles

/**
 * The colors a stylesheet writes itself: hex values, color functions and named colors in
 * declaration values (comments and strings dropped; `currentColor`, `transparent` and `inherit`
 * are not colors of the stylesheet's own).
 */
function literalColors(css: string): string[] {
  const named = new Set(NAMED_COLOR_NAMES);
  const found: string[] = [];
  const values = css
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .matchAll(/:([^;{}]*)(?=[;}])/g);
  for (const [, value] of values) {
    found.push(...(value.match(/#[0-9a-f]{3,8}\b/gi) ?? []));
    found.push(...(value.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\([^)]*\)/gi) ?? []));
    for (const word of value.match(/(?<![\w-])[a-z]+(?![\w-])/gi) ?? []) if (named.has(word.toLowerCase())) found.push(word);
  }
  return found;
}

/** The colors a bundled theme keeps as its own design; everything else comes from the roles. */
const OWN_COLORS: Record<string, string[]> = {};

describe('color roles', () => {
  const themes = listThemes().filter((name) => existsSync(join(THEMES_DIR, name, 'card.html')));

  it('finds the colors a stylesheet writes, and nothing else', () => {
    expect(literalColors('.a { color: #444; border: 1pt solid black; background: rgb(0 0 0 / 50%); }')).toEqual(['#444', 'black', 'rgb(0 0 0 / 50%)']);
    expect(literalColors('/* #000 */ .a { content: "red"; color: var(--card-ink); border: 1px solid currentColor; } .b:hover { color: inherit }')).toEqual([]);
  });

  it.each(themes)('%s writes no color of its own beyond those listed', (name) => {
    const theme = loadTheme(name);
    expect(literalColors(theme.css).sort(), name).toEqual([...(OWN_COLORS[name] ?? [])].sort());
  });

  it('the core stylesheet writes no color but its on-screen shadow', () => {
    expect(literalColors(CORE_CSS)).toEqual(['rgba(0, 0, 0, 0.25)']);
  });

  it('are written on :root, before the core stylesheet, with their defaults', () => {
    expect(CARD_COLOR_ROLES).toEqual({
      '--card-paper': '#fff',
      '--card-desk': '#e8e8e4',
      '--card-ink': '#000',
      '--card-ink-soft': '#444',
    });
    for (const name of themes) {
      const { css } = renderCardParts(parseRecipe('---\netna: 1\n---\n\n# Salt\n\n## Mix\n\n- 1 g salt\n\nMix.\n', { units: loadUnits() }), loadTheme(name));
      const root = css.slice(css.indexOf(':root {'), css.indexOf(CORE_CSS));
      expect(root.length, name).toBeGreaterThan(0);
      for (const [property, value] of Object.entries(CARD_COLOR_ROLES)) expect(root, `${name} ${property}`).toContain(`  ${property}: ${value};\n`);
    }
  });
});
