// The real recipes must pass: no errors in the recipes that ship, none in the collection.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hasErrors } from '../../src/lint/index.ts';
import { lintPath, type FileResult } from '../../src/lint/node.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
/** The personal collection sits beside the `etna` checkout; it is not part of this repo. */
const COLLECTION = process.env.ETNA_COLLECTION ?? join(ETNA_ROOT, '..', 'recipe-collection');

function errorsOf(results: FileResult[]): string[] {
  return results.flatMap((r) =>
    r.findings.filter((f) => f.severity === 'error').map((f) => `${r.slug}:${f.line} ${f.rule} — ${f.message}`),
  );
}

describe('corpus', () => {
  it('every recipe that ships has zero errors', () => {
    const results = lintPath(COOKBOOK);
    expect(results.length).toBeGreaterThanOrEqual(11);
    expect(errorsOf(results)).toEqual([]);
    expect(results.some((r) => hasErrors(r.findings))).toBe(false);
  });

  it.skipIf(!existsSync(COLLECTION))('every recipe in the collection has zero errors', () => {
    const results = lintPath(COLLECTION);
    expect(results.length).toBeGreaterThan(100);
    expect(errorsOf(results)).toEqual([]);
  });
});
