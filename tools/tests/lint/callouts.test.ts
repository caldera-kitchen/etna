import { describe, expect, it } from 'vitest';

import { classifyLabel, KEYWORDS, levenshtein, slipDistance } from '../../src/lint/callouts.ts';

describe('levenshtein', () => {
  it('counts insertions, deletions and substitutions', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('choose', 'choose')).toBe(0);
    expect(levenshtein('', 'tip')).toBe(3);
    expect(levenshtein('tip', '')).toBe(3);
    expect(levenshtein('chose', 'choose')).toBe(1);
    expect(levenshtein('chekpoint', 'checkpoint')).toBe(1);
    expect(levenshtein('choice', 'choose')).toBe(2);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('slipDistance', () => {
  it('counts a letter added, dropped or changed, or two neighbors swapped, as one slip each', () => {
    expect(slipDistance('', '')).toBe(0);
    expect(slipDistance('choose', 'choose')).toBe(0);
    expect(slipDistance('', 'tip')).toBe(3);
    expect(slipDistance('tip', '')).toBe(3);
    expect(slipDistance('chose', 'choose')).toBe(1);
    expect(slipDistance('chooose', 'choose')).toBe(1);
    expect(slipDistance('chooes', 'choose')).toBe(1);
    expect(slipDistance('hcoose', 'choose')).toBe(1);
    expect(slipDistance('checkpiont', 'checkpoint')).toBe(1);
    expect(slipDistance('chekpiont', 'checkpoint')).toBe(2);
    expect(slipDistance('choice', 'choose')).toBe(2);
    expect(slipDistance('close', 'choose')).toBe(2);
    // Optimal string alignment: a swapped pair is not edited again (true Damerau-Levenshtein gives 2).
    expect(slipDistance('ca', 'abc')).toBe(3);
    expect(slipDistance('kitten', 'sitting')).toBe(3);
  });
});

/** Every label one keystroke slip from `word`: a letter dropped, doubled, swapped with its neighbor or replaced by a key it touches. */
function slips(word: string): string[] {
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const touching = (ch: string): string[] => {
    const r = rows.findIndex((row) => row.includes(ch));
    const i = rows[r].indexOf(ch);
    const at = (rr: number, ii: number) => rows[rr]?.[ii] ?? '';
    return [at(r, i - 1), at(r, i + 1), at(r - 1, i), at(r - 1, i + 1), at(r + 1, i - 1), at(r + 1, i)].filter(Boolean);
  };
  const out = new Set<string>();
  for (let i = 0; i < word.length; i++) {
    out.add(word.slice(0, i) + word.slice(i + 1));
    out.add(word.slice(0, i) + word[i] + word.slice(i));
    if (i + 1 < word.length) out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
    for (const t of touching(word[i])) out.add(word.slice(0, i) + t + word.slice(i + 1));
  }
  out.delete(word);
  return [...out];
}

describe('callout labels', () => {
  it('has two keywords, both written exactly', () => {
    expect(KEYWORDS).toEqual(['Checkpoint', 'Choose']);
    for (const k of KEYWORDS) expect(classifyLabel(k)).toEqual({ kind: 'keyword' });
  });

  it('reads any other label as an aside, and says nothing about it', () => {
    for (const k of ['Note', 'note', 'Tip', 'Warning', 'Make ahead', 'Variation', 'Storage', 'Optional', 'Substitute', 'Option', 'Alternative', 'Or', 'Check', 'Checklist item', 'Serving', '🔥', '12', '']) {
      expect(classifyLabel(k), k).toEqual({ kind: 'aside' });
    }
  });

  it('takes a wrong-case or wrongly spaced keyword for a near-miss', () => {
    for (const k of ['checkpoint', 'CHECKPOINT', 'Check point', 'Check-point', 'Checkpoint:', 'Checkpoint 2']) {
      expect(classifyLabel(k), k).toEqual({ kind: 'near-miss', suggestion: 'Checkpoint' });
    }
    for (const k of ['choose', 'CHOOSE', 'Choose:']) expect(classifyLabel(k), k).toEqual({ kind: 'near-miss', suggestion: 'Choose' });
  });

  it('takes a misspelling, another number or another form of a keyword for a near-miss', () => {
    for (const k of ['Checkpoints', 'Chekpoint', 'Checkpont', 'Checkpiont']) {
      expect(classifyLabel(k), k).toEqual({ kind: 'near-miss', suggestion: 'Checkpoint' });
    }
    for (const k of ['Chose', 'Chooses', 'Chooose', 'Choos', 'Chooes', 'Hcoose', 'Xhoose', 'Chosoes']) {
      expect(classifyLabel(k), k).toEqual({ kind: 'near-miss', suggestion: 'Choose' });
    }
    // Two slips in the longer keyword.
    for (const k of ['Chekpiont', 'Chekpont', 'Hceckpoints']) expect(classifyLabel(k), k).toEqual({ kind: 'near-miss', suggestion: 'Checkpoint' });
  });

  it('takes every one-keystroke slip of a keyword, however written, for a near-miss of that keyword', () => {
    for (const keyword of KEYWORDS) {
      const variants = slips(keyword.toLowerCase());
      expect(variants.length).toBeGreaterThan(40);
      for (const v of variants) {
        const title = v[0].toUpperCase() + v.slice(1);
        for (const label of [title, v, v.toUpperCase(), `${title}:`, `${title}s`, `${title} 2`]) {
          expect(classifyLabel(label), label).toEqual({ kind: 'near-miss', suggestion: keyword });
        }
      }
    }
    for (const half of slips('point')) expect(classifyLabel(`Check ${half}`), half).toEqual({ kind: 'near-miss', suggestion: 'Checkpoint' });
    for (const half of slips('check')) expect(classifyLabel(`${half}-point`), half).toEqual({ kind: 'near-miss', suggestion: 'Checkpoint' });
  });

  it('leaves alone a real word two slips from a keyword', () => {
    // `Close`, `Those`, `Cheese`, `Chore` and `Chosen` are two slips from `choose`.
    for (const k of ['Close', 'Those', 'Cheese', 'Chore', 'Chosen', 'Choke', 'Goose', 'House', 'Chill', 'Chocolate', 'Chopped', 'Chef', 'Check', 'Checklist', 'Checkout', 'Checkup', 'Cook', 'Cool', 'Course', 'Point', 'Viewpoint', 'Choosing', 'Choice', 'Choices', 'Your choice']) {
      expect(classifyLabel(k), k).toEqual({ kind: 'aside' });
    }
  });
});

describe('callout labels that name an Object.prototype member', () => {
  it('are asides, not prototype members', async () => {
    const { parseRecipe } = await import('../../src/core/index.ts');
    const { lintRecipe } = await import('../../src/lint/index.ts');
    const { loadUnits } = await import('../../src/node/files.ts');
    for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(classifyLabel(k).kind, k).toBe('aside');
      const source = `---\netna: 1\n---\n\n# Proto\n\n## Mix\n\n- 2 g salt\n\nStir.\n\n> **${k}** — hello\n`;
      expect(lintRecipe(parseRecipe(source, { units: loadUnits() })), k).toEqual([]);
    }
  });
});
