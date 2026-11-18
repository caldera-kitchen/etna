// A small, conservative English inflector for ingredient names.
//
// It only answers "could `plural` be the plural of `singular`?" for one word. The shopping list
// merges two items only when BOTH forms were actually written, so nothing here ever has to
// invent a singular for a lone word such as `molasses`.

/** Plurals that no regular rule gives. */
export const IRREGULAR: Record<string, string> = {
  leaf: 'leaves',
  loaf: 'loaves',
  half: 'halves',
  knife: 'knives',
  calf: 'calves',
  shelf: 'shelves',
  child: 'children',
  foot: 'feet',
  tooth: 'teeth',
  goose: 'geese',
  mouse: 'mice',
  person: 'people',
};

/** Same in both numbers, mass nouns, or words that merely end in `s`: never inflected. */
export const INVARIANT = new Set([
  'rice',
  'molasses',
  'asparagus',
  'hummus',
  'couscous',
  'swiss',
  'citrus',
  'octopus',
  'bass',
  'grits',
  'schnapps',
  'series',
  'species',
  'sheep',
  'deer',
  'fish',
  'moose',
  'quinoa',
  'tahini',
  'harissa',
  'anise',
  'chassis',
  'aioli',
]);

/** Pairs that look like singular and plural but name different things in a kitchen. */
export const DISTINCT = new Set([
  'pepper', // black pepper (a spice) vs. peppers (the vegetable)
  'green', // green vs. greens (leafy)
  'bitter', // bitters (cocktail)
  'good', // goods
  'spirit', // spirits
]);

const VOWEL = /[aeiou]/;

/** Plural spellings that regular rules (or the irregular table) give for `word`. Lower-case in. */
export function pluralsOf(word: string): string[] {
  if (word.length < 2 || INVARIANT.has(word) || DISTINCT.has(word) || !/^\p{Ll}[\p{Ll}'-]*$/u.test(word)) return [];
  const irregular = Object.hasOwn(IRREGULAR, word) ? IRREGULAR[word] : undefined;
  if (irregular) return [irregular];
  if (/y$/.test(word)) return VOWEL.test(word[word.length - 2]) ? [`${word}s`] : [`${word.slice(0, -1)}ies`];
  if (/(s|x|z|ch|sh)$/.test(word)) return [`${word}es`];
  if (/o$/.test(word)) return [`${word}es`, `${word}s`];
  return [`${word}s`];
}

/** True when `plural` is a plural of `singular` by the rules above. Both lower-case single words. */
export function isPluralOf(singular: string, plural: string): boolean {
  if (INVARIANT.has(plural) || DISTINCT.has(plural)) return false;
  return pluralsOf(singular).includes(plural);
}

/** Spelling identity of a name: trimmed, whitespace collapsed, lower-cased. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * True when two names are the same item: equal after normalizing, or differing only in the
 * number of their last word by the rules above (`egg yolk` / `egg yolks`).
 */
export function sameItem(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return true;
  const sx = splitLast(x);
  const sy = splitLast(y);
  if (sx.head !== sy.head) return false;
  return isPluralOf(sx.last, sy.last) || isPluralOf(sy.last, sx.last);
}

/** Split a normalized name into everything before the last word, and the last word. */
export function splitLast(name: string): { head: string; last: string } {
  const i = name.lastIndexOf(' ');
  return i === -1 ? { head: '', last: name } : { head: name.slice(0, i + 1), last: name.slice(i + 1) };
}

/**
 * Given the set of item keys seen, map each plural key to its singular key when both occur and
 * they differ only in the number of the last word. Keys not in the map stand for themselves.
 */
export function pluralMerges(keys: Iterable<string>): Map<string, string> {
  const all = new Set(keys);
  const merges = new Map<string, string>();
  for (const key of all) {
    const { head, last } = splitLast(key);
    for (const plural of pluralsOf(last)) {
      const other = head + plural;
      if (other !== key && all.has(other) && !merges.has(other) && !INVARIANT.has(other)) merges.set(other, key);
    }
  }
  // A key that is itself the plural of something never also acts as a singular.
  for (const [plural, singular] of merges) if (merges.has(singular)) merges.delete(plural);
  return merges;
}

/** Re-spell `word` (lower-case) in the letter case of `model`: lower, Capitalized or UPPER. */
export function matchCase(word: string, model: string): string {
  if (model.length > 1 && model === model.toUpperCase() && model !== model.toLowerCase()) return word.toUpperCase();
  if (model[0] && model[0] !== model[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}
