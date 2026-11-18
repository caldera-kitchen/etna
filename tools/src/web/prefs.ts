// Whether a recipe has notes a card could print. Pure and browser-safe.

import type { Recipe } from '../core/index.ts';

/**
 * True when the recipe has notes a card could print: its Notes section (either form; for a
 * traditional recipe the same as `traditional.notes`) with something in it.
 */
export function hasRecipeNotes(recipe: Pick<Recipe, 'notes' | 'traditional'>): boolean {
  const section = recipe.notes ?? recipe.traditional?.notes ?? null;
  return section !== null && section.items.length > 0;
}
