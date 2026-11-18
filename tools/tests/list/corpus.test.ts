// Property tests over every recipe on disk: nothing lost, nothing counted twice, exact doubling.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allComponents, allSteps, type IngredientLine, type Recipe, type StepBlock } from '../../src/core/index.ts';
import { ETNA_ROOT, findRecipes, readRecipe } from '../../src/node/files.ts';
import { toBase } from '../../src/density/index.ts';
import { loadDensities } from '../../src/density/node.ts';
import { consolidate, type Amount, type ConsolidateOptions, type ListSource } from '../../src/list/index.ts';
import { add, equals, rangeOf, type RationalRange } from '../../src/list/rational.ts';
import { loadUnits } from '../../src/node/files.ts';

const COLLECTION = process.env.ETNA_COLLECTION ?? join(ETNA_ROOT, '..', 'recipe-collection');

function load(root: string): ListSource[] {
  if (!existsSync(root)) return [];
  return findRecipes(root)
    .filter((f) => f.file !== null)
    .map((f) => {
      const recipe = readRecipe(f.file!);
      return { id: f.slug, title: recipe.title?.text ?? f.slug, recipe };
    });
}

/** Counted independently of `ingredientLines`. */
function linesOf(recipe: Recipe): IngredientLine[] {
  const fromBlocks = (blocks: StepBlock[]) => blocks.flatMap((b) => (b.kind === 'ingredients' ? b.items : []));
  const pre = fromBlocks(recipe.preamble);
  if (recipe.traditional) {
    const groups = recipe.traditional.ingredients?.items ?? [];
    const lines = groups.flatMap((g) => g.items);
    expect(lines.length).toBe(recipe.traditional.ingredients?.count ?? 0);
    return [...pre, ...lines];
  }
  return [...pre, ...allComponents(recipe.nodes).flatMap((c) => fromBlocks(c.blocks)), ...allSteps(recipe.nodes).flatMap((s) => s.ingredients)];
}

const shipped = load(join(ETNA_ROOT, 'cookbook'));
const collection = load(COLLECTION);

const off: ConsolidateOptions = {};
const on: ConsolidateOptions = { densities: loadDensities(), units: loadUnits() };

/** An amount's exact value, in grams or milliliters when its unit has a size. */
function exactOf(a: Amount): RationalRange {
  const q = a.converted?.exact ?? a.quantity!;
  return (a.unit && toBase(q, a.unit)) || rangeOf(q);
}

describe.each([
  ['the recipes that ship, density off', shipped, off],
  ['the recipes that ship, density on', shipped, on],
  ['collection, density off', collection, off],
  ['collection, density on', collection, on],
])('%s', (_name, sources, options) => {
  it.skipIf(sources.length === 0)('accounts for every ingredient line exactly once', () => {
    for (const s of sources) {
      const lines = linesOf(s.recipe);
      const internal = lines.filter((l) => l.kind === 'reference' && l.internal).length;
      const list = consolidate([s], options);
      // What is needed, and each optional set (SPEC §8): a line is in exactly one of them.
      const groups = [list, ...(list.sets ?? [])];
      const counted = groups.reduce((n, g) => n + g.items.reduce((k, i) => k + i.amounts.reduce((m, a) => m + a.lines, 0), 0), 0);
      const recipes = groups.reduce((n, g) => n + g.recipes.length, 0);
      expect(counted + internal + recipes, s.id).toBe(lines.length);
    }
  });

  it.skipIf(sources.length === 0)('doubles every quantified total exactly when a recipe is listed twice', () => {
    for (const s of sources) {
      const single = consolidate([s], options);
      const double = consolidate([s, s], options);
      // Names may change number (`1 egg` → `2 eggs`); the merged forms may not.
      expect(double.items.map((i) => i.forms?.singular ?? i.item), s.id).toEqual(single.items.map((i) => i.forms?.singular ?? i.item));
      expect(double.recipes.length).toBe(single.recipes.length * 2);
      single.items.forEach((item, i) => {
        const twice = double.items[i];
        expect(twice.amounts.length, `${s.id}: ${item.item}`).toBe(item.amounts.length);
        item.amounts.forEach((a, j) => {
          const b = twice.amounts[j];
          expect(b.lines).toBe(a.lines * 2);
          if (!a.converted) expect(b.unit).toBe(a.unit);
          if (a.quantity === null) {
            expect(b.quantity).toBeNull();
            return;
          }
          const ra = exactOf(a);
          const rb = exactOf(b);
          const label = `${s.id}: ${item.item} ${a.quantity.raw} → ${b.quantity!.raw}`;
          expect(equals(rb.min, add(ra.min, ra.min)), label).toBe(true);
          expect(equals(rb.max, add(ra.max, ra.max)), label).toBe(true);
          expect(b.quantity!.raw, label).not.toMatch(/\d\.\d*0000|9999/);
        });
      });
    }
  });
});
