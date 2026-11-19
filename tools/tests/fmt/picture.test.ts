// `etna fmt` leaves the picture line (SPEC §4.3) as written.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { run } from '../../src/fmt/cli.ts';
import { format } from './helpers.ts';

const LINE = '![A bowl of potato soup](image/markdown.jpg)';
const STRUCTURED = `---\netna: 1\n---\n\n# Potato Soup\n\n${LINE}\n\nA soup for cold days.\n\n## Simmer\n\n- 1 kg potatoes\n\nSimmer until soft.\n`;
const TRADITIONAL = `---\netna: 1\nform: traditional\n---\n\n# Potato Soup\n\n${LINE}\n\n## Ingredients\n\n- 1 kg potatoes\n\n## Directions\n\n1. Simmer until soft.\n`;

let root: string | null = null;
afterEach(() => {
  vi.restoreAllMocks();
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

describe('etna fmt and the picture line', () => {
  it('calls a recipe with a picture line canonical, in either form', () => {
    for (const source of [STRUCTURED, TRADITIONAL]) {
      const result = format(source);
      expect(result.changed).toBe(false);
      expect(result.output).toBe(source);
    }
  });

  it('keeps the line as written while it tidies the rest', () => {
    const messy = STRUCTURED.replace('- 1 kg potatoes', '* 1 kilograms potatoes');
    const result = format(messy);
    expect(result.changed).toBe(true);
    expect(result.output).toContain(`# Potato Soup\n\n${LINE}\n\nA soup for cold days.`);
    expect(result.output).toContain('- 1 kg potatoes');
  });

  it('passes fmt --check', async () => {
    root = mkdtempSync(join(tmpdir(), 'etna-fmt-picture-'));
    for (const [slug, source] of [['potato-soup', STRUCTURED], ['potato-soup-traditional-form', TRADITIONAL]]) {
      mkdirSync(join(root, 'recipes', slug), { recursive: true });
      writeFileSync(join(root, 'recipes', slug, 'recipe.md'), source);
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    expect(await run([root, '--check'])).toBe(0);
  });
});
