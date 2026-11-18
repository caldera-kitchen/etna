import { describe, expect, it } from 'vitest';

import { filterOnList, hitDetail, rowDetail, segments, sourceTags, sourceText } from '../../src/web/rows.ts';

const entry = (source: string | null, ingredients: string[]) => ({ source, ingredients });
const hit = (terms: string[], ingredients: string[] = [], excerpt: string | null = null) => ({ terms, ingredients, excerpt });

describe('the second line of a row', () => {
  it('is the recipe’s source when it has one', () => {
    expect(rowDetail(entry('Bread Bible', ['flour', 'water']))).toBe('Bread Bible');
  });

  it('shows a web address as its site', () => {
    expect(sourceText('https://www.chopstickchronicles.com/shokupan/#wprm')).toBe('chopstickchronicles.com');
    expect(sourceText('http://londonfoodieny.com/2010/02/08/cake/')).toBe('londonfoodieny.com');
    expect(sourceText('  kingarthurflour.com ')).toBe('kingarthurflour.com');
    expect(sourceText('https://')).toBe('https://');
  });

  it('is the first four ingredients when there is no source', () => {
    expect(rowDetail(entry(null, ['eggs', 'sugar', 'pumpkin', 'lemon juice', 'flour']))).toBe('eggs, sugar, pumpkin, lemon juice');
    expect(rowDetail(entry('  ', ['salt']))).toBe('salt');
    expect(rowDetail(entry(null, []))).toBe('');
    expect(rowDetail(undefined)).toBe('');
  });

  it('in a search result, keeps the usual line when a search word is in it', () => {
    expect(hitDetail(entry(null, ['buttermilk', 'flour']), hit(['buttermilk'], ['buttermilk']))).toBe('buttermilk, flour');
  });

  it('in a search result, says what matched when the usual line does not', () => {
    expect(hitDetail(entry('Bread Bible', ['flour', 'yudane']), hit(['yudane'], ['yudane', 'yudane']))).toBe('yudane');
    expect(hitDetail(entry('Bread Bible', []), hit(['stir'], [], '…stir, stir, the boiling water'))).toBe('…stir, stir, the boiling water');
    expect(hitDetail(entry('Bread Bible', []), hit(['bread']))).toBe('Bread Bible');
    expect(hitDetail(undefined, hit(['x']))).toBe('');
  });
});

describe('segments (search highlighting in a row)', () => {
  it('marks the words that match, keeping the text whole', () => {
    const parts = segments('Buttermilk Pancakes', ['buttermilk']);
    expect(parts).toEqual([
      { text: 'Buttermilk', mark: true },
      { text: ' Pancakes', mark: false },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('Buttermilk Pancakes');
  });

  it('marks real search terms from the search', async () => {
    const { createSearch } = await import('../../src/catalog/index.ts');
    const search = createSearch([
      {
        source: 'a',
        catalog: {
          version: 1,
          recipes: [{ slug: 'p', title: 'Buttermilk Pancakes', form: 'traditional', source: null, yield: null, license: null, ingredients: ['buttermilk', 'flour'], text: 'Mix.', path: 'recipes/p/recipe.md' }],
        },
      },
    ]);
    const [h] = search.search('pancake buttermilk');
    expect(h).toBeDefined();
    const title = segments(h.title, h.terms);
    expect(title.filter((p) => p.mark).map((p) => p.text)).toEqual(['Buttermilk', 'Pancakes']);
    const partial = search.search('pancake zucchini');
    expect(segments(partial[0].title, partial[0].terms).filter((p) => p.mark).map((p) => p.text)).toEqual(['Pancakes']);
  });

  it('is one plain piece when nothing matches, and nothing for no text', () => {
    expect(segments('Quiche', ['flour'])).toEqual([{ text: 'Quiche', mark: false }]);
    expect(segments('Quiche', [])).toEqual([{ text: 'Quiche', mark: false }]);
    expect(segments('', ['flour'])).toEqual([]);
  });
});

describe('filterOnList', () => {
  const rows = [
    { ref: { source: 'a', slug: 'one' } },
    { ref: { source: 'a', slug: 'two' } },
    { ref: { source: 'b', slug: 'one' } },
  ];
  const list = [
    { source: 'b', slug: 'one' },
    { source: 'a', slug: 'one' },
  ];

  it('keeps every row when off', () => {
    expect(filterOnList(rows, (r) => r.ref, list, false)).toEqual(rows);
  });

  it('keeps only the rows on the list, in the rows’ order', () => {
    expect(filterOnList(rows, (r) => r.ref, list, true).map((r) => `${r.ref.source}/${r.ref.slug}`)).toEqual(['a/one', 'b/one']);
  });

  it('is empty for an empty list', () => {
    expect(filterOnList(rows, (r) => r.ref, [], true)).toEqual([]);
  });
});

describe('sourceTags', () => {
  const rows = [
    { source: 'mine', title: 'Irish Brown Bread' },
    { source: 'desserts', title: 'irish brown bread ' },
    { source: 'mine', title: 'Quiche' },
    { source: 'mine', title: 'Quiche' },
  ];

  it('never tags rows from a single source', () => {
    expect(sourceTags(rows, 1, false)).toEqual([false, false, false, false]);
    expect(sourceTags(rows, 1, true)).toEqual([false, false, false, false]);
  });

  it('tags only titles shared across sources when browsing several', () => {
    expect(sourceTags(rows, 2, false)).toEqual([true, true, false, false]);
  });

  it('tags every search result when the results come from several sources', () => {
    expect(sourceTags(rows, 2, true)).toEqual([true, true, true, true]);
  });

  it('tags no search result when every result comes from one source (unless a title is shared)', () => {
    expect(sourceTags(rows.slice(2), 2, true)).toEqual([false, false]);
  });
});
