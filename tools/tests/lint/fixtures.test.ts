// Runs every fixture in `etna/tests/linter/`.
//
//   <case>/input.md       one recipe            → lintRecipe
//   <case>/input/         a small collection    → lintPath (collection-level rules, external references)
//   <case>/expected.yaml  findings: [{ rule, severity, at, recipe? }], in order
//
// `recipe` (the recipe directory name) is given only in collection cases.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { parseRecipe } from '../../src/core/index.ts';
import { lintRecipe, SEVERITY } from '../../src/lint/index.ts';
import { lintPath } from '../../src/lint/node.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const FIXTURES = join(ETNA_ROOT, 'tests', 'linter');
const units = loadUnits();

interface Expected {
  rule: string;
  severity: string;
  at: string | null;
  recipe?: string;
}

const cases = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

function expectedOf(name: string): Expected[] {
  const data = parseYaml(readFileSync(join(FIXTURES, name, 'expected.yaml'), 'utf8')) as { findings: Expected[] | null };
  return (data.findings ?? []).map((f) => ({ ...f, at: f.at ?? null }));
}

function actualOf(name: string): Expected[] {
  const dir = join(FIXTURES, name);
  const file = join(dir, 'input.md');
  if (existsSync(file)) {
    const recipe = parseRecipe(readFileSync(file, 'utf8'), { units });
    return lintRecipe(recipe).map((f) => ({ rule: f.rule, severity: f.severity, at: f.at }));
  }
  return lintPath(join(dir, 'input')).flatMap((r) =>
    r.findings.map((f) => ({ rule: f.rule, severity: f.severity, at: f.at, recipe: r.slug })),
  );
}

describe('linter fixtures', () => {
  it('finds the fixture tree', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  for (const name of cases) {
    it(name, () => {
      expect(actualOf(name)).toEqual(expectedOf(name));
    });
  }

  it('has a firing fixture for every rule, and clean recipes that produce nothing', () => {
    const fired = new Set(cases.flatMap((name) => expectedOf(name).map((f) => f.rule)));
    expect(Object.keys(SEVERITY).filter((rule) => !fired.has(rule))).toEqual([]);
    expect(cases.filter((name) => expectedOf(name).length === 0).length).toBeGreaterThanOrEqual(3);
  });

  it('expects the severity the rule table gives each rule', () => {
    for (const name of cases) {
      for (const f of expectedOf(name)) expect(f.severity, `${name}: ${f.rule}`).toBe(SEVERITY[f.rule as keyof typeof SEVERITY]);
    }
  });
});
