import { describe, expect, it } from 'vitest';

import { fold, type Strip } from '../../src/dag/layout/columns.ts';
import { choose, preferred, printScale, TIE } from '../../src/dag/layout/fit.ts';

/** A strip of plain heights with a gap between pieces in one column. */
const strip = (heights: number[], o: { gap?: number; allowed?: Strip['allowed']; cost?: Strip['cost'] } = {}): Strip => ({
  count: heights.length,
  height: (from, to) => heights.slice(from, to).reduce((a, b) => a + b, 0) + (to - from - 1) * (o.gap ?? 0),
  allowed: o.allowed ?? (() => true),
  cost: o.cost ?? (() => 0),
});

/** Every way to cut `n` pieces into `k` columns. */
function* cutSets(n: number, k: number, start = 1): Generator<number[]> {
  if (k === 1) {
    yield [];
    return;
  }
  for (let at = start; at <= n - (k - 1); at++) for (const rest of cutSets(n, k - 1, at + 1)) yield [at, ...rest];
}

const tallestOf = (s: Strip, cuts: number[]): number => {
  const ends = [0, ...cuts, s.count];
  let tallest = 0;
  for (let c = 0; c + 1 < ends.length; c++) {
    if (!s.allowed(ends[c], ends[c + 1])) return Infinity;
    tallest = Math.max(tallest, s.height(ends[c], ends[c + 1]));
  }
  return tallest;
};

/** A small fixed pseudo-random sequence, so the cases are the same every run. */
const sequence = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

describe('fold', () => {
  it('leaves one column uncut', () => {
    expect(fold(strip([3, 4, 5]), 1)).toEqual({ cuts: [], tallest: 12, cost: 0 });
  });

  it('cannot make more columns than pieces', () => {
    expect(fold(strip([3, 4]), 3)).toBeNull();
  });

  it('balances two columns', () => {
    expect(fold(strip([5, 5, 5, 5]), 2)).toEqual({ cuts: [2], tallest: 10, cost: 0 });
  });

  it('respects what may stand as a column', () => {
    // Pieces 1 and 2 may not be parted.
    const s = strip([5, 5, 5, 5], { allowed: (from, to) => !(from === 2 || to === 2) });
    expect(fold(s, 2)!.cuts).toEqual([1]);
    expect(fold(strip([5, 5], { allowed: (from, to) => to - from === 2 }), 2)).toBeNull();
  });

  it('takes a cheaper cut when it costs little height', () => {
    // The balanced cut (at 2) breaks two edges; cutting at 3 breaks none and is 4% taller.
    const s = strip([6, 4, 0.4, 9.6], { cost: (at) => (at === 2 ? 2 : 0) });
    expect(fold(s, 2)).toEqual({ cuts: [3], tallest: 10.4, cost: 0 });
    expect(fold(s, 2, 0)).toEqual({ cuts: [2], tallest: 10, cost: 2 });
  });

  it('finds the shortest tallest column, as trying every cut set does', () => {
    const next = sequence(7);
    for (let round = 0; round < 200; round++) {
      const n = 2 + Math.floor(next() * 9);
      const heights = Array.from({ length: n }, () => 1 + Math.floor(next() * 20));
      const banned = new Set(Array.from({ length: Math.floor(next() * 3) }, () => 1 + Math.floor(next() * (n - 1))));
      const s = strip(heights, { gap: 2, allowed: (from, to) => !banned.has(from) && !banned.has(to) });
      for (let k = 1; k <= Math.min(n, 5); k++) {
        let shortest = Infinity;
        for (const cuts of cutSets(n, k)) shortest = Math.min(shortest, tallestOf(s, cuts));
        const found = fold(s, k, 0);
        if (shortest === Infinity) expect(found).toBeNull();
        else {
          expect(found!.tallest).toBe(shortest);
          expect(tallestOf(s, found!.cuts)).toBe(shortest);
          expect(found!.cuts).toHaveLength(k - 1);
        }
      }
    }
  });

  it('finds the cheapest cuts within the slack, as trying every cut set does', () => {
    const next = sequence(11);
    for (let round = 0; round < 200; round++) {
      const n = 3 + Math.floor(next() * 7);
      const heights = Array.from({ length: n }, () => 1 + Math.floor(next() * 20));
      const costs = Array.from({ length: n }, () => Math.floor(next() * 4));
      const s = strip(heights, { cost: (at) => costs[at] });
      for (let k = 2; k <= Math.min(n, 4); k++) {
        let shortest = Infinity;
        for (const cuts of cutSets(n, k)) shortest = Math.min(shortest, tallestOf(s, cuts));
        let cheapest = Infinity;
        for (const cuts of cutSets(n, k)) if (tallestOf(s, cuts) <= shortest * 1.1 + 1e-9) cheapest = Math.min(cheapest, cuts.reduce((sum, at) => sum + costs[at], 0));
        const found = fold(s, k, 0.1)!;
        expect(found.cost).toBe(cheapest);
        expect(found.cuts.reduce((sum, at) => sum + costs[at], 0)).toBe(cheapest);
        expect(found.tallest).toBeLessThanOrEqual(shortest * 1.1 + 1e-9);
      }
    }
  });
});

describe('print scale and the choice of layout', () => {
  const letter = { width: 522, height: 702 };

  it('scales a chart into the box, upright or turned', () => {
    expect(printScale(1044, 702, letter, 'portrait')).toBe(0.5);
    expect(printScale(1044, 702, letter, 'landscape')).toBeCloseTo(702 / 1044);
    expect(printScale(1044, 702, letter, 'auto')).toBeCloseTo(702 / 1044);
    expect(printScale(522, 1404, letter, 'auto')).toBe(0.5);
  });

  it('fits a screen by its width alone', () => {
    expect(printScale(1044, 9000, letter, 'screen')).toBe(0.5);
  });

  it('prefers fewer columns, then the third column', () => {
    const plans = [
      { third: false, columns: 2, broken: 1 },
      { third: false, columns: 1, broken: 0 },
      { third: true, columns: 2, broken: 0 },
      { third: true, columns: 1, broken: 0 },
    ];
    expect([...plans].sort(preferred).map((p) => `${p.third ? 'third' : 'spine'} ${p.columns}`)).toEqual(['third 1', 'spine 1', 'third 2', 'spine 2']);
  });

  const plain = { plan: { third: true, columns: 1, broken: 0 }, width: 600, height: 1400, value: 'plain' };
  const folded = (width: number, height: number) => ({ plan: { third: true, columns: 2, broken: 1 }, width, height, value: 'folded' });

  it('takes the layout that prints largest, whatever order they come in', () => {
    // On a turned sheet the fold prints far larger.
    expect(choose([plain, folded(1200, 760)], letter, 'landscape').value).toBe('folded');
    expect(choose([folded(1200, 760), plain], letter, 'landscape').value).toBe('folded');
  });

  it('calls layouts within the tie window a tie, and gives it to the preferred one', () => {
    expect(TIE).toBe(0.02);
    // 1% larger: a tie, which goes to fewer columns.
    expect(choose([folded(1000, 1400 / 1.01), plain], letter, 'portrait').value).toBe('plain');
    // 3% larger: the fold.
    expect(choose([folded(1000, 1400 / 1.03), plain], letter, 'portrait').value).toBe('folded');
    // Equal: the third column before the spine.
    const spine = { ...plain, plan: { third: false, columns: 1, broken: 0 }, value: 'spine' };
    expect(choose([spine, plain], letter, 'auto').value).toBe('plain');
  });

  it('on a sheet counts print scale up to full size and no further; on a screen without end', () => {
    const wide = { plan: { third: true, columns: 1, broken: 0 }, width: 600, height: 700, value: 'plain' };
    const narrow = { plan: { third: false, columns: 1, broken: 0 }, width: 400, height: 700, value: 'spine' };
    // The narrower chart prints half as large again, and is taken...
    expect(choose([wide, narrow], letter, 'portrait').value).toBe('spine');
    // ...unless the wider one already prints at full size.
    expect(choose([wide, narrow], letter, 'portrait', 0.85).value).toBe('plain');
    expect(choose([wide, narrow], letter, 'portrait', 0.85).scale).toBeCloseTo(0.87);
    // A screen has no full size: the narrowest wins.
    expect(choose([wide, narrow], letter, 'screen', 0.85).value).toBe('spine');
  });
});
