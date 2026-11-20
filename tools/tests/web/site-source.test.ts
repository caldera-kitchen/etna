// A static build's default source (`etna build-web --default-source`): what is read from the
// folder at build time, what the site carries, and that a build without one is as before.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildCatalog, serializeCatalog } from '../../src/catalog/node.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';
import { bundledData, buildWeb } from '../../src/web/build.ts';
import { defaultSourceFiles } from '../../src/web/site-source.ts';
import { run } from '../../src/web/build-cli.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const temp = mkdtempSync(join(tmpdir(), 'etna-site-source-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe('defaultSourceFiles', () => {
  it('names Etna\'s own cookbook/ folder for itself, a folder of recipe folders, and carries each recipe and its catalog', () => {
    const d = defaultSourceFiles(COOKBOOK);
    expect(d.id).toBe('cookbook');
    expect(d.label).toBe('cookbook');
    const recipes = Object.keys(d.files).filter((f) => f.endsWith('/recipe.md'));
    expect(recipes).toHaveLength(18);
    expect(recipes).toContain('an-etna-recipe/recipe.md');
    for (const f of recipes) expect(d.files[f], f).toBe(readFileSync(join(COOKBOOK, f), 'utf8'));
    // The catalog is the one `etna catalog` would write, its paths relative to the folder.
    expect(d.files['catalog.json']).toBe(serializeCatalog(buildCatalog(COOKBOOK)));
    expect(JSON.parse(d.files['catalog.json']).recipes.map((r: { path: string }) => r.path).sort()).toEqual([...recipes].sort());
    // The README and anything else that is not a recipe stay out.
    expect(Object.keys(d.files).sort()).toEqual(['catalog.json', ...recipes].sort());
  });

  it('carries the picture files the app reads, as bytes, beside each recipe; no other file', () => {
    const root = join(temp, 'pictures');
    mkdirSync(join(root, 'toast', 'image'), { recursive: true });
    writeFileSync(join(root, 'toast', 'recipe.md'), '# Toast\n\n## Toast\n\n- 1 slice bread\n\nToast it.\n');
    writeFileSync(join(root, 'toast', 'image', 'etna.jpg'), 'jpeg bytes');
    writeFileSync(join(root, 'toast', 'image', 'photo.jpg'), 'other bytes');
    writeFileSync(join(root, 'toast', 'image', '.hidden'), 'hidden');
    const d = defaultSourceFiles(root);
    expect(Object.keys(d.pictures)).toEqual(['toast/image/etna.jpg']);
    expect(new TextDecoder().decode(d.pictures['toast/image/etna.jpg'])).toBe('jpeg bytes');
    expect(Object.keys(d.files).some((f) => f.includes('image/'))).toBe(false);
    expect(JSON.parse(d.files['catalog.json']).recipes[0].image).toEqual(['etna.jpg', 'photo.jpg']);
    // Written by the build under default-source/, where the app reads them.
    expect(Object.keys(defaultSourceFiles(COOKBOOK).pictures)).toEqual([]);
  });

  it('takes a collection root too: recipes/ inside it, its densities.md and its themes', () => {
    const root = join(temp, 'starter');
    mkdirSync(join(root, 'recipes', 'toast'), { recursive: true });
    writeFileSync(join(root, 'recipes', 'toast', 'recipe.md'), '# Toast\n\n## Toast\n\n- 1 slice bread\n\nToast it.\n');
    writeFileSync(join(root, 'densities.md'), '| item | g per ml |\n');
    mkdirSync(join(root, 'themes', 'postcard'), { recursive: true });
    writeFileSync(join(root, 'themes', 'postcard', 'theme.yaml'), 'name: Postcard\n');
    writeFileSync(join(root, 'themes', 'postcard', 'card.css'), 'body {}\n');
    writeFileSync(join(root, 'themes', 'postcard', 'notes.txt'), 'not a theme file\n');
    const d = defaultSourceFiles(root);
    expect(d.id).toBe('starter');
    expect(Object.keys(d.files).sort()).toEqual(['catalog.json', 'densities.md', 'recipes/toast/recipe.md', 'themes/postcard.json']);
    expect(JSON.parse(d.files['themes/postcard.json'])).toEqual({ 'card.css': 'body {}\n', 'theme.yaml': 'name: Postcard\n' });
    expect(JSON.parse(d.files['catalog.json']).themes).toEqual(['postcard']);
  });

  it('refuses, in words, a folder that cannot be a source', () => {
    expect(() => defaultSourceFiles(join(temp, 'missing'))).toThrow(/is not a folder/);
    mkdirSync(join(temp, 'empty'));
    expect(() => defaultSourceFiles(join(temp, 'empty'))).toThrow(/holds no recipe/);
    mkdirSync(join(temp, 'My Recipes', 'toast'), { recursive: true });
    writeFileSync(join(temp, 'My Recipes', 'toast', 'recipe.md'), '# Toast\n');
    expect(() => defaultSourceFiles(join(temp, 'My Recipes'))).toThrow(/lower-case letters and digits joined by hyphens/);
  });
});

describe('a build with a default source', () => {
  const stamp = { version: '0.1.0', commit: '0123456789abcdef0123456789abcdef01234567', committed: '2026-11-12', modified: false };
  const options = { minify: true, fonts: 'web' as const, localServer: false, stamp };

  it('carries the recipes under default-source/, names the source in its data, and keeps its policy', async () => {
    const plain = await buildWeb(options);
    const withDefault = await buildWeb({ ...options, defaultSource: defaultSourceFiles(COOKBOOK) });
    const extra = Object.keys(withDefault.files).filter((f) => !(f in plain.files));
    expect(extra.every((f) => f.startsWith('default-source/'))).toBe(true);
    expect(extra).toContain('default-source/catalog.json');
    expect(extra.filter((f) => f.endsWith('/recipe.md'))).toHaveLength(18);
    expect(withDefault.files['app.js']).toContain('{id:"cookbook",label:"cookbook",welcome:{samples:[{slug:"potato-soup"');
    // Same origin: nothing new to allow.
    expect(withDefault.csp).toBe(plain.csp);
    expect(withDefault.files['index.html']).toBe(plain.files['index.html']);
    // Without one, the bundle's data is as it was: no entry at all.
    expect(plain.files['app.js']).not.toContain('label:"cookbook"');
    // Built again from the same commit: the same bytes.
    const again = await buildWeb({ ...options, defaultSource: defaultSourceFiles(COOKBOOK) });
    expect(Object.keys(again.files).sort()).toEqual(Object.keys(withDefault.files).sort());
    for (const name of Object.keys(again.files)) expect(again.files[name] === withDefault.files[name], name).toBe(true);
  }, 180_000);

  it('adds the data entry only when there is a default', () => {
    const about = { version: '', commit: null, committed: null, modified: false, sourceUrl: null, docs: null, fonts: [], fontLicenseTexts: [] } as never;
    const without = bundledData('web', undefined, false, about);
    expect(without).not.toContain('defaultSource');
    const welcome = { samples: [{ slug: 'toast', title: 'Toast', line: null }], ordered: false, count: 1, example: null };
    const withOne = bundledData('web', undefined, false, about, { id: 'cookbook', label: 'cookbook', welcome, order: ['toast'] });
    expect(withOne).toBe(`${without}export const defaultSource = {"id":"cookbook","label":"cookbook","welcome":${JSON.stringify(welcome)},"order":["toast"]};\n`);
  });

  it('etna build-web --default-source writes the folders it needs, and refuses a folder that is not one', async () => {
    const out = join(temp, 'site');
    const log = console.log;
    console.log = () => {};
    try {
      expect(await run(['--out', out, '--default-source', COOKBOOK])).toBe(0);
    } finally {
      console.log = log;
    }
    expect(readFileSync(join(out, 'default-source', 'potato-soup', 'recipe.md'), 'utf8')).toBe(readFileSync(join(COOKBOOK, 'potato-soup', 'recipe.md'), 'utf8'));
    expect(JSON.parse(readFileSync(join(out, 'default-source', 'catalog.json'), 'utf8')).recipes).toHaveLength(18);
    const error = console.error;
    console.error = () => {};
    try {
      expect(await run(['--out', out, '--default-source', join(temp, 'missing')])).toBe(2);
      expect(await run(['--out', out, '--default-source'])).toBe(2);
    } finally {
      console.error = error;
    }
  }, 120_000);

  it('etna build-web removes the default-source/ it wrote before, and nothing else', async () => {
    const out = join(temp, 'rebuilt');
    const folder = join(temp, 'shelf');
    for (const slug of ['bread', 'toast']) {
      mkdirSync(join(folder, slug), { recursive: true });
      writeFileSync(join(folder, slug, 'recipe.md'), `# ${slug}\n\n## Make\n\n- 100 g flour\n\nDo the first thing.\n`);
    }
    mkdirSync(join(folder, 'bread', 'image'));
    writeFileSync(join(folder, 'bread', 'image', 'etna.jpg'), new Uint8Array([0xff, 0xd8, 0x00, 0x80, 0xff]));
    const quiet = async (argv: string[]) => {
      const log = console.log;
      console.log = () => {};
      try {
        return await run(argv);
      } finally {
        console.log = log;
      }
    };
    expect(await quiet(['--out', out, '--default-source', folder])).toBe(0);
    expect(existsSync(join(out, 'default-source', 'toast', 'recipe.md'))).toBe(true);
    // Something of the site's own beside the build, and a stray file inside the folder the build owns.
    writeFileSync(join(out, 'CNAME'), 'example.org\n');
    writeFileSync(join(out, 'default-source', 'stray.txt'), 'old\n');
    rmSync(join(folder, 'toast'), { recursive: true });
    expect(await quiet(['--out', out, '--default-source', folder])).toBe(0);
    expect(existsSync(join(out, 'default-source', 'toast'))).toBe(false);
    expect(existsSync(join(out, 'default-source', 'stray.txt'))).toBe(false);
    expect(existsSync(join(out, 'default-source', 'bread', 'recipe.md'))).toBe(true);
    // The picture is written as its bytes, unchanged.
    expect(new Uint8Array(readFileSync(join(out, 'default-source', 'bread', 'image', 'etna.jpg')))).toEqual(new Uint8Array([0xff, 0xd8, 0x00, 0x80, 0xff]));
    expect(JSON.parse(readFileSync(join(out, 'default-source', 'catalog.json'), 'utf8')).recipes.map((r: { slug: string }) => r.slug)).toEqual(['bread']);
    expect(readFileSync(join(out, 'CNAME'), 'utf8')).toBe('example.org\n');
    expect(existsSync(join(out, 'index.html'))).toBe(true);
  }, 120_000);
});
