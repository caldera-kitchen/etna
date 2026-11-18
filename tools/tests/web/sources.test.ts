import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanCatalog, GitHubSource, isRecipePath, LocalSource, SiteSource, SITE_SOURCE_DIR, SOURCE_LIMITS, THEME_LIMITS, themeManifestFiles, withinThemeLimits } from '../../src/web/sources.ts';

const RAW = 'https://raw.githubusercontent.com/someone/recipes/HEAD/';
const API = 'https://api.github.com/';

const MANIFEST = `name: Postcard
skeleton: back.html
`;

/** A fake fetch over a map of URL → body; anything else is a 404. Records every URL asked for. */
function mockFetch(files: Record<string, string | object>) {
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (!Object.hasOwn(files, url)) return new Response('Not Found', { status: 404, statusText: 'Not Found' });
    const body = files[url];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('themeManifestFiles', () => {
  it('names the skeleton and card.css, and only plain theme-file names', () => {
    expect(themeManifestFiles(MANIFEST)).toEqual(['back.html', 'card.css']);
    expect(themeManifestFiles('name: Plain')).toEqual(['card.html', 'card.css']);
    expect(themeManifestFiles('skeleton: ../../secret.html')).toEqual(['card.css']);
    expect(themeManifestFiles('skeleton: https://example.com/x.html')).toEqual(['card.css']);
    expect(themeManifestFiles('skeleton: run.js')).toEqual(['card.css']);
    expect(themeManifestFiles(': not yaml : [')).toEqual([]);
    expect(themeManifestFiles('- a list')).toEqual([]);
  });
});

describe('withinThemeLimits', () => {
  it('refuses too many files, a file too large, and too much in all', () => {
    const many = Object.fromEntries(Array.from({ length: THEME_LIMITS.files + 1 }, (_, i) => [`f${i}.css`, '']));
    expect(() => withinThemeLimits('t', many)).toThrow(/at most 20/);
    expect(() => withinThemeLimits('t', { 'a.css': 'a'.repeat(THEME_LIMITS.fileBytes + 1) })).toThrow(/a\.css is larger than 256 KB/);
    const heavy = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`f${i}.css`, 'a'.repeat(250 * 1024)]));
    expect(() => withinThemeLimits('t', heavy)).toThrow(/1 MB in all/);
    // Measured in bytes, not characters.
    expect(() => withinThemeLimits('t', { 'a.css': 'é'.repeat(THEME_LIMITS.fileBytes / 2 + 1) })).toThrow(/larger/);
    expect(withinThemeLimits('t', { 'a.css': 'ok' })).toEqual({ 'a.css': 'ok' });
  });
});

describe('GitHubSource themes', () => {
  it('takes the theme names from catalog.json, keeping valid slugs only', async () => {
    const calls = mockFetch({ [`${RAW}catalog.json`]: { version: 1, themes: ['postcard', '../evil', 'Bad', 'postcard', 'a-b'], recipes: [] } });
    const source = new GitHubSource('someone/recipes');
    expect(await source.themes()).toEqual(['a-b', 'postcard']);
    await source.catalog();
    // The catalog is fetched once, and no API call is made.
    expect(calls).toEqual([`${RAW}catalog.json`]);
  });

  it('is empty when the catalog lists no themes', async () => {
    mockFetch({ [`${RAW}catalog.json`]: { version: 1, recipes: [] } });
    expect(await new GitHubSource('someone/recipes').themes()).toEqual([]);
  });

  it('without catalog.json, takes the names from the one tree listing', async () => {
    const calls = mockFetch({
      [`${API}repos/someone/recipes/git/trees/HEAD?recursive=1`]: {
        tree: [
          { path: 'recipes/toast/recipe.md' },
          { path: 'themes/postcard/theme.yaml' },
          { path: 'themes/postcard/card.html' },
          { path: 'themes/Bad/theme.yaml' },
          { path: 'themes/nested/deeper/theme.yaml' },
          { path: 'themes/alpha/theme.yaml' },
        ],
      },
    });
    const source = new GitHubSource('someone/recipes');
    const { catalog, nameOnly } = await source.catalog();
    expect(nameOnly).toBe(true);
    expect(catalog.recipes.map((r) => r.slug)).toEqual(['toast']);
    expect(await source.themes()).toEqual(['alpha', 'postcard']);
    expect(calls.filter((u) => u.startsWith(API))).toHaveLength(1);
  });

  it("fetches a theme's files from raw.githubusercontent.com as its theme.yaml names them", async () => {
    const dir = `${RAW}themes/postcard/`;
    const calls = mockFetch({
      [`${dir}theme.yaml`]: MANIFEST,
      [`${dir}back.html`]: '<article class="card"></article>',
      // card.css is missing: left out, for the checker to report. README.md is missing: no error.
    });
    const files = await new GitHubSource('someone/recipes').themeFiles('postcard');
    expect(files).toEqual({ 'theme.yaml': MANIFEST, 'back.html': '<article class="card"></article>' });
    expect(calls.every((u) => u.startsWith(dir))).toBe(true);
    expect(calls).toContain(`${dir}card.css`);
    expect(calls).toContain(`${dir}README.md`);
  });

  it('includes README.md when there is one', async () => {
    const dir = `${RAW}themes/plain/`;
    mockFetch({ [`${dir}theme.yaml`]: 'name: Plain', [`${dir}card.html`]: '<article></article>', [`${dir}card.css`]: '', [`${dir}README.md`]: '# Plain' });
    expect(Object.keys(await new GitHubSource('someone/recipes').themeFiles('plain')).sort()).toEqual(['README.md', 'card.css', 'card.html', 'theme.yaml']);
  });

  it('rejects a missing theme, a bad name, an oversize file, and a server error', async () => {
    const dir = `${RAW}themes/big/`;
    mockFetch({ [`${dir}theme.yaml`]: 'name: Big', [`${dir}card.html`]: '<article></article>', [`${dir}card.css`]: 'a'.repeat(THEME_LIMITS.fileBytes + 1) });
    const source = new GitHubSource('someone/recipes');
    await expect(source.themeFiles('absent')).rejects.toThrow(/no theme "absent"/);
    await expect(source.themeFiles('../x')).rejects.toThrow(/not a theme name/);
    await expect(source.themeFiles('a/b')).rejects.toThrow(/not a theme name/);
    await expect(source.themeFiles('big')).rejects.toThrow(/card\.css is larger than 256 KB/);
    vi.stubGlobal('fetch', async () => new Response('', { status: 500, statusText: 'Server Error' }));
    await expect(source.themeFiles('big')).rejects.toThrow(/500/);
  });
});

describe('LocalSource themes', () => {
  it('reads the names from the catalog and the files from the theme endpoint', async () => {
    const calls = mockFetch({
      'api/sources/demo/catalog': { version: 1, themes: ['postcard'], recipes: [] },
      'api/sources/demo/theme?name=postcard': { 'theme.yaml': 'name: Postcard' },
    });
    const source = new LocalSource('demo', 'demo');
    expect(await source.themes()).toEqual(['postcard']);
    expect(await source.themeFiles('postcard')).toEqual({ 'theme.yaml': 'name: Postcard' });
    await expect(source.themeFiles('../x')).rejects.toThrow(/not a theme name/);
    await expect(source.themeFiles('gone')).rejects.toThrow(/404/);
    expect(calls.filter((u) => u.endsWith('/catalog'))).toHaveLength(1);
  });
});

describe('the order a source states', () => {
  it('asks etna serve for a folder\'s, and takes slugs only; a failure is no order', async () => {
    mockFetch({ 'api/sources/demo/order': ['b', 'a', 3, 'b', ''] });
    expect(await new LocalSource('demo', 'demo').order()).toEqual(['b', 'a']);
    expect(await new LocalSource('gone', 'gone').order()).toEqual([]);
  });

  it('has the site\'s own from the build, with no request', async () => {
    const calls = mockFetch({});
    expect(await new SiteSource('cookbook', 'cookbook', ['b', 'a']).order()).toEqual(['b', 'a']);
    expect(await new SiteSource('cookbook', 'cookbook').order()).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('what a source may hand over', () => {
  it('accepts only plain paths to a recipe.md', () => {
    for (const ok of ['recipes/apple-pie/recipe.md', 'apple-pie/recipe.md']) expect(isRecipePath(ok), ok).toBe(true);
    for (const bad of [
      '../other/repo/HEAD/recipes/x/recipe.md',
      'recipes/../../x/recipe.md',
      'recipes/x/../y/recipe.md',
      '/recipes/x/recipe.md',
      'recipes//recipe.md',
      'recipes/x/README.md',
      'recipe.md',
      'recipes/x/recipe.md?y',
      'recipes\\x\\recipe.md',
      42,
      null,
    ]) {
      expect(isRecipePath(bad), String(bad)).toBe(false);
    }
  });

  it('keeps the usable entries of a catalog and drops the rest', () => {
    const catalog = cleanCatalog({
      version: 1,
      themes: ['postcard', '../x', 7],
      recipes: [
        { slug: 'toast', title: 'Toast', form: 'structured', path: 'recipes/toast/recipe.md', ingredients: ['bread', 3], text: 'Toast it.', source: 'Me' },
        { slug: 'elsewhere', title: 'Elsewhere', path: '../../other/repo/HEAD/recipes/x/recipe.md' },
        { slug: 'Not A Slug', title: 'x', path: 'recipes/x/recipe.md' },
        { title: 'no slug', path: 'recipes/y/recipe.md' },
        'nonsense',
        { slug: 'bare', path: 'recipes/bare/recipe.md', title: { html: '<b>' }, text: 9 },
      ],
    });
    expect(catalog.themes).toEqual(['postcard']);
    expect(catalog.recipes.map((r) => r.slug)).toEqual(['toast', 'bare']);
    expect(catalog.recipes[0]).toMatchObject({ ingredients: ['bread'], source: 'Me', form: 'structured' });
    expect(catalog.recipes[1]).toMatchObject({ title: 'bare', text: '', form: 'structured' });
    expect(cleanCatalog('nonsense')).toEqual({ version: 1, recipes: [] });
  });

  it('a GitHub source uses a catalog path only when it is plain, and bounds what it reads', async () => {
    mockFetch({
      [`${RAW}catalog.json`]: { version: 1, recipes: [{ slug: 'toast', title: 'Toast', path: 'recipes/toast/recipe.md' }, { slug: 'evil', title: 'Evil', path: '../../a/b/HEAD/recipes/x/recipe.md' }] },
      [`${RAW}recipes/toast/recipe.md`]: '# Toast\n',
      [`${RAW}recipes/big/recipe.md`]: 'x'.repeat(SOURCE_LIMITS.recipeBytes + 1),
    });
    const source = new GitHubSource('someone/recipes');
    expect((await source.catalog()).catalog.recipes.map((r) => r.slug)).toEqual(['toast']);
    expect(await source.read('recipes/toast/recipe.md')).toBe('# Toast\n');
    await expect(source.read('../../a/b/HEAD/recipes/x/recipe.md')).rejects.toThrow(/not a recipe file/);
    await expect(source.read('recipes/big/recipe.md')).rejects.toThrow(/larger than/);
    expect(source.link('recipes/toast/recipe.md')).toBe('https://github.com/someone/recipes/blob/HEAD/recipes/toast/recipe.md');
    expect(source.link('../x/recipe.md')).toBeNull();
  });

  it('refuses a repository name that is not owner/name', () => {
    for (const bad of ['someone/recipes/../../x', 'https://evil.example/a/b', 'a b/c', 'a/b?x=1', '../..', 'a/..', '']) expect(() => new GitHubSource(bad), bad).toThrow(/not a GitHub repository/);
    expect(new GitHubSource('someone/recipes').id).toBe('someone/recipes');
  });
});

describe('SiteSource: the recipes a static build carries', () => {
  const at = (path: string) => `${SITE_SOURCE_DIR}/${path}`;

  it('reads its catalog, recipes, densities and themes from the site itself, by relative URLs only', async () => {
    const calls = mockFetch({
      [at('catalog.json')]: { version: 1, themes: ['postcard'], recipes: [{ slug: 'potato-soup', title: 'Potato Soup', path: 'potato-soup/recipe.md' }] },
      [at('potato-soup/recipe.md')]: '# Potato Soup\n',
      [at('densities.md')]: '| item | g/ml |\n',
      [at('themes/postcard.json')]: { 'theme.yaml': 'name: Postcard' },
    });
    const source = new SiteSource('cookbook', 'cookbook');
    expect(source).toMatchObject({ id: 'cookbook', label: 'cookbook', kind: 'site' });
    const { catalog, nameOnly } = await source.catalog();
    expect(nameOnly).toBe(false);
    expect(catalog.recipes.map((r) => r.path)).toEqual(['potato-soup/recipe.md']);
    expect(await source.read('potato-soup/recipe.md')).toBe('# Potato Soup\n');
    expect(await source.densities()).toBe('| item | g/ml |\n');
    expect(await source.themes()).toEqual(['postcard']);
    expect(await source.themeFiles('postcard')).toEqual({ 'theme.yaml': 'name: Postcard' });
    expect(source.link()).toBeNull();
    // Every request is relative to the page: under a sub-path it stays there, and no host is named.
    for (const url of calls) expect(url, url).toMatch(/^default-source\/[a-z0-9./-]+$/);
    expect(calls.filter((u) => u.endsWith('catalog.json'))).toHaveLength(1);
  });

  it('reads only what any source may hand over', async () => {
    mockFetch({
      [at('catalog.json')]: { version: 1, recipes: [{ slug: 'ok', title: 'OK', path: 'ok/recipe.md' }, { slug: 'evil', title: 'Evil', path: '../../index.html' }] },
      [at('big/recipe.md')]: 'x'.repeat(SOURCE_LIMITS.recipeBytes + 1),
      [at('themes/huge.json')]: { 'theme.yaml': 'x'.repeat(THEME_LIMITS.fileBytes + 1) },
    });
    const source = new SiteSource('cookbook', 'cookbook');
    expect((await source.catalog()).catalog.recipes.map((r) => r.slug)).toEqual(['ok']);
    await expect(source.read('../index.html')).rejects.toThrow(/not a recipe file/);
    await expect(source.read('big/recipe.md')).rejects.toThrow(/larger than/);
    await expect(source.themeFiles('../x')).rejects.toThrow(/not a theme name/);
    await expect(source.themeFiles('huge')).rejects.toThrow(/larger than/);
    await expect(source.themeFiles('gone')).rejects.toThrow(/404/);
    // No densities.md: none, without an error.
    expect(await source.densities()).toBeNull();
  });
});
