import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from '../../src/fmt/cli.ts';

const CANONICAL = '---\netna: 1\n---\n\n# Tidy\n\n## Step\n\n- 2 g salt\n\nStir.\n';
const MESSY = '---\nform: traditional\netna: 1\n---\n# Messy\n## Ingredients\n* 2 grams salt\n* 1½ cups water\n## Directions\n1. Bake at 350 °F or 180 ℃.\n2. Rest at 70 degrees.\n';
const MESSY_FORMATTED =
  '---\netna: 1\nform: traditional\n---\n\n# Messy\n\n## Ingredients\n\n- 2 g salt\n- 1 1/2 cups water\n\n## Directions\n\n1. Bake at 350°F or 180°C.\n2. Rest at 70 degrees.\n';
const BROKEN = '---\netna: [1\n---\n\n# Broken\n\n* 2 grams salt\n';

let root: string;
let out: string[];
let err: string[];

function recipe(slug: string, content: string): string {
  mkdirSync(join(root, 'recipes', slug), { recursive: true });
  const file = join(root, 'recipes', slug, 'recipe.md');
  writeFileSync(file, content);
  return file;
}
const read = (slug: string) => readFileSync(join(root, 'recipes', slug, 'recipe.md'), 'utf8');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etna-fmt-'));
  recipe('tidy', CANONICAL);
  recipe('messy', MESSY);
  recipe('broken', BROKEN);
  mkdirSync(join(root, 'recipes', 'empty'));
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('etna fmt', () => {
  it('rewrites changed files in place and prints each path and a count', async () => {
    expect(await run([root])).toBe(0);
    expect(read('messy')).toBe(MESSY_FORMATTED);
    expect(read('tidy')).toBe(CANONICAL);
    expect(read('broken')).toBe(BROKEN);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/messy[\\/]recipe\.md$/);
    expect(out[1]).toBe('1 of 3 recipes formatted, 2 already canonical; 2 notes');
    // Things left alone on purpose go to standard error.
    expect(err.some((l) => /messy[\\/]recipe\.md:11: temperature undecided: 70 degrees: scale not stated, and the recipe uses both °F and °C$/.test(l))).toBe(true);
    expect(err.some((l) => /broken[\\/]recipe\.md:1: malformed frontmatter .*file left unchanged$/.test(l))).toBe(true);

    // A second run finds nothing to do.
    out = [];
    expect(await run([root])).toBe(0);
    expect(out).toEqual(['0 of 3 recipes formatted, 3 already canonical; 2 notes']);
  });

  it('--check writes nothing, lists the files that would change and exits 1', async () => {
    expect(await run([root, '--check'])).toBe(1);
    expect(read('messy')).toBe(MESSY);
    expect(out[0]).toMatch(/messy[\\/]recipe\.md$/);
    expect(out[1]).toBe('1 of 3 recipes would change, 2 already canonical; 2 notes');

    out = [];
    expect(await run(['--check', join(root, 'recipes', 'tidy')])).toBe(0);
    expect(out).toEqual(['0 of 1 recipe would change, 1 already canonical']);
  });

  it('--diff writes nothing and prints a unified diff', async () => {
    expect(await run(['--diff', join(root, 'recipes', 'messy', 'recipe.md')])).toBe(0);
    expect(read('messy')).toBe(MESSY);
    const patch = out.join('');
    expect(patch).toMatch(/^--- .*messy[\\/]recipe\.md\tas written$/m);
    expect(patch).toMatch(/^\+\+\+ .*messy[\\/]recipe\.md\tformatted$/m);
    expect(patch).toContain('\n-* 2 grams salt\n');
    expect(patch).toContain('\n+- 2 g salt\n');
    expect(patch).toContain('\n-1. Bake at 350 °F or 180 ℃.\n');
    expect(patch).toContain('\n+1. Bake at 350°F or 180°C.\n');
    expect(patch).toMatch(/^@@ -1,11 \+1,16 @@$/m);
    expect(patch).not.toContain('already canonical'); // the summary goes to standard error
    expect(err.at(-1)).toBe('1 of 1 recipe would change, 0 already canonical; 1 note');
  });

  it('--check --diff prints the diff and still exits 1', async () => {
    expect(await run(['--check', '--diff', root])).toBe(1);
    expect(read('messy')).toBe(MESSY);
    expect(out.join('')).toContain('+- 2 g salt');
  });

  it('accepts a file, a recipe directory or a collection, and formats each file once', async () => {
    const file = join(root, 'recipes', 'messy', 'recipe.md');
    expect(await run([file, join(root, 'recipes', 'messy'), root])).toBe(0);
    expect(read('messy')).toBe(MESSY_FORMATTED);
    expect(out.at(-1)).toBe('1 of 3 recipes formatted, 2 already canonical; 2 notes');
  });

  it('prints help, and rejects bad usage with exit code 2', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(out.join('\n')).toMatch(/Usage: etna fmt <path\.\.\.>/);
    expect(await run([])).toBe(2);
    expect(await run(['--bogus', root])).toBe(2);
    expect(await run([join(root, 'nowhere')])).toBe(2);
    expect(read('messy')).toBe(MESSY);
  });
});
