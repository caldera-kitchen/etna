// What a row of the recipe list says, and which rows are on show. Pure and browser-safe;
// main.tsx draws the rows.

import { matchRanges, type CatalogEntry, type SearchHit } from '../catalog/index.ts';
import { refKey, type ListRef } from './shopping.ts';

/** How many ingredients the second line names when the recipe has no source. */
export const DETAIL_INGREDIENTS = 4;

/**
 * A recipe's `source` as the list shows it: a web address as its site's name (`www.` dropped,
 * no path), anything else (a book, a person) as written, trimmed. Empty for none.
 */
export function sourceText(source: string | null | undefined): string {
  const text = (source ?? '').trim();
  if (!/^https?:\/\//i.test(text)) return text;
  try {
    return new URL(text).hostname.replace(/^www\./i, '');
  } catch {
    return text;
  }
}

/** The second line of a row: the recipe's source when it has one, else its first few ingredients. */
export function rowDetail(entry: Pick<CatalogEntry, 'source' | 'ingredients'> | null | undefined): string {
  if (!entry) return '';
  return sourceText(entry.source) || entry.ingredients.slice(0, DETAIL_INGREDIENTS).join(', ');
}

/**
 * The second line of a search result. The usual line when a search word is in it; otherwise
 * what matched, so the row says why it is there: the matching ingredients, else the excerpt
 * from the method; else the usual line.
 */
export function hitDetail(entry: Pick<CatalogEntry, 'source' | 'ingredients'> | null | undefined, hit: Pick<SearchHit, 'ingredients' | 'excerpt' | 'terms'>): string {
  const usual = rowDetail(entry);
  if (usual && matchRanges(usual, hit.terms).length > 0) return usual;
  if (hit.ingredients.length > 0) return [...new Set(hit.ingredients)].slice(0, DETAIL_INGREDIENTS).join(', ');
  if (hit.excerpt) return hit.excerpt;
  return usual;
}

/** A piece of text, marked when it is a search match. */
export interface Segment {
  text: string;
  mark: boolean;
}

/** `text` cut into pieces at the words matching `terms` (a hit's terms; see matchRanges). One unmarked piece when nothing matches. */
export function segments(text: string, terms: readonly string[]): Segment[] {
  const ranges = terms.length > 0 ? matchRanges(text, terms) : [];
  if (ranges.length === 0) return text === '' ? [] : [{ text, mark: false }];
  const out: Segment[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) out.push({ text: text.slice(at, r.start), mark: false });
    out.push({ text: text.slice(r.start, r.end), mark: true });
    at = r.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false });
  return out;
}

/** The rows to show: all of them, or (`only`) just those on the shopping list, in the same order. */
export function filterOnList<T>(rows: readonly T[], refOf: (row: T) => ListRef, list: readonly ListRef[], only: boolean): T[] {
  if (!only) return [...rows];
  const on = new Set(list.map(refKey));
  return rows.filter((row) => on.has(refKey(refOf(row))));
}

/**
 * Which rows carry their source's name. None when one source is open. In search results that
 * come from more than one source, every row (a result may come from anywhere). Otherwise only
 * rows whose title another source on show also has, which would be ambiguous without it.
 */
export function sourceTags(rows: readonly { source: string; title: string }[], sourceCount: number, searching: boolean): boolean[] {
  if (sourceCount <= 1) return rows.map(() => false);
  if (searching && new Set(rows.map((r) => r.source)).size > 1) return rows.map(() => true);
  const sourcesByTitle = new Map<string, Set<string>>();
  const key = (title: string) => title.trim().toLowerCase();
  for (const r of rows) {
    const set = sourcesByTitle.get(key(r.title)) ?? new Set<string>();
    set.add(r.source);
    sourcesByTitle.set(key(r.title), set);
  }
  return rows.map((r) => (sourcesByTitle.get(key(r.title))?.size ?? 0) > 1);
}
