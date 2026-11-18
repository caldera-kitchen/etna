// Turning: what happens to the emitted layout on its way onto the page. With
// `ingredient-side: right`, the chart is mirrored, and a container's name an edge runs through
// moves clear of it. Last, on the page, an amount whose spot is not clear moves along its edge
// (labels.ts); that is left to the caller, which does it only for the layout it keeps.

import { clearCaptions } from './labels.ts';
import { round } from './shapes.ts';
import type { CaptionAnchor, Emitted } from './emit.ts';
import type { DetailedLayout, Horizontal, LayoutBox, Point, Sizes } from './types.ts';

/** A layout on the page, and the step that moves its captions clear. */
export interface OnPage {
  out: DetailedLayout;
  /**
   * Move every name and amount that is not clear (labels.ts). It moves captions alone, and
   * nothing else on the chart reads where a caption is, so it can wait until a layout is kept:
   * the fit and the lanes' second order choose by size and edges, never by captions.
   */
  clearCaptions: () => void;
}

/**
 * Take the emitted layout onto the page: mirrored, mirror it and move the containers' names
 * that edges run through. Changes `emitted.out` in place and returns it, with the step that
 * moves its captions clear.
 */
export function toPage(sizes: Sizes, emitted: Emitted, horizontal: Horizontal): OnPage {
  const { mirrored } = sizes;
  const { out, captionAnchors } = emitted;
  if (mirrored) {
    mirror(out, horizontal.blockX, horizontal.blockWidth, captionAnchors);
    // Turned over, an edge into a container can run down through its name, which stays at the
    // left of the frame's top: that name moves along the border.
    nameInsets(sizes, out);
  }
  // On the page, with everything in its place: a name over a node that is not clear moves
  // along the node's top, an amount that is not clear along its edge.
  return { out, clearCaptions: () => clearCaptions(sizes, out, emitted.names, [...emitted.written]) };
}

/**
 * Mirrored: the name pills' insets. Reads the mirrored containers and edges. Writes `inset` on
 * a container whose name an edge runs through, and so moved.
 */
export function nameInsets(sizes: Sizes, out: DetailedLayout): void {
  const { t, captionSize } = sizes;
  // An edge into a container comes in through its top, where the name sits: move the name
  // along the border, right of every edge that crosses it there.
  const nameMeasure = t.measure(t.num('font-weight'));
  for (const c of out.containers) {
    const size = c.choose ? captionSize : t.num('component-title-font-size');
    const w = nameMeasure(c.title) * size * t.num('char-width') + 2 * (size * 0.9);
    const top = c.box.y;
    // The pill as svg.ts `legendBox` draws it; an edge through it as check.ts reads one.
    const h = size + 11;
    const pill = { x: c.box.x + (c.inset ?? (c.choose ? 14 : 18)), y: top - h / 2, width: w, height: h };
    const through = out.edges.some((e) =>
      e.points.slice(1).some((q, i) => {
        const p = e.points[i];
        return Math.min(p.x, q.x) < pill.x + pill.width - 1 && Math.max(p.x, q.x) > pill.x + 1 && Math.min(p.y, q.y) < pill.y + pill.height - 1 && Math.max(p.y, q.y) > pill.y + 1;
      }),
    );
    if (!through) continue;
    const crossings = out.edges.flatMap((e) =>
      e.points.slice(1).flatMap((q, i) => {
        const p = e.points[i];
        return p.x === q.x && Math.min(p.y, q.y) < top + 12 && Math.max(p.y, q.y) > top - 12 && p.x > c.box.x && p.x < c.box.x + c.box.width ? [p.x] : [];
      }),
    );
    const usual = c.choose ? 14 : 18;
    const sorted = [...crossings].sort((a, b) => a - b);
    let inset = usual;
    for (const x of sorted) if (x > c.box.x + inset - 8 && x < c.box.x + inset + w + 8) inset = x - c.box.x + 12;
    // Past the end of the border: before the first crossing instead, when there is room.
    if (inset + w > c.box.width - 8 && sorted.length > 0 && sorted[0] - c.box.x - 12 - w >= 4) inset = sorted[0] - c.box.x - 12 - w;
    if (inset !== usual) c.inset = round(inset);
  }
}

/** The length of an edge: its runs end to end. */
export function edgeLength(points: Point[]): number {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
}

/**
 * Does the edge join neighboring boxes? It does when it is up to `short` long
 * (`edge-label-short`); with `short` 0 no edge does.
 */
export function joinsNeighbors(points: Point[], short: number): boolean {
  return short > 0 && edgeLength(points) <= short;
}

/**
 * Where along the edge, 0 to 1, a quantified reference's amount is wanted: `at`
 * (`edge-label-at`) on an edge that joins neighboring boxes (`joinsNeighbors`); on a longer
 * one, no farther than `within` (`edge-label-within`) from where the edge starts, `0` for no
 * limit.
 */
export function wantedAt(points: Point[], at: number, short: number, within: number): number {
  const f = Math.min(Math.max(at, 0), 1);
  if (joinsNeighbors(points, short)) return f;
  const total = edgeLength(points);
  return within > 0 && total > 0 ? Math.min(f, within / total) : f;
}

/**
 * Where a quantified reference's amount is written: part way along the edge (`at`, 0 = source,
 * 1 = arrowhead), beside the line: to the right of a vertical run, above a horizontal one.
 */
export function edgeLabel(points: Point[], label: string, at: number, captionSize: number): DetailedLayout['captions'][number] {
  let along = Math.min(Math.max(at, 0), 1) * edgeLength(points);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (along > len && i < points.length - 1) {
      along -= len;
      continue;
    }
    const f = len === 0 ? 0 : along / len;
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    if (Math.abs(b.x - a.x) < 0.01) return { x: round(x + 6), y: round(y + captionSize * 0.35), text: label, anchor: 'start', edge: true };
    return { x: round(x), y: round(y - 5), text: label, anchor: 'middle', edge: true };
  }
  return { x: points[0].x, y: points[0].y, text: label, anchor: 'middle', edge: true };
}

/**
 * Turn the chart over within its block, for `ingredient-side: right`: every box,
 * edge, rule and caption moves; text stays as it reads, and the title stays where it is.
 */
export function mirror(out: DetailedLayout, blockX: number, blockWidth: number, anchors: CaptionAnchor[]): void {
  const axis = 2 * blockX + blockWidth;
  const moved = new Map<LayoutBox, number>();
  for (const b of out.boxes) {
    if (b.kind === 'title') continue;
    const x = round(axis - b.x - b.width);
    moved.set(b, x - b.x);
    b.x = x;
  }
  for (const table of out.tables) {
    const shift = moved.get(table.box)!;
    table.quantityRight = round(table.quantityRight + shift);
    table.unitLeft = round(table.unitLeft + shift);
    table.itemLeft = round(table.itemLeft + shift);
  }
  let k = 0;
  for (const c of out.captions) {
    if (c.edge) {
      c.x = round(axis - c.x);
      c.anchor = c.anchor === 'end' ? 'start' : c.anchor === 'start' ? 'end' : c.anchor;
      continue;
    }
    const a = anchors[k++];
    c.x = round(axis - a.left - a.width + a.offset);
  }
  out.separators = out.separators.map((s) => ({ ...s, x1: round(axis - s.x2), x2: round(axis - s.x1) }));
  for (const e of out.edges) e.points = e.points.map((p) => ({ x: round(axis - p.x), y: p.y }));
}
