// Placing, in the frame: row and snake heights and the containers' paddings, then (after
// the fold, fold.ts) the band over the columns, vertical positions, lanes, and horizontal
// positions. The order matters: lanes are packed by height, and the channel's width (so every
// x) depends on how many lanes there are.

import { channelSide } from './routes.ts';
import { rowOf } from './structure.ts';
import type { Frame, Horizontal, Op, Route, Row, Sizes, Snake, Vertical } from './types.ts';

/** One run of an edge along a channel: from `a` to `b` along it, each end turning off toward a node on the left or the right. */
export interface Stretch {
  key: string;
  a: number;
  b: number;
  aLeft: boolean;
  bLeft: boolean;
  set: (lane: number) => void;
  /** For the first stretch of an edge that forks (`Route.fork`): its fork, and how near its lane is to be among the fork's. */
  fork?: { key: string; near: number };
}

/**
 * Row and snake heights. Reads the ops' sizes, the rows' `extra` and `Snake.turn`. Writes
 * `Row.height`, `Row.y` (from the snake's top) and `Snake.height`.
 */
export function sizeRows(sizes: Sizes, snakes: Snake[]): void {
  const { rowGap, turnDepth } = sizes;
  for (const snake of snakes) {
    let y = 0;
    snake.rows.forEach((row, i) => {
      row.height = Math.max(0, ...row.cells.flatMap((op) => (op ? [op.size.height, op.size.table?.height ?? 0] : [])));
      y += row.extra + (i > 0 ? rowGap : 0);
      row.y = y;
      y += row.height;
    });
    snake.height = y + (snake.turn ? turnDepth + 6 : 0) + chooseFoot(sizes, snake);
  }
}

/**
 * The room a container must add under its snake when the snake ends in a Choose group (a fold
 * cut just after it): the group's frame runs `CHOOSE_BELOW` under its last row, and must stay
 * `CHOOSE_CLEAR` inside the container's bottom border, which its padding alone may not reach
 * (Dense: 12; Easter Bread folded to three columns).
 */
function chooseFoot(sizes: Sizes, snake: Snake): number {
  const last = snake.rows.length - 1;
  if (!snake.component || snake.turn || !snake.groups.some((g) => g.end === last)) return 0;
  return Math.max(0, CHOOSE_BELOW + CHOOSE_CLEAR - sizes.t.num('component-padding-bottom'));
}

/** The frame's fixed offsets for these snakes: paddings, the step column. Reads only. */
export function frameOf(sizes: Sizes, snakes: Snake[]): Frame {
  const { t, hasTables, tableWidth, columnGap } = sizes;
  // A container's padding in the frame: each side of its snake, and over and under it.
  const padSide = t.num('component-padding-x');
  const padTop = t.num('component-padding-top');
  const padBottom = t.num('component-padding-bottom');
  const usesThird = snakes.some((s) => s.rows.some((row) => row.cells[1]));
  const col2 = hasTables ? tableWidth + columnGap : 0;
  return { padSide, padTop, padBottom, col2, usesThird };
}

/** The clear space over a snake's first row: inside its container's top, or under the title or the margin. */
const topClearOf = (sizes: Sizes, frame: Frame, contained: boolean): number =>
  contained ? frame.padTop - 14 : sizes.title ? sizes.titleGap : sizes.margin;

/**
 * Room for the edges that come into one row through the top from one side: each runs at its
 * own height over the row, so a row that takes several needs that much clear space above it.
 * Reads the routes' `type`, `drop`, `entry` and `side` (so after `claimPorts`). Writes
 * `Row.extra` where a row is short of room. Returns whether it changed anything: `sizeRows`
 * must then run again.
 */
export function roomForEntries(sizes: Sizes, frame: Frame, snakes: Snake[], routes: Route[], contained: boolean): boolean {
  if (!sizes.separate) return false;
  const count = new Map<Row, Map<string, number>>();
  for (const r of routes) {
    if ((r.type !== 'lane' && r.type !== 'gutter') || r.drop || r.entry === 'tip') continue;
    const row = rowOf(r.to);
    const side = r.type === 'lane' ? `${r.to.id}|${channelSide(r.to)}` : r.side === 'left' ? 'left' : `${r.to.id}|right`;
    const sides = count.get(row) ?? new Map<string, number>();
    sides.set(side, (sides.get(side) ?? 0) + 1);
    count.set(row, sides);
  }
  let changed = false;
  for (const snake of snakes) {
    snake.rows.forEach((row, i) => {
      const most = Math.max(0, ...(count.get(row)?.values() ?? []));
      if (most < 2) return;
      const clear = (i === 0 ? topClearOf(sizes, frame, contained) : sizes.rowGap) + row.extra;
      const need = 24 + (most - 1) * 6;
      if (need <= clear) return;
      row.extra += need - clear;
      changed = true;
    });
  }
  return changed;
}

/**
 * The band over the columns, for the edges that pass over one (`via`): its lanes are packed by
 * the gutters each edge runs between (the shortest nearest the columns, so none crosses another
 * on its way down), before anything has a height. Reads the routes' `type`, `via` and source
 * column. Writes `Route.band`. Returns the band's height.
 */
export function placeBand(sizes: Sizes, routes: Route[]): number {
  const { lanePad, laneGap } = sizes;
  const bandLanes = packLanes(
    sizes,
    routes
      .filter((r) => r.type === 'gutter' && r.via >= 0)
      .map((r) => ({ key: gutterKey(sizes, r), a: Math.min(r.from.snake.column, r.via) * 1000, b: Math.max(r.from.snake.column, r.via) * 1000, aLeft: false, bLeft: false, set: (lane: number) => (r.band = lane) })),
  );
  return bandLanes > 0 ? lanePad + (bandLanes - 1) * laneGap : 0;
}

/**
 * Vertical positions. Reads the snakes' `column`, `height` and rows. Writes `Snake.y`,
 * `topClear`, `bottomClear`, makes `Row.y` absolute, and sets `Op.y`. Returns the columns'
 * top, each container's top and the chart's height (in the frame).
 */
export function placeVertical(sizes: Sizes, frame: Frame, snakes: Snake[], routes: Route[], columnCount: number, contained: boolean, bandHeight: number): Vertical {
  const { margin, titleGap, componentGap, title } = sizes;
  const { padTop, padBottom } = frame;
  const top0 = margin + (title ? title.height + titleGap : 0) + bandHeight;
  const cursors = Array.from({ length: columnCount }, () => top0);
  const containerTops = new Map<Snake, number>();
  for (const snake of snakes) {
    let cursor = cursors[snake.column];
    if (contained) {
      if (cursor > top0) cursor += componentGap;
      containerTops.set(snake, cursor);
      snake.y = cursor + padTop;
      snake.topClear = topClearOf(sizes, frame, contained);
      snake.bottomClear = padBottom;
      cursor = snake.y + snake.height + padBottom;
    } else {
      snake.y = cursor;
      snake.topClear = topClearOf(sizes, frame, contained);
      snake.bottomClear = margin;
      cursor += snake.height;
    }
    cursors[snake.column] = cursor;
    for (const row of snake.rows) {
      row.y += snake.y;
      for (const op of row.cells) if (op) op.y = row.y + (row.height - op.size.height) / 2;
    }
  }
  // A column shorter than the tallest has room to spare. It slides down in that room, as far
  // as it takes for the edges that come into it from the column before to run level or down
  // instead of climbing back up the page: the parts on the left, what they go into lower on
  // the right. A column that continues a snake or a container cut by a fold stays at the top,
  // where the reader looks for it.
  const foot = Math.max(...cursors);
  for (let column = 1; column < columnCount; column++) {
    const own = snakes.filter((s) => s.column === column);
    if (own.some((s) => !s.head || !s.tail)) continue;
    let climb = 0;
    for (const r of routes) {
      if (r.type !== 'gutter' || r.via >= 0 || r.to.snake.column !== column || r.from.snake.column !== column - 1) continue;
      climb = Math.max(climb, exitY(sizes, r) - entryY(sizes, r));
    }
    const down = Math.min(foot - cursors[column], climb);
    if (down <= 0) continue;
    for (const snake of own) {
      snake.y += down;
      if (containerTops.has(snake)) containerTops.set(snake, containerTops.get(snake)! + down);
      for (const row of snake.rows) {
        row.y += down;
        for (const op of row.cells) if (op) op.y += down;
      }
    }
    cursors[column] += down;
  }
  return { top0, containerTops, height: foot + margin };
}

/** The height of an edge's run along the band over the columns. */
export const bandY = (sizes: Sizes, vertical: Vertical, r: Route): number => vertical.top0 - sizes.lanePad - r.band * sizes.laneGap;

// ------------------------------------------------------------------ heights of edge ends

export const centerY = (op: Op): number => op.y + op.size.height / 2;
export const clearAbove = (sizes: Sizes, op: Op): number => (op.row === 0 ? op.snake.topClear : sizes.rowGap) + rowOf(op).extra;
export const clearBelow = (sizes: Sizes, op: Op): number =>
  op.row === op.snake.rows.length - 1 ? op.snake.bottomClear : sizes.rowGap + op.snake.rows[op.row + 1].extra;
/** How far a Choose frame's bottom border runs under the last row of its alternatives. */
export const CHOOSE_BELOW = 14;
/** How far an edge that turns under a node keeps from a Choose frame's bottom border, at least. */
const CHOOSE_CLEAR = 4;

/**
 * Where an edge leaves its source: at the tip's height, or just under the node's row. Under
 * the last row of a Choose, the frame's bottom border runs `CHOOSE_BELOW` under the row, and
 * the usual turn can land on it (Easter Bread's KitchenAid, at landscape): there the edge turns
 * clear of the border instead, midway between it and the container's bottom when the row is
 * its snake's last and that leaves room, else midway between the node and the border.
 */
export const exitY = (sizes: Sizes, r: Route): number => {
  if (r.exit === 'tip') return centerY(r.from);
  const op = r.from;
  const below = rowOf(op).y + rowOf(op).height;
  const clear = clearBelow(sizes, op);
  const usual = below + Math.min(14, clear * 0.45);
  const border = below + CHOOSE_BELOW;
  if (!op.snake.groups.some((g) => g.end === op.row) || Math.abs(usual - border) >= CHOOSE_CLEAR) return usual;
  const room = clear - CHOOSE_BELOW;
  return op.row === op.snake.rows.length - 1 && room >= 4 * CHOOSE_CLEAR ? border + room / 2 : below + CHOOSE_BELOW / 2;
};
/**
 * Where an edge comes in: at the tip's height, or over the node's row. An edge that comes in
 * through a node's top runs straight down at least far enough to carry its arrowhead, when the
 * row gap allows (`arrowRun`).
 */
export const entryY = (sizes: Sizes, r: Route): number => {
  if (r.entry === 'tip') return centerY(r.to);
  const usual = Math.min(16, Math.max(clearAbove(sizes, r.to) * 0.4, Math.min(sizes.arrowRun, clearAbove(sizes, r.to) - 4)));
  // An edge that comes in from the left runs over the row's ingredient box, and the name of a
  // branch is written there, just over the box: when the edge would run through the name, it
  // runs just above it instead.
  const name = nameOver(sizes, r);
  return rowOf(r.to).y - (name > 0 && usual < name ? name + 3 : usual);
};

/**
 * How far over its row the name written over the row's ingredient box reaches (from the box's
 * top to the top of the text), when an edge coming in through the top of `r`'s target runs
 * over it (from the left); 0 when it does not.
 */
export const nameOver = (sizes: Sizes, r: Route): number => {
  const row = rowOf(r.to);
  if (!row.caption || r.type !== 'gutter' || r.side !== 'left') return 0;
  if (!(row.cells[0] ?? row.cells[1])?.size.table) return 0;
  return 6 + sizes.captionSize * 0.75;
};

// ------------------------------------------------------------------ forks

/** The side of its source an edge leaves by: the channel's, or toward the gutter. */
export const exitSide = (r: Route): 'left' | 'right' => (r.type === 'lane' ? channelSide(r.from) : 'right');

/** The height an edge runs out toward its lane at: its own, when it forks (`spreadExits`), or the usual. */
export const turnY = (sizes: Sizes, r: Route): number => r.fork?.y ?? exitY(sizes, r);

/**
 * `join-edges: separate`: edges that leave one node from one side for different nodes each take
 * their own point of exit and run out at their own height, as edges that join one node each
 * take their own point of entry (emit.ts, `separateEntries`); so no two run along one line.
 * Through the tip, they spread up and down the node's side; through the bottom, along its flat
 * part from the usual port outwards, each turning at its own height under the row. Top to
 * bottom (and through the bottom, from the outside in): the edges that go up, the one bound
 * for the nearest lane first, then any that run level, then those that go down, the one bound
 * for the furthest lane first, so that none crosses another on its way out.
 *
 * Which lane is nearer is first reckoned before the lanes are packed (`spreadExits`), and the
 * packing is told these heights; once packed, the order is taken from the lanes themselves
 * (`followLanes`), and packed again when that changed it. With `bus`, nothing changes: the edges
 * leave by one point (and a Choose's alternatives share one lane out of the step before it, as
 * joining edges share one into their node).
 */
function forkGroups(sizes: Sizes, routes: Route[]): Route[][] {
  if (!sizes.separate) return [];
  const forks = new Map<string, Route[]>();
  for (const r of routes) {
    if ((r.type !== 'lane' && r.type !== 'gutter') || r.drop || r.exit === 'bottom') continue;
    const key = `${r.from.id}|${r.exit}|${exitSide(r)}`;
    forks.set(key, [...(forks.get(key) ?? []), r]);
  }
  return [...forks.values()].filter((list) => list.length > 1);
}

/** How far an edge climbs from its source to its target (negative going down); over the top, all the way. */
const rise = (sizes: Sizes, r: Route): number => (r.via >= 0 ? Infinity : exitY(sizes, r) - entryY(sizes, r));

/** A fork's edges in their order of exit, top to bottom, by how near each one's lane is (`near`, smaller nearer). */
function exitOrder(sizes: Sizes, list: Route[], near: (r: Route) => number): Route[] {
  return [
    ...list.filter((r) => rise(sizes, r) > 0.5).sort((a, b) => near(a) - near(b)),
    ...list.filter((r) => Math.abs(rise(sizes, r)) <= 0.5),
    ...list.filter((r) => rise(sizes, r) < -0.5).sort((a, b) => near(b) - near(a)),
  ];
}

/**
 * Each edge of a fork, in its order of exit, its point of exit and the height it runs out at,
 * and how near its lane is to be (by `near`). Writes `Route.fork`.
 */
function setExits(sizes: Sizes, ordered: Route[], near: (r: Route) => number): void {
  const { t, laneGap, flatHalf, portOffset } = sizes;
  const n = ordered.length;
  const from = ordered[0].from;
  const key = `${from.id}|${ordered[0].exit}|${exitSide(ordered[0])}`;
  const rank = new Map([...ordered].sort((a, b) => near(a) - near(b)).map((r, k) => [r, k]));
  if (ordered[0].exit === 'tip') {
    // As far apart as edges that come into a tip, within the middle of the side.
    const step = Math.min(Math.max(laneGap, 2 * t.num('arrow-width')), (from.size.height * 0.7) / (n - 1));
    ordered.forEach((r, k) => {
      const dy = (k - (n - 1) / 2) * step;
      r.fork = { dy, dx: 0, y: centerY(from) + dy, key, near: rank.get(r)! };
    });
    return;
  }
  // Along the flat bottom, from the usual port outwards (away from a spine edge at the center),
  // or back toward the center when the flat part is too short. Under the row, the edge furthest
  // out turns at the usual height and each further in a little lower, within the room there.
  // Under the last row of a Choose, the frame's bottom border runs across that room: the edges
  // turn either side of the usual height, all on the side of the border it is on, clear of it.
  const hi = flatHalf - 6;
  let lo = portOffset;
  if ((hi - lo) / (n - 1) < laneGap * 0.6) lo = Math.max(10, hi - (n - 1) * laneGap);
  const dxStep = Math.max(0, Math.min(laneGap, (hi - lo) / (n - 1)));
  const usual = exitY(sizes, ordered[0]);
  const below = rowOf(from).y + rowOf(from).height;
  const floor = below + clearBelow(sizes, from) - 8;
  const border = below + CHOOSE_BELOW;
  let ys: number[];
  if (!from.snake.groups.some((g) => g.end === from.row)) {
    // Between two alternatives of a Choose, a rule runs across under the row: the edges turn
    // over it, and start higher than the usual height when there is not room for them below it.
    const next = from.snake.rows[from.row + 1];
    const rule = next && from.snake.groups.some((g) => g.breaks.includes(from.row + 1)) ? (below + (next.caption ? next.y - 6 - sizes.captionSize : next.y)) / 2 : Infinity;
    const bottom = Math.min(floor, rule - CHOOSE_CLEAR);
    const top = bottom - usual >= (n - 1) * 6 ? usual : Math.max(below + 6, Math.min(usual, bottom - (n - 1) * 8));
    const yStep = Math.max(0, Math.min(8, (bottom - top) / (n - 1)));
    ys = ordered.map((_, k) => top + k * yStep);
  } else {
    const [top, bottom] = usual < border ? [below + 3, border - 3] : [border + CHOOSE_CLEAR, below + clearBelow(sizes, from) - CHOOSE_CLEAR];
    const yStep = Math.max(0, Math.min(8, (bottom - top) / (n - 1)));
    ys = ordered.map((_, k) => usual + (k - (n - 1) / 2) * yStep);
  }
  ordered.forEach((r, k) => (r.fork = { dy: 0, dx: lo + (n - 1 - k) * dxStep - portOffset, y: ys[k], key, near: rank.get(r)! }));
}

/**
 * Each fork's exits, in the order reckoned before the lanes are packed: a lane in the channel
 * is nearer than one in the gutter; then, of an edge that comes back to the side it left by,
 * the shorter is nearer (it would otherwise cross the other on its way back in), and of one
 * that runs on across the lanes to the far side, the longer (for the same reason). Reads the
 * routes' `type`, `exit`, `via`, `side`, ends and heights (so after `placeVertical`). Writes
 * `Route.fork`.
 */
export function spreadExits(sizes: Sizes, routes: Route[]): void {
  const across = (r: Route): boolean =>
    r.type === 'lane' ? channelSide(r.from) !== channelSide(r.to) : r.via >= 0 ? r.via > r.from.snake.column : r.side === 'left';
  const near = (r: Route): number => {
    const length = Math.min(Math.abs(rise(sizes, r)), 1e5);
    return (r.type === 'gutter' ? 1e6 : 0) + (across(r) ? -length : length);
  };
  for (const list of forkGroups(sizes, routes)) setExits(sizes, exitOrder(sizes, list, near), near);
}

/**
 * Each fork's exits again, in the order of the lanes as packed. Reads the routes' `lane` (so
 * after `placeLanes`). Writes `Route.fork`. Returns whether any order changed: the lanes must
 * then be packed again.
 */
export function followLanes(sizes: Sizes, routes: Route[]): boolean {
  // A channel lane counts out from the spine; one in the gutter, out from the column.
  const near = (r: Route): number => (r.type === 'gutter' ? 1e6 + r.lane : channelSide(r.from) === 'right' ? r.lane : -r.lane);
  let changed = false;
  for (const list of forkGroups(sizes, routes)) {
    const before = [...list].sort((a, b) => a.fork!.y - b.fork!.y);
    const ordered = exitOrder(sizes, before, near);
    const ranks = [...list].sort((a, b) => near(a) - near(b));
    if (ordered.every((r, k) => r === before[k]) && ranks.every((r, k) => r.fork!.near === k)) continue;
    setExits(sizes, ordered, near);
    changed = true;
  }
  return changed;
}

// ------------------------------------------------------------------ lanes

// Edges that share a target (or, fanning out of a Choose, a source) share a lane, so they
// read as one merging line (`join-edges: bus`); with `separate`, every joining edge has a lane
// of its own. Lanes are packed: shortest first, each takes the innermost lane where it
// overlaps nothing over its height (with a lane gap to spare), so edges at different heights
// reuse the lane nearest the nodes and an edge goes further out only when every nearer lane
// is taken over its span. Among the free lanes it takes the one that crosses the fewest
// edges already placed: an edge's ends run across the lanes between its node and its own
// lane, and cross whatever runs down those lanes at that height.
/**
 * Pack `list` into lanes. Writes each stretch's lane through its `set`. Returns the lane count.
 * With `reorder`, the packing is then improved by swapping lanes (see below).
 */
/** Two level runs closer than this lie on one line (as check.ts's `edges-share-line` counts them). */
const SAME_LINE = 3;
/** What a pair of ends on one line costs in the lane packing, against one crossing. */
const CLASH = 1000;

export function packLanes(sizes: Sizes, list: Stretch[], reorder = false): number {
  const { laneGap } = sizes;
  interface Group {
    stretches: Stretch[];
    min: number;
    max: number;
    order: number;
    ends: { y: number; left: boolean }[];
    lane: number;
    fork?: { key: string; near: number; left: boolean };
  }
  const groups = new Map<string, Group>();
  for (const r of list) {
    let g = groups.get(r.key);
    if (!g) groups.set(r.key, (g = { stretches: [], min: Infinity, max: -Infinity, order: groups.size, ends: [], lane: -1 }));
    g.stretches.push(r);
    g.min = Math.min(g.min, r.a, r.b);
    g.max = Math.max(g.max, r.a, r.b);
    g.ends.push({ y: r.a, left: r.aLeft }, { y: r.b, left: r.bLeft });
    if (r.fork) g.fork = { ...r.fork, left: r.aLeft };
  }
  // Shortest first. The edges of one fork are placed together, nearest first, when the
  // shortest of them comes: so the one to take the nearest lane finds it free.
  const units = new Map<string, Group[]>();
  for (const g of groups.values()) {
    const key = g.fork ? `f:${g.fork.key}` : `g:${g.order}`;
    units.set(key, [...(units.get(key) ?? []), g]);
  }
  const span = (g: Group): number => g.max - g.min;
  const sorted = [...units.values()]
    .map((u) => ({ u: [...u].sort((a, b) => a.fork!.near - b.fork!.near || a.order - b.order), len: Math.min(...u.map(span)), order: Math.min(...u.map((g) => g.order)) }))
    .sort((a, b) => a.len - b.len || a.order - b.order)
    .flatMap((x) => x.u);
  const placed: Group[] = [];
  // Crossings between an edge in `lane` and one already placed: an end of either, at a height
  // the other runs down, that passes the other's lane on its way to its own.
  const crosses = (g: Group, lane: number, p: Group): number => {
    const passes = (from: number, to: number, end: { left: boolean }): boolean => (end.left ? to < from : to > from);
    const within = (y: number, h: Group): boolean => y > h.min && y < h.max;
    return (
      g.ends.filter((e) => passes(lane, p.lane, e) && within(e.y, p)).length +
      p.ends.filter((e) => passes(p.lane, lane, e) && within(e.y, g)).length
    );
  };
  // Ends that run level at one height, from their lanes toward opposite sides, lie on one line
  // where they overlap: the one that turns left must come from the lane further left. A pair in
  // the other order costs more than any number of crossings (Tres Leches's entries into one row).
  const clashes = (g: Group, lane: number, p: Group): number => {
    if (lane === p.lane) return 0;
    let n = 0;
    for (const e of g.ends) for (const f of p.ends) if (e.left !== f.left && Math.abs(e.y - f.y) < SAME_LINE && e.left === lane > p.lane) n++;
    return n;
  };
  // Two edges of one fork whose lanes are not in the order of their exits cross on the way out.
  const outOfOrder = (g: Group, lane: number, p: Group): number => {
    if (!g.fork || !p.fork || g.fork.key !== p.fork.key || lane === p.lane) return 0;
    const nearer = g.fork.left ? lane < p.lane : lane > p.lane;
    return nearer === g.fork.near < p.fork.near ? 0 : 1;
  };
  const crossCost = (g: Group, lane: number, p: Group): number => CLASH * (clashes(g, lane, p) + outOfOrder(g, lane, p)) + crosses(g, lane, p);
  let count = 0;
  for (const g of sorted) {
    let best = 0;
    let bestCost = Infinity;
    for (let lane = 0; lane <= count; lane++) {
      if (placed.some((p) => p.lane === lane && p.min < g.max + laneGap && g.min < p.max + laneGap)) continue;
      const cost = placed.reduce((sum, p) => sum + crossCost(g, lane, p), 0);
      if (cost < bestCost) {
        best = lane;
        bestCost = cost;
      }
    }
    g.lane = best;
    count = Math.max(count, best + 1);
    placed.push(g);
  }
  // The greedy packing places each edge against those placed before it only. Then swap the
  // lanes of two edges (or move one to a free stretch of another lane) when each fits where the
  // other was and it leaves fewer pairs of ends on one line; with `reorder`, also when the lanes
  // cross fewer edges for it; again until no swap helps. The count is this function's own
  // reckoning, not what is drawn: the caller keeps a reordered result only when the drawn chart
  // crosses fewer edges (index.ts).
  const free = (g: Group, lane: number, skip: Group): boolean =>
    !placed.some((p) => p !== g && p !== skip && p.lane === lane && p.min < g.max + laneGap && g.min < p.max + laneGap);
  const total = (): number => {
    let n = 0;
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        n += reorder ? crossCost(placed[i], placed[i].lane, placed[j]) : clashes(placed[i], placed[i].lane, placed[j]) + outOfOrder(placed[i], placed[i].lane, placed[j]);
    return n;
  };
  {
    let current = total();
    for (let improved = true; improved && current > 0; ) {
      improved = false;
      for (let i = 0; i < placed.length && !improved; i++) {
        for (let lane = 0; lane < count && !improved; lane++) {
          const g = placed[i];
          if (lane === g.lane) continue;
          // Whatever is in `lane` over g's height goes to g's lane (one edge at most).
          const there = placed.filter((p) => p !== g && p.lane === lane && p.min < g.max + laneGap && g.min < p.max + laneGap);
          if (there.length > 1) continue;
          const h = there[0];
          const from = g.lane;
          if (h && !free(h, from, g)) continue;
          g.lane = lane;
          if (h) h.lane = from;
          const n = total();
          if (n < current) {
            current = n;
            improved = true;
          } else {
            g.lane = from;
            if (h) h.lane = lane;
          }
        }
      }
    }
  }
  for (const g of placed) for (const r of g.stretches) r.set(g.lane);
  return count;
}

/** A forking edge's fork, for its first stretch. */
const forkOf = (r: Route): Pick<Stretch, 'fork'> => (r.fork ? { fork: { key: r.fork.key, near: r.fork.near } } : {});

/** Edges in a gutter share a lane by target (`bus`), or each has its own (`separate`). */
const gutterKey = (sizes: Sizes, r: Route): string => (sizes.separate ? `e:${r.from.id}>${r.to.id}` : `t:${r.to.id}`);

/**
 * The lane sets: the channel's in each column, then the gutter's (an edge over the top has a
 * stretch in its own gutter and one in the gutter beside its target). Reads the routes' `type`,
 * `drop`, `side`, `via`, `band`, ends and heights (so after `placeVertical`). Writes
 * `Route.lane`, `Route.lane2` and `Snake.lanes` (its column's channel lane count). Returns the
 * gutter lane count of each column.
 */
export function placeLanes(sizes: Sizes, snakes: Snake[], routes: Route[], columnCount: number, vertical: Vertical, reorder = false): number[] {
  const { separate } = sizes;
  const columns = Array.from({ length: columnCount }, (_, column) => column);
  const band = (r: Route): number => bandY(sizes, vertical, r);
  // Within a column of containers, lanes are shared by every snake in it (an edge between two
  // containers runs down the same channel).
  const laneKey = (r: Route): string => (separate ? `e:${r.from.id}>${r.to.id}` : r.edge.kind === 'choose' ? `s:${r.from.id}` : `t:${r.to.id}`);
  const channelLanes = columns.map((column) =>
    packLanes(
      sizes,
      routes
        .filter((r) => r.type === 'lane' && !r.drop && r.from.snake.column === column)
        .map((r) => ({ key: laneKey(r), a: turnY(sizes, r), b: entryY(sizes, r), aLeft: channelSide(r.from) === 'right', bLeft: channelSide(r.to) === 'right', set: (lane: number) => (r.lane = lane), ...forkOf(r) })),
      reorder,
    ),
  );
  for (const snake of snakes) snake.lanes = channelLanes[snake.column];
  // A gutter runs down the right of each column; an edge uses its source's, and an edge that
  // passes over the top also the one it comes down beside its target.
  return columns.map((column) =>
    packLanes(
      sizes,
      routes.flatMap((r): Stretch[] => {
        if (r.type !== 'gutter') return [];
        const a = r.from.snake.column;
        if (r.via < 0) return a === column ? [{ key: gutterKey(sizes, r), a: turnY(sizes, r), b: entryY(sizes, r), aLeft: true, bLeft: r.side === 'right', set: (lane) => (r.lane = r.lane2 = lane), ...forkOf(r) }] : [];
        return [
          ...(a === column ? [{ key: gutterKey(sizes, r), a: turnY(sizes, r), b: band(r), aLeft: true, bLeft: r.via < a, set: (lane: number) => (r.lane = lane), ...forkOf(r) }] : []),
          ...(r.via === column ? [{ key: gutterKey(sizes, r), a: band(r), b: entryY(sizes, r), aLeft: a < r.via, bLeft: r.side === 'right', set: (lane: number) => (r.lane2 = lane) }] : []),
        ];
      }),
      reorder,
    ),
  );
}

/**
 * The crossings between the edges as drawn: points where a horizontal run of one edge crosses
 * a vertical run of another strictly inside both (as check.ts counts them).
 */
export function crossingCount(edges: { points: { x: number; y: number }[] }[]): number {
  const segs = edges.flatMap((e, ei) => e.points.slice(1).map((q, k) => ({ ei, p: e.points[k], q })));
  const vs = segs.filter((s) => s.p.x === s.q.x);
  const hs = segs.filter((s) => s.p.y === s.q.y);
  let n = 0;
  for (const v of vs) {
    for (const h of hs) {
      if (v.ei === h.ei || v === h) continue;
      const x = v.p.x;
      const y = h.p.y;
      if (x > Math.min(h.p.x, h.q.x) + 0.5 && x < Math.max(h.p.x, h.q.x) - 0.5 && y > Math.min(v.p.y, v.q.y) + 0.5 && y < Math.max(v.p.y, v.q.y) - 0.5) n++;
    }
  }
  return n;
}

/**
 * The pairs of edges from different sources that run along one line, level or upright, for
 * more than 2 units (one edge drawn over another, which reads as one).
 */
export function sharedRuns(edges: { from: string; kind: string; points: { x: number; y: number }[] }[]): number {
  const runs = edges.filter((e) => e.kind !== 'ingredients').flatMap((e) => e.points.slice(1).map((q, k) => ({ from: e.from, p: e.points[k], q })));
  let n = 0;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (a.from === b.from) continue;
      const along = (u: 'x' | 'y', v: 'x' | 'y'): number =>
        Math.abs(a.p[u] - a.q[u]) < 0.01 && Math.abs(b.p[u] - b.q[u]) < 0.01 && Math.abs(a.p[u] - b.p[u]) < 0.01
          ? Math.min(Math.max(a.p[v], a.q[v]), Math.max(b.p[v], b.q[v])) - Math.max(Math.min(a.p[v], a.q[v]), Math.min(b.p[v], b.q[v]))
          : 0;
      if (Math.max(along('y', 'x'), along('x', 'y')) > 2) n++;
    }
  }
  return n;
}

/**
 * Horizontal positions. Reads the snakes' `lanes` and `column`, the gutter lane counts and
 * the frame. Writes `Snake.x` and `Op.x`. Returns the widths and lefts the output needs.
 */
export function placeHorizontal(sizes: Sizes, frame: Frame, snakes: Snake[], columnCount: number, contained: boolean, gutterLanes: number[]): Horizontal {
  const { lanePad, laneGap, opWidth, channelGap, componentGap, margin, titleLeft, title } = sizes;
  const { col2, usesThird, padSide } = frame;
  const maxLanes = Math.max(0, ...snakes.map((s) => s.lanes));
  const laneRoom = maxLanes > 0 ? 2 * lanePad + (maxLanes - 1) * laneGap : 0;
  const col3 = col2 + opWidth + Math.max(channelGap, laneRoom);
  const contentWidth = usesThird ? col3 + opWidth : col2 + opWidth + (maxLanes > 0 ? laneRoom - lanePad + 10 : 0);
  const containerWidth = contentWidth + padSide + padSide;
  const columnWidth = contained ? containerWidth : contentWidth;
  // A gutter is as wide as its lanes need; between two columns it is at least a plain gap.
  const gutterWidth = (column: number): number => {
    const lanes = gutterLanes[column];
    const last = column === columnCount - 1;
    if (lanes === 0) return last ? 0 : componentGap;
    return lanePad + (lanes - 1) * laneGap + (last ? 0 : lanePad);
  };
  const columnLeft = (column: number): number => {
    let x = 0;
    for (let c = 0; c < column; c++) x += columnWidth + gutterWidth(c);
    return x;
  };
  const containersWidth = columnLeft(columnCount - 1) + columnWidth;
  const blockWidth = containersWidth + gutterWidth(columnCount - 1);
  const width = Math.max(blockWidth, title?.width ?? 0) + 2 * margin;
  const blockX = titleLeft ? margin : (width - blockWidth) / 2;
  const gutterX = Array.from({ length: columnCount }, (_, column) => blockX + columnLeft(column) + columnWidth + lanePad);
  for (const snake of snakes) {
    snake.x = blockX + columnLeft(snake.column) + (contained ? padSide : 0);
    for (const row of snake.rows) for (const op of row.cells) if (op) op.x = snake.x + (op.col === 0 ? col2 : col3);
  }
  return { col3, containerWidth, containersWidth, blockWidth, width, blockX, gutterX };
}
