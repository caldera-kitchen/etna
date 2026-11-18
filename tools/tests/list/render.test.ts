import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';
import { consolidate, formatListMarkdown, formatListText } from '../../src/list/index.ts';
import { run } from '../../src/list/cli.ts';

const units = loadUnits();
const recipe = (source: string) => parseRecipe(source, { units });

const A = recipe(`# Rolls

## Mix

- 113 g butter, softened
- 1 1/2 cups milk
- 2 cloves garlic
- salt

Mix.

## Finish

- 2 tbsp butter
- 1/2 cup milk
- 1 g salt
- [glaze](../glaze/)

Finish.
`);

const B = recipe(`---
form: traditional
---

# Soup

## Ingredients

- 1 clove garlic
- 1 recipe stock

## Directions

1. Cook.
`);

const one = consolidate([{ id: 'rolls', title: 'Rolls', recipe: A }]);
const two = consolidate([
  { id: 'rolls', title: 'Rolls', recipe: A },
  { id: 'soup', title: 'Soup', recipe: B },
]);

describe('formatListText', () => {
  it('aligns amounts and joins several units with +', () => {
    expect(formatListText(one)).toBe(
      [
        'Shopping list: Rolls',
        '',
        '113 g + 2 tbsp  butter, 113 g: softened',
        '2 cups          milk',
        '2 cloves        garlic',
        '1 g + some      salt',
        '',
        'Other recipes:',
        '                glaze',
        '',
      ].join('\n'),
    );
  });

  it('writes units long, fractions as glyphs, and leaves notes out on request', () => {
    const list = consolidate([{ id: 'x', title: 'X', recipe: recipe('# X\n\n## A\n\n- 1 1/2 tbsp oil, light\n- 1 g yeast\n\nGo.\n') }]);
    expect(formatListText(list, { units: 'long', fractions: 'unicode', notes: false })).toBe(
      'Shopping list: X\n\n1 ½ tablespoons  oil\n1 gram           yeast\n',
    );
  });

  it('says where each item is used across several recipes', () => {
    const text = formatListText(two, { uses: true });
    expect(text).toContain('Shopping list: Rolls + Soup');
    expect(text).toMatch(/^3 cloves +garlic +for: Rolls \(Mix\); Soup$/m);
    expect(text).toMatch(/^1 recipe +stock +for: Soup$/m);
  });

  it('lists steps only, for one recipe', () => {
    expect(formatListText(one, { uses: true })).toMatch(/^2 cups +milk +for: Mix, Finish$/m);
  });
});

describe('formatListMarkdown', () => {
  it('writes a GitHub task list under a heading naming the recipes', () => {
    expect(formatListMarkdown(two, { uses: true })).toBe(
      [
        '# Shopping list: Rolls + Soup',
        '',
        '- [ ] 113 g + 2 tbsp butter, 113 g: softened — for: Rolls (Mix, Finish)',
        '- [ ] 2 cups milk — for: Rolls (Mix, Finish)',
        '- [ ] 3 cloves garlic — for: Rolls (Mix); Soup',
        '- [ ] 1 g + some salt — for: Rolls (Mix, Finish)',
        '',
        '## Other recipes',
        '',
        '- [ ] [glaze](../glaze/) — for: Rolls (Finish)',
        '- [ ] 1 recipe stock — for: Soup',
        '',
      ].join('\n'),
    );
  });

  it('omits uses by default', () => {
    expect(formatListMarkdown(one)).not.toContain('for:');
  });
});

describe('etna list', () => {
  let out: string[];
  let err: string[];
  let dir: string;
  const example = join(ETNA_ROOT, 'cookbook', 'malted-chocolate');

  beforeEach(() => {
    out = [];
    err = [];
    dir = mkdtempSync(join(tmpdir(), 'etna-list-'));
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
    vi.spyOn(console, 'log').mockImplementation((...args) => void out.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => void err.push(args.join(' ')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints help', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(out.join('')).toContain('Usage: etna list');
  });

  it('prints a text list by default', async () => {
    expect(await run([example])).toBe(0);
    expect(out.join('')).toMatch(/^480 g +heavy cream$/m);
  });

  it('writes markdown, json and sorted output', async () => {
    const md = join(dir, 'list.md');
    expect(await run([join(example, 'recipe.md'), '--format', 'markdown', '--out', md, '--sort'])).toBe(0);
    const lines = readFileSync(md, 'utf8').split('\n').filter((l) => l.startsWith('- [ ]'));
    expect(lines[0]).toBe('- [ ] 350 g crushed Whoppers');
    expect(lines[1]).toBe('- [ ] 115 g dark chocolate');

    expect(await run([example, '--format=json'])).toBe(0);
    const json = JSON.parse(out.join(''));
    expect(json.sources).toEqual([{ id: 'malted-chocolate', title: 'Malted Chocolate' }]);
    expect(json.items[0].item).toBe('heavy cream');
  });

  it('combines several recipes, and a collection, into one list', async () => {
    expect(await run([example, join(ETNA_ROOT, 'cookbook', 'frosty-chocolate'), example, '--uses'])).toBe(0);
    expect(out.join('')).toContain('Shopping list: Malted Chocolate + ');
    out = [];
    expect(await run([join(ETNA_ROOT, 'cookbook'), '--long-units', '--unicode-fractions'])).toBe(0);
    expect(out.join('').split('\n')[0].split(' + ').length).toBeGreaterThan(5);
  });

  it('rejects usage errors with 2 and unreadable recipes with 1', async () => {
    expect(await run([])).toBe(2);
    expect(await run([example, '--format', 'html'])).toBe(2);
    expect(await run([example, '--frobnicate'])).toBe(2);
    expect(await run([example, '--out'])).toBe(2);
    expect(await run([example, '--sort=yes'])).toBe(2);
    expect(await run([join(dir, 'missing')])).toBe(2);
    expect(await run([dir])).toBe(1); // an empty directory: no recipes
  });
});
