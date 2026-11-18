// A traditional recipe's parts (SPEC §4.1) on a card: part markup, numbering that restarts
// in each part, the paired arrangement (`options.parts`), the older spellings, and the rule
// that a run of steps is numbered throughout or not at all — in every bundled theme.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { renderCard, renderCardParts, type CardOptions } from '../../src/card/index.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import { findBrowser, openPrinter } from '../../src/card/pdf.ts';
import { ETNA_ROOT, findRecipes, loadUnits, readRecipe } from '../../src/node/files.ts';

const units = loadUnits();
const recipe = (source: string) => parseRecipe(source, { units });
const count = (html: string, needle: string) => html.split(needle).length - 1;
const html = (source: string | Recipe, theme = 'binder', options: CardOptions = {}) =>
  renderCardParts(typeof source === 'string' ? recipe(source) : source, loadTheme(theme), options).html;

const HEAD = '---\netna: 1\nform: traditional\n---\n\n# Test Recipe\n\n';

const HEADED =
  HEAD +
  '## Ingredients\n\n### Beans\n\n- 100 g kidney beans\n- kosher salt\n\n### Sauce\n\n- 10 g olive oil\n- 100 g onion\n\n### Finish\n\n- 100 g cream\n\n' +
  '## Directions\n\n### Beans\n\n1. **Soak** — Soak the beans overnight.\n2. Pressure-cook the beans.\n\n' +
  '### Sauce\n\n1. Sauté the onion.\n2. Blend the sauce.\n3. Simmer.\n\n### Finish\n\n1. Stir in the cream.\n\n## Notes\n\nKeeps three days.\n';

/** Steps before the first part heading, and a name on each side with no partner on the other. */
const UNPAIRED =
  HEAD +
  '## Ingredients\n\n### Puree\n\n- 100 g onion\n- 100 g tomatoes\n\n### Curry\n\n- 100 g paneer\n\n' +
  '## Directions\n\n1. Soak the paneer.\n\n### Tomato puree\n\n1. Cook the onion.\n2. Blend.\n\n### Curry\n\n1. Fry the spices.\n2. Add the paneer.\n';

/** The unnamed leading part on both sides, and a garnish with no steps of its own. */
const INGREDIENTS_ONLY =
  HEAD +
  '## Ingredients\n\n- 1 g salt\n\n### Sauce\n\n- 10 g olive oil\n\n### Garnish\n\n- 5 g parsley\n\n' +
  '## Directions\n\n1. Salt the water.\n\n### Sauce\n\n1. Warm the oil.\n2. Cook it down.\n';

/** An assembly with no ingredients of its own. */
const STEPS_ONLY =
  HEAD +
  '## Ingredients\n\n### Sauce\n\n- 10 g olive oil\n\n### Pasta\n\n- 200 g pasta\n\n' +
  '## Directions\n\n### Sauce\n\n1. Warm the oil.\n2. Cook it down.\n\n### Assembly\n\n1. Layer it all.\n2. Bake.\n\n### Pasta\n\n1. Boil the pasta.\n';

/** The older spelling: a bold-line group, and bold labels heading runs of steps. */
const OLDER =
  HEAD +
  '## Ingredients\n\n- 100 g kidney beans\n\n**Sauce**\n\n- 10 g olive oil\n\n' +
  '## Directions\n\n1. **Beans** — Soak the beans.\n2. Pressure-cook them.\n3. **Sauce** — Sauté the onion.\n4. Blend.\n';

/** Ingredient parts, directions without any. */
const GROUPS_ONLY =
  HEAD + '## Ingredients\n\n### Dough\n\n- 300 g flour\n\n### Glaze\n\n- 100 g sugar\n\n## Directions\n\n1. **Dough** — Mix.\n2. Bake.\n3. **Glaze** — Glaze.\n';

const PLAIN = HEAD + '## Ingredients\n\n- 1 g salt\n\n## Directions\n\n1. Salt it.\n2. Eat it.\n';

/** The direction lists of a card, each with its steps' classes and printed numbers, in order. */
function runs(card: string): { alone: boolean; number: string | null }[][] {
  const lists: { alone: boolean; number: string | null }[][] = [];
  let at = card.indexOf('<ol class="direction-list">');
  while (at >= 0) {
    // The list's own end: Markdown lists nested in a step are <ol>s too.
    let depth = 0;
    let end = at;
    const tags = /<ol\b|<\/ol>/g;
    tags.lastIndex = at;
    for (let m = tags.exec(card); m !== null; m = tags.exec(card)) {
      depth += m[0] === '</ol>' ? -1 : 1;
      if (depth === 0) {
        end = m.index;
        break;
      }
    }
    const list = card.slice(at, end);
    lists.push(
      [...list.matchAll(/<li class="direction( direction-alone)?"[^>]*>(<span class="direction-number">(\d+)<\/span>)?/g)].map((m) => ({
        alone: m[1] !== undefined,
        number: m[3] ?? null,
      })),
    );
    at = card.indexOf('<ol class="direction-list">', end);
  }
  return lists;
}

/**
 * Problems with the rule "a run of steps is numbered throughout or not at all": every step
 * carries its number, 1…n, and only the one step of a one-step run is `direction-alone`.
 */
function numberingProblems(card: string): string[] {
  const problems: string[] = [];
  for (const run of runs(card)) {
    run.forEach((step, i) => {
      if (step.number !== String(i + 1)) problems.push(`step ${i + 1} of ${run.length} is numbered ${step.number ?? 'not at all'}`);
      if (step.alone !== (run.length === 1)) problems.push(`step ${i + 1} of ${run.length} is ${step.alone ? '' : 'not '}marked alone`);
    });
  }
  return problems;
}

/** Rules in a stylesheet that hide step numbers for some steps only (by a label, say). */
function selectiveNumberHiding(css: string): string[] {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const m of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/display\s*:\s*none/.test(m[2])) continue;
    for (const selector of m[1].split(',').map((s) => s.trim())) {
      if (!selector.includes('direction-number')) continue;
      if (selector === '.direction-number' || selector === '.direction-alone > .direction-number') continue;
      found.push(selector);
    }
  }
  return found;
}

describe('parts as headings', () => {
  const card = html(HEADED, 'binder', { notes: true });

  it('prints a titled part per direction part, its steps numbered from 1', () => {
    expect(count(card, '<section class="part">')).toBe(3);
    expect(card).toContain('<section class="part"><h3 class="part-title">Beans</h3><ol class="direction-list">');
    expect(card).toContain('<h3 class="part-title">Sauce</h3>');
    expect(runs(card).map((r) => r.map((s) => s.number))).toEqual([['1', '2'], ['1', '2', '3'], ['1']]);
    expect(card.indexOf('part-title">Beans')).toBeLessThan(card.indexOf('Soak the beans'));
    expect(card.indexOf('Pressure-cook')).toBeLessThan(card.indexOf('part-title">Sauce'));
  });

  it('prints a bold lead as the step name, after the number', () => {
    expect(card).toContain(
      '<li class="direction" value="1"><span class="direction-number">1</span><div class="direction-body">' +
        '<p class="direction-text"><span class="direction-label">Soak</span> Soak the beans overnight.</p>',
    );
  });

  it('marks the only step of a part, whose number the core hides', () => {
    expect(card).toContain('<li class="direction direction-alone" value="1"><span class="direction-number">1</span>');
    expect(renderCard(recipe(HEADED), loadTheme('binder'))).toContain('.direction-alone > .direction-number { display: none; }');
  });

  it('keeps the ingredients as one table, the parts as its groups', () => {
    expect(count(card, '<table class="ingr-table">')).toBe(1);
    expect([...card.matchAll(/ingr-group-label[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Beans', 'Sauce', 'Finish']);
    expect(card).toContain('<footer class="notes">');
  });

  it('prints a named ingredient part even when it lists nothing', () => {
    const source = '---\netna: 1\nform: traditional\n---\n\n# Cake\n\n## Ingredients\n\n### Cake -- see the other recipe\n\n### Topping\n\n- 1 cup pecans\n\n## Directions\n\n1. Assemble.\n';
    for (const theme of ['binder', 'mise', 'folio', 'grid']) {
      const out = html(source, theme);
      expect([...out.matchAll(/ingr-group-label[^>]*>([^<]+)</g)].map((m) => m[1]), theme).toEqual(['Cake -- see the other recipe', 'Topping']);
    }
  });

  it('prints the steps before the first part heading as an unnamed part, with no title', () => {
    const c = html(UNPAIRED);
    expect(c).toContain('<section class="part part-unnamed"><ol class="direction-list"><li class="direction direction-alone" value="1">');
    expect(count(c, 'part-title')).toBe(2);
    expect(c.indexOf('Soak the paneer')).toBeLessThan(c.indexOf('part-title">Tomato puree'));
  });
});

describe('a recipe without named direction parts', () => {
  it('prints as it always did: one list, no part markup', () => {
    const c = html(PLAIN);
    expect(c).not.toContain('class="part');
    expect(c).toContain('<div class="directions"><ol class="direction-list"><li class="direction" value="1">');
    expect(runs(c)).toEqual([[{ alone: false, number: '1' }, { alone: false, number: '2' }]]);
  });

  it('in the older spelling: numbers on every step, each bold label as its step name', () => {
    const c = html(OLDER);
    expect(c).not.toContain('class="part');
    expect(runs(c).map((r) => r.map((s) => s.number))).toEqual([['1', '2', '3', '4']]);
    expect(c).toContain('<span class="direction-number">1</span><div class="direction-body"><p class="direction-text"><span class="direction-label">Beans</span> Soak');
    expect(c).toContain('<span class="direction-number">3</span><div class="direction-body"><p class="direction-text"><span class="direction-label">Sauce</span> Sauté');
    expect([...c.matchAll(/ingr-group-label[^>]*>([^<]+)</g)].map((m) => m[1])).toEqual(['Sauce']);
  });

  it('a single direction is not numbered', () => {
    const c = html(HEAD + '## Directions\n\n1. Toast the bread.\n');
    expect(c).toContain('<li class="direction direction-alone" value="1">');
  });
});

describe('options.parts: paired', () => {
  const paired = (source: string, theme = 'mise') => html(source, theme, { parts: 'paired', notes: true });

  it('is what Mise and Folio do; the other themes keep the classic sections', () => {
    const themes = Object.fromEntries(listThemes().map((t) => [t, loadTheme(t).parts]));
    expect(themes).toMatchObject({ mise: 'paired', folio: 'paired', binder: 'sections', grid: 'sections', countertop: 'sections', galley: 'sections' });
    expect(html(HEADED, 'mise', { notes: true })).toBe(paired(HEADED));
    expect(html(HEADED, 'mise', { parts: 'sections' })).not.toBe(paired(HEADED));
  });

  it('prints each part with its own ingredients beside its own steps, in the directions slot', () => {
    const c = paired(HEADED);
    expect(c).not.toContain('<div class="ingredients">');
    expect(count(c, '<section class="part part-paired')).toBe(3);
    const beans = c.slice(c.indexOf('part-title">Beans'), c.indexOf('part-title">Sauce'));
    expect(beans).toContain('<div class="part-body"><div class="part-ingredients"><table class="ingr-table">');
    expect(beans).toContain('kidney beans');
    expect(beans).not.toContain('olive oil');
    expect(beans).toContain('<div class="part-directions"><ol class="direction-list">');
    expect(beans).not.toContain('ingr-group-label');
    expect(c).toContain('<section class="part part-paired part-with-ingredients part-with-directions"><h3 class="part-title">Finish</h3>');
    expect(count(c, '<tr class="ingr')).toBe(5);
    // The notes follow the parts.
    expect(c.indexOf('Stir in the cream')).toBeLessThan(c.indexOf('Keeps three days'));
  });

  const sections = (c: string) => [...c.matchAll(/<section class="([^"]+)">(?:<h3 class="part-title">([^<]+)<\/h3>)?/g)].map((m) => [m[1], m[2] ?? null]);

  it('prints the unnamed leading part, untitled, and a part with ingredients only', () => {
    const c = paired(INGREDIENTS_ONLY);
    expect(sections(c)).toEqual([
      ['part part-unnamed part-paired part-with-ingredients part-with-directions', null],
      ['part part-paired part-with-ingredients part-with-directions', 'Sauce'],
      ['part part-paired part-with-ingredients', 'Garnish'],
    ]);
    expect(c.slice(c.indexOf('part-title">Garnish'))).not.toContain('part-directions');
    expect(count(c, '<tr class="ingr')).toBe(3);
  });

  it('prints a part with steps only after the part before it', () => {
    const c = paired(STEPS_ONLY);
    expect(sections(c)).toEqual([
      ['part part-paired part-with-ingredients part-with-directions', 'Sauce'],
      ['part part-paired part-with-directions', 'Assembly'],
      ['part part-paired part-with-ingredients part-with-directions', 'Pasta'],
    ]);
    expect(c.slice(c.indexOf('part-title">Assembly'), c.indexOf('part-title">Pasta'))).not.toContain('part-ingredients');
  });

  it('falls back to the classic sections when names miss on both sides', () => {
    expect(paired(UNPAIRED)).toBe(html(UNPAIRED, 'mise', { parts: 'sections' }));
    expect(paired(UNPAIRED)).toContain('<div class="ingredients">');
  });

  it('falls back to the classic sections without direction parts, ingredients or directions', () => {
    for (const source of [
      GROUPS_ONLY,
      OLDER,
      PLAIN,
      HEAD + '## Ingredients\n\n### Dough\n\n- 300 g flour\n\n### Glaze\n\n- 100 g sugar\n',
      HEAD + '## Directions\n\n### Dough\n\n1. Mix.\n2. Knead.\n\n### Glaze\n\n1. Glaze.\n',
    ]) {
      const c = paired(source);
      expect(c).toBe(html(source, 'mise', { parts: 'sections' }));
      expect(c).not.toContain('part-paired');
    }
  });

  it('leaves a structured recipe alone', () => {
    const r = readRecipe(join(ETNA_ROOT, 'cookbook', 'italian-wedding-soup', 'recipe.md'));
    expect(html(r, 'mise', { parts: 'paired' })).toBe(html(r, 'mise', { parts: 'sections' }));
  });

  it('is refused when unknown, in options and in theme.yaml', () => {
    expect(() => html(HEADED, 'mise', { parts: 'beside' as never })).toThrow(/unknown parts arrangement "beside"/);
  });
});

describe('a hoisted structured recipe prints as its traditional equivalent', () => {
  const STRUCTURED =
    '---\netna: 1\n---\n\n# Test Recipe\n\n## Beans\n\n### Soak\n\n- 100 g kidney beans\n- kosher salt\n\nSoak the beans overnight.\n\n### Cook\n\nPressure-cook the beans.\n\n' +
    '## Sauce\n\n### Sauté\n\n- 10 g olive oil\n- 100 g onion\n\nSauté the onion.\n\n### Blend\n\nBlend the sauce.\n\n### Simmer\n\nSimmer.\n\n' +
    '## Finish\n\n### Stir\n\n- 100 g cream\n\nStir in the cream.\n';

  it('component = part with its title, step heading = step name, numbers restarting per component', () => {
    const s = html(STRUCTURED);
    const t = html(HEADED);
    const shape = (c: string) => ({
      groups: [...c.matchAll(/ingr-group-label[^>]*>([^<]+)</g)].map((m) => m[1]),
      parts: [...c.matchAll(/part-title">([^<]+)</g)].map((m) => m[1]),
      numbers: runs(c).map((r) => r.map((x) => x.number)),
      rows: count(c, '<tr class="ingr'),
    });
    expect(shape(s)).toEqual(shape(t));
    expect(s).toContain('<span class="direction-label">Sauté</span> Sauté the onion.');
  });

});

describe('numbering: a run of steps is numbered throughout or not at all', () => {
  const themes = listThemes();
  const shipped = findRecipes(join(ETNA_ROOT, 'cookbook')).filter((r) => r.file !== null);
  const sources: Recipe[] = [HEADED, UNPAIRED, INGREDIENTS_ONLY, STEPS_ONLY, OLDER, GROUPS_ONLY, PLAIN].map(recipe);
  const all = [...sources, ...shipped.map((e) => readRecipe(e.file!))];

  it.each(themes)('%s: every run is numbered 1…n, both arrangements, every layout', (name) => {
    let lists = 0;
    for (const r of all) {
      for (const options of [{}, { parts: 'paired' as const }, { parts: 'sections' as const }, { layout: 'hoisted' as const }, { layout: 'paired' as const }]) {
        const c = html(r, name, options);
        expect(numberingProblems(c), `${r.title?.text} ${JSON.stringify(options)}`).toEqual([]);
        lists += runs(c).length;
      }
    }
    // A shopping list prints no directions.
    if (loadTheme(name).layout !== 'list') expect(lists).toBeGreaterThan(0);
  });

  it.each(themes)('%s: no rule hides the numbers of some steps of a run only', (name) => {
    const theme = loadTheme(name);
    expect(selectiveNumberHiding(theme.css)).toEqual([]);
  });

  it('the check itself catches a mixed run', () => {
    const mixed = '<ol class="direction-list"><li class="direction" value="1"><span class="direction-number">1</span></li><li class="direction" value="2"></li></ol>';
    expect(numberingProblems(mixed)).toEqual(['step 2 of 2 is numbered not at all']);
    expect(selectiveNumberHiding('.direction:has(.direction-label) > .direction-number { display: none; }')).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ in a browser

const browser = findBrowser();
let pdftotext = false;
try {
  execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  pdftotext = true;
} catch {
  pdftotext = false;
}

describe.skipIf(browser === null || !pdftotext)('paging parts in a real browser', () => {
  it('never leaves a part title at the foot of a page without its first step', async () => {
    // Many parts of two steps, on small paper: some part falls across a page break.
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'];
    const filler = 'Stir it gently over a low heat until it thickens and coats the back of a spoon.';
    const directions = '\n## Directions\n\n' + words.map((w) => `### Part ${w}\n\n1. First${w} ${filler}\n2. Then${w} ${filler}\n`).join('\n');
    // Paired, a part's name is printed once; in sections the ingredient table would print it too.
    const paired = recipe(HEAD + '## Ingredients\n\n' + words.map((w) => `### Part ${w}\n\n- 10 g ${w} flour\n`).join('\n') + directions);
    const sections = recipe(HEAD + '## Ingredients\n\n' + words.map((w) => `- 10 g ${w} flour\n`).join('') + directions);
    const dir = mkdtempSync(join(tmpdir(), 'etna-parts-test-'));
    const printer = await openPrinter(browser!);
    try {
      let broken = 0;
      for (const [name, options] of [
        ['binder', { paper: 'index-4x6' }],
        ['grid', { paper: 'index-5x7' }],
        ['mise', { paper: 'index-4x6' }],
        ['mise', { paper: 'index-4x6', parts: 'sections' }],
        ['galley', {}],
      ] as [string, CardOptions][]) {
        const target = join(dir, `${name}.pdf`);
        const r = loadTheme(name).parts === 'paired' && options.parts !== 'sections' ? paired : sections;
        const result = await printer.print(renderCard(r, loadTheme(name), { ...options, fit: 'off' }), target);
        expect(result.paged, name).toBe('done');
        for (let page = 1; page <= result.pages!; page++) {
          const text = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), target, '-'], { encoding: 'utf8' });
          for (const w of words) {
            if (text.includes(`Part ${w}`)) {
              // A part may continue on the next page; its title is printed once, with its first step.
              expect(text, `${name} page ${page}: Part ${w}`).toContain(`First${w}`);
            }
            if (text.includes(`First${w}`) && !text.includes(`Part ${w}`)) broken++;
          }
        }
      }
      // The first step always shares a page with its title.
      expect(broken).toBe(0);
    } finally {
      await printer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('a part heading with a qualifier after an em dash', () => {
  const SOURCE =
    HEAD +
    '## Ingredients\n\n### Biga — 50% hydration\n\n- 350 g water\n\n### Dough - Day 1\n\n- 18 g salt\n\n' +
    '## Directions\n\n### Biga\n\n1. Mix.\n\n### Dough - Day 1\n\n1. Knead.\n';

  it('prints the qualifier in its own part-qualifier element, in sections and paired', () => {
    for (const parts of ['sections', 'paired'] as const) {
      const out = html(SOURCE, 'binder', { parts });
      expect(out).toContain('Biga<span class="part-qualifier"> — 50% hydration</span>');
      expect(out).not.toContain('Dough<span class="part-qualifier">');
      expect(out).toContain('Dough - Day 1');
    }
    // Paired: the qualified heading and the bare one are one part.
    expect(count(html(SOURCE, 'binder', { parts: 'paired' }), '<h3 class="part-title">')).toBe(2);
  });

  it('has a default style in every bundled theme that prints part headings', () => {
    for (const id of listThemes()) {
      const css = loadTheme(id).css;
      if (css.includes('.part-title')) expect(css, id).toContain('.part-qualifier');
    }
  });
});
