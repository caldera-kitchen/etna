// Fuzzy search over one or more catalogs, on MiniSearch. The index is built in memory from
// the catalogs (a few hundred recipes index in tens of milliseconds), never shipped.

import MiniSearch, { type Query } from 'minisearch';

import { analyze, indexTerms, queryTerms, tokens } from './text.ts';
import type { Catalog, CatalogEntry, Search, SearchHit } from './types.ts';

// ---------------------------------------------------------------------- tuning

/**
 * Field weights. A name match beats an ingredient match beats a mention in the method.
 * `slug` is the directory name as words: it carries the family prefix (`pizza-…`) even when
 * the title does not, at a low weight because it usually repeats the title.
 */
const BOOST = { title: 4, slug: 1, ingredients: 2, text: 1 };

/**
 * What a prefix match counts for, next to an exact one (MiniSearch's default is 0.375).
 * Low enough that an exact ingredient match (2) outranks a title that merely starts with
 * the word (4 × 0.25): `peas` before `Peach Pie`.
 */
const PREFIX_WEIGHT = 0.25;

/**
 * What a typo match counts for (MiniSearch's default is 0.45). A near-miss of a long word
 * is almost certainly the same word spelled differently; of a shorter word, only maybe.
 */
const TYPO_WEIGHT = { short: 0.2, long: 0.5 };

/**
 * Typo tolerance, by the length of the query word (after stemming):
 *
 *  - under 5 letters: none. One edit to a short word is another word (`rice` / `rise`).
 *  - 5 to 7 letters: one edit, only against names (titles and ingredients), and only when the
 *    word as typed is rare in the collection. Words this size have real neighbors — `batter`
 *    / `butter`, `chicken` / `thicken`, `bread` / `break` — so a word many recipes use is
 *    taken as meant, and method prose is left out. A rare one is likely a slip, including
 *    slips the collection itself contains (`carmel`).
 *  - 8 letters or more: two edits, everywhere, always. Long words have no such neighbors,
 *    and a collection often spells one two ways (`mozzarella` / `mozarella`, `broccoli` /
 *    `brocolli`), so either spelling must find both.
 */
const SHORT_WORD = 5;
const LONG_WORD = 8;
const NAME_FIELDS = ['title', 'slug', 'ingredients'];

/** "Rare" for a 5–7 letter word: used as typed by fewer recipes than this. One percent, at least 5. */
const rareBelow = (recipes: number) => Math.max(5, recipes / 100);

/** A prefix match needs at least this many letters typed. */
const MIN_PREFIX = 2;

/** Score multiplier when the query words sit next to each other, in order, in one field. */
const PHRASE_BOOST = 3;

const DEFAULT_LIMIT = 20;
const DEFAULT_SUGGESTIONS = 8;
const EXCERPT_BEFORE = 40;
const EXCERPT_AFTER = 110;

// ----------------------------------------------------------------------- index

interface Doc {
  id: number;
  source: string;
  entry: CatalogEntry;
  /** Term sequences of each field value, for phrase checks; built on first use. */
  sequences: string[][] | null;
}

interface Found {
  doc: Doc;
  /** Share of the query's words this recipe matches, 0–1. */
  coverage: number;
  score: number;
  /** Matched index terms → the fields they matched in. */
  match: Record<string, string[]>;
}

const slugWords = (slug: string) => slug.replace(/[-_]+/g, ' ');
const same = <T>(x: T) => x;

export function createSearch(sources: { source: string; catalog: Catalog }[]): Search {
  const docs: Doc[] = [];
  for (const { source, catalog } of sources) {
    for (const entry of catalog.recipes) docs.push({ id: docs.length, source, entry, sequences: null });
  }
  const threshold = rareBelow(docs.length);

  const mini = new MiniSearch<Doc>({
    idField: 'id',
    fields: ['title', 'slug', 'ingredients', 'text'],
    extractField: (doc, field) => {
      if (field === 'id') return doc.id;
      if (field === 'slug') return slugWords(doc.entry.slug);
      if (field === 'ingredients') return doc.entry.ingredients.join('\n');
      return doc.entry[field as 'title' | 'text'];
    },
    // `text.ts` does all of the term work, on both sides; queries arrive here as ready terms.
    tokenize: indexTerms,
    processTerm: same,
    searchOptions: { boost: BOOST, weights: { prefix: PREFIX_WEIGHT, fuzzy: TYPO_WEIGHT.short }, tokenize: (t) => [t], processTerm: same },
  });
  mini.addAll(docs);

  /**
   * The MiniSearch query for a list of terms: per term, exact (and maybe prefix) matches in
   * `fields`, plus typo matches where the rules above allow them.
   */
  function build(terms: string[], fields: string[], combineWith: 'AND' | 'OR', prefix: (t: string) => boolean): Query {
    const queries = terms.map((t): Query => {
      const exact: Query = { queries: [t], fields, prefix: prefix(t) && t.length >= MIN_PREFIX };
      if (t.length < SHORT_WORD || /\d/.test(t)) return exact;
      const long = t.length >= LONG_WORD;
      if (!long && mini.search(t).length >= threshold) return exact;
      const fuzzy: Query = {
        queries: [t],
        fields: long ? fields : fields.filter((f) => NAME_FIELDS.includes(f)),
        fuzzy: long ? 2 : 1,
        weights: { prefix: PREFIX_WEIGHT, fuzzy: long ? TYPO_WEIGHT.long : TYPO_WEIGHT.short },
        // The exact matches are already counted above; keep only the near-misses here.
        boostDocument: (_id, matched) => (matched === t ? 0 : 1),
      };
      return { combineWith: 'OR', queries: [exact, fuzzy] };
    });
    return { combineWith, queries };
  }

  function find(query: string, source: string | undefined): Found[] {
    const { terms, open } = analyze(query);
    const distinct = [...new Set(terms)];
    if (distinct.length === 0) return [];
    const last = terms[terms.length - 1];
    const results = mini.search(
      build(distinct, ['title', 'slug', 'ingredients', 'text'], 'OR', (t) => open && t === last),
      source === undefined ? {} : { filter: (r) => docs[r.id].source === source },
    );
    return results
      .map((r): Found => {
        const doc = docs[r.id];
        return {
          doc,
          coverage: Math.min(1, r.queryTerms.length / distinct.length),
          score: r.score * (terms.length > 1 && hasPhrase(doc, terms) ? PHRASE_BOOST : 1),
          match: r.match,
        };
      })
      .sort((a, b) => b.coverage - a.coverage || b.score - a.score || tieBreak(a.doc, b.doc));
  }

  return {
    size: docs.length,

    search(query, options = {}) {
      const terms = analyze(query).terms;
      return find(query, options.source)
        .slice(0, Math.max(0, options.limit ?? DEFAULT_LIMIT))
        .map((found) => hit(found, terms));
    },

    suggest(query, limit = DEFAULT_SUGGESTIONS) {
      const distinct = [...new Set(analyze(query).terms)];
      if (distinct.length === 0) return [];
      // Every word must match the name, and every word may be a beginning: `cin rol`.
      return mini
        .search(build(distinct, ['title', 'slug'], 'AND', () => true))
        .map((r) => ({ doc: docs[r.id], score: r.score }))
        .sort((a, b) => b.score - a.score || tieBreak(a.doc, b.doc))
        .slice(0, Math.max(0, limit))
        .map(({ doc }) => ({ source: doc.source, slug: doc.entry.slug, title: doc.entry.title }));
    },
  };
}

/** A fixed order for equal scores, so results never shuffle between runs. */
function tieBreak(a: Doc, b: Doc): number {
  return compare(a.entry.slug, b.entry.slug) || compare(a.source, b.source) || a.id - b.id;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --------------------------------------------------------------------- phrases

function hasPhrase(doc: Doc, query: string[]): boolean {
  doc.sequences ??= [doc.entry.title, slugWords(doc.entry.slug), ...doc.entry.ingredients, doc.entry.text].map(queryTerms);
  return doc.sequences.some((s) => indexOfRun(s, query) >= 0);
}

/** Where `needle` occurs as a run in `haystack` (its last word may be a beginning), or -1. */
function indexOfRun(haystack: string[], needle: string[]): number {
  const n = needle.length;
  if (n === 0) return -1;
  outer: for (let i = 0; i + n <= haystack.length; i++) {
    for (let j = 0; j < n; j++) {
      const h = haystack[i + j];
      if (h !== needle[j] && !(j === n - 1 && h.startsWith(needle[j]))) continue outer;
    }
    return i;
  }
  return -1;
}

// ------------------------------------------------------------------------ hits

const FIELD_NAMES: Record<string, 'title' | 'ingredients' | 'text'> = { title: 'title', slug: 'title', ingredients: 'ingredients', text: 'text' };
const FIELD_ORDER = ['title', 'ingredients', 'text'] as const;

function hit(found: Found, query: string[]): SearchHit {
  const { doc, match } = found;
  const matched = { title: new Set<string>(), ingredients: new Set<string>(), text: new Set<string>() };
  for (const [t, fields] of Object.entries(match)) {
    for (const f of fields) matched[FIELD_NAMES[f]].add(t);
  }
  return {
    source: doc.source,
    slug: doc.entry.slug,
    title: doc.entry.title,
    score: found.score,
    fields: FIELD_ORDER.filter((f) => matched[f].size > 0),
    ingredients: doc.entry.ingredients.filter((name) => indexTerms(name).some((t) => matched.ingredients.has(t))),
    excerpt: matched.text.size > 0 ? excerpt(doc.entry.text, matched.text, query) : null,
    full: found.coverage >= 1,
    terms: Object.keys(match).sort(),
  };
}

/** A window of the method text around the query phrase if it is there, else around the first matching word. */
function excerpt(text: string, matched: Set<string>, query: string[]): string | null {
  let toks = tokens(text, 'query');
  let at = query.length > 1 ? indexOfRun(toks.map((t) => t.term), query) : -1;
  if (at < 0) {
    toks = tokens(text, 'index');
    at = toks.findIndex((t) => matched.has(t.term));
  }
  if (at < 0) return null;
  const word = toks[at];

  let start = Math.max(0, word.start - EXCERPT_BEFORE);
  let end = Math.min(text.length, word.start + EXCERPT_AFTER);
  // Do not cut words in half: move both ends inward to the nearest space.
  if (start > 0) {
    const space = text.indexOf(' ', start);
    start = space >= 0 && space < word.start ? space + 1 : word.start;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > word.end) end = space;
  }
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + body + (end < text.length ? '…' : '');
}
