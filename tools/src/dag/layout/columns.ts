// Folding a chart into columns: choosing the cuts.
//
// A chart in one column is a strip: its items (the preparation row, each container, each run
// of top-level steps) one under another, each a sequence of rows. Folding cuts the strip into
// columns that each read top to bottom, and follow one another left to right, like the columns
// of a newspaper. This file chooses the cuts, exactly: for a given number of columns, the cuts
// that make the tallest column as short as it can be, and, among the foldings within a small
// slack of that, the one whose cuts break the fewest edges (a cut where only the spine crosses
// reads best: Rüegg and von Hanxleden, "Wrapping Layered Graphs", 2018).
//
// It knows nothing of charts. It is the linear partition problem with a test of which columns
// are allowed, solved by dynamic programming over (pieces placed, columns used, cost so far).

/** The strip to fold, as the three things the fold needs to know about it. */
export interface Strip {
  /** How many pieces the strip has. A piece is never cut. */
  count: number;
  /** The height of a column holding pieces `from` to `to - 1`. */
  height(from: number, to: number): number;
  /** Whether pieces `from` to `to - 1` may stand as one column. */
  allowed(from: number, to: number): boolean;
  /** What a cut just before piece `at` costs: a whole number, 0 for a cut that breaks nothing. */
  cost(at: number): number;
}

export interface Fold {
  /** Where each column after the first starts: `columns - 1` piece indexes, ascending. */
  cuts: number[];
  /** The height of the tallest column. */
  tallest: number;
  /** The summed cost of the cuts. */
  cost: number;
}

/** Costs are summed up to this; a folding that costs more is treated as costing this much. */
const COST_CAP = 32;

/**
 * Fold `strip` into exactly `columns` columns, or `null` when it cannot be done (too few
 * pieces, or no allowed set of cuts). `slack` is how much taller than the shortest possible
 * the tallest column may be for the sake of cheaper cuts (0.04: four percent).
 */
export function fold(strip: Strip, columns: number, slack = 0.04): Fold | null {
  const n = strip.count;
  if (columns < 1 || n < columns) return null;
  // The height of every allowed column, once.
  const span: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  for (let from = 0; from < n; from++) for (let to = from + 1; to <= n; to++) if (strip.allowed(from, to)) span[from][to] = strip.height(from, to);
  const cost = Array.from({ length: n + 1 }, (_, at) => (at > 0 && at < n ? Math.max(0, Math.round(strip.cost(at))) : 0));

  // best[c][i][p]: the shortest tallest column over every way to set the first `i` pieces in
  // `c` columns whose cuts cost `p` in all; from[c][i][p]: where the last of them starts.
  const table = (): number[][][] => Array.from({ length: columns + 1 }, () => Array.from({ length: n + 1 }, () => new Array<number>(COST_CAP + 1).fill(Infinity)));
  const best = table();
  const from = table();
  for (let i = 1; i <= n; i++) {
    best[1][i][0] = span[0][i];
    from[1][i][0] = 0;
  }
  for (let c = 2; c <= columns; c++) {
    for (let i = c; i <= n; i++) {
      for (let j = c - 1; j < i; j++) {
        const last = span[j][i];
        if (last === Infinity) continue;
        for (let p = 0; p <= COST_CAP; p++) {
          const before = best[c - 1][j][p];
          if (before === Infinity) continue;
          const q = Math.min(COST_CAP, p + cost[j]);
          const tallest = Math.max(before, last);
          // Strictly better only: of two equal foldings the one that cuts earlier is kept.
          if (tallest < best[c][i][q]) {
            best[c][i][q] = tallest;
            from[c][i][q] = j * (COST_CAP + 1) + p;
          }
        }
      }
    }
  }

  const final = best[columns][n];
  const shortest = Math.min(...final);
  if (shortest === Infinity) return null;
  const p = final.findIndex((tallest) => tallest <= shortest * (1 + slack) + 1e-9);
  const cuts: number[] = [];
  let i = n;
  let q = p;
  for (let c = columns; c > 1; c--) {
    const back = from[c][i][q];
    i = Math.floor(back / (COST_CAP + 1));
    q = back % (COST_CAP + 1);
    cuts.unshift(i);
  }
  return { cuts, tallest: final[p], cost: p };
}
