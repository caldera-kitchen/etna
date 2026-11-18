// Fitting a card to whole pages: which text size to print at, given how a size lays out.
//
// Pure. `decideFit` is also shipped, as its source text, inside the paging script (paging.ts),
// so it must stay self-contained: no imports, no references to anything outside its body.

/**
 * How a card lays out at one size: its page count, how full its last page is (0–1), and
 * whether anything had to be printed cut off (a block taller than a page that could not be split).
 */
export interface Layout {
  pages: number;
  fill: number;
  overflow?: boolean;
}

/** The limits decideFit works within (FitLimits in paper.ts). */
export interface FitRule {
  base: number;
  min: number;
  max: number;
  nearlyEmpty: number;
  short: number;
  full: number;
  step: number;
  /** The theme's opt-in (`fit.grow: true`) to the older rule that also grows a card to fill its pages. Default off. */
  grow?: boolean;
}

export interface FitDecision extends Layout {
  /** The chosen size, in points, rounded to the step. */
  size: number;
  /**
   * Why: `kept` (the theme's size), `shrunk` (one page fewer), `unclipped` (smaller, so that
   * nothing is cut off). Only with `grow`: `grown` (fuller pages) or `short` (a short card left alone).
   */
  reason: 'kept' | 'shrunk' | 'grown' | 'short' | 'unclipped';
  /** The sizes measured, in the order tried. */
  tried: number[];
}

/**
 * Choose the size to print at. `measure` lays the card out at a size and reports it.
 * Fitting never prints larger than the base size: a larger size is the reader's choice (an
 * explicit size), not the fitting's.
 *
 * 1. Lay out at the base size (the theme's).
 * 2. More than one page, and the last nearly empty: the largest size between `min` and the base
 *    that needs one page fewer. Found: print at it (`shrunk`).
 * 3. Otherwise print at the base size (`kept`).
 *
 * A size at which anything is cut off is never chosen while a size without that exists: when
 * the base size cuts something off, the largest size down to `min` that does not is used
 * (`unclipped`), and shrinking never accepts a size that cuts anything off.
 *
 * Only when a theme opts in (`rule.grow`), the older rule follows step 2: a single page filled
 * less than `short` keeps the base size (`short`); otherwise the largest size between the
 * base and `max` that keeps the page count and fills the last page no more than `full`
 * (`grown`).
 *
 * Sizes are tried on a grid of `step` points by binary search, which assumes a larger size never
 * needs fewer pages; the same measurements give the same answer every time.
 */
export function decideFit(rule: FitRule, measure: (size: number) => Layout): FitDecision {
  const tried: number[] = [];
  const memo = new Map<number, Layout>();
  const at = (size: number): Layout => {
    let layout = memo.get(size);
    if (!layout) {
      tried.push(size);
      layout = measure(size);
      memo.set(size, layout);
    }
    return layout;
  };
  const snap = (x: number) => Math.round(x / rule.step) * rule.step;
  const fix = (x: number) => Math.round(x * 1000) / 1000;
  const grid = (from: number, to: number): number[] => {
    const out: number[] = [];
    const lo = Math.round(snap(from) / rule.step);
    const hi = Math.round(snap(to) / rule.step);
    for (let i = lo; i <= hi; i++) out.push(fix(i * rule.step));
    return out;
  };
  // The last size in `sizes` (ascending) for which `ok` holds, when `ok` is true up to some point and false after.
  const lastTrue = (sizes: number[], ok: (s: number) => boolean): number | null => {
    let lo = 0;
    let hi = sizes.length - 1;
    let found: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ok(sizes[mid])) {
        found = sizes[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };

  const base = fix(Math.min(Math.max(snap(rule.base), rule.min), rule.max));
  const done = (size: number, reason: FitDecision['reason']): FitDecision => ({ size, reason, tried, ...at(size) });
  const clean = (s: number) => !at(s).overflow;
  if (!clean(base)) {
    // Something is cut off at the base size: the largest smaller size where nothing is.
    const smaller = grid(rule.min, base).filter((s) => s < base);
    const unclipped = lastTrue(smaller, clean);
    return done(unclipped ?? base, unclipped === null ? 'kept' : 'unclipped');
  }
  const start = at(base);

  if (start.pages > 1 && start.fill < rule.nearlyEmpty) {
    const target = start.pages - 1;
    const smaller = grid(rule.min, base).filter((s) => s < base);
    const shrunk = lastTrue(smaller, (s) => at(s).pages <= target && clean(s));
    if (shrunk !== null) return done(shrunk, 'shrunk');
  }
  if (rule.grow !== true) return done(base, 'kept');
  if (start.pages === 1 && start.fill < rule.short) return done(base, 'short');

  const larger = grid(base, rule.max).filter((s) => s > base);
  const grown = lastTrue(larger, (s) => {
    const layout = at(s);
    return layout.pages === start.pages && layout.fill <= rule.full && !layout.overflow;
  });
  if (grown !== null) return done(grown, 'grown');
  return done(base, 'kept');
}
