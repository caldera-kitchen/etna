// The shopping list the GUI remembers: which recipes are on it, as source id + slug pairs.
// Pure and browser-safe; main.tsx keeps the text in localStorage.
//
// What storage hands back may be anything (an older version's data, another page's, a hand
// edit): it is read as data, and whatever is not a plain pair of names is dropped.

import { isValidSlug } from '../core/index.ts';

/** The localStorage key the list is kept under. */
export const LIST_KEY = 'etna.shopping-list';

/** One recipe on the list. */
export interface ListRef {
  source: string;
  slug: string;
}

/** At most this many recipes are remembered (a list is a few recipes; this bounds what storage can make us fetch). */
export const MAX_LIST = 50;

/** A source id as the app makes them: a folder's name or `owner/name`. Bounded, printable, no control characters. */
function isSourceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f\u007f]/.test(id);
}

/** The key of a pair, unique on the list (and the id it goes into the combined list under). */
export function refKey(ref: ListRef): string {
  return `${ref.source}/${ref.slug}`;
}

/** The remembered list from its stored text; `[]` for no text or text that is not a list. Duplicates and bad entries are dropped. */
export function parseListRefs(text: string | null | undefined): ListRef[] {
  if (typeof text !== 'string' || text === '') return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const out: ListRef[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    if (out.length >= MAX_LIST) break;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const { source, slug } = item as Record<string, unknown>;
    if (!isSourceId(source) || typeof slug !== 'string' || !isValidSlug(slug)) continue;
    const ref = { source, slug };
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    out.push(ref);
  }
  return out;
}

/** The text to store: a JSON array of `{ source, slug }`, in list order. */
export function formatListRefs(refs: ListRef[]): string {
  return JSON.stringify(parseListRefs(JSON.stringify(refs.map(({ source, slug }) => ({ source, slug })))));
}

export function hasRef(refs: ListRef[], ref: ListRef): boolean {
  return refs.some((r) => r.source === ref.source && r.slug === ref.slug);
}

/** The list with `ref` added at the end, or removed when it is already on it. */
export function toggleRef(refs: ListRef[], ref: ListRef): ListRef[] {
  if (hasRef(refs, ref)) return removeRef(refs, ref);
  return refs.length >= MAX_LIST ? refs : [...refs, { source: ref.source, slug: ref.slug }];
}

export function removeRef(refs: ListRef[], ref: ListRef): ListRef[] {
  return refs.filter((r) => !(r.source === ref.source && r.slug === ref.slug));
}
