// Captions that can move, once the chart is on the page. A branch's or a Choose alternative's
// name is first written over a node with no ingredient box, over the node's left corner; when
// that spot is not clear, it moves along the node's top (to end left of the edge that comes
// down into the node, or start right of it, or end at the node's right corner). "Clear" is
// what the geometry check (check.ts) reads: the text's box touches no line, no box, no frame's
// border, no name pill, no other caption, and lies on the canvas.
//
// A quantified reference's amount is written where it is wanted (`wantedAt`: halfway along an
// edge between neighboring boxes, near the start of a longer one, and then inside the frame
// the edge starts in, `wantedInside`), beside the line. It needs more than clear: `CLEAR`
// units of room from everything but its own edge, which it may come as near as any spot
// does, and the chart's outer edge, which it only has to lie within. Without that room it is
// tried on the other side of the line at the same place, then slides along its edge to the
// nearest spot with room.

import { legendBox } from '../svg.ts';
import type { ThemeReader } from '../theme.ts';
import { round } from './shapes.ts';
import { edgeLabel, joinsNeighbors, wantedAt } from './turn.ts';
import type { DetailedLayout, LayoutBox, LayoutEdge, Point, Sizes } from './types.ts';

type Caption = DetailedLayout['captions'][number];

/** An amount written on an edge: its caption and the edge it belongs to. */
export interface EdgeLabel {
  caption: Caption;
  edge: LayoutEdge;
}

/** A name written over an operation that has no ingredient box: its caption and the node. */
export interface RowName {
  caption: Caption;
  box: LayoutBox;
}

interface R {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The check's tolerance for touching borders (check.ts `E`). */
const E = 0.6;
/** How far apart the spots tried along an edge are. */
const STEP = 4;
/** A name's spot that is not where it was first written keeps this much further from anything; an amount keeps this near its own edge. */
const PAD = 1.5;
/** An amount keeps this much room from every line, box, frame's border and text but its own edge. */
export const CLEAR = 5;

const overlap = (a: R, b: R, pad: number): boolean =>
  a.x < b.x + b.width - E + pad && b.x < a.x + a.width - E + pad && a.y < b.y + b.height - E + pad && b.y < a.y + a.height - E + pad;
const inside = (a: R, b: R, pad: number): boolean =>
  a.x >= b.x - E + pad && a.y >= b.y - E + pad && a.x + a.width <= b.x + b.width + E - pad && a.y + a.height <= b.y + b.height + E - pad;
/** Does the segment reach into the rectangle (grown by `pad`)? As the check's `segHits` with no pad. */
const segHits = (p: Point, q: Point, b: R, pad: number): boolean =>
  Math.min(p.x, q.x) < b.x + b.width + pad && Math.max(p.x, q.x) > b.x - pad && Math.min(p.y, q.y) < b.y + b.height + pad && Math.max(p.y, q.y) > b.y - pad;

/** The box a line runs within. */
const boundsOf = (p: Point, q: Point): R => ({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), width: Math.abs(q.x - p.x), height: Math.abs(q.y - p.y) });

/** The side of a cell that things are filed by, in chart units: a few captions' height, so a spot looks in a few cells. */
const CELL = 48;
/** The most cells a chart is cut into: past it the cells grow, so a huge chart takes no more memory. */
const MAX_CELLS = 100_000;

/**
 * Things filed by the square cells of the chart that their bounds reach, so that a caption's
 * box is tested only against what is filed in the cells it reaches. Two boxes that touch share
 * a point, and that point lies in a cell both reach, so nothing that could touch is left out.
 * Bounds past the chart's edge are filed in its edge cells: clamping keeps that true, since it
 * never moves a point to the other side of another.
 */
class Cells {
  private readonly side: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly cells: number[][];
  /** When each thing was last found, so a thing filed in several cells is found once. */
  private readonly lastFound: number[] = [];
  private search = 0;

  constructor(width: number, height: number) {
    this.side = Math.max(CELL, Math.sqrt((width * height) / MAX_CELLS) || 0);
    this.columns = Math.max(1, Math.ceil(width / this.side));
    this.rows = Math.max(1, Math.ceil(height / this.side));
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
  }

  /** The cells from `lo` to `hi` along one side of the chart, clamped to the chart. */
  private span(lo: number, hi: number, count: number): [number, number] {
    const clamp = (v: number): number => Math.min(count - 1, Math.max(0, Math.floor(v / this.side)));
    return [clamp(lo), clamp(hi)];
  }

  /** Every cell the bounds, grown by `margin` on each side, reach. */
  private each(r: R, margin: number, visit: (cell: number[]) => void): void {
    const [x0, x1] = this.span(r.x - margin, r.x + r.width + margin, this.columns);
    const [y0, y1] = this.span(r.y - margin, r.y + r.height + margin, this.rows);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) visit(this.cells[y * this.columns + x]);
  }

  /** File a thing in every cell its bounds reach. */
  add(id: number, bounds: R): void {
    this.each(bounds, 0, (cell) => cell.push(id));
  }

  /** Take a thing out of the cells it was filed in, by the same bounds. */
  remove(id: number, bounds: R): void {
    this.each(bounds, 0, (cell) => cell.splice(cell.indexOf(id), 1));
  }

  /**
   * Every thing filed in a cell that the box, grown by `margin`, reaches, each once. A test
   * with pad `margin` (and the check's tolerance, which only shrinks it) touches nothing
   * outside that grown box.
   */
  near(r: R, margin: number, found: (id: number) => void): void {
    const search = ++this.search;
    this.each(r, margin, (cell) => {
      for (const id of cell) {
        if (this.lastFound[id] === search) continue;
        this.lastFound[id] = search;
        found(id);
      }
    });
  }
}

type Spot = { x: number; y: number; anchor: Caption['anchor'] };

/**
 * Move every name that is not clear to the first clear spot over its node. Write every amount
 * where it is wanted (`wantedAt`, `wantedInside`) and, when it has not `CLEAR` units of room
 * there, move it to the spot with room along its edge nearest that place, the other side of
 * the line first. When there is none, either moves to the spot that touches the fewest things,
 * if it touches fewer than where it is. A caption already clear does not move. Changes the
 * captions in place.
 */
export function clearCaptions(sizes: Sizes, out: DetailedLayout, names: RowName[], labels: EdgeLabel[]): void {
  if (labels.length === 0 && names.length === 0) return;
  const { t, captionSize: cap } = sizes;
  const measure = t.measure(t.num('font-weight'));
  // Each caption's width, measured once: every spot tried for every caption is checked against
  // every other caption, and a recipe's amounts can be long, so measuring there each time made
  // a large recipe take minutes (tests/dag/labels.test.ts). A caption's text never changes here.
  const widths = new Map<string, number>();
  const textWidth = (text: string): number => {
    let w = widths.get(text);
    if (w === undefined) {
      w = measure(text) * cap * t.num('char-width');
      widths.set(text, w);
    }
    return w;
  };
  const rectOf = (c: { x: number; y: number; anchor?: Caption['anchor'] }, w: number): R => {
    const x = c.anchor === 'middle' ? c.x - w / 2 : c.anchor === 'end' ? c.x - w : c.x;
    return { x, y: c.y - cap * 0.75, width: w, height: cap * 0.95 };
  };

  const solid: R[] = [...out.operations.map((o) => o.box), ...out.tables.map((x) => x.box), ...(out.title ? [out.title.box] : [])];
  const frames: R[] = out.containers.map((c) => c.box);
  const pills: R[] = out.containers.map((c) => {
    // As svg.ts draws it.
    const l = legendBox(c.box, c.title, c.choose ? cap : t.num('component-title-font-size'), c.inset ?? (c.choose ? 14 : 18), t, c.note);
    return { x: l.x, y: l.y, width: l.width, height: l.height };
  });
  const canvas: R = { x: 0, y: 0, width: out.width, height: out.height };
  const segments = out.edges.flatMap((e) => e.points.slice(1).map((q, k) => ({ p: e.points[k], q, edge: e })));

  // What never moves, filed by where it lies: each thing with the test that says whether a
  // caption's box touches it. A box, a pill, a frame (touched when crossed, not when the
  // caption lies wholly within it) and a line, as the check reads them; a line with its edge.
  const fixed: { tests: (r: R, pad: number) => boolean; edge?: LayoutEdge }[] = [];
  const fixedCells = new Cells(out.width, out.height);
  const file = (bounds: R, tests: (r: R, pad: number) => boolean, edge?: LayoutEdge): void => fixedCells.add(fixed.push({ tests, edge }) - 1, bounds);
  for (const s of solid) file(s, (r, pad) => overlap(r, s, pad));
  for (const p of pills) file(p, (r, pad) => overlap(r, p, pad));
  for (const f of frames) file(f, (r, pad) => overlap(r, f, pad) && !inside(r, f, pad));
  for (const { p, q, edge } of segments) file(boundsOf(p, q), (r, pad) => segHits(p, q, r, pad), edge);

  // Where each caption's text lies, filed by where it lies and kept until the caption moves.
  // (A caption listed twice is filed twice, and counted twice, as it always was.)
  const captions = out.captions;
  const placed = captions.map((c) => rectOf(c, textWidth(c.text)));
  const captionCells = new Cells(out.width, out.height);
  placed.forEach((r, i) => captionCells.add(i, r));

  /**
   * How many things the text's box, grown by `pad`, touches (0: clear). Only what is filed
   * near the box is tested, with the same test as against everything: what lies farther away
   * cannot touch it, so the count is the same. An amount (`own`, its edge) is tested against
   * its own edge with no more than `PAD`, and against the chart's outer edge with none.
   */
  const touches = (self: Caption, r: R, pad: number, own?: LayoutEdge): number => {
    let n = 0;
    // The check's tolerance lets a box, a pill, a frame or a caption come `E` nearer than
    // `pad`; an amount's room is measured in full, to the hundredth the chart is drawn to.
    const full = own ? pad + E - 0.01 : pad;
    fixedCells.near(r, full, (i) => {
      const edge = fixed[i].edge;
      if (fixed[i].tests(r, edge ? (own && edge === own ? Math.min(pad, PAD) : pad) : full)) n++;
    });
    captionCells.near(r, full, (i) => {
      if (captions[i] !== self && overlap(r, placed[i], full)) n++;
    });
    if (!inside(r, canvas, own ? 0 : pad)) n++;
    return n;
  };

  /** Write the caption at this spot, and file it there. */
  const put = (caption: Caption, spot: { x: number; y: number; anchor?: Caption['anchor'] }, w: number): void => {
    caption.x = spot.x;
    caption.y = spot.y;
    caption.anchor = spot.anchor;
    captions.forEach((c, i) => {
      if (c !== caption) return;
      captionCells.remove(i, placed[i]);
      placed[i] = rectOf(caption, w);
      captionCells.add(i, placed[i]);
    });
  };

  /**
   * Move the caption to the first spot with room, or the least bad if better than where it
   * is. A name needs to be clear where it is and `PAD` clear at another spot; an amount
   * (`own`, its edge) needs `CLEAR` everywhere.
   */
  const move = (caption: Caption, spots: Spot[], own?: LayoutEdge): void => {
    const w = textWidth(caption.text);
    const now = touches(caption, rectOf(caption, w), own ? CLEAR : 0, own);
    if (now === 0) return;
    let best: (Spot & { n: number }) | null = null;
    for (const spot of spots) {
      const n = touches(caption, rectOf(spot, w), own ? CLEAR : PAD, own);
      if (!best || n < best.n) best = { ...spot, n };
      if (n === 0) break;
    }
    if (!best || best.n >= now) return;
    put(caption, best, w);
  };
  for (const { caption, box } of names) move(caption, spotsOver(box, caption, segments));
  for (const { caption, edge } of labels) {
    const w = textWidth(caption.text);
    const at = amountAt(edge.points, t, frames, w / 2 + CLEAR);
    put(caption, edgeLabel(edge.points, caption.text, at, cap), w);
    move(caption, spotsAlong(edge.points, cap, at), edge);
  }
}

/**
 * Where along its edge, 0 to 1, an amount is wanted, on the page: `wantedAt`, and on an edge
 * that does not join neighboring boxes, `wantedInside` the frame the edge starts in, the amount
 * taking `margin` to each side.
 */
function amountAt(points: Point[], t: ThemeReader, frames: R[], margin: number): number {
  const short = t.num('edge-label-short');
  const at = wantedAt(points, t.num('edge-label-at'), short, t.num('edge-label-within'));
  return joinsNeighbors(points, short) ? at : wantedInside(points, at, frames, margin);
}

/**
 * `at` (0 to 1 along the edge), pulled back so that the amount, `margin` to each side of its
 * place, is written before the edge leaves the innermost frame its first point lies in.
 * Unchanged when the edge starts in no frame, never leaves it, or leaves it too soon for the
 * amount to fit between the edge's start and the frame's border (`2 * margin`).
 */
export function wantedInside(points: Point[], at: number, frames: R[], margin: number): number {
  const holds = (f: R, p: Point): boolean => p.x >= f.x - E && p.x <= f.x + f.width + E && p.y >= f.y - E && p.y <= f.y + f.height + E;
  const frame = frames.filter((f) => holds(f, points[0])).sort((p, q) => p.width * p.height - q.width * q.height)[0];
  if (!frame) return at;
  const lengths = points.slice(1).map((q, k) => Math.hypot(q.x - points[k].x, q.y - points[k].y));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  let along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!holds(frame, b)) {
      // Where the run from a (inside) to b (outside) crosses the frame's border.
      const fx = b.x > frame.x + frame.width ? (frame.x + frame.width - a.x) / (b.x - a.x) : b.x < frame.x ? (frame.x - a.x) / (b.x - a.x) : 1;
      const fy = b.y > frame.y + frame.height ? (frame.y + frame.height - a.y) / (b.y - a.y) : b.y < frame.y ? (frame.y - a.y) / (b.y - a.y) : 1;
      const exit = along + Math.min(fx, fy) * lengths[i - 1];
      if (total === 0 || exit < 2 * margin) return at;
      return Math.min(at, (exit - margin) / total);
    }
    along += lengths[i - 1];
  }
  return at;
}

/**
 * The spots over a node where its name could be written, at the height it has: ending left of
 * an edge that comes down into the node's top, or starting right of it (the nearest the
 * node's middle first), then ending at the node's right corner, as far in as it starts.
 */
export function spotsOver(box: LayoutBox, caption: Caption, segments: { p: Point; q: Point }[]): Spot[] {
  const y = caption.y;
  const lines = [
    ...new Set(
      segments
        .filter((s) => s.p.x === s.q.x && s.p.x > box.x && s.p.x < box.x + box.width && Math.max(s.p.y, s.q.y) >= box.y - 1 && Math.min(s.p.y, s.q.y) < y)
        .map((s) => s.p.x),
    ),
  ].sort((a, b) => Math.abs(a - (box.x + box.width / 2)) - Math.abs(b - (box.x + box.width / 2)) || a - b);
  const inset = caption.x - box.x;
  return [
    ...lines.flatMap((x): Spot[] => [
      { x: round(x - 6), y, anchor: 'end' },
      { x: round(x + 6), y, anchor: 'start' },
    ]),
    { x: round(box.x + box.width - inset), y, anchor: 'end' },
  ];
}

/**
 * The spots beside an edge where its amount could be written: every few units back along each
 * run from the arrowhead, on both sides (right then left of a vertical run, above then below a
 * horizontal one), placed as `edgeLabel` places them. They come nearest `at` first, measured
 * along the edge (0 at the source, 1 at the arrowhead, as `edge-label-at`); spots equally near
 * keep that order. At 1 the order is the walk's own: nearest the arrowhead first.
 */
export function spotsAlong(points: Point[], cap: number, at = 1): { x: number; y: number; anchor: Caption['anchor'] }[] {
  const lengths = points.slice(1).map((q, k) => Math.hypot(q.x - points[k].x, q.y - points[k].y));
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const want = Math.min(Math.max(at, 0), 1) * total;
  const spots: { x: number; y: number; anchor: Caption['anchor']; off: number }[] = [];
  let after = 0; // the length of the edge from this run's end to the arrowhead
  for (let i = points.length - 1; i >= 1; i--) {
    const a = points[i - 1];
    const b = points[i];
    const len = lengths[i - 1];
    if (len === 0) continue;
    const vertical = Math.abs(b.x - a.x) < 0.01;
    for (let d = 0; d <= len; d += STEP) {
      const x = b.x + ((a.x - b.x) * d) / len;
      const y = b.y + ((a.y - b.y) * d) / len;
      // To a thousandth of a unit, so a spot met twice where two runs join ties exactly.
      const off = Math.round(Math.abs(total - want - after - d) * 1000) / 1000;
      if (vertical) {
        spots.push({ x: round(x + 6), y: round(y + cap * 0.35), anchor: 'start', off });
        spots.push({ x: round(x - 6), y: round(y + cap * 0.35), anchor: 'end', off });
      } else {
        spots.push({ x: round(x), y: round(y - 5), anchor: 'middle', off });
        spots.push({ x: round(x), y: round(y + 5 + cap * 0.55), anchor: 'middle', off });
      }
    }
    after += len;
  }
  // Nearest where the amount is meant to be first; spots equally near keep the order above.
  return spots
    .map((spot, k) => ({ spot, k }))
    .sort((p, q) => p.spot.off - q.spot.off || p.k - q.k)
    .map(({ spot }) => ({ x: spot.x, y: spot.y, anchor: spot.anchor }));
}
