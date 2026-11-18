// The recipe list's order (listorder.ts), and the order a default source's README states, each
// traditional twin right after its dish (site-source.ts).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { listOrder, readOrder } from '../../src/web/listorder.ts';
import { buildCatalog } from '../../src/catalog/node.ts';
import { defaultSourceFiles, folderOrder, twinsAfterDishes } from '../../src/web/site-source.ts';

const rows = (...ids: string[]) => ids.map((id) => ({ sourceId: id.split(':')[0], slug: id.split(':')[1] }));
const ids = (list: { sourceId: string; slug: string }[]) => list.map((r) => `${r.sourceId}:${r.slug}`);

describe('the recipe list order', () => {
  it('is alphabetical by slug, then by source, when no order is given', () => {
    expect(ids(listOrder(rows('b:pie', 'a:pie', 'a:cake'), null))).toEqual(['a:cake', 'a:pie', 'b:pie']);
    expect(ids(listOrder(rows('a:pie', 'a:cake'), []))).toEqual(['a:cake', 'a:pie']);
  });

  it('follows a stated order, with the recipes it leaves out after it, alphabetically', () => {
    const order = ['lesson-two', 'lesson-one', 'not-here'];
    expect(ids(listOrder(rows('t:zest', 't:lesson-one', 't:apple', 't:lesson-two'), order))).toEqual(['t:lesson-two', 't:lesson-one', 't:apple', 't:zest']);
  });

  it('does not change the rows it is given', () => {
    const given = rows('a:b', 'a:a');
    listOrder(given, ['b']);
    expect(ids(given)).toEqual(['a:b', 'a:a']);
  });

  it('reads an order as slugs, each once, and anything else as none', () => {
    expect(readOrder(['a', 'b', 'a', 7, '', null])).toEqual(['a', 'b']);
    for (const raw of [null, undefined, 'a', { 0: 'a' }]) expect(readOrder(raw)).toEqual([]);
  });
});

describe('the order a folder states', () => {
  const temp = mkdtempSync(join(tmpdir(), 'etna-listorder-'));
  afterAll(() => rmSync(temp, { recursive: true, force: true }));
  const recipe = (title: string) => `---\netna: 1\n---\n\n# ${title}\n\n## ${title}\n\n- 1 slice bread\n\nToast it.\n`;
  const folder = (name: string, readme: string | null) => {
    const root = join(temp, name);
    for (const slug of ['apple', 'toast', 'zest']) {
      mkdirSync(join(root, slug), { recursive: true });
      writeFileSync(join(root, slug, 'recipe.md'), recipe(slug));
    }
    if (readme !== null) writeFileSync(join(root, 'README.md'), readme);
    return root;
  };

  it('is the recipes its README links from a list or a table, in that order', () => {
    const root = folder('lessons', '# Lessons\n\nSee [apple](apple/) first.\n\n| # | Recipe |\n|--|--|\n| 1 | [Zest](zest/recipe.md) |\n| 2 | [Toast](toast/) |\n');
    expect(defaultSourceFiles(root).order).toEqual(['zest', 'toast']);
    expect(folderOrder(root, buildCatalog(root).recipes)).toEqual(['zest', 'toast']);
  });

  it('is empty without a README', () => {
    expect(defaultSourceFiles(folder('plain', null)).order).toEqual([]);
  });

  // A dish and its traditional twin, each in its own folder.
  const twin = (title: string) => `---\netna: 1\nform: traditional\n---\n\n# ${title}\n\n## Ingredients\n\n- 1 slice bread\n\n## Directions\n\n1. Toast it.\n`;
  const pair = (name: string, readme: string | null) => {
    const root = folder(name, readme);
    mkdirSync(join(root, 'toast-traditional-form'), { recursive: true });
    writeFileSync(join(root, 'toast-traditional-form', 'recipe.md'), twin('toast (Traditional Form)'));
    return root;
  };

  it('puts a traditional twin listed before its dish right after it', () => {
    const root = pair('twin-first', '# Lessons\n\n1. [Toast, the old way](toast-traditional-form/recipe.md)\n2. [Toast](toast/)\n3. [Zest](zest/)\n');
    expect(defaultSourceFiles(root).order).toEqual(['toast', 'toast-traditional-form', 'zest']);
    expect(folderOrder(root, buildCatalog(root).recipes)).toEqual(['toast', 'toast-traditional-form', 'zest']);
  });

  it('puts a twin listed far from its dish right after it, and one the README leaves out too', () => {
    const root = pair('twin-apart', '- [Toast](toast/)\n- [Apple](apple/)\n- [Toast, the old way](toast-traditional-form/)\n');
    expect(defaultSourceFiles(root).order).toEqual(['toast', 'toast-traditional-form', 'apple']);
    const left = pair('twin-unlisted', '- [Zest](zest/)\n- [Toast](toast/)\n');
    expect(defaultSourceFiles(left).order).toEqual(['zest', 'toast', 'toast-traditional-form']);
  });

  it('leaves a twin in place when its dish is not in the order', () => {
    const root = pair('dish-absent', '1. [Toast, the old way](toast-traditional-form/)\n2. [Zest](zest/)\n');
    expect(defaultSourceFiles(root).order).toEqual(['toast-traditional-form', 'zest']);
  });

  it('is still empty without a README, twins or not', () => {
    expect(defaultSourceFiles(pair('twin-plain', null)).order).toEqual([]);
  });

  it('moves only a traditional recipe whose title is a structured one plus " (Traditional Form)"', () => {
    const recipes = [
      { slug: 'soup', title: 'Soup', form: 'structured' },
      { slug: 'soup-old', title: 'Soup (Traditional Form)', form: 'traditional' },
      { slug: 'stew-old', title: 'Stew (traditional form)', form: 'traditional' },
      { slug: 'stew', title: 'Stew', form: 'structured' },
      { slug: 'bread-old', title: 'Bread (Traditional Form)', form: 'structured' },
      { slug: 'bread', title: 'Bread', form: 'structured' },
    ];
    expect(twinsAfterDishes(['soup-old', 'stew-old', 'bread-old', 'soup', 'stew', 'bread'], recipes)).toEqual(['stew-old', 'bread-old', 'soup', 'soup-old', 'stew', 'bread']);
    expect(twinsAfterDishes([], recipes)).toEqual([]);
  });
});

describe('the cookbook list', () => {
  it('starts with Potato Soup, its traditional form right under it, while the README keeps its teaching order', () => {
    const cookbook = join(import.meta.dirname, '..', '..', '..', 'cookbook');
    const order = defaultSourceFiles(cookbook).order;
    expect(order.slice(0, 2)).toEqual(['potato-soup', 'potato-soup-traditional-form']);
    for (const [i, slug] of order.entries()) {
      if (slug.endsWith('-traditional-form')) expect(order[i - 1]).toBe(slug.replace(/-traditional-form$/, ''));
    }
  });
});
