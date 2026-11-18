// Recipe model → catalog entry. Pure and deterministic: the same recipe always gives the
// same entry, key for key, so a committed catalog.json only changes when a recipe does.

import { partKey, type IngredientLine, type Node, type Pos, type Recipe, type StepBlock } from '../core/index.ts';
import type { Catalog, CatalogEntry } from './types.ts';

export function catalogEntry(recipe: Recipe, slug: string): CatalogEntry {
  const data = recipe.frontmatter.data ?? {};
  return {
    slug,
    title: recipe.title?.text.trim() || titleFromSlug(slug),
    form: recipe.form,
    source: scalar(data.source),
    yield: scalar(data.yield),
    license: scalar(data.license),
    ingredients: ingredientNames(recipe),
    text: methodText(recipe),
    path: `recipes/${slug}/recipe.md`,
  };
}

/** A minimal catalog from directory names alone, for a repo that ships no catalog.json. */
export function catalogFromSlugs(slugs: string[]): Catalog {
  const unique = [...new Set(slugs.map((s) => s.trim()).filter((s) => s !== ''))].sort(compareSlugs);
  return {
    version: 1,
    recipes: unique.map((slug) => ({
      slug,
      title: titleFromSlug(slug),
      // Unknown without reading the file. `traditional` promises the least (a card, no DAG).
      form: 'traditional',
      source: null,
      yield: null,
      license: null,
      ingredients: [],
      text: '',
      path: `recipes/${slug}/recipe.md`,
    })),
  };
}

/** Code-point order: the same on every machine, unlike `localeCompare`. */
export function compareSlugs(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `apple-pie` → `Apple Pie`: a display name when the recipe's own title is not available. */
function titleFromSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Frontmatter values are free text, but YAML reads `yield: 32` as a number. */
function scalar(value: unknown): string | null {
  if (typeof value === 'string') return clean(value) || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// ----------------------------------------------------------------- ingredients

function ingredientNames(recipe: Recipe): string[] {
  const lines: IngredientLine[] = [];
  const fromBlocks = (blocks: StepBlock[]) => {
    for (const b of blocks) if (b.kind === 'ingredients') lines.push(...b.items);
  };
  fromBlocks(recipe.preamble);
  if (recipe.traditional) {
    for (const group of recipe.traditional.ingredients?.items ?? []) lines.push(...group.items);
  } else {
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        fromBlocks(n.blocks);
        if (n.kind === 'component') walk(n.children);
      }
    };
    walk(recipe.nodes);
  }

  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of lines) {
    // A link to another step of the same recipe is an intermediate, not an ingredient;
    // a link to another recipe is one, under the name it is given here.
    if (line.kind === 'reference' && line.internal) continue;
    const name = clean(line.kind === 'reference' ? line.label : line.item);
    const key = name.toLowerCase();
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// ------------------------------------------------------------------------ text

function methodText(recipe: Recipe): string {
  const out: string[] = [];
  const add = (text: string | null | undefined) => {
    const t = clean(text ?? '');
    if (t !== '') out.push(t);
  };
  const addBlocks = (blocks: StepBlock[]) => {
    for (const b of blocks) {
      if (b.kind === 'ingredients') continue;
      add(b.kind === 'callout' ? `${b.keyword} — ${b.text}` : b.text);
    }
  };

  addBlocks(recipe.preamble);
  const t = recipe.traditional;
  if (t) {
    // Collect every piece with its source offset, then emit in document order: a section's
    // recognized items and its other blocks (tables, stray paragraphs) come as separate lists.
    const parts: { at: number; text: string | null }[] = [];
    const put = (pos: Pos, text: string | null) => parts.push({ at: pos.start.offset, text });
    // Part names (`### Frosting`, or the older bold line) name a part of the dish, as
    // component headings do in the structured form, so they are searchable too: once each,
    // where first written, though a part is named in both sections.
    const named = new Set<string>();
    const putName = (p: Pos, name: string) => {
      if (named.has(partKey(name))) return;
      named.add(partKey(name));
      put(p, name);
    };
    for (const g of t.ingredients?.items ?? []) if (g.label && g.labelPos) putName(g.labelPos, g.label);
    for (const o of t.ingredients?.other ?? []) put(o.pos, o.text);
    for (const p of t.directions?.parts ?? []) if (p.label && p.heading) putName(p.heading.pos, p.label);
    for (const d of t.directions?.items ?? []) {
      put(d.pos, d.label ? `${d.label} — ${d.text}` : d.text);
      put(d.pos, d.more);
    }
    for (const o of t.directions?.other ?? []) put(o.pos, o.text);
    for (const n of t.notes?.items ?? []) put(n.pos, n.label ? `${n.label} — ${n.text}` : n.text);
    for (const o of t.notes?.other ?? []) put(o.pos, o.text);
    for (const s of t.otherSections) put(s.pos, s.raw);
    parts.sort((a, b) => a.at - b.at);
    for (const p of parts) add(p.text);
  } else {
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        add(n.heading.text);
        addBlocks(n.blocks);
        if (n.kind === 'component') walk(n.children);
      }
    };
    walk(recipe.nodes);
    // The Notes section, as the traditional form's notes are searched.
    const notes = recipe.notes;
    if (notes) {
      const parts = [
        ...notes.items.map((n) => ({ at: n.pos.start.offset, text: n.label ? `${n.label} — ${n.text}` : n.text })),
        ...notes.other.map((o) => ({ at: o.pos.start.offset, text: o.text })),
      ].sort((a, b) => a.at - b.at);
      for (const p of parts) add(p.text);
    }
  }
  return out.join('\n');
}
