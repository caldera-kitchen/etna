// The catalog: one small record per recipe, enough to browse and search a collection
// without fetching every recipe file.

import type { Form } from '../core/index.ts';

export interface CatalogEntry {
  slug: string;
  title: string;
  form: Form;
  /** Frontmatter `source`. */
  source: string | null;
  yield: string | null;
  license: string | null;
  /** Ingredient item names in recipe order, de-duplicated, as written (no quantities, units or notes). */
  ingredients: string[];
  /** Plain text of the method: directions (traditional) or step headings + instructions (structured), plus notes. */
  text: string;
  /** Path of the recipe file relative to the collection root, e.g. `recipes/apple-pie/recipe.md`. */
  path: string;
  /**
   * Names of the files directly in the recipe's `image/` folder (SPEC §4.3), such as
   * `["etna.jpg", "markdown.jpg"]`, sorted; hidden files left out. Left out when there are none
   * (the key is additive; `version` stays 1). The app reads the picture by these names.
   */
  image?: string[];
}

export interface Catalog {
  version: 1;
  /**
   * Names of the card themes the collection carries: folders directly under `themes/` that hold
   * a `theme.yaml`, sorted. Left out when there are none (the key is additive; `version` stays 1).
   */
  themes?: string[];
  recipes: CatalogEntry[];
}

export interface SearchHit {
  /** The source label passed to createSearch. */
  source: string;
  slug: string;
  title: string;
  /** Relevance. Hits are returned in rank order — see `Search.search` — so there is no need to sort by it. */
  score: number;
  /** Which fields matched: 'title' | 'ingredients' | 'text'. */
  fields: string[];
  /** Matching ingredient names, when the ingredients field matched. */
  ingredients: string[];
  /** A short plain-text excerpt around the first match in the method text, or null. */
  excerpt: string | null;
  /** True when the recipe matches every word of the query; false for a partial match. */
  full: boolean;
  /** The recipe's own search terms that matched (after typo and plural handling), for highlighting — see `matchRanges`. */
  terms: string[];
}

export interface Search {
  /**
   * Hits in rank order: recipes matching every word of the query first, then those matching
   * fewer; by score within each group. `limit` defaults to 20; `source` keeps one source only.
   */
  search(query: string, options?: { limit?: number; source?: string }): SearchHit[];
  /** Title suggestions for a "jump to recipe" box: every word must match the name. `limit` defaults to 8. */
  suggest(query: string, limit?: number): { source: string; slug: string; title: string }[];
  size: number;
}
