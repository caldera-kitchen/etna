// Routes: how each edge runs, before anything has a position. Its type (straight down the
// spine, a hop along a row, a lane in the channel, the gutter between containers), the turn,
// which edges move in from the gutter or drop straight into a node's top, and which port of
// each node every edge takes.

import type { Graph } from '../../core/index.ts';
import { rowOf } from './structure.ts';
import type { Arrangement, Op, Route, RouteType, Row, Snake } from './types.ts';

/** True when the op's row leaves the third column free beside it (or it is in the third column). */
export const thirdFree = (op: Op): boolean => op.col === 1 || op.snake.rows[op.row].cells[1] === null;

/** Which side of a node faces the channel: the right of a spine node, the left of a third-column one. */
export const channelSide = (op: Op): 'left' | 'right' => (op.col === 0 ? 'right' : 'left');

/** Take a node's side port for an entry (`in`) or exit (`out`), if it is free or already that. Writes `op.used`. */
function claim(op: Op, side: 'left' | 'right', as: 'in' | 'out'): boolean {
  if (op.used[side] !== '' && op.used[side] !== as) return false;
  op.used[side] = as;
  return true;
}

/**
 * One route per edge between two placed steps (repeats and self-edges left out), in the
 * graph's order, with its type. Run once on the chart in one column and, when it is folded,
 * again on its columns: it first clears every `Op.used` and every `Snake.turn`. Reads each
 * op's `placed`, `snake`, `row`, `col`.
 */
export function classifyRoutes(graph: Graph, arrangement: Arrangement): Route[] {
  const { ops, snakes } = arrangement;
  const routes: Route[] = [];
  for (const op of ops.values()) op.used = { left: '', right: '', top: '', bottom: '' };
  for (const snake of snakes) snake.turn = false;
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const from = ops.get(edge.from);
    const to = ops.get(edge.to);
    if (!from || !to || !from.placed || !to.placed || from === to) continue;
    const key = `${edge.from}>${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let type: RouteType;
    if (from.snake !== to.snake) type = 'gutter';
    else if (edge.kind !== 'reference' && from.col === to.col && (to.row - from.row === 1 || (from.col === 1 && from.row - to.row === 1))) type = 'vertical';
    else if (edge.kind !== 'reference' && from.row === to.row) type = 'hop';
    else type = 'lane';
    routes.push({ edge, from, to, type, turn: false, exit: 'tip', entry: 'tip', side: 'right', lane: 0, drop: false, back: false, via: -1, lane2: 0, band: 0, fork: null });
  }
  return routes;
}

/**
 * Spine ports, the cut spine and the turn. Spine edges (vertical, the spine where a fold cuts
 * it, and hop) take their ports first. Reads the routes' `type`, `edge.kind`, `from`, `to`, the
 * ops' `row`, `col`, `snake` (`rows`, `item`, `column`, `tail`). Writes `Op.used` (`'spine'`),
 * `Route.back` for the cut spine, and for a hop that turns under its source `Route.turn` and
 * `Snake.turn`.
 */
export function spinePorts(routes: Route[]): void {
  // Ports. Spine edges take theirs first; joining edges later take what is left: the tip of
  // the hexagon when it is free, else an offset port on the flat top (entries) or bottom
  // (exits).
  for (const r of routes) {
    if (r.type !== 'vertical') continue;
    if (r.to.row > r.from.row) r.from.used.bottom = r.to.used.top = 'spine';
    else r.from.used.top = r.to.used.bottom = 'spine';
  }
  // Where a fold cuts the spine, it runs from the foot of one column to the head of the next,
  // and comes in through the middle of the node's top, as the spine does.
  for (const r of routes) {
    if (r.type !== 'gutter' || r.edge.kind !== 'spine' || r.from.snake.item !== r.to.snake.item) continue;
    if (r.to.snake.column !== r.from.snake.column + 1 || r.from.col !== 0 || r.to.col !== 0) continue;
    if (r.from.row !== r.from.snake.rows.length - 1 || r.to.row !== 0 || r.to.used.top !== '') continue;
    r.back = true;
    r.to.used.top = 'spine';
  }
  const joined = new Set(routes.filter((r) => r.type === 'lane').map((r) => r.to.id));
  for (const r of routes) {
    if (r.type !== 'hop') continue;
    const { from, to } = r;
    if (from.col === 1) {
      from.used.left = to.used.right = 'spine';
    } else if (from.snake.tail && from.row === from.snake.rows.length - 1 && joined.has(from.id) && !from.used.bottom && !to.used.bottom) {
      // A branch joins here from the right, so the spine leaves from the bottom and turns
      // up into the third column (Frosty Chocolate's `Add to Vitamix`).
      r.turn = true;
      from.used.bottom = to.used.bottom = 'spine';
      from.snake.turn = true;
    } else {
      from.used.right = to.used.left = 'spine';
    }
  }
}

/**
 * The rows an edge between two snakes of one column passes on its way down: the rest of the
 * source's snake, every snake of that column between the two, and the target's snake above it.
 */
function rowsAcross(snakes: Snake[], order: Map<Snake, number>, r: Route): Row[] {
  const rows = r.from.snake.rows.slice(r.from.row + 1);
  for (const s of snakes.slice(order.get(r.from.snake)! + 1, order.get(r.to.snake))) if (s.column === r.from.snake.column) rows.push(...s.rows);
  return [...rows, ...r.to.snake.rows.slice(0, r.to.row)];
}

/**
 * The inner-gutter rule: a gutter edge to a container further down the same column becomes a
 * lane when its way down the channel is clear and passes no other container. Only when the
 * chart has containers. Reads the routes' `type`, `turn`, the snakes' `column`, `component`
 * and rows. Writes `Route.type` (`'gutter'` →
 * `'lane'`).
 */
export function innerGutters(snakes: Snake[], routes: Route[], contained: boolean): void {
  // An edge to a container further down the same column runs down the channel beside the
  // operations, as an edge within one container does, rather than out in the gutter beyond
  // the containers' right edge, when nothing else crosses that channel between its ends: no
  // hop out to the third column (nor a spine turning under the source into it), and no edge
  // that stays in the gutter leaving or entering a container there. Edges that move in share
  // the channel's lanes with the container's own, and the lane packing keeps them apart.
  if (!contained) return;
  const order = new Map(snakes.map((s, i) => [s, i]));
  let inner = routes.filter(
    (r) =>
      r.type === 'gutter' &&
      r.from.snake.column === r.to.snake.column &&
      order.get(r.from.snake)! < order.get(r.to.snake)! &&
      // Never through a container that is neither its source nor its target.
      !snakes.slice(order.get(r.from.snake)! + 1, order.get(r.to.snake)).some((s) => s.column === r.from.snake.column && s.component) &&
      !routes.some((o) => o.turn && o.from.snake === r.from.snake && o.from.row >= r.from.row),
  );
  // Drop the edges whose way down is blocked until none is (an edge that stays outside
  // blocks the rows it leaves and enters by).
  for (;;) {
    const busy = new Set<Row>();
    for (const r of routes) {
      if (r.type === 'hop') busy.add(rowOf(r.from));
      if (r.type === 'gutter' && !inner.includes(r)) busy.add(rowOf(r.from)).add(rowOf(r.to));
    }
    const kept = inner.filter((r) => rowsAcross(snakes, order, r).every((row) => !busy.has(row)));
    if (kept.length === inner.length) break;
    inner = kept;
  }
  for (const r of inner) r.type = 'lane';
}

/**
 * The drop rule. Reads the routes' `type`, `edge.kind`, ends' `col`, `row`, `used.top`, the
 * snakes' `column` and rows. Writes `Route.drop`, `Route.entry` (`'tip'`) and the target's
 * `used.top` (`'in'`).
 */
export function dropRoutes(snakes: Snake[], routes: Route[]): void {
  // A joining edge from the operations column into a third-column node whose column is clear
  // all the way up to the source's row runs straight: out of the source along its row, then
  // down into the node's top. No lane, no jog in beside the node, and the edge reads as the
  // branch it is (a crust made apart into the step that fills it, a topping into the step that
  // tops). One such edge per node; the node's top must be free of a spine edge.
  const order = new Map(snakes.map((s, i) => [s, i]));
  const rowsBetween = (r: Route): Row[] | null => {
    if (r.from.snake === r.to.snake) return r.from.row < r.to.row ? r.from.snake.rows.slice(r.from.row + 1, r.to.row) : null;
    if (r.from.snake.column !== r.to.snake.column || order.get(r.from.snake)! > order.get(r.to.snake)!) return null;
    return rowsAcross(snakes, order, r);
  };
  for (const r of routes) {
    if (r.type !== 'lane' || r.edge.kind === 'choose' || r.from.col !== 0 || r.to.col !== 1) continue;
    if (r.to.used.top !== '' || !thirdFree(r.from)) continue;
    const rows = rowsBetween(r);
    if (rows === null || !rows.every((row) => row.cells[1] === null)) continue;
    r.drop = true;
    r.entry = 'tip';
    r.to.used.top = 'in';
  }
}

/**
 * Port claims: joining edges take the side ports the spine left free, every entry before any
 * exit; an edge that finds its port taken goes in or out through the top or bottom
 * (`'offset'`); the cut spine comes in through the top's middle and leaves from the bottom's
 * when its side is taken. Reads the routes' `type`, `drop`, `back`, the ops' `used`, `col`,
 * `size.table` and snakes' `column`. Writes `Route.entry`, `Route.exit`, `Route.side` and
 * `Route.via` (gutter edges) and `Op.used` (`'in'`, `'out'`, and `'spine'` for a cut spine's
 * bottom).
 */
export function claimPorts(routes: Route[]): void {
  // Joining edges take the ports the spine left free, an entry before an exit.
  for (const r of routes) {
    if (r.drop) continue;
    if (r.type === 'lane') r.entry = claim(r.to, channelSide(r.to), 'in') ? 'tip' : 'offset';
    if (r.type !== 'gutter') continue;
    const a = r.from.snake.column;
    const b = r.to.snake.column;
    r.side = b > a ? 'left' : 'right';
    // To the next column an edge runs up or down the gutter between the two; to a column
    // further on, or back to an earlier one, it goes over the top: up its own gutter, along the
    // band over the columns, and down the gutter beside its target.
    r.via = b === a || b === a + 1 ? -1 : b > a ? b - 1 : b;
    if (r.back) {
      r.entry = 'top';
      continue;
    }
    // From the left, an edge can run straight in only along a row with no ingredient box.
    if (r.side === 'left') r.entry = r.to.col === 0 && !r.to.size.table && claim(r.to, 'left', 'in') ? 'tip' : 'offset';
    else r.entry = thirdFree(r.to) && claim(r.to, 'right', 'in') ? 'tip' : 'offset';
  }
  for (const r of routes) {
    if (r.type === 'lane') r.exit = claim(r.from, channelSide(r.from), 'out') ? 'tip' : 'offset';
    if (r.type !== 'gutter') continue;
    if (thirdFree(r.from) && claim(r.from, 'right', 'out')) r.exit = 'tip';
    else if (r.back && r.from.used.bottom === '') {
      r.exit = 'bottom';
      r.from.used.bottom = 'spine';
    } else r.exit = 'offset';
  }
}
