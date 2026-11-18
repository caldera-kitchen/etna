// Emitting: the placed model, written out as the layout the drawer reads. Boxes (title,
// containers, Choose frames, tables, operations), rules, captions, and every edge as a
// polyline, with the amount a quantified reference carries. Coordinates are rounded here.

import { nodeName } from '../../core/qualifier.ts';
import { cornerInset, round, sideInset } from './shapes.ts';
import { bandY, CHOOSE_BELOW, centerY, clearAbove, entryY, exitY, turnY } from './place.ts';
import { channelSide } from './routes.ts';
import { unitShown } from './sizes.ts';
import { rowOf } from './structure.ts';
import type { EdgeLabel, RowName } from './labels.ts';
import { edgeLabel, wantedAt } from './turn.ts';
import type { Arrangement, DetailedLayout, LayoutBox, LayoutEdge, Op, Placement, Point, Route, Sizes, Snake } from './types.ts';

/** Where a caption sits over its box, so a mirror can move it with the box. */
export interface CaptionAnchor {
  left: number;
  width: number;
  offset: number;
}

/** The emitted layout, in the frame, and what turning it onto the page needs. */
export interface Emitted {
  out: DetailedLayout;
  /** The amounts written, with their edges, to be moved clear once on the page. */
  written: EdgeLabel[];
  /** Each row caption's place over its box, in caption order. */
  captionAnchors: CaptionAnchor[];
  /** The names written over an operation (no ingredient box), to be moved clear once on the page. */
  names: RowName[];
}

/**
 * Write the placed chart out. Reads everything placed (`Snake.x/y`, `Row.y/height`,
 * `Op.x/y`, the routes' types, ports, lanes, drops). Changes nothing on the model. The
 * order of the arrays is the drawing order: title, containers and Choose frames, then per row
 * its tables and operations; edges from ingredients first, then every route in order;
 * captions of rows, then the amounts.
 */
export function emitLayout(sizes: Sizes, arrangement: Arrangement, routes: Route[], placement: Placement): Emitted {
  const { width } = placement.horizontal;
  const out: DetailedLayout = {
    width: round(width),
    height: round(placement.vertical.height),
    boxes: [],
    edges: [],
    title: null,
    tables: [],
    operations: [],
    containers: [],
    separators: [],
    captions: [],
  };
  emitTitle(sizes, arrangement.contained, placement, out);
  emitFrames(sizes, arrangement.snakes, placement, out);
  const { captionAnchors, names } = emitRows(sizes, arrangement.snakes, placement, out);
  const written = emitEdges(sizes, routes, placement, out);
  return { out, written, captionAnchors, names };
}

/** Add a box, rounded, to the output's boxes; returns the rounded box. */
function box(out: DetailedLayout, b: LayoutBox): LayoutBox {
  const rounded = { ...b, x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) };
  out.boxes.push(rounded);
  return rounded;
}

/** Add an edge, its points rounded. Drops repeated points and the middle of any three in a line. */
function edge(out: DetailedLayout, from: string, to: string, kind: string, points: Point[]): void {
  // Drop repeated points and the middle of any three in a line.
  const clean: Point[] = [];
  for (const p of points.map((q) => ({ x: round(q.x), y: round(q.y) }))) {
    const a = clean[clean.length - 2];
    const b = clean[clean.length - 1];
    if (b && b.x === p.x && b.y === p.y) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) clean.pop();
    clean.push(p);
  }
  out.edges.push({ from, to, kind, points: clean });
}

/** The title pill, in the frame. */
function emitTitle(sizes: Sizes, contained: boolean, placement: Placement, out: DetailedLayout): void {
  const { title, margin, mirrored, titleLeft } = sizes;
  if (!title) return;
  const { blockX, blockWidth, containersWidth, width } = placement.horizontal;
  // Centered over the chart (over the containers, not their gutter); or at the left margin.
  const center = contained ? (mirrored ? blockX + blockWidth - containersWidth / 2 : blockX + containersWidth / 2) : width / 2;
  const x = titleLeft ? margin : Math.min(Math.max(center - title.width / 2, margin), width - margin - title.width);
  out.title = {
    box: box(out, { id: 'title', kind: 'title', x, y: margin, width: title.width, height: title.height, lines: [...title.main, ...title.sub] }),
    main: title.main,
    sub: title.sub,
  };
}

/** Containers, Choose frames and the rules between a Choose's alternatives. */
function emitFrames(sizes: Sizes, snakes: Snake[], placement: Placement, out: DetailedLayout): void {
  const { t, opWidth, rowGap, captionSize } = sizes;
  const { padSide, padTop, padBottom, col2 } = placement.frame;
  const { containerWidth } = placement.horizontal;
  for (const snake of snakes) {
    if (snake.component && snake.head) {
      const top = placement.vertical.containerTops.get(snake)!;
      // A container cut by a fold has one frame over all its columns, as tall as its tallest part.
      const parts = snakes.filter((s) => s.item === snake.item);
      out.containers.push({
        box: box(out, {
          id: `component:${snake.component.heading.anchor}`,
          kind: 'component',
          x: snake.x - padSide,
          y: top,
          width: parts[parts.length - 1].x - snake.x + containerWidth,
          height: padTop + Math.max(...parts.map((s) => s.height)) + padBottom,
          lines: [sizes.labels.get(snake.component)!],
        }),
        title: sizes.labels.get(snake.component)!,
        choose: false,
        ...(snake.component.optional ? { note: sizes.mark } : {}),
      });
    }
    for (const group of snake.groups) {
      const first = snake.rows[group.start];
      const last = snake.rows[group.end];
      const x1 = snake.x - 12;
      const x2 = snake.x + col2 + opWidth + 12;
      const label = `${t.str('choose-label')} — ${nodeName(group.component)}`;
      // A caption over the first row (the first alternative's name) sits inside the box.
      const top = first.y - 22 - (first.caption ? captionSize + 4 : 0);
      out.containers.push({
        box: box(out, {
          id: `choose:${group.component.heading.anchor}`,
          kind: 'component',
          x: x1,
          y: top,
          width: x2 - x1,
          height: last.y + last.height + CHOOSE_BELOW - top,
          lines: [label],
        }),
        title: label,
        choose: true,
        ...(group.component.optional ? { note: sizes.mark } : {}),
      });
      for (const b of group.breaks) {
        const row = snake.rows[b];
        // Halfway between the row above and this row, or its caption when it has one.
        const above = row.y - rowGap - row.extra;
        const below = row.caption ? row.y - 6 - captionSize : row.y;
        const y = round((above + below) / 2);
        out.separators.push({ x1: round(x1), y1: y, x2: round(x2), y2: y });
      }
    }
  }
}

/**
 * Per row: each ingredient table (with its edge into the operation), each operation, and the
 * row's caption. Returns where each caption sits over its box, for a mirror.
 */
function emitRows(sizes: Sizes, snakes: Snake[], placement: Placement, out: DetailedLayout): { captionAnchors: CaptionAnchor[]; names: RowName[] } {
  const { t, tableInset, tableWidth, cw, space, opWidth, operationShape, point, operationRadius } = sizes;
  const captionAnchors: CaptionAnchor[] = [];
  const names: RowName[] = [];
  for (const snake of snakes) {
    for (const row of snake.rows) {
      const tops: number[] = [];
      for (const op of row.cells) {
        if (!op) continue;
        tops.push(op.y);
        if (op.size.table) {
          const tb = op.size.table;
          const y = row.y + (row.height - tb.height) / 2;
          tops.push(y);
          const id = `ingredients:${op.id}`;
          const left = snake.x + t.num('ingredient-padding-x') + tableInset;
          out.tables.push({
            box: box(out, { id, kind: 'ingredients', x: snake.x, y, width: tableWidth, height: tb.height, lines: tb.lines }),
            rows: tb.rows,
            quantityRight: round(left + tb.quantityChars * cw),
            unitLeft: round(left + (tb.quantityChars ? tb.quantityChars + space : 0) * cw),
            itemLeft: round(left + tb.itemColumn * cw),
          });
          edge(out, id, op.id, 'ingredients', [
            { x: snake.x + tableWidth, y: centerY(op) },
            { x: op.x, y: centerY(op) },
          ]);
        }
        out.operations.push({
          box: box(out, { id: op.id, kind: 'operation', x: op.x, y: op.y, width: opWidth, height: op.size.height, lines: op.size.lines }),
          checkpoints: op.size.checkpoints,
          prep: snake.prep,
          ...(op.size.mark ? { mark: op.size.mark } : {}),
        });
      }
      if (row.caption) {
        const first = row.cells[0] ?? row.cells[1]!;
        const x = first.size.table ? snake.x + 2 : first.x + cornerInset(operationShape, opWidth, first.size.height, point, operationRadius);
        const caption = { x: round(x), y: round((first.size.table ? Math.min(...tops) : first.y) - 6), text: row.caption };
        out.captions.push(caption);
        if (!first.size.table) names.push({ caption, box: out.operations.find((o) => o.box.id === first.id)!.box });
        // Over the left end of its box, which a mirror moves: remember where it sits in it.
        captionAnchors.push({ left: first.size.table ? snake.x : first.x, width: first.size.table ? tableWidth : opWidth, offset: x - (first.size.table ? snake.x : first.x) });
      }
    }
  }
  return { captionAnchors, names };
}

// ------------------------------------------------------------------ edges

const cx = (sizes: Sizes, op: Op): number => op.x + sizes.opWidth / 2;
const tip = (sizes: Sizes, op: Op, side: 'left' | 'right'): Point => ({ x: side === 'left' ? op.x : op.x + sizes.opWidth, y: centerY(op) });
const bottom = (op: Op): number => op.y + op.size.height;
const laneX = (sizes: Sizes, placement: Placement, r: Route): number =>
  (r.type === 'lane' ? r.from.snake.x + placement.frame.col2 + sizes.opWidth + sizes.lanePad : placement.horizontal.gutterX[r.from.snake.column]) + r.lane * sizes.laneGap;
/** The lane an edge comes in from: its own, or, when it passes over the top, the one it comes down. */
const lane2X = (sizes: Sizes, placement: Placement, r: Route): number =>
  r.via < 0 ? laneX(sizes, placement, r) : placement.horizontal.gutterX[r.via] + r.lane2 * sizes.laneGap;
const entrySide = (r: Route): 'left' | 'right' => (r.type === 'lane' ? channelSide(r.to) : r.side);

/** Where an edge comes into a node it shares with others from one side (`join-edges: separate`). */
type EntryAt = Map<Route, { dy: number; dx: number; y: number }>;

/**
 * `join-edges: separate`: each joining edge's own point of entry, where several come into one
 * node from one side. Reads the routes, their lanes and heights. Returns the offsets by route.
 */
function separateEntries(sizes: Sizes, routes: Route[], placement: Placement): EntryAt {
  const { t, laneGap, opWidth, flatHalf, portOffset } = sizes;
  // `join-edges: separate`: edges that come into one node from one side each take their own
  // point there. Through the tip, they spread up and down the node's side; through the top,
  // along its flat part, each turning in at its own height. The edge in the lane nearest the
  // node takes the highest point (and, through the top, the one furthest in), so no two cross.
  const entryAt: EntryAt = new Map();
  if (!sizes.separate) return entryAt;
  const joins = new Map<string, Route[]>();
  for (const r of routes) {
    if (r.type !== 'lane' && r.type !== 'gutter') continue;
    if (r.drop) continue;
    // Through the top: the spine where a fold cut it (`top`) with the edges that join beside it.
    const key = `${r.to.id}|${r.entry === 'tip' ? 'tip' : 'top'}|${entrySide(r)}`;
    joins.set(key, [...(joins.get(key) ?? []), r]);
  }
  // Edges that come in through the top, by the row they come into and the side they come
  // from: each runs at its own height, whichever node of the row it is for.
  const overTop = new Map<string, { to: Op; ordered: Route[] }[]>();
  const dxOf = new Map<Route, number>();
  for (const list of joins.values()) {
    const n = list.length;
    const to = list[0].to;
    if (n < 2 && list[0].entry === 'tip') continue;
    const side = entrySide(list[0]);
    const near = (r: Route): number => Math.abs(lane2X(sizes, placement, r) - (side === 'right' ? to.x + opWidth : to.x));
    const fromBelow = (r: Route): boolean => turnY(sizes, r) > entryY(sizes, r);
    // Top to bottom: edges from above, nearest lane first; then edges from below, furthest first.
    // The cut spine first: it comes in at the middle, further in than any other, so it runs highest.
    const joining = list.filter((r) => r.entry !== 'top');
    const ordered = [
      ...list.filter((r) => r.entry === 'top'),
      ...joining.filter((r) => !fromBelow(r)).sort((a, b) => near(a) - near(b)),
      ...joining.filter(fromBelow).sort((a, b) => near(b) - near(a)),
    ];
    if (list[0].entry === 'tip') {
      // Far enough apart that the arrowheads do not touch, within the middle of the side.
      const step = Math.min(Math.max(laneGap, 2 * t.num('arrow-width')), (to.size.height * 0.7) / (n - 1));
      ordered.forEach((r, k) => entryAt.set(r, { dy: (k - (n - 1) / 2) * step, dx: 0, y: 0 }));
      continue;
    }
    if (n >= 2) {
      // Along the flat top, from the usual port outwards (away from a spine edge at the
      // center), or back toward the center when the flat part is too short.
      const hi = flatHalf - 6;
      let lo = portOffset;
      if ((hi - lo) / (n - 1) < laneGap * 0.6) lo = Math.max(10, hi - (n - 1) * laneGap);
      const dxStep = Math.max(0, Math.min(laneGap, (hi - lo) / (n - 1)));
      ordered.forEach((r, k) => dxOf.set(r, lo + k * dxStep - portOffset));
    }
    const key = `${to.snake.item}|${to.snake.column}|${to.row}|${side}`;
    overTop.set(key, [...(overTop.get(key) ?? []), { to, ordered }]);
  }
  for (const groups of overTop.values()) {
    // The node furthest in first: its edges run over the nearer node's, so they run highest.
    const side = entrySide(groups[0].ordered[0]);
    const all = groups.sort((a, b) => (side === 'left' ? b.to.x - a.to.x : a.to.x - b.to.x)).flatMap((g) => g.ordered);
    const n = all.length;
    if (n < 2) continue;
    const to = all[0].to;
    const room = clearAbove(sizes, to) - (rowOf(to).y - entryY(sizes, all[0])) - 8;
    const yStep = Math.max(0, Math.min(8, room / (n - 1)));
    all.forEach((r, k) => entryAt.set(r, { dy: 0, dx: dxOf.get(r) ?? 0, y: entryY(sizes, r) - (n - 1 - k) * yStep }));
  }
  return entryAt;
}

/** A route's polyline, before rounding. */
function routePoints(sizes: Sizes, placement: Placement, r: Route, entryAt: EntryAt): Point[] {
  const { turnDepth, portOffset, operationShape, point, operationRadius } = sizes;
  const { from, to } = r;
  if (r.type === 'vertical') {
    return to.row > from.row
      ? [{ x: cx(sizes, from), y: bottom(from) }, { x: cx(sizes, to), y: to.y }]
      : [{ x: cx(sizes, from), y: from.y }, { x: cx(sizes, to), y: bottom(to) }];
  }
  if (r.type === 'hop') {
    if (r.turn) {
      const y = rowOf(from).y + rowOf(from).height + turnDepth;
      return [{ x: cx(sizes, from), y: bottom(from) }, { x: cx(sizes, from), y }, { x: cx(sizes, to), y }, { x: cx(sizes, to), y: bottom(to) }];
    }
    // Along the row: both ends at the source's height. The two nodes are centered in one row,
    // so their middles are the same height, but each computed from its own node they can
    // round 0.01 apart and the edge would be drawn as a slant.
    const y = centerY(from);
    const ends = from.col === 0 ? [tip(sizes, from, 'right'), tip(sizes, to, 'left')] : [tip(sizes, from, 'left'), tip(sizes, to, 'right')];
    return ends.map((p) => ({ x: p.x, y }));
  }
  if (r.drop) {
    // Along the source's row to the node's center line, then straight down into its top.
    const x = cx(sizes, to);
    const fromX = cx(sizes, from) + portOffset;
    return [
      ...(r.exit === 'tip'
        ? [tip(sizes, from, 'right'), { x, y: centerY(from) }]
        : [{ x: fromX, y: bottom(from) }, { x: fromX, y: exitY(sizes, r) }, { x, y: exitY(sizes, r) }]),
      { x, y: to.y },
    ];
  }
  // Out to a lane (between the columns, or the gutter beside the containers), along it,
  // and in.
  const inside = r.type === 'lane';
  const lane = laneX(sizes, placement, r);
  const lane2 = lane2X(sizes, placement, r);
  const fromSide = inside ? channelSide(from) : 'right';
  const toSide = entrySide(r);
  const sign = toSide === 'right' ? 1 : -1;
  const at = entryAt.get(r);
  const away = r.fork;
  const fromX = r.exit === 'bottom' ? cx(sizes, from) : cx(sizes, from) + (fromSide === 'right' ? 1 : -1) * (portOffset + (away?.dx ?? 0));
  // Where it leaves: off the tip (at its own height on the side, stopping at the outline), or
  // down from the bottom to the height it turns at.
  const start = tip(sizes, from, fromSide);
  if (away && away.dy !== 0) {
    start.y += away.dy;
    start.x += (fromSide === 'right' ? -1 : 1) * sideInset(operationShape, from.size.height, point, operationRadius, Math.abs(away.dy));
  }
  let outY = r.exit === 'tip' ? start.y : turnY(sizes, r);
  const toX = r.entry === 'top' ? cx(sizes, to) : cx(sizes, to) + sign * (portOffset + (at?.dx ?? 0));
  let entry: Point[];
  if (r.entry === 'tip') {
    const end = tip(sizes, to, toSide);
    if (at && at.dy !== 0) {
      // Off the tip, the edge stops at the node's outline.
      end.y += at.dy;
      end.x -= sign * sideInset(operationShape, to.size.height, point, operationRadius, Math.abs(at.dy));
    }
    entry = [{ x: lane2, y: end.y }, end];
    // A forking edge out at one height and in at another less than a point away: it leaves at
    // the height it comes in by (its own point of exit moved that little along the side).
    if (away && r.via < 0 && Math.abs(outY - end.y) < 1) {
      outY = end.y;
      if (r.exit === 'tip') {
        start.y = end.y;
        start.x = tip(sizes, from, fromSide).x + (fromSide === 'right' ? -1 : 1) * sideInset(operationShape, from.size.height, point, operationRadius, Math.abs(end.y - centerY(from)));
      }
    }
  } else {
    let y = at?.y ?? entryY(sizes, r);
    // Out at one height and in at another less than a point away (Italian Wedding Soup's
    // meatballs, dense, three columns): run in at the height it left by, not with a step
    // too small to see.
    if (r.via < 0 && Math.abs(outY - y) < 1) y = outY;
    entry = [{ x: lane2, y }, { x: toX, y }, { x: toX, y: to.y }];
  }
  return [
    ...(r.exit === 'tip' ? [start, { x: lane, y: outY }] : [{ x: fromX, y: bottom(from) }, { x: fromX, y: outY }, { x: lane, y: outY }]),
    // Over the top: up its own gutter, along the band, down the gutter beside its target.
    ...(r.via < 0 ? [] : [{ x: lane, y: bandY(sizes, placement.vertical, r) }, { x: lane2, y: bandY(sizes, placement.vertical, r) }]),
    ...entry,
  ];
}

/**
 * Every route as an edge, in order, with a quantified reference's amount written as a caption.
 * Returns the amounts written, with their edges.
 */
function emitEdges(sizes: Sizes, routes: Route[], placement: Placement, out: DetailedLayout): EdgeLabel[] {
  const { t, captionSize } = sizes;
  const entryAt = separateEntries(sizes, routes, placement);
  const written: EdgeLabel[] = [];
  for (const r of routes) {
    const points = routePoints(sizes, placement, r, entryAt);
    edge(out, r.from.id, r.to.id, r.edge.kind, points);
    // A quantified reference says how much of the component's output enters: write it
    // beside the line, where `wantedAt` says (clearCaptions, on the page, keeps it inside the
    // frame the edge starts in and moves it when that place has no room).
    const q = r.edge.kind === 'reference' ? r.edge.reference?.quantity : null;
    if (q && points.length >= 2) {
      const unitText = r.edge.reference?.unit ? unitShown(r.edge.reference.unit.def, q.min.value) : '';
      const label = `${q.raw}${unitText ? ` ${unitText}` : ''}`;
      const e = out.edges[out.edges.length - 1];
      const at = wantedAt(e.points, t.num('edge-label-at'), t.num('edge-label-short'), t.num('edge-label-within'));
      const caption = edgeLabel(e.points, label, at, captionSize);
      out.captions.push(caption);
      written.push({ caption, edge: e });
    }
  }
  return written;
}
