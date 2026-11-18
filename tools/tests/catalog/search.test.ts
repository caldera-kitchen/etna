import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogFromSlugs, createSearch, matchRanges, type Catalog, type CatalogEntry } from '../../src/catalog/index.ts';
import { buildCatalog } from '../../src/catalog/node.ts';
import { analyze, indexTerms, queryTerms, stem } from '../../src/catalog/text.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';

/** A catalog entry with only the searchable parts spelled out. */
function entry(slug: string, title: string, ingredients: string[] = [], text = ''): CatalogEntry {
  return { slug, title, form: 'traditional', source: null, yield: null, license: null, ingredients, text, path: `recipes/${slug}/recipe.md` };
}

const catalog = (...recipes: CatalogEntry[]): Catalog => ({ version: 1, recipes });

const KITCHEN = catalog(
  entry('broccoli-soup', 'Broccoli Soup', ['broccoli heads', 'olive oil', 'sea salt'], 'Trim the florets. Simmer the broccoli until tender, then blend.'),
  entry('quiche', 'Quiche', ['pie crust', 'eggs', 'frozen broccoli', 'scallions'], 'Add the broccoli and cook until hot. Pour into the crust and bake.'),
  entry('caramel-apples', 'Caramel Apples', ['apples', 'sugar', 'heavy cream'], 'Cook to 250°F. Move the caramel to a narrow bowl and dip the apples.'),
  entry('carmel-cookies', 'Carmel Cookies', ['flour', 'brown sugar', 'butter'], 'Cream the butter and sugar. Bake 10 minutes.'),
  entry('pizza-brier-hill', 'Brier Hill', ['bread flour', 'crushed tomatoes', 'Romano cheese', 'green onions'], 'Stretch the dough. Top with sauce, peppers and Romano. Bake on a steel.'),
  entry('archive-pizza-sicilian', '[Archive] Pizza — Sicilian', ['bread flour', 'mozarella', 'pizza sauce'], 'Press the dough into the pan and let it rise. Bake in a hot oven.'),
  entry('no-knead-bread', 'No-Knead Bread', ['bread flour', 'water', 'salt', 'yeast'], 'Mix and rest overnight. Preheat a Dutch oven for 30 minutes. Bake covered, then uncovered.'),
  entry('cocoa-brownies', 'Cocoa Brownies', ['Dutch process cocoa', 'butter', 'sugar', 'eggs'], 'Heat the oven to 350°F. Melt the butter, stir everything together and bake.'),
  entry('cinnamon-rolls', 'Cinnamon Rolls', ['bread flour', 'whole milk', 'cinnamon', 'cream cheese'], 'Roll the dough out, spread the filling, roll up and slice. Bake until golden.'),
  entry('dinner-rolls', 'Dinner Rolls', ['bread flour', 'whole milk', 'butter'], 'Shape into rolls. Dust with cinnamon sugar if you like. Bake.'),
  entry('rice-pudding', 'Rice Pudding', ['long grain rice', 'whole milk', 'sugar', 'jalapeño'], 'Simmer the rice in milk. Let the pudding rise to a gentle boil, stirring.'),
  entry('creme-brulee', 'Crème Brûlée', ['heavy cream', 'egg yolks', 'sugar', "confectioners' sugar"], 'Bake in a water bath. Torch the sugar.'),
);

const search = createSearch([{ source: 'kitchen', catalog: KITCHEN }]);
const slugs = (query: string, options?: { limit?: number; source?: string }) => search.search(query, options).map((h) => h.slug);

describe('terms', () => {
  it('folds case, accents, apostrophes and plurals', () => {
    expect(indexTerms("Crème Brûlée — S'Mores & Baker’s Rolls")).toEqual(['creme', 'brulee', 'smore', 'baker', 'roll']);
    expect(indexTerms('Bread and Butter with the 72-hour dough at 350°F')).toEqual(['bread', 'butter', '72', 'hour', 'dough', 'at', '350']);
    for (const [plural, singular] of [['berries', 'berry'], ['cookies', 'cookie'], ['tomatoes', 'tomato'], ['peaches', 'peach'], ['rolls', 'roll'], ['glasses', 'glass']]) {
      expect(stem(plural), plural).toBe(stem(singular));
    }
    for (const same of ['asparagus', 'swiss', 'hummus', 'pie', 'egg', 'couscous']) expect(stem(same)).toBe(same);
  });

  it('adds synonym terms when indexing and substitutes them in queries', () => {
    expect(indexTerms('2 green onions, sliced')).toEqual(['2', 'green', 'onion', 'scallion', 'sliced']);
    expect(indexTerms('scallions')).toEqual(['scallion']);
    expect(queryTerms('Green Onion pancakes')).toEqual(['scallion', 'pancake']);
    expect(queryTerms('spring onions')).toEqual(queryTerms('scallion'));
    expect(queryTerms("confectioners' sugar")).toEqual(queryTerms('icing sugar'));
  });

  it('knows when the last word may still be being typed', () => {
    expect(analyze('cinnamon rol')).toEqual({ terms: ['cinnamon', 'rol'], open: true });
    expect(analyze('peas').open).toBe(false); // a plural is a finished word
    expect(analyze('green onion').open).toBe(false); // a synonym is a finished name
    expect(analyze('mac and')).toEqual({ terms: ['mac'], open: false });
    expect(analyze('  ')).toEqual({ terms: [], open: false });
  });
});

describe('search', () => {
  it('reports its size and returns nothing for an empty query', () => {
    expect(search.size).toBe(12);
    expect(search.search('')).toEqual([]);
    expect(search.search(' — ')).toEqual([]);
    expect(search.search('the')).toEqual([]);
    expect(search.search('zzzzzz')).toEqual([]);
  });

  it('ranks a name above an ingredient above a mention in the method', () => {
    expect(slugs('cinnamon')).toEqual(['cinnamon-rolls', 'dinner-rolls']);
    expect(slugs('broccoli')).toEqual(['broccoli-soup', 'quiche']);
    const [soup, quiche] = search.search('broccoli');
    expect(soup.score).toBeGreaterThan(quiche.score);
  });

  it('says where a hit matched', () => {
    const [soup, quiche] = search.search('broccoli');
    expect(soup).toMatchObject({ source: 'kitchen', slug: 'broccoli-soup', title: 'Broccoli Soup', fields: ['title', 'ingredients', 'text'], ingredients: ['broccoli heads'] });
    expect(soup.excerpt).toBe('Trim the florets. Simmer the broccoli until tender, then blend.');
    expect(quiche.fields).toEqual(['ingredients', 'text']);
    expect(quiche.ingredients).toEqual(['frozen broccoli']);

    const [bread] = search.search('overnight');
    expect(bread).toMatchObject({ slug: 'no-knead-bread', fields: ['text'], ingredients: [] });
    expect(bread.excerpt).toContain('rest overnight');

    const [rolls] = search.search('cream cheese');
    expect(rolls).toMatchObject({ slug: 'cinnamon-rolls', fields: ['ingredients'], ingredients: ['cream cheese'], excerpt: null });
  });

  it('cuts a long method down to an excerpt around the match', () => {
    const long = createSearch([
      { source: 's', catalog: catalog(entry('stew', 'Stew', [], `${'Brown the meat in batches. '.repeat(20)}Add the saffron and stir. ${'Simmer gently for an hour. '.repeat(20)}`)) },
    ]);
    const { excerpt } = long.search('saffron')[0];
    expect(excerpt).toMatch(/^….*Add the saffron and stir\. .*…$/);
    expect(excerpt!.length).toBeLessThan(170);
    expect(excerpt).not.toMatch(/^…\S*[a-z]…?$/);
  });

  it('forgives typos in names: brocolli, carmel', () => {
    expect(slugs('brocolli')).toEqual(['broccoli-soup', 'quiche']);
    expect(slugs('brocoli')).toEqual(['broccoli-soup', 'quiche']);
    // The collection's own misspelling comes first; the right spelling is still found.
    expect(slugs('carmel')).toEqual(['carmel-cookies', 'caramel-apples']);
    expect(slugs('caramel')).toEqual(['caramel-apples', 'carmel-cookies']);
    // A long word finds either spelling, both ways.
    expect(slugs('mozzarella')).toEqual(['archive-pizza-sicilian']);
    expect(slugs('cinamon')).toContain('cinnamon-rolls');
  });

  it('does not let short queries explode into noise', () => {
    // No typo matching under five letters: rice is not rise.
    expect(slugs('rice')).toEqual(['rice-pudding']);
    expect(slugs('rise').sort()).toEqual(['archive-pizza-sicilian', 'rice-pudding']); // both say "rise" in the method
    // A 5–7 letter word is only matched loosely against names, never against method prose.
    expect(slugs('golten')).toEqual([]); // "golden" is only in a method
    // One letter is not a query; two letters match as a prefix only.
    expect(slugs('p')).toEqual([]);
    expect(slugs('qu')).toEqual(['quiche']);
  });

  it('takes a word many recipes use as meant, not as a typo', () => {
    const many = catalog(
      entry('butter-cake', 'Butter Cake', ['butter', 'flour']),
      ...[1, 2, 3, 4, 5].map((n) => entry(`pancakes-${n}`, `Pancakes ${n}`, ['flour', 'milk'], 'Whisk the batter and rest it.')),
    );
    const s = createSearch([{ source: 's', catalog: many }]);
    expect(s.search('batter').map((h) => h.slug)).not.toContain('butter-cake');
    // With "batter" in only one recipe, the same word is rare enough to be a slip.
    const few = createSearch([{ source: 's', catalog: catalog(many.recipes[0], many.recipes[1]) }]);
    expect(few.search('batter').map((h) => h.slug).sort()).toEqual(['butter-cake', 'pancakes-1']);
  });

  it('matches the last word as a prefix while it is being typed', () => {
    expect(slugs('brocc')).toEqual(['broccoli-soup', 'quiche']);
    expect(slugs('cinnamon rol')[0]).toBe('cinnamon-rolls');
    // Only the last word: an earlier "cin" is a whole word, and not cinnamon.
    expect(slugs('cin soup')).toEqual(['broccoli-soup']);
  });

  it('prefers recipes that match all the words', () => {
    const hits = slugs('cinnamon rolls');
    // Both have both words; the name wins. Recipes with only "roll" in them come after.
    expect(hits.slice(0, 2)).toEqual(['cinnamon-rolls', 'dinner-rolls']);
    expect(slugs('bread flour water')[0]).toBe('no-knead-bread');
    // A recipe matching one word of two still shows, below every recipe matching both.
    const both = slugs('pizza cinnamon');
    expect(both).toContain('cinnamon-rolls');
    expect(both).toContain('pizza-brier-hill');
    expect(slugs('milk cinnamon').slice(0, 2).sort()).toEqual(['cinnamon-rolls', 'dinner-rolls']);
  });

  it('prefers the words next to each other: dutch oven is not Dutch cocoa plus an oven', () => {
    const hits = search.search('dutch oven');
    expect(hits.map((h) => h.slug).slice(0, 2)).toEqual(['no-knead-bread', 'cocoa-brownies']);
    expect(hits[0].excerpt).toContain('Preheat a Dutch oven');
  });

  it('finds a family by its slug prefix', () => {
    // "Brier Hill" has no "pizza" in its title, ingredients or method — only in its slug.
    const hits = search.search('pizza');
    expect(hits.map((h) => h.slug)).toEqual(['archive-pizza-sicilian', 'pizza-brier-hill']);
    expect(hits[1].fields).toEqual(['title']);
    expect(slugs('brier hill')).toEqual(['pizza-brier-hill']);
    expect(slugs('archive')).toEqual(['archive-pizza-sicilian']);
  });

  it('applies the synonym table', () => {
    expect(slugs('scallion').sort()).toEqual(['pizza-brier-hill', 'quiche']);
    expect(slugs('green onions').sort()).toEqual(['pizza-brier-hill', 'quiche']);
    expect(search.search('scallions').find((h) => h.slug === 'pizza-brier-hill')?.ingredients).toEqual(['green onions']);
    expect(slugs('icing sugar')[0]).toBe('creme-brulee');
    // The words of a synonym still work on their own.
    expect(slugs('onion')).toEqual(['pizza-brier-hill']);
  });

  it('ignores accents and case', () => {
    expect(slugs('creme brulee')).toEqual(['creme-brulee']);
    expect(slugs('CRÈME')).toEqual(['creme-brulee']);
    expect(slugs('jalapeno')).toEqual(['rice-pudding']);
  });

  it('honors limit', () => {
    expect(slugs('bread flour').length).toBeGreaterThan(3);
    expect(slugs('bread flour', { limit: 3 })).toHaveLength(3);
    expect(slugs('bread flour', { limit: 0 })).toEqual([]);
  });

  it('gives the same results every time', () => {
    const again = createSearch([{ source: 'kitchen', catalog: KITCHEN }]);
    for (const q of ['bread flour', 'bake', 'cinnamon rolls', 'sugar']) expect(again.search(q)).toEqual(search.search(q));
  });
});

describe('several sources', () => {
  const mine = catalog(entry('apple-pie', 'Apple Pie', ['apples', 'pie crust'], 'Bake at 375°F.'), entry('pie-crust', 'Pie Crust', ['flour', 'butter']));
  const theirs = catalog(entry('apple-pie', 'Apple Pie with Cheddar', ['apples', 'cheddar'], 'Grate the cheddar into the crust.'));
  const both = createSearch([
    { source: 'me/recipes', catalog: mine },
    { source: 'them/recipes', catalog: theirs },
  ]);

  it('keeps the same slug from two sources apart', () => {
    expect(both.size).toBe(3);
    const hits = both.search('apple pie');
    expect(hits.map((h) => `${h.source}:${h.slug}`)).toEqual(['me/recipes:apple-pie', 'them/recipes:apple-pie', 'me/recipes:pie-crust']);
    expect(hits[1].title).toBe('Apple Pie with Cheddar');
    expect(both.search('cheddar').map((h) => h.source)).toEqual(['them/recipes']);
  });

  it('restricts results to one source', () => {
    expect(both.search('apple', { source: 'them/recipes' }).map((h) => `${h.source}:${h.slug}`)).toEqual(['them/recipes:apple-pie']);
    expect(both.search('pie', { source: 'me/recipes' }).every((h) => h.source === 'me/recipes')).toBe(true);
    expect(both.search('pie', { source: 'me/recipes' })).toHaveLength(2);
    expect(both.search('apple', { source: 'nobody' })).toEqual([]);
  });

  it('suggests titles from every source', () => {
    expect(both.suggest('app')).toEqual([
      { source: 'me/recipes', slug: 'apple-pie', title: 'Apple Pie' },
      { source: 'them/recipes', slug: 'apple-pie', title: 'Apple Pie with Cheddar' },
    ]);
  });

  it('works with no sources at all', () => {
    const none = createSearch([]);
    expect(none.size).toBe(0);
    expect(none.search('pie')).toEqual([]);
    expect(none.suggest('pie')).toEqual([]);
  });
});

describe('suggest', () => {
  const titles = (query: string, limit?: number) => search.suggest(query, limit).map((s) => s.title);

  it('completes titles, every word a possible beginning', () => {
    expect(titles('cin rol')).toEqual(['Cinnamon Rolls']);
    expect(titles('rol')).toEqual(['Cinnamon Rolls', 'Dinner Rolls']);
    expect(titles('piz')).toEqual(['[Archive] Pizza — Sicilian', 'Brier Hill']);
    expect(titles('brocolli')).toEqual(['Broccoli Soup']);
  });

  it('looks at names only, needs every word, and honors the limit', () => {
    expect(titles('cinnamon')).toEqual(['Cinnamon Rolls']); // not Dinner Rolls, which only mentions it
    expect(titles('cinnamon soup')).toEqual([]);
    expect(titles('')).toEqual([]);
    expect(titles('rol', 1)).toHaveLength(1);
  });
});

describe('a catalog of slugs only', () => {
  it('still searches by name', () => {
    const s = createSearch([{ source: 'bare', catalog: catalogFromSlugs(['apple-pie', 'archive-pizza-brier-hill', 'pizza-dough']) }]);
    expect(s.search('pizza').map((h) => h.slug)).toEqual(['pizza-dough', 'archive-pizza-brier-hill']);
    expect(s.search('pizza')[0]).toMatchObject({ source: 'bare', title: 'Pizza Dough', fields: ['title'], ingredients: [], excerpt: null });
    expect(s.suggest('app')).toEqual([{ source: 'bare', slug: 'apple-pie', title: 'Apple Pie' }]);
  });
});

describe('the recipes that ship', () => {
  const shipped = createSearch([{ source: 'cookbook', catalog: buildCatalog(join(ETNA_ROOT, 'cookbook')) }]);
  const top = (query: string) => shipped.search(query)[0]?.slug;

  it('finds them by name, ingredient and method', () => {
    expect(shipped.size).toBe(18);
    expect(top('cinnamon rolls')).toBe('next-day-soft-cinnamon-rolls');
    expect(top('yudane')).toBe('next-day-soft-cinnamon-rolls'); // a component heading, in the method text
    expect(top('whoppers')).toBe('malted-chocolate');
    expect(top('lecithin')).toBe('frosty-chocolate');
    expect(shipped.search('potato soup').slice(0, 2).map((h) => h.slug).sort()).toEqual(['potato-soup', 'potato-soup-traditional-form']);
    expect(shipped.search('escarole').map((h) => h.slug).sort()).toEqual(['italian-wedding-soup', 'italian-wedding-soup-traditional-form']);
    expect(top('meatloaf')).toBe('nana-palumbos-meatloaf');
  });
});

describe('full and partial matches, and highlighting', () => {
  const catalog = (recipes: Partial<CatalogEntry>[]): Catalog => ({
    version: 1,
    recipes: recipes.map((r, i) => ({
      slug: `r${i}`, title: `R${i}`, form: 'traditional', source: null, yield: null, license: null, ingredients: [], text: '', path: `recipes/r${i}/recipe.md`, ...r,
    })),
  });

  it('marks whether a hit matches every word', () => {
    const search = createSearch([{ source: 's', catalog: catalog([
      { slug: 'a', title: 'No-Knead Bread', text: 'Bake in a dutch oven.' },
      { slug: 'b', title: 'Roast Chicken', text: 'Heat the oven.' },
    ]) }]);
    const hits = search.search('dutch oven');
    expect(hits.map((h) => [h.slug, h.full])).toEqual([['a', true], ['b', false]]);
  });

  it("reports the recipe's own matching terms, which locate the words to highlight", () => {
    const search = createSearch([{ source: 's', catalog: catalog([
      { slug: 'a', title: 'Brocolli Soup', ingredients: ['broccoli florets'], text: 'Simmer the broccoli.' },
    ]) }]);
    const [hit] = search.search('broccoli');
    expect(hit.terms).toEqual(['broccoli', 'brocolli']);
    const text = 'Brocolli Soup: simmer the broccoli, not the Cauliflower.';
    expect(matchRanges(text, hit.terms).map((r) => text.slice(r.start, r.end))).toEqual(['Brocolli', 'broccoli']);
    // Plurals reduce to the same term.
    const [rolls] = createSearch([{ source: 's', catalog: catalog([{ slug: 'c', title: 'Cinnamon Rolls' }]) }]).search('roll');
    expect(matchRanges('Roll the rolls.', rolls.terms)).toHaveLength(2);
    expect(matchRanges('anything', [])).toEqual([]);
  });
});
