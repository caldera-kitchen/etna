// `etna card --theme shopping`: the CLI totals the one-recipe shopping list through the density
// table, as `etna list` and the web engine do.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { run } from '../../src/card/cli.ts';

const dir = mkdtempSync(join(tmpdir(), 'etna-card-cli-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const write = (lines: string[]): string => {
  const recipeDir = join(dir, 'bars');
  mkdirSync(recipeDir, { recursive: true });
  const file = join(recipeDir, 'recipe.md');
  writeFileSync(file, `---\netna: 1\n---\n\n# Bars\n\n## Mix\n\n${lines.map((l) => `- ${l}`).join('\n')}\n\nMix.\n`);
  return file;
};

async function card(args: string[]): Promise<{ code: number; html: string }> {
  const out: string[] = [];
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  const std = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  try {
    const code = await run(args);
    return { code, html: out.join('') };
  } finally {
    err.mockRestore();
    std.mockRestore();
  }
}

describe('etna card with a list theme', () => {
  it('totals butter by tbsp and by grams into one ≈ total', async () => {
    const file = write(['2 tbsp butter', '100 g butter']);
    const { code, html } = await card([file, '--theme', 'shopping', '--fonts', 'none']);
    expect(code).toBe(0);
    expect(html.match(/≈/g)?.length).toBe(1);
    expect(html).toMatch(/≈ \d+<\/td><td class="ingr-unit">g<\/td><td class="ingr-item">butter<span class="ingr-note list-from"> \(2 tbsp \+ 100 g\)/);
  });
});
