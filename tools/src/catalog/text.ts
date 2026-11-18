// Turning text into search terms. The same steps run on recipes when indexing and on the
// query when searching, so the two always agree.

import { SYNONYMS } from './synonyms.ts';

/** A word: letters, digits and combining marks, with inner apostrophes (`baker's`, `S'Mores`). */
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;

/** Words too common to tell recipes apart. Kept deliberately short. */
const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'or', 'to', 'in', 'on', 'with', 'for']);

/** The words of `text`, as written. */
export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Lowercase, accents and apostrophes removed: `Crème` → `creme`, `Baker's` → `bakers`. */
export function fold(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * A light English plural stemmer, so `rolls` finds `roll` and `berries` finds `berry`.
 * It only has to be consistent, not linguistically right: `cookies` and `cookie` both
 * become `cooki`. Words of three letters or fewer are left alone.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length > 3 && /^[a-z]+$/.test(w)) {
    if (w.length > 4 && w.endsWith('ies')) w = w.slice(0, -3) + 'y';
    else if (/(?:ss|sh|ch|x|z|o)es$/.test(w)) w = w.slice(0, -2);
    else if (/[^sui]s$/.test(w)) w = w.slice(0, -1);
  }
  if (w.length > 3) {
    if (w.endsWith('ie')) w = w.slice(0, -1);
    else if (/[^aeiou]y$/.test(w)) w = w.slice(0, -1) + 'i';
  }
  return w;
}

/** One word → its search term, or null for a stop word, a lone letter or punctuation. */
export function term(word: string): string | null {
  const folded = fold(word);
  if (folded === '' || STOP_WORDS.has(folded)) return null;
  if (folded.length === 1 && !/\p{N}/u.test(folded)) return null;
  return stem(folded);
}

/**
 * Where the words of `text` that reduce to one of `terms` are, as character ranges — for
 * highlighting a hit's matches in the recipe. `terms` are a `SearchHit`'s `terms`.
 */
export function matchRanges(text: string, terms: Iterable<string>): { start: number; end: number }[] {
  const wanted = new Set(terms);
  if (wanted.size === 0) return [];
  const ranges: { start: number; end: number }[] = [];
  for (const m of text.matchAll(WORD)) {
    const t = term(m[0]);
    if (t !== null && wanted.has(t)) ranges.push({ start: m.index, end: m.index + m[0].length });
  }
  return ranges;
}

// -------------------------------------------------------------------- synonyms
//
// Each synonym group has one canonical term: the first name in its row (a made-up term with
// a space in it when that name is several words, which no ordinary word can collide with).
// When indexing, the canonical term is added next to any name of the group, so `green onion`
// is still found by `green` and by `onion`. In a query, a name of the group is replaced by
// the canonical term, so `green onions`, `spring onion` and `scallions` all ask the same thing.

interface Rule {
  run: string[];
  canonical: string;
}

function baseTerms(text: string): string[] {
  return words(text).map(term).filter((t): t is string => t !== null);
}

const RULES: Rule[] = SYNONYMS.flatMap((group) => {
  const canonical = baseTerms(group[0]).join(' ');
  return group.map((name) => ({ run: baseTerms(name), canonical }));
})
  .filter((r) => r.run.length > 0)
  .sort((a, b) => b.run.length - a.run.length);

function ruleAt(list: Token[], at: number): Rule | undefined {
  return RULES.find((r) => r.run.every((t, j) => list[at + j]?.term === t));
}

// ---------------------------------------------------------------------- tokens

export interface Token {
  term: string;
  /** Offsets of the word (or, for a synonym, the whole name) in the original text. */
  start: number;
  end: number;
}

/**
 * The search terms of `text`, in order, each with its place in the text.
 * `index` mode adds synonym terms; `query` mode replaces names by them (see above).
 */
export function tokens(text: string, mode: 'index' | 'query'): Token[] {
  const plain: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const t = term(m[0]);
    if (t !== null) plain.push({ term: t, start: m.index, end: m.index + m[0].length });
  }
  if (RULES.length === 0) return plain;

  const out: Token[] = [];
  for (let i = 0; i < plain.length; ) {
    const rule = ruleAt(plain, i);
    if (!rule) {
      out.push(plain[i++]);
      continue;
    }
    const run = plain.slice(i, i + rule.run.length);
    const alreadyThere = run.length === 1 && run[0].term === rule.canonical;
    if (mode === 'index') out.push(...run);
    if (mode === 'query' || !alreadyThere) out.push({ term: rule.canonical, start: run[0].start, end: run[run.length - 1].end });
    i += run.length;
  }
  return out;
}

/** Terms to index for a piece of recipe text. */
export function indexTerms(text: string): string[] {
  return tokens(text, 'index').map((t) => t.term);
}

/** Terms a piece of text asks for when it is typed as a query. */
export function queryTerms(text: string): string[] {
  return tokens(text, 'query').map((t) => t.term);
}

/**
 * A query's terms, and whether its last word may still be being typed (`open`): it is the
 * last thing in the query, it stands as typed (not a plural cut back to its stem — `peas`
 * is a finished word and must not also find `peach`), and it is not a synonym.
 */
export function analyze(query: string): { terms: string[]; open: boolean } {
  const toks = tokens(query, 'query');
  const last = toks[toks.length - 1];
  const typed = last ? fold(query.slice(last.start, last.end)) : '';
  return {
    terms: toks.map((t) => t.term),
    open: last !== undefined && last.end === query.trimEnd().length && typed === last.term,
  };
}
