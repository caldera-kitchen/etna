// Registry data: `raise` is rise.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { ETNA_ROOT } from '../../src/node/files.ts';

const yaml = (name: string) => parseYaml(readFileSync(join(ETNA_ROOT, 'registries', name), 'utf8'));

describe('operations', () => {
  const ops = yaml('operations.yaml').operations as { name: string; aliases?: string[] }[];
  const lookup = new Map<string, string>();
  for (const op of ops) for (const term of [op.name, ...(op.aliases ?? [])]) lookup.set(term.toLowerCase(), op.name);

  it('reads raise, proof and prove as rise', () => {
    for (const word of ['rise', 'raise', 'proof', 'prove']) expect(lookup.get(word)).toBe('rise');
  });

  it('names no word twice', () => {
    const all = ops.flatMap((op) => [op.name, ...(op.aliases ?? [])].map((t) => t.toLowerCase()));
    expect(new Set(all).size).toBe(all.length);
  });
});
