import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { catalogEntry, catalogFromSlugs } from '../../src/catalog/index.ts';
import { buildCatalog, collectionRoot, serializeCatalog, writeCatalog } from '../../src/catalog/node.ts';
import { run } from '../../src/catalog/cli.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });
const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const example = (slug: string) => parse(readFileSync(join(COOKBOOK, slug, 'recipe.md'), 'utf8'));

const TRADITIONAL = `---
etna: 1
form: traditional
source: "https://example.com/rolls"
yield: 12
---

# Test Rolls

## Ingredients

**Part A**

- 80 grams Bread Flour
- 60 grams Boiling Water

**Part B**

- 250 grams Whole Milk, heated to 115°F
- 300 grams bread flour
- 2 large eggs
- 15 grams Butter, softened

## Directions

1. **Night Before** — Do the first thing.
2. Do the second thing.

## Notes

Test note - This is *great*!
`;

const tmp = mkdtempSync(join(tmpdir(), 'etna-catalog-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** A throwaway collection: `recipes/<slug>/recipe.md` for each entry; a null source makes an empty directory. */
function collection(name: string, recipes: Record<string, string | null>): string {
  const root = join(tmp, name);
  for (const [slug, source] of Object.entries(recipes)) {
    mkdirSync(join(root, 'recipes', slug), { recursive: true });
    if (source !== null) writeFileSync(join(root, 'recipes', slug, 'recipe.md'), source);
  }
  return root;
}

describe('catalogEntry', () => {
  it('reads a traditional recipe', () => {
    const e = catalogEntry(parse(TRADITIONAL), 'test-rolls');
    expect(e).toEqual({
      slug: 'test-rolls',
      title: 'Test Rolls',
      form: 'traditional',
      source: 'https://example.com/rolls',
      yield: '12', // YAML number → text
      license: null,
      // Names only, in recipe order; "bread flour" appears twice (different case) and is kept once, as first written.
      ingredients: ['Bread Flour', 'Boiling Water', 'Whole Milk', 'eggs', 'Butter'],
      // Group labels first (they name parts of the dish), then directions and notes.
      text: [
        'Part A',
        'Part B',
        'Night Before — Do the first thing.',
        'Do the second thing.',
        'Test note - This is great!',
      ].join('\n'),
      path: 'recipes/test-rolls/recipe.md',
    });
  });

  it('names each part of a recipe written with part headings once', () => {
    const source =
      '---\netna: 1\nform: traditional\n---\n\n# Test Recipe\n\n## Ingredients\n\n### Beans\n\n- 100 g beans\n\n### Sauce\n\n- 28 g oil\n\n## Directions\n\n### Beans\n\n1. **Soak** — Soak overnight.\n2. Cook.\n\n### sauce\n\n1. Fry.\n\n### Finish\n\n1. Combine.\n';
    expect(catalogEntry(parse(source), 'test-recipe').text.split('\n')).toEqual(['Beans', 'Sauce', 'Soak — Soak overnight.', 'Cook.', 'Fry.', 'Finish', 'Combine.']);
  });

  it('keeps the keys in a fixed order', () => {
    expect(Object.keys(catalogEntry(parse(TRADITIONAL), 'x'))).toEqual(['slug', 'title', 'form', 'source', 'yield', 'license', 'ingredients', 'text', 'path']);
  });

  it('reads a structured recipe', () => {
    const e = catalogEntry(example('next-day-soft-cinnamon-rolls'), 'next-day-soft-cinnamon-rolls');
    expect(e.form).toBe('structured');
    expect(e.title).toBe('Next-Day Soft Cinnamon Rolls');
    expect(e.source).toBe('Vincent Lucarelli');
    expect(e.yield).toBe('12 rolls');
    expect(e.license).toBe('CC BY-SA 4.0');
    expect(e.path).toBe('recipes/next-day-soft-cinnamon-rolls/recipe.md');
    // Bread flour is used in two steps; links to the recipe's own steps are not ingredients.
    expect(e.ingredients.slice(0, 5)).toEqual(['bread flour', 'boiling water', 'russet potato', 'water', 'whole milk']);
    expect(e.ingredients.filter((i) => i === 'bread flour')).toHaveLength(1);
    expect(e.ingredients).not.toContain('yudane');
    expect(new Set(e.ingredients.map((i) => i.toLowerCase())).size).toBe(e.ingredients.length);
    // No quantities, units or notes.
    expect(e.ingredients.join('|')).not.toMatch(/\d|King Arthur/);
    // Headings (components and steps) and instructions, in order; no ingredient lines.
    const lines = e.text.split('\n');
    expect(lines.slice(0, 4)).toEqual(['Dough', 'Yudane', 'Stir', 'Stir the boiling water into the bread flour to form a paste; cool to room temperature.']);
    expect(e.text).toContain('Cream cheese frosting');
    expect(e.text).not.toContain('105 g');
  });

  it('includes callouts and links to other recipes', () => {
    const e = catalogEntry(
      parse(`---
etna: 1
---

# Cheese Plate

## Arrange

- 200 g cheddar
- 80 g [mango chutney](../mango-chutney/)

Arrange on a board.

> **Tip** — Serve at room temperature.
`),
      'cheese-plate',
    );
    expect(e.ingredients).toEqual(['cheddar', 'mango chutney']);
    expect(e.text).toBe('Arrange\nArrange on a board.\nTip — Serve at room temperature.');
  });

  it('falls back to the slug when there is no title', () => {
    const e = catalogEntry(parse('---\netna: 1\nform: traditional\n---\n\n## Ingredients\n\n- 2 eggs\n'), 'fried-eggs');
    expect(e.title).toBe('Fried Eggs');
    expect(e.text).toBe('');
  });
});

describe('catalogFromSlugs', () => {
  it('builds name-only entries, sorted and de-duplicated', () => {
    const c = catalogFromSlugs(['pizza-brier-hill', 'apple-pie', 'pizza-brier-hill']);
    expect(c.version).toBe(1);
    expect(c.recipes.map((r) => r.slug)).toEqual(['apple-pie', 'pizza-brier-hill']);
    expect(c.recipes[1]).toEqual({
      slug: 'pizza-brier-hill',
      title: 'Pizza Brier Hill',
      form: 'traditional',
      source: null,
      yield: null,
      license: null,
      ingredients: [],
      text: '',
      path: 'recipes/pizza-brier-hill/recipe.md',
    });
    expect(catalogFromSlugs([])).toEqual({ version: 1, recipes: [] });
  });
});

describe('buildCatalog', () => {
  it('catalogs a directory of recipe directories', () => {
    const c = buildCatalog(COOKBOOK);
    expect(c.version).toBe(1);
    expect(c.recipes).toHaveLength(18);
    expect(c.recipes.map((r) => r.slug)).toEqual([...c.recipes.map((r) => r.slug)].sort());
    expect(c.recipes.find((r) => r.slug === 'malted-chocolate')?.path).toBe('malted-chocolate/recipe.md');
    expect(c.recipes.filter((r) => r.form !== 'structured').map((r) => r.slug)).toEqual([
      'easter-bread-traditional-form',
      'italian-wedding-soup-traditional-form',
      'nana-palumbos-meatloaf-traditional-form',
      'navy-bean-soup-traditional-form',
      'potato-soup-traditional-form',
    ]);
    // A folder of recipe folders not named recipes/ is its own root.
    expect(collectionRoot(COOKBOOK)).toBe(COOKBOOK);
    expect(collectionRoot(join(COOKBOOK, 'malted-chocolate', 'recipe.md'))).toBe(COOKBOOK);
  });

  it('skips directories without recipe.md and gives paths from the collection root', () => {
    const root = collection('skips', { 'b-rolls': TRADITIONAL, 'a-empty': null, 'c-rolls': TRADITIONAL });
    const c = buildCatalog(root);
    expect(c.recipes.map((r) => r.slug)).toEqual(['b-rolls', 'c-rolls']);
    expect(c.recipes[0].path).toBe('recipes/b-rolls/recipe.md');
    // The same catalog whether pointed at the root or at recipes/.
    expect(buildCatalog(join(root, 'recipes'))).toEqual(c);
    expect(collectionRoot(join(root, 'recipes'))).toBe(root);
    expect(collectionRoot(join(root, 'recipes', 'b-rolls', 'recipe.md'))).toBe(root);
  });

  it('is deterministic: two builds give byte-identical JSON', () => {
    const a = serializeCatalog(buildCatalog(COOKBOOK));
    const b = serializeCatalog(buildCatalog(COOKBOOK));
    expect(a).toBe(b);
    expect(a.endsWith('}\n')).toBe(true);
    expect(a).not.toContain(ETNA_ROOT); // no machine-specific paths
    expect(JSON.parse(a)).toEqual(buildCatalog(COOKBOOK));
  });
});

describe('writeCatalog', () => {
  it('writes catalog.json at the collection root by default', () => {
    const root = collection('writes', { rolls: TRADITIONAL });
    const written = writeCatalog(root);
    expect(written).toBe(join(root, 'catalog.json'));
    const first = readFileSync(written, 'utf8');
    expect(JSON.parse(first).recipes[0].slug).toBe('rolls');
    expect(writeCatalog(join(root, 'recipes'))).toBe(written);
    expect(readFileSync(written, 'utf8')).toBe(first);
  });

  it('writes to another file when asked, creating directories', () => {
    const out = join(tmp, 'elsewhere', 'deep', 'examples.json');
    expect(writeCatalog(COOKBOOK, out)).toBe(out);
    expect(readFileSync(out, 'utf8')).toBe(serializeCatalog(buildCatalog(COOKBOOK)));
  });
});

describe('cli', () => {
  /** Run the CLI with console output captured. */
  async function cli(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    const error = vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    try {
      return { code: await run(argv), out: out.join('\n'), err: err.join('\n') };
    } finally {
      log.mockRestore();
      error.mockRestore();
      write.mockRestore();
    }
  }

  it('etna catalog writes the file and reports what it skipped', async () => {
    const root = collection('cli', { rolls: TRADITIONAL, empty: null });
    const out = join(tmp, 'cli-out', 'catalog.json');
    const r = await cli('catalog', root, '--out', out);
    expect(r.code).toBe(0);
    expect(r.out).toContain('1 recipe');
    expect(r.err).toContain('empty');
    expect(readFileSync(out, 'utf8')).toBe(serializeCatalog(buildCatalog(root)));
  });

  it('etna catalog --stdout prints the catalog and writes nothing', async () => {
    const r = await cli('catalog', COOKBOOK, '--stdout');
    expect(r.code).toBe(0);
    expect(r.out).toBe(serializeCatalog(buildCatalog(COOKBOOK)));
  });

  it('etna search prints ranked hits', async () => {
    const r = await cli('search', COOKBOOK, 'cinnamon rolls', '--limit', '3');
    expect(r.code).toBe(0);
    expect(r.out.split('\n')[0]).toContain('Next-Day Soft Cinnamon Rolls');
    const json = await cli('search', COOKBOOK, 'pistachio', '--json');
    expect(JSON.parse(json.out)[0].slug).toBe('pistachio-in-the-style-of-van-leeuwen');
  });

  it('prints help and rejects bad usage', async () => {
    expect((await cli('catalog', '--help')).out).toContain('Usage: etna catalog');
    expect((await cli('search', '--help')).out).toContain('Usage: etna search');
    expect((await cli('catalog')).code).toBe(2);
    expect((await cli('catalog', join(tmp, 'nowhere'))).code).toBe(2);
    expect((await cli('catalog', COOKBOOK, '--stdout', '--out', 'x.json')).code).toBe(2);
    expect((await cli('search', COOKBOOK)).code).toBe(2);
    expect((await cli('search', COOKBOOK, 'rolls', '--limit', '0')).code).toBe(2);
    expect((await cli('search', COOKBOOK, 'rolls', '--nope')).code).toBe(2);
    expect((await cli('nonsense')).code).toBe(2);
  });
});

describe('the Notes section of a structured recipe', () => {
  it('is searchable text, after the steps, as a traditional recipe\'s notes are', () => {
    const source = '---\netna: 1\n---\n\n# Shake\n\n## Blend\n\n- 300 g milk\n\nBlend.\n\n## Notes\n\n**Storage** — keeps a day.\n\n- Oat milk works too.\n';
    expect(catalogEntry(parse(source), 'shake').text.split('\n')).toEqual(['Blend', 'Blend.', 'Storage — keeps a day.', 'Oat milk works too.']);
  });
});
