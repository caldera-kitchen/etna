// The recipes that ship with Etna (cookbook/), with their lessons in its README, are
// documentation that the tools can check. Every recipe in it must be a clean recipe by the
// format's own rules, and must draw: a recipe that falls behind the format fails here.
// The lessons' text is in the README, not in the recipes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderCard } from '../../src/card/index.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import { checkGeometry } from '../../src/dag/check.ts';
import { computeLayout } from '../../src/dag/index.ts';
import { listDagThemes, loadDagTheme } from '../../src/dag/node.ts';
import { CHART_SHAPES } from '../../src/dag/sheet.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { formatRecipe } from '../../src/fmt/index.ts';
import { lintPath } from '../../src/lint/node.ts';
import { ETNA_ROOT, findRecipes, loadUnits, readRecipe } from '../../src/node/files.ts';

const COOKBOOK = join(ETNA_ROOT, 'cookbook');
const units = loadUnits();
const recipes = findRecipes(COOKBOOK).map((r) => ({ slug: r.slug, file: r.file!, source: readFileSync(r.file!, 'utf8'), recipe: readRecipe(r.file!, units) }));
const readme = readFileSync(join(COOKBOOK, 'README.md'), 'utf8');
/** The README's list of lessons: one numbered line per recipe, each recipe a lesson. */
const rows = [...readme.matchAll(/^(\d+)\. \[([^\]]+)\]\(([^)]+)\/recipe\.md\) — /gm)].map((m) => ({ n: Number(m[1]), title: m[2], slug: m[3] }));
/** The recipe written for the lessons; every other one is a dish of the author's. */
const WRITTEN = 'an-etna-recipe';
const TRADITIONAL = '-traditional-form';

describe('the recipes that ship with Etna', () => {
  it('makes every recipe a lesson, numbered from 1 with no gap, in its README by their own titles', () => {
    expect(rows.length).toBe(18);
    expect(rows.map((r) => r.n)).toEqual(Array.from({ length: rows.length }, (_, i) => i + 1));
    expect(rows.map((r) => r.slug).sort()).toEqual(recipes.map((r) => r.slug).sort());
    for (const row of rows) {
      const lesson = recipes.find((l) => l.slug === row.slug);
      expect(lesson, row.slug).toBeDefined();
      expect(lesson!.recipe.title?.text, row.slug).toBe(row.title);
    }
    expect(rows.at(-1)!.slug).toBe(WRITTEN);
  });

  it('links every recipe it holds from its README', () => {
    const linked = new Set([...readme.matchAll(/\]\(([a-z0-9-]+)\/recipe\.md\)/g)].map((m) => m[1]));
    expect(recipes.map((r) => r.slug).filter((s) => !linked.has(s))).toEqual([]);
  });

  it('names each traditional lesson after its structured twin', () => {
    const twins = recipes.filter((r) => r.slug.endsWith(TRADITIONAL));
    expect(twins.length).toBe(5);
    for (const t of twins) {
      const twin = recipes.find((r) => r.slug === t.slug.slice(0, -TRADITIONAL.length))!;
      expect(t.recipe.form, t.slug).toBe('traditional');
      expect(t.recipe.title?.text, t.slug).toBe(`${twin.recipe.title?.text} (Traditional Form)`);
    }
  });

  it('passes the linter with no finding at all', () => {
    const findings = lintPath(COOKBOOK).flatMap((r) => r.findings.map((f) => `${r.slug}:${f.line} ${f.severity} ${f.rule}`));
    expect(findings).toEqual([]);
  });

  it('is written as the formatter writes it', () => {
    for (const lesson of recipes) expect(formatRecipe(lesson.source, { units }).output, lesson.slug).toBe(lesson.source);
  });

  it('says how each recipe may be used', () => {
    for (const lesson of recipes) expect(lesson.source, lesson.slug).toMatch(/^license: CC BY-SA 4\.0$/m);
  });

  it('prints as a card in every bundled card style', () => {
    for (const name of listThemes()) {
      const theme = loadTheme(name);
      for (const lesson of recipes) {
        const doc = renderCard(lesson.recipe, theme);
        expect(doc, `${lesson.slug}, ${name}`).toContain('<h1 class="card-title">');
        expect(doc, `${lesson.slug}, ${name}`).not.toContain('undefined');
      }
    }
  });

  it('draws every structured recipe as a chart with no geometry flaw, in every bundled chart style and fit', () => {
    const structured = recipes.filter((l) => l.recipe.form === 'structured');
    expect(structured.length).toBeGreaterThanOrEqual(10);
    const flawed: string[] = [];
    for (const style of listDagThemes()) {
      const theme = loadDagTheme(style);
      for (const lesson of structured) {
        for (const shape of CHART_SHAPES) {
          const layout = computeLayout(lesson.recipe, { theme, sheet: { shape } });
          for (const flaw of checkGeometry(layout, readTheme(theme), lesson.recipe).flaws) flawed.push(`${lesson.slug}, ${style}, ${shape}: ${flaw.rule}`);
        }
      }
    }
    expect(flawed).toEqual([]);
  });

  it('has traditional lessons too, which say plainly that they have no chart', () => {
    const traditional = recipes.filter((l) => l.recipe.form === 'traditional');
    expect(traditional.length).toBeGreaterThanOrEqual(1);
    for (const lesson of traditional) expect(() => computeLayout(lesson.recipe), lesson.slug).toThrow(/traditional form/);
  });
});
