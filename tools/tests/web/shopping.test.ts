// The GUI's combined shopping list: totals as `etna list` makes them, and the remembered list.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// The bundle's data, as build.ts compiles it, without esbuild.
vi.mock('virtual:etna-data', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { listThemes, readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');
  const { ETNA_ROOT: root } = await import('../../src/node/files.ts');
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(j(THEMES_DIR, name));
  return {
    unitsYaml: read(j(root, 'registries', 'units.yaml'), 'utf8'),
    densitiesMd: read(j(root, 'registries', 'densities.md'), 'utf8'),
    themes,
    chartThemes: {},
    fontMode: 'web',
    fontCss: {},
    localServer: true,
    about: null,
  };
});

const { ETNA_ROOT } = await import('../../src/node/files.ts');
const { loadDensities } = await import('../../src/density/node.ts');
const { formatListText, formatListMarkdown } = await import('../../src/list/index.ts');
const engine = await import('../../src/web/engine.ts');
const { analyze, builtinThemes, combinedList, densityTable, isListTheme, listCard, pickListTheme, referenceDensities } = engine;
const shopping = await import('../../src/web/shopping.ts');
const { formatListRefs, hasRef, MAX_LIST, parseListRefs, refKey, removeRef, toggleRef } = shopping;

/** A small structured recipe with one step holding `lines`. */
const recipe = (title: string, lines: string[]) => `---\netna: 1\n---\n\n# ${title}\n\n## Mix\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nMix.\n`;

const member = (id: string, title: string, lines: string[]) => ({ id, title, recipe: analyze(recipe(title, lines)).recipe });

/** The list as `etna list` prints it (text), without its heading. */
const lines = (result: ReturnType<typeof combinedList>) => formatListText(result.list).split('\n').slice(2).filter((l) => l !== '');

describe('combinedList', () => {
  it('bundles the reference density table and parses it once', () => {
    const table = referenceDensities();
    expect(table.rows.map((r) => r.ingredient)).toEqual(expect.arrayContaining(['all-purpose flour', 'butter', 'sugar', 'water']));
    expect(referenceDensities()).toBe(table);
    // The same rows as the command line reads.
    expect(table.rows.map((r) => [r.ingredient, r.grams])).toEqual(loadDensities().rows.map((r) => [r.ingredient, r.grams]));
  });

  it('totals one ingredient in the same unit across recipes', () => {
    const result = combinedList([member('a/bread', 'Bread', ['100 g sugar', '2 eggs']), member('a/cake', 'Cake', ['50 g sugar', '3 eggs'])]);
    expect(result.failed).toEqual([]);
    expect(lines(result)).toEqual(['150 g  sugar', '5      eggs']);
    expect(result.list.sources.map((s) => s.title)).toEqual(['Bread', 'Cake']);
  });

  it('totals different units of one kind, exactly or marked ≈', () => {
    const result = combinedList([member('a/one', 'One', ['1 cup milk', '1 lb butter']), member('a/two', 'Two', ['2 tbsp milk', '100 g butter'])]);
    const text = lines(result);
    expect(text[0]).toMatch(/^1 1\/8 cups\s+milk \(1 cup \+ 2 tbsp\)$/);
    expect(text[1]).toMatch(/^≈ 554 g\s+butter \(1 lb \+ 100 g\)$/);
  });

  it('totals a weight with a volume only through the density table, marked ≈', () => {
    const two = () => [member('a/one', 'One', ['120 g all-purpose flour']), member('a/two', 'Two', ['1 cup all-purpose flour'])];
    const withTable = combinedList(two());
    expect(lines(withTable)).toEqual(['≈ 240 g  all-purpose flour (120 g + 1 cup)']);
    const amount = withTable.list.items[0].amounts[0];
    expect(amount.converted?.by).toBe('density');
    expect(amount.converted?.approximate).toBe(true);
    // Without a table: side by side, never converted.
    const without = combinedList(two(), null);
    expect(lines(without)).toEqual(['120 g + 1 cup  all-purpose flour']);
  });

  it('leaves a weight and a volume with no density side by side, and says so', () => {
    const result = combinedList([member('a/one', 'One', ['5 g cinnamon']), member('a/two', 'Two', ['1 tsp cinnamon'])]);
    expect(lines(result)).toEqual(['5 g + 1 tsp  cinnamon', 'No density for: cinnamon — amounts left as written']);
  });

  it('never adds ounces of a liquid to a volume', () => {
    const result = combinedList([member('a/one', 'One', ['8 oz water']), member('a/two', 'Two', ['1 cup water'])]);
    expect(result.list.items[0].amounts.map((a) => a.unit?.name)).toEqual(['ounce', 'cup']);
    expect(result.list.items[0].amounts.every((a) => !a.converted)).toBe(true);
    expect(result.list.unconverted).toEqual([expect.objectContaining({ item: 'water', reason: 'liquid-ounces' })]);
    expect(formatListText(result.list)).toContain('Measured in oz, by weight or fluid ounces? water');
  });

  it('leaves out a recipe that cannot be read, names it, and totals the rest', () => {
    const result = combinedList([
      member('a/one', 'One', ['100 g sugar']),
      { id: 'a/broken', title: 'Broken <b>', recipe: { ok: false as const, error: 'unexpected end of file' } },
      member('a/two', 'Two', ['50 g sugar']),
    ]);
    expect(result.failed).toEqual([{ id: 'a/broken', title: 'Broken <b>', error: 'unexpected end of file' }]);
    expect(lines(result)).toEqual(['150 g  sugar']);
    expect(result.list.sources.map((s) => s.id)).toEqual(['a/one', 'a/two']);
  });

  it('agrees with the command line on recipes that ship', () => {
    const slugs = ['next-day-soft-cinnamon-rolls', 'italian-wedding-soup', 'easter-bread'];
    const members = slugs.map((slug) => {
      const a = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'));
      return { id: `cookbook/${slug}`, title: a.recipe.ok ? (a.recipe.value.title?.text ?? slug) : slug, recipe: a.recipe };
    });
    const gui = combinedList(members, densityTable(null));
    expect(gui.failed).toEqual([]);
    // What `etna list` does: consolidate with loadDensities() and the units registry.
    const cli = combinedList(members, loadDensities());
    expect(formatListText(gui.list, { uses: true })).toBe(formatListText(cli.list, { uses: true }));
    expect(formatListMarkdown(gui.list)).toMatch(/^# Shopping list: .+\n\n- \[ \] /);
  });
});

describe('densityTable', () => {
  it('is the reference table without a collection file, or with one that has no Reference section', () => {
    expect(densityTable(null)).toBe(referenceDensities());
    expect(densityTable('# Ingredient densities\n\n## Wanted\n\nNothing.\n')).toBe(referenceDensities());
    expect(densityTable('\u0000 not markdown at all {{')).toBe(referenceDensities());
  });

  it('overlays a collection file: its entries replace the reference entries of the same name', () => {
    const reference = readFileSync(join(ETNA_ROOT, 'registries', 'densities.md'), 'utf8');
    const section = reference.slice(reference.indexOf('## Reference densities'));
    const head = section.split('\n').filter((l) => l.startsWith('|')).slice(0, 2).join('\n');
    const sugar = section.split('\n').find((l) => l.startsWith('| sugar |'))!;
    const own = `# Ours\n\n## Reference densities\n\n${head}\n${sugar.replace(/1 cup = \d+ g/, '1 cup = 250 g')}\n`;
    const table = densityTable(own);
    expect(table).not.toBe(referenceDensities());
    expect(table.rows.filter((r) => r.ingredient === 'sugar').map((r) => r.grams)).toEqual([250]);
    expect(densityTable(own)).toBe(table); // parsed once per text
  });
});

describe('listCard', () => {
  it('offers only list themes, Shopping first', () => {
    const lists = builtinThemes.filter(isListTheme);
    expect(lists.map((e) => e.name)).toContain('shopping');
    expect(lists.every((e) => e.theme?.layout === 'list')).toBe(true);
    expect(pickListTheme(builtinThemes, null)?.id).toBe('builtin:shopping');
    expect(pickListTheme(builtinThemes, 'builtin:mise')?.id).toBe('builtin:shopping');
  });

  it('renders the combined list on the chosen paper, with uses on request', () => {
    const entry = pickListTheme(builtinThemes, null)!;
    const { list } = combinedList([member('a/one', 'Bread', ['100 g sugar']), member('a/two', 'Cake', ['50 g sugar'])]);
    const html = listCard(list, entry, { paper: 'a4', size: 'auto' }, true);
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    expect(html.value).toContain('data-paper="a4"');
    expect(html.value).toContain('<h1 class="card-title">Shopping list</h1>');
    expect(html.value).toContain('<span class="list-uses">Bread (Mix); Cake (Mix)</span>');
    const plain = listCard(list, entry);
    expect(plain.ok && plain.value.includes('<span class="list-uses">')).toBe(false);
  });

  it('refuses a theme that does not print lists', () => {
    const mise = builtinThemes.find((e) => e.name === 'mise')!;
    const html = listCard(combinedList([]).list, mise);
    expect(html.ok).toBe(false);
  });
});

describe('card with the Shopping theme (one recipe, as on the Card tab)', () => {
  const shoppingEntry = () => builtinThemes.find((e) => e.name === 'shopping')!;
  const butter = () => analyze(recipe('Bars', ['2 tbsp butter', '100 g butter'])).recipe;

  it('totals a weight and a volume of one ingredient through the densities, marked ≈', () => {
    const r = butter();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = engine.card(r.value, shoppingEntry());
    expect(html.ok).toBe(true);
    if (!html.ok) return;
    // One total, as the shopping list view gives it, not `2 tbsp + 100 g` side by side.
    expect(html.value.match(/≈/g)?.length).toBe(1);
    const view = lines(combinedList([{ id: 'a/bars', title: 'Bars', recipe: r }], densityTable(null)));
    expect(view).toHaveLength(1);
    expect(view[0]).toMatch(/^≈ \d+ g\s+butter \(2 tbsp \+ 100 g\)$/);
  });

  it('keeps them side by side without a table', () => {
    const r = butter();
    if (!r.ok) throw new Error(r.error);
    const html = engine.card(r.value, shoppingEntry(), { paper: null, size: 'auto' }, null);
    expect(html.ok && html.value.includes('≈')).toBe(false);
  });
});

describe('the remembered list', () => {
  it('round-trips', () => {
    const refs = [
      { source: 'recipe-collection', slug: 'beer-bread' },
      { source: 'owner/repo', slug: 'carrot-cake' },
    ];
    expect(parseListRefs(formatListRefs(refs))).toEqual(refs);
    expect(JSON.parse(formatListRefs(refs))).toEqual(refs);
  });

  it('tolerates garbage', () => {
    for (const text of [null, undefined, '', 'not json', '{"source":"a","slug":"b"}', '42', 'null', '"text"']) expect(parseListRefs(text)).toEqual([]);
    const mixed = JSON.stringify([
      { source: 'a', slug: 'ok' },
      { source: 'a', slug: 'ok' }, // duplicate
      { source: 'a', slug: '../etc' },
      { source: 'a', slug: 'Not A Slug' },
      { source: '', slug: 'empty-source' },
      { source: 'bad\u0000id', slug: 'x' },
      { source: 3, slug: 'x' },
      ['a', 'x'],
      null,
      'a/x',
      { source: 'b', slug: 'fine', extra: '<script>' },
    ]);
    expect(parseListRefs(mixed)).toEqual([
      { source: 'a', slug: 'ok' },
      { source: 'b', slug: 'fine' },
    ]);
    const many = JSON.stringify(Array.from({ length: MAX_LIST + 10 }, (_, i) => ({ source: 's', slug: `r${i}` })));
    expect(parseListRefs(many)).toHaveLength(MAX_LIST);
  });

  it('adds, takes off and removes', () => {
    const a = { source: 's', slug: 'a' };
    const b = { source: 's', slug: 'b' };
    let refs = toggleRef([], a);
    refs = toggleRef(refs, b);
    expect(refs).toEqual([a, b]);
    expect(hasRef(refs, { source: 's', slug: 'b' })).toBe(true);
    expect(toggleRef(refs, a)).toEqual([b]);
    expect(removeRef(refs, b)).toEqual([a]);
    expect(refKey(a)).toBe('s/a');
  });
});
