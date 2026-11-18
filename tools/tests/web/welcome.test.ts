// The landing page: which form shows when (welcome.ts), and the order and lines of the recipes it
// names, read from the default source's README at build time (site-source.ts).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { ETNA_ROOT } from '../../src/node/files.ts';
import { defaultSourceFiles, firstSentence, readmeOrder, siteWelcome, startWith } from '../../src/web/site-source.ts';
import { readSiteWelcome, SAMPLE_COUNT, welcomeForm } from '../../src/web/welcome.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const temp = mkdtempSync(join(tmpdir(), 'etna-welcome-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe('which form the landing page takes', () => {
  it('is the full welcome for a static build whose reader has kept no repository', () => {
    expect(welcomeForm({ localServer: false, kept: undefined, hidden: false, asked: false })).toBe('full');
    expect(welcomeForm({ localServer: false, kept: [], hidden: false, asked: false })).toBe('full');
  });

  it('is the short form once the reader has kept a repository of their own', () => {
    expect(welcomeForm({ localServer: false, kept: ['example-cook/etna-recipes'], hidden: false, asked: false })).toBe('short');
    expect(welcomeForm({ localServer: false, kept: [{ repo: 'example-cook/etna-recipes', ref: 'main' }], hidden: false, asked: false })).toBe('short');
  });

  it('is the short form under etna serve, whatever is kept', () => {
    expect(welcomeForm({ localServer: true, kept: undefined, hidden: false, asked: false })).toBe('short');
    expect(welcomeForm({ localServer: true, kept: ['a/b'], hidden: false, asked: false })).toBe('short');
  });

  it('is the short form once the reader has hidden it (the welcome: short setting)', () => {
    expect(welcomeForm({ localServer: false, kept: undefined, hidden: true, asked: false })).toBe('short');
    expect(welcomeForm({ localServer: false, kept: [], hidden: true, asked: false })).toBe('short');
    expect(welcomeForm({ localServer: true, kept: undefined, hidden: true, asked: false })).toBe('short');
  });

  it('is the full welcome when the reader asks for it, hidden or not', () => {
    expect(welcomeForm({ localServer: false, kept: undefined, hidden: true, asked: true })).toBe('full');
  });

  it('is the full welcome whenever the reader asks for it', () => {
    expect(welcomeForm({ localServer: true, kept: undefined, hidden: false, asked: true })).toBe('full');
    expect(welcomeForm({ localServer: false, kept: ['a/b'], hidden: false, asked: true })).toBe('full');
  });
});

describe('the recipes the welcome names', () => {
  it('names the four dishes the cookbook README names under "Start with these", each with its line', () => {
    const w = defaultSourceFiles(COOKBOOK).welcome;
    expect(w.ordered).toBe(true);
    expect(w.count).toBe(18);
    expect(w.samples.map((s) => s.slug)).toEqual(['potato-soup', 'malted-chocolate', 'easter-bread', 'italian-wedding-soup']);
    // Each line stands on its own: no twin is listed above it on the landing page.
    expect(w.samples[0]).toEqual({ slug: 'potato-soup', title: 'Potato Soup', line: 'Potato soup with each ingredient listed under the step where it goes in.' });
    expect(w.samples[1].line).toBe('An ice cream made in seven steps, one after another, with no parts at all.');
    expect(w.samples[2].line).toBe('A braided bread: a Choose between two mixers, a Checkpoint and an optional frosting.');
    expect(w.samples[3].line).toBe('Four components, one of them optional, brought together in a fifth that serves the soup.');
    expect(w.samples.every((s) => s.line !== null && !/^the same/i.test(s.line))).toBe(true);
    // The recipe the welcome shows three ways: the first sample.
    expect(w.example).toEqual({ slug: 'potato-soup', title: 'Potato Soup' });
    // "Plus 14 more in the recipe list": every recipe not named, the traditional forms too.
    expect(w.count - w.samples.length).toBe(14);
  });

  it('without that section, names the first four structured lessons of the cookbook README', () => {
    const d = defaultSourceFiles(COOKBOOK);
    const recipes = JSON.parse(d.files['catalog.json']).recipes;
    const readme = readFileSync(join(COOKBOOK, 'README.md'), 'utf8');
    const without = readme.replace(/^## Start with these\n[\s\S]*?(?=^## )/m, '');
    expect(without).not.toContain('Start with these');
    const w = siteWelcome(recipes, without);
    // Lesson 1 is the traditional form of lesson 2: each dish is named once.
    expect(w.samples.map((s) => s.slug)).toEqual(['potato-soup', 'malted-chocolate', 'pistachio-in-the-style-of-van-leeuwen', 'frosty-chocolate']);
    expect(w.samples[0].line).toBe('The same soup structured: each ingredient under the step where it goes in, and the white sauce a component linked into the soup.');
    expect(w.ordered).toBe(true);
  });

  it('reads every recipe in the README order, the lessons first, not the alphabetical one', () => {
    const d = defaultSourceFiles(COOKBOOK);
    const recipes = JSON.parse(d.files['catalog.json']).recipes;
    const order = readmeOrder(readFileSync(join(COOKBOOK, 'README.md'), 'utf8'), recipes).map((r) => r.slug);
    expect(order).toEqual([
      'potato-soup-traditional-form',
      'potato-soup',
      'malted-chocolate',
      'pistachio-in-the-style-of-van-leeuwen',
      'frosty-chocolate',
      'boiled-eggs',
      'deviled-eggs',
      'navy-bean-soup-traditional-form',
      'navy-bean-soup',
      'nana-palumbos-meatloaf-traditional-form',
      'nana-palumbos-meatloaf',
      'next-day-soft-cinnamon-rolls',
      'easter-bread-traditional-form',
      'easter-bread',
      'italian-wedding-soup-traditional-form',
      'italian-wedding-soup',
      'chili-with-short-ribs',
      'an-etna-recipe',
    ]);
    expect(recipes.map((r: { slug: string }) => r.slug)[0]).toBe('an-etna-recipe');
  });

  const recipes = [
    { slug: 'apple-pie', title: 'Apple Pie', form: 'traditional', path: 'recipes/apple-pie/recipe.md' },
    { slug: 'bread', title: 'Bread', form: 'structured', path: 'recipes/bread/recipe.md' },
    { slug: 'crumble', title: 'Crumble', form: 'structured', path: 'recipes/crumble/recipe.md' },
  ];

  it('takes list items too, each recipe once, and skips links in running text, in code and to elsewhere', () => {
    const readme = [
      'Start with [Crumble](recipes/crumble/) if you like.',
      '',
      '```',
      '- [Apple Pie](recipes/apple-pie/recipe.md)',
      '```',
      '',
      '- [Bread](./recipes/bread/recipe.md) — *A loaf*, made overnight. It keeps.',
      '- [The site](https://example.com/recipes/crumble/)',
      '1. [Crumble](recipes/crumble) : quick',
      '- [Bread again](recipes/bread/)',
      '- [Apple Pie](recipes/apple-pie/)',
    ].join('\n');
    expect(readmeOrder(readme, recipes)).toEqual([
      { slug: 'bread', line: 'A loaf, made overnight.' },
      { slug: 'crumble', line: 'quick' },
      { slug: 'apple-pie', line: null },
    ]);
  });

  it('takes the next cell of a table row, with bars inside code left alone', () => {
    const readme = '| Recipe | About |\n|---|---|\n| [Bread](recipes/bread/recipe.md) | Uses `a | b`. Then more. |\n| [Crumble](recipes/crumble/) | |\n';
    expect(readmeOrder(readme, recipes)).toEqual([
      { slug: 'bread', line: 'Uses `a | b`.' },
      { slug: 'crumble', line: null },
    ]);
  });

  it('takes only structured recipes, in the README order, and only those the README links', () => {
    // Apple Pie is traditional: it has no flow chart, so it is not named. Crumble is not linked.
    const w = siteWelcome(recipes, '- [Apple Pie](recipes/apple-pie/) — a pie.\n- [Bread](recipes/bread/) — a loaf.\n');
    expect(w).toEqual({ samples: [{ slug: 'bread', title: 'Bread', line: 'a loaf.' }], ordered: true, count: 3, example: { slug: 'bread', title: 'Bread' } });
    // A README that links only traditional recipes names none.
    expect(siteWelcome(recipes, '- [Apple Pie](recipes/apple-pie/)\n').samples).toEqual([]);
  });

  it('without a README, or one that links no recipe, names the first four structured recipes in the list’s order, by name alone', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ slug: `r${i}`, title: `R ${i}`, form: i % 2 === 0 ? 'traditional' : 'structured', path: `r${i}/recipe.md` }));
    for (const readme of [null, '# Recipes\n\nSee [SPEC](../SPEC.md).\n']) {
      const w = siteWelcome(many, readme);
      expect(w.ordered).toBe(false);
      expect(w.samples).toHaveLength(SAMPLE_COUNT);
      expect(w.samples.map((s) => s.slug)).toEqual(['r1', 'r3', 'r5', 'r7']);
      expect(w.samples.every((s) => s.line === null)).toBe(true);
      expect(w.example).toEqual({ slug: 'r1', title: 'R 1' });
      expect(w.count).toBe(8);
    }
    // Only traditional recipes: nothing to name, nothing to show three ways.
    const flat = many.map((r) => ({ ...r, form: 'traditional' }));
    expect(siteWelcome(flat, null)).toEqual({ samples: [], ordered: false, count: 8, example: null });
  });

  it('reads a collection root’s README, whose links go through recipes/', () => {
    const root = join(temp, 'starter');
    for (const slug of ['bread', 'toast']) {
      mkdirSync(join(root, 'recipes', slug), { recursive: true });
      writeFileSync(join(root, 'recipes', slug, 'recipe.md'), `# ${slug}\n\n## Make\n\n- 1 slice bread\n\nMake it.\n`);
    }
    writeFileSync(join(root, 'README.md'), '- [Toast](recipes/toast/) — first.\n- [Bread](recipes/bread/) — second.\n');
    const w = defaultSourceFiles(root).welcome;
    expect(w.samples.map((s) => [s.slug, s.line])).toEqual([
      ['toast', 'first.'],
      ['bread', 'second.'],
    ]);
    // The README is read, not carried: the site's files are the source's as before.
    expect(Object.keys(defaultSourceFiles(root).files)).not.toContain('README.md');
  });

  it('takes the samples from a "Start with these" section, in its order, at most four and structured only', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ slug: `r${i}`, title: `R ${i}`, form: i === 2 ? 'traditional' : 'structured', path: `recipes/r${i}/recipe.md` }));
    const readme = [
      '# Recipes',
      '',
      '## Start with These',
      '',
      '- [R 5](recipes/r5/) — the fifth. More.',
      '- [R 2](recipes/r2/) — traditional, so skipped.',
      '- [R 4](recipes/r4/recipe.md)',
      '- [R 3](recipes/r3/)',
      '- [R 1](recipes/r1/)',
      '- [R 0](recipes/r0/)',
      '',
      '### Still the section',
      '',
      '## Lessons',
      '',
      '- [R 0](recipes/r0/) — zero.',
      '- [R 4](recipes/r4/) — four, from the lessons.',
      '- [R 1](recipes/r1/)',
    ].join('\n');
    const w = siteWelcome(many, readme);
    expect(w.samples).toEqual([
      { slug: 'r5', title: 'R 5', line: 'the fifth.' },
      // No line in the section: the README's line elsewhere.
      { slug: 'r4', title: 'R 4', line: 'four, from the lessons.' },
      { slug: 'r3', title: 'R 3', line: null },
      { slug: 'r1', title: 'R 1', line: null },
    ]);
    expect(w.ordered).toBe(true);
    expect(w.example).toEqual({ slug: 'r5', title: 'R 5' });
    // The section names the samples only: the list's order is the rest of the README.
    expect(readmeOrder(readme, many).map((l) => l.slug)).toEqual(['r0', 'r4', 'r1']);
    expect(startWith(readme, many).map((l) => l.slug)).toEqual(['r5', 'r2', 'r4', 'r3', 'r1', 'r0']);
  });

  it('reads no section under another heading, a deeper one, or one in code', () => {
    const two = recipes.slice(1);
    for (const heading of ['## Start with these ones', '### Start with these', '```\n## Start with these\n```']) {
      const readme = `${heading}\n\n- [Crumble](recipes/crumble/)\n\n## Lessons\n\n- [Bread](recipes/bread/)\n`;
      expect(startWith(readme, two)).toEqual([]);
    }
    // Without a section the samples follow the README's order, as before.
    expect(siteWelcome(two, '## Lessons\n\n- [Bread](recipes/bread/)\n- [Crumble](recipes/crumble/)\n').samples.map((s) => s.slug)).toEqual(['bread', 'crumble']);
  });

  it('cuts a line at its first sentence', () => {
    expect(firstSentence('')).toBeNull();
    expect(firstSentence('No full stop')).toBe('No full stop');
    expect(firstSentence('One, "quoted". Two.')).toBe('One, "quoted".');
    expect(firstSentence('See SPEC §4.1 and lesson 2. Then 3.')).toBe('See SPEC §4.1 and lesson 2.');
  });
});

describe('the welcome as the bundle carries it', () => {
  it('is read back as written, and anything else is dropped', () => {
    const w = defaultSourceFiles(COOKBOOK).welcome;
    expect(readSiteWelcome(JSON.parse(JSON.stringify(w)))).toEqual(w);
    expect(readSiteWelcome(undefined)).toBeNull();
    expect(readSiteWelcome({ samples: 'x', ordered: true, count: 1 })).toBeNull();
    expect(readSiteWelcome({ samples: [{ slug: 1 }], ordered: true, count: 1 })).toBeNull();
    expect(readSiteWelcome({ samples: [], ordered: false, count: 0, example: { slug: 2 } })).toEqual({ samples: [], ordered: false, count: 0, example: null });
  });
});
