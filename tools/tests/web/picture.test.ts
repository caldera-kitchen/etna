// The recipe's picture in the app (SPEC §4.3): the catalog lists a recipe's image files, each
// kind of source reads them, the Check tab lints them, and the card shows image/etna.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCatalog } from '../../src/catalog/node.ts';
import { etnaPicture, PICTURE_LIMIT, pictureDataAddress } from '../../src/core/index.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';
import { parseSettings } from '../../src/web/settings.ts';
import { cleanCatalog, GitHubSource, LocalSource, PICTURE_HEAD, readImageFolder, SiteSource, SITE_SOURCE_DIR } from '../../src/web/sources.ts';

// The bundle's data, as build.ts compiles it, without esbuild (as engine.test.ts has it).
vi.mock('virtual:etna-data', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { listThemes, readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');
  const { ETNA_ROOT: root } = await import('../../src/node/files.ts');
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(j(THEMES_DIR, name));
  return { unitsYaml: read(j(root, 'registries', 'units.yaml'), 'utf8'), themes, chartThemes: {}, fontMode: 'none', fontCss: {}, localServer: true, about: null };
});

const { analyze, builtinThemes, card, offersPicture } = await import('../../src/web/engine.ts');

const LINTER = join(ETNA_ROOT, 'tests', 'linter');
const CLEAN = join(LINTER, 'clean-picture', 'input');
const PNG = new Uint8Array(readFileSync(join(CLEAN, 'test-soup', 'image', 'etna.png')));
const JPEG = new Uint8Array(readFileSync(join(CLEAN, 'test-soup', 'image', 'markdown.jpg')));
const SOUP = readFileSync(join(CLEAN, 'test-soup', 'recipe.md'), 'utf8');

const RAW = 'https://raw.githubusercontent.com/someone/recipes/HEAD/';
const API = 'https://api.github.com/';

/** A fake fetch over URL → body (text, bytes, or JSON); anything else is a 404. Records each URL. */
function mockFetch(files: Record<string, string | Uint8Array | object>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (!Object.hasOwn(files, url)) return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      const body = files[url];
      return new Response(typeof body === 'string' ? body : body instanceof Uint8Array ? new Blob([body as Uint8Array<ArrayBuffer>]) : JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const entry = (image?: unknown) => ({ slug: 'test-soup', title: 'Test Soup', path: 'recipes/test-soup/recipe.md', ...(image === undefined ? {} : { image }) });

describe('etnaPicture: what Etna shows from the image folder', () => {
  it('takes etna.jpg before etna.png, as a data: address of the kind its bytes are', () => {
    expect(etnaPicture([{ name: 'etna.png', bytes: PNG }])).toEqual({ src: pictureDataAddress(PNG) });
    expect(etnaPicture([{ name: 'etna.png', bytes: PNG }, { name: 'etna.jpg', bytes: JPEG }])).toEqual({ src: pictureDataAddress(JPEG) });
    expect(etnaPicture([{ name: 'markdown.jpg', bytes: JPEG }])).toBeNull();
    expect(etnaPicture([])).toBeNull();
  });

  it('says why a file it cannot show gives no picture, and does not try the other', () => {
    expect(etnaPicture([{ name: 'etna.jpg', bytes: PNG }, { name: 'etna.png', bytes: PNG }])).toEqual({ note: 'image/etna.jpg is not a JPEG' });
    expect(etnaPicture([{ name: 'etna.jpg', bytes: JPEG.slice(0, 200), size: PICTURE_LIMIT + 1 }])).toEqual({ note: 'image/etna.jpg is larger than 1024 KiB' });
    expect(etnaPicture([{ name: 'etna.png', bytes: new Uint8Array(10) }])).toEqual({ note: 'image/etna.png is not a PNG' });
  });
});

describe('the catalog lists a recipe\'s image files', () => {
  it('by name, sorted, leaving out hidden files and sub-folders', () => {
    const catalog = buildCatalog(join(LINTER, 'collection-picture-file', 'input'));
    expect(catalog.recipes[0].image).toEqual(['etna.jpg', 'markdown.jpg', 'markdown.png', 'photo.jpg']);
  });

  it('not at all for a recipe without them', () => {
    const catalog = buildCatalog(join(ETNA_ROOT, 'cookbook'));
    expect(catalog.recipes.every((r) => !('image' in r))).toBe(true);
  });

  it('as a source hands them over: plain names only, not hidden, no paths', () => {
    const clean = (image: unknown) => cleanCatalog({ version: 1, recipes: [entry(image)] }).recipes[0].image;
    expect(clean(['markdown.jpg', 'etna.jpg', 'etna.jpg'])).toEqual(['etna.jpg', 'markdown.jpg']);
    expect(clean(['../secret.jpg', 'a/b.jpg', '.hidden', 'a\\b', 7, 'photo 1.jpg'])).toEqual(['photo 1.jpg']);
    expect(clean('etna.jpg')).toBeUndefined();
    expect(clean([])).toBeUndefined();
    expect(clean(Array.from({ length: 80 }, (_, i) => `p${String(i).padStart(2, '0')}.jpg`))).toHaveLength(50);
  });

  it('from the GitHub tree listing when a repository has no catalog.json', async () => {
    mockFetch({
      [`${API}repos/someone/recipes/git/trees/HEAD?recursive=1`]: {
        tree: [
          { path: 'recipes/toast/recipe.md', type: 'blob' },
          { path: 'recipes/toast/image', type: 'tree' },
          { path: 'recipes/toast/image/etna.jpg', type: 'blob' },
          { path: 'recipes/toast/image/.DS_Store', type: 'blob' },
          { path: 'recipes/toast/image/old', type: 'tree' },
          { path: 'recipes/toast/image/old/etna.jpg', type: 'blob' },
          { path: 'recipes/soup/recipe.md', type: 'blob' },
        ],
      },
    });
    const { catalog } = await new GitHubSource('someone/recipes').catalog();
    expect(catalog.recipes.find((r) => r.slug === 'toast')?.image).toEqual(['etna.jpg']);
    expect(catalog.recipes.find((r) => r.slug === 'soup')?.image).toBeUndefined();
  });
});

describe('where each kind of source reads a picture file', () => {
  const path = 'recipes/test-soup/recipe.md';
  it('beside the recipe, by a name Etna reads, and nothing else', () => {
    expect(new LocalSource('book', 'book').imageUrl(path, 'etna.jpg')).toBe(`api/sources/book/image?path=${encodeURIComponent('recipes/test-soup/image/etna.jpg')}`);
    expect(new SiteSource('book', 'book').imageUrl(path, 'etna.png')).toBe(`${SITE_SOURCE_DIR}/recipes/test-soup/image/etna.png`);
    expect(new GitHubSource('someone/recipes').imageUrl(path, 'markdown.jpg')).toBe(`${RAW}recipes/test-soup/image/markdown.jpg`);
    const source = new GitHubSource('someone/recipes');
    expect(() => source.imageUrl(path, 'photo.jpg')).toThrow(/not a picture file/);
    expect(() => source.imageUrl('../x/recipe.md', 'etna.jpg')).toThrow(/not a picture file/);
  });
});

describe('readImageFolder', () => {
  const site = () => new SiteSource('book', 'book');
  const at = (name: string) => `${SITE_SOURCE_DIR}/recipes/test-soup/image/${name}`;

  it('reads the files Etna reads, and names any other', async () => {
    const calls = mockFetch({ [`${SITE_SOURCE_DIR}/catalog.json`]: { version: 1, recipes: [entry(['etna.png', 'markdown.jpg', 'photo.jpg'])] }, [at('etna.png')]: PNG, [at('markdown.jpg')]: JPEG });
    const files = await readImageFolder(site(), 'recipes/test-soup/recipe.md');
    expect(files?.map((f) => [f.name, f.bytes.length])).toEqual([
      ['etna.png', PNG.length],
      ['markdown.jpg', JPEG.length],
      ['photo.jpg', 0],
    ]);
    expect(calls).not.toContain(at('photo.jpg'));
  });

  it('is an empty list when the catalog lists none, and asks for nothing', async () => {
    const calls = mockFetch({ [`${SITE_SOURCE_DIR}/catalog.json`]: { version: 1, recipes: [entry()] } });
    expect(await readImageFolder(site(), 'recipes/test-soup/recipe.md')).toEqual([]);
    expect(calls).toEqual([`${SITE_SOURCE_DIR}/catalog.json`]);
  });

  it('keeps only the start of a file over 1024 KiB, and its size', async () => {
    const big = new Uint8Array(PICTURE_LIMIT + 5000);
    big.set(JPEG.slice(0, 100));
    mockFetch({ [`${SITE_SOURCE_DIR}/catalog.json`]: { version: 1, recipes: [entry(['etna.jpg'])] }, [at('etna.jpg')]: big });
    const [file] = (await readImageFolder(site(), 'recipes/test-soup/recipe.md'))!;
    expect(file.bytes.length).toBe(PICTURE_HEAD);
    expect(file.size).toBeGreaterThan(PICTURE_LIMIT);
    expect(etnaPicture([file])).toEqual({ note: 'image/etna.jpg is larger than 1024 KiB' });
  });

  it('is null when the folder cannot be seen: a file it lists is missing, or the recipe is not in the catalog', async () => {
    mockFetch({ [`${SITE_SOURCE_DIR}/catalog.json`]: { version: 1, recipes: [entry(['etna.png'])] } });
    expect(await readImageFolder(site(), 'recipes/test-soup/recipe.md')).toBeNull();
    expect(await readImageFolder(site(), 'recipes/other/recipe.md')).toBeNull();
  });
});

describe('the Check tab and the card', () => {
  const theme = (name: string) => builtinThemes.find((t) => t.name === name)!;

  it('lints the picture files when they are given, and skips them otherwise', () => {
    const rules = (files?: { name: string; bytes: Uint8Array }[]) => (analyze(SOUP, files).findings as { ok: true; value: { rule: string }[] }).value.map((f) => f.rule);
    expect(rules()).toEqual([]);
    expect(rules([])).toEqual(['picture-line']);
    expect(rules([{ name: 'markdown.jpg', bytes: JPEG }])).toEqual(['picture-not-in-etna']);
    expect(rules([{ name: 'markdown.jpg', bytes: JPEG }, { name: 'etna.png', bytes: PNG }])).toEqual([]);
  });

  it('shows the picture where the style has a place for one, described by the picture line', () => {
    const recipe = analyze(SOUP).recipe;
    if (!recipe.ok) throw new Error(recipe.error);
    const picture = { src: pictureDataAddress(PNG)! };
    const html = card(recipe.value, theme('mise'), { paper: null, size: 'auto', picture });
    expect(html.ok && html.value).toContain(`<img src="${picture.src}" alt="A bowl of soup">`);
    const without = card(recipe.value, theme('mise'), { paper: null, size: 'auto', picture: null });
    expect(without.ok && without.value).not.toContain('<figure class="card-picture"');
    expect(offersPicture(theme('mise'), picture)).toBe(true);
    expect(offersPicture(theme('galley'), picture)).toBe(false);
    expect(offersPicture(theme('mise'), null)).toBe(false);
  });
});

describe('the remembered Picture switch', () => {
  it('is a card setting, true or false', () => {
    expect(parseSettings({ 'etna-settings': 1, cards: { picture: false } })).toMatchObject({ ok: true, value: { settings: { cards: { picture: false } }, ignored: [] } });
    expect(parseSettings({ 'etna-settings': 1, cards: { picture: 'no' } })).toMatchObject({ ok: true, value: { settings: { cards: {} }, ignored: ['cards.picture'] } });
  });
});
