// Callout labels (SPEC §5.1, ADR 0019): two keywords carry structure; every other label is an
// informational aside, printed as written.

/** The keywords: the only labels with a meaning. Each carries structure (ADRs 0006, 0009). */
export const KEYWORDS: readonly string[] = ['Checkpoint', 'Choose'];

/**
 * How many letters of a keyword allow one slip: `Choose` (6 letters) allows one, `Checkpoint`
 * (10) two. A slip is a letter dropped, added or changed, or two neighboring letters swapped.
 */
const LETTERS_PER_SLIP = 5;

export type LabelClass =
  /** `Checkpoint` or `Choose`, exactly as written. */
  | { kind: 'keyword' }
  /** An aside whose label looks like a mistake for a keyword (`choose`, `Chose`, `Checkpoints`): an error. */
  | { kind: 'near-miss'; suggestion: string }
  /** Any other label (`Note`, `Tip`, `Make ahead`): an informational aside. The linter is quiet. */
  | { kind: 'aside' };

/**
 * What a callout's label is. A label is a near-miss for a keyword when, with letter case and
 * everything but letters ignored (`Check point`, `CHOOSE:`, `Checkpoint 2`) and one trailing
 * `s` dropped (`Checkpoints`), it is at most one slip per five letters of the keyword away from
 * it (one for `Choose`, two for `Checkpoint`). So `Chose`, `Chooes`, `Hcoose` and `Chekpiont`
 * are near-misses; `Close`, `Those`, `Cheese`, `Chosen` and `Check` are asides, and so is
 * `Choice`: another word, not a slip of typing, and the rule keeps no list of words.
 * A near-miss is never read as the keyword.
 */
export function classifyLabel(label: string): LabelClass {
  if (KEYWORDS.includes(label)) return { kind: 'keyword' };
  const letters = label.toLowerCase().replace(/[^a-z]+/g, '');
  if (letters === '') return { kind: 'aside' };
  const forms = letters.endsWith('s') ? [letters, letters.slice(0, -1)] : [letters];
  let best: { keyword: string; slips: number } | null = null;
  for (const keyword of KEYWORDS) {
    const k = keyword.toLowerCase();
    const allowed = Math.max(1, Math.floor(k.length / LETTERS_PER_SLIP));
    for (const form of forms) {
      const slips = slipDistance(form, k);
      if (slips <= allowed && (!best || slips < best.slips)) best = { keyword, slips };
    }
  }
  return best ? { kind: 'near-miss', suggestion: best.keyword } : { kind: 'aside' };
}

/**
 * How many slips apart two strings are: letters added, dropped or changed, or two neighboring
 * letters swapped, each one slip (optimal string alignment, the restricted Damerau-Levenshtein
 * distance; a swapped letter is not edited again).
 */
export function slipDistance(a: string, b: string): number {
  if (a === b) return 0;
  let before = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, before[j - 2] + 1);
      row.push(d);
    }
    before = prev;
    prev = row;
  }
  return prev[b.length];
}

/** Edit distance between two strings (insertions, deletions, substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = row;
  }
  return prev[b.length];
}
