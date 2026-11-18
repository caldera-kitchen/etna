// Folding: the chart in one column cut into several, each read down, one after another across.
//
// The chart in one column is a strip: its snakes one under another. Folding cuts the strip
// into columns that each read down and follow one another across, like a newspaper's. A cut
// falls between two snakes, or between two rows of one: never inside a Choose group, a run
// down or up the third column, or the preparation row. A container that is cut takes whole
// columns to itself, so its frame stays one rectangle over them. columns.ts picks the cuts:
// the shortest tallest column, then the fewest edges broken.

import { fold } from './columns.ts';
import { newSnake } from './structure.ts';
import type { Arrangement, Folded, Frame, Route, Sizes, Snake } from './types.ts';

/** A run of rows of one snake that a cut never falls inside. */
interface Piece {
  snake: Snake;
  from: number;
  to: number;
}

/**
 * Fold the chart into `columns` columns; `null` when it cannot be (a mirrored chart, too few
 * pieces, no allowed cuts). Must come after the first `classifyRoutes`,
 * `spinePorts` and `sizeRows` (it reads the routes, `Row.y/height/extra` and `Snake.height`),
 * and be followed by a second round of them on the folded snakes. Writes: replaces the
 * contents of `arrangement.snakes` with the folded list (a snake cut by a fold becomes part
 * snakes with `item`, `head`, `tail`, their share of rows and groups), sets `Snake.column`, and
 * moves each op of a part (`Op.snake`, `Op.row`).
 */
export function foldColumns(sizes: Sizes, frame: Frame, arrangement: Arrangement, routes: Route[], columns: number): Folded | null {
  const { mirrored, componentGap } = sizes;
  const { padTop, padBottom } = frame;
  const { snakes, contained } = arrangement;
  // A mirrored chart is folded only as it always could be: its containers in two stacks, cut
  // between two of them, with no edge from the second stack back to the first.
  if (mirrored && (columns > 2 || !contained)) return null;
  const pieces: Piece[] = [];
  for (const snake of snakes) {
    const grouped = (r: number): boolean => snake.groups.some((g) => r > g.start && r <= g.end);
    let from = 0;
    for (let r = 1; r <= snake.rows.length; r++) {
      const apart = r === snake.rows.length || (!mirrored && !snake.prep && !grouped(r) && !(snake.rows[r - 1].cells[1] && snake.rows[r].cells[1]));
      if (!apart) continue;
      pieces.push({ snake, from, to: r });
      from = r;
    }
  }
  // Rows carry their place within their snake (`sizeRows`): a part of one is as tall as
  // from its first row's top, with the room that row asks above itself, to its last row's
  // bottom, and the snake's last part has whatever the snake has under its last row. A part
  // that starts a column drops the gap that set its first row apart from the row above.
  const partHeight = (snake: Snake, from: number, to: number): number => {
    const first = snake.rows[from];
    const last = snake.rows[to - 1];
    const end = snake.rows[snake.rows.length - 1];
    return last.y + last.height - (first.y - first.extra) - (from > 0 ? first.gap : 0) + (to === snake.rows.length ? snake.height - (end.y + end.height) : 0);
  };
  const parts = (a: number, b: number): Piece[] => {
    const list: Piece[] = [];
    for (let i = a; i < b; ) {
      let j = i + 1;
      while (j < b && pieces[j].snake === pieces[i].snake) j++;
      list.push({ snake: pieces[i].snake, from: pieces[i].from, to: pieces[j - 1].to });
      i = j;
    }
    return list;
  };
  // Whether an edge runs from a piece at or after `at` back to one before it.
  const place = new Map(pieces.map((p, i) => [p.snake, i]));
  const backward = (at: number): boolean => routes.some((r) => r.type === 'gutter' && place.get(r.from.snake)! >= at && place.get(r.to.snake)! < at);
  const found = fold(
    {
      count: pieces.length,
      height: (a, b) =>
        parts(a, b).reduce((sum, part, i) => {
          const own = partHeight(part.snake, part.from, part.to);
          return sum + (contained ? (i > 0 ? componentGap : 0) + padTop + own + padBottom : own);
        }, 0),
      // The preparation row never has a column to itself.
      allowed: (a, b) =>
        !(mirrored && [a, b].some((at) => at > 0 && at < pieces.length && backward(at))) &&
        !parts(a, b).every((part) => part.snake.prep) &&
        parts(a, b).every((part) => !part.snake.component || (part.from === 0 && part.to === part.snake.rows.length) || (pieces[a].snake === part.snake && pieces[b - 1].snake === part.snake)),
      // What a cut breaks: the edges of its snake that run from one side of it to the other.
      cost: (at) => {
        const snake = pieces[at].snake;
        if (pieces[at - 1].snake !== snake) return 0;
        const row = pieces[at].from;
        return routes.filter((r) => r.from.snake === snake && r.to.snake === snake && Math.min(r.from.row, r.to.row) < row && Math.max(r.from.row, r.to.row) >= row).length;
      },
    },
    columns,
  );
  if (!found) return null;
  const ends = [0, ...found.cuts, pieces.length];
  const folded: Snake[] = [];
  for (let column = 0; column + 1 < ends.length; column++) {
    for (const part of parts(ends[column], ends[column + 1])) folded.push(partSnake(part, column));
  }
  snakes.splice(0, snakes.length, ...folded);
  return { columnCount: columns, broken: found.cost };
}

/** The snake for one part in `column`: the snake itself when the part is all of it, else a part snake that takes over its rows. */
function partSnake(part: Piece, column: number): Snake {
  let snake = part.snake;
  if (part.from > 0 || part.to < snake.rows.length) {
    snake = newSnake(part.snake.component);
    snake.prep = part.snake.prep;
    snake.item = part.snake.item;
    snake.head = part.from === 0;
    snake.tail = part.to === part.snake.rows.length;
    snake.rows = part.snake.rows.slice(part.from, part.to);
    if (part.from > 0) {
      snake.rows[0].extra -= snake.rows[0].gap;
      snake.rows[0].gap = 0;
    }
    snake.groups = part.snake.groups
      .filter((g) => g.start >= part.from && g.end < part.to)
      .map((g) => ({ ...g, start: g.start - part.from, end: g.end - part.from, breaks: g.breaks.map((k) => k - part.from) }));
    snake.rows.forEach((row, k) => {
      for (const op of row.cells) {
        if (!op) continue;
        op.snake = snake;
        op.row = k;
      }
    });
  }
  snake.column = column;
  return snake;
}
