// The geometry check of a laid-out chart: what a reader would see as a fault on the page.
// Pure and browser-safe (no Node imports): the engine may call it as a debug assertion, the
// tests run it on every example, and scripts run it over a corpus.
//
// It reads only the finished `DetailedLayout` (and, for `frame-membership`, the recipe's
// component tree), so it holds for any arrangement: one column or several, frames spanning
// columns, edges in vertical gutters or horizontal bands. Nothing in it assumes one
// ingredient-box x per chart, or containers in one or two stacks.
//
// "Solid" below means an operation node, an ingredient box or the title. A "frame" is a
// container: a component's frame (`component:…`) or a Choose group's (`choose:…`). A "pill"
// is a frame's name, drawn on its top border (svg.ts `legendBox`).
//
// The rules, each a `Flaw.rule`:
//
//   off-canvas             A box (solid or frame) is not wholly inside the canvas.
//   boxes-overlap          Two solid boxes overlap.
//   box-crosses-frame      A solid box overlaps a frame without lying wholly inside it.
//   frames-cross           Two frames overlap without one lying wholly inside the other.
//   frame-membership       A step's node or ingredient box is outside a drawn frame of a component it belongs to, or wholly inside a non-Choose frame of a component it does not belong to.
//   pill-on-box            A frame's name pill overlaps a solid box.
//   pill-off-canvas        A frame's name pill is not wholly inside the canvas.
//   pill-long              A frame's name pill runs past the right end of its frame.
//   pills-overlap          Two name pills overlap.
//   diagonal-segment       An edge has a segment that is neither horizontal nor vertical.
//   edge-through-box       An edge segment passes through a solid box (its own ends excepted at its first and last segment).
//   edge-through-pill      An edge segment passes through a name pill.
//   edge-through-frame     An edge crosses the border of a frame that holds neither its source nor its target.
//   edges-share-line       Two edges run along one line, level or upright, less than 3 units apart, for more than 2 units, though they share neither their source nor (joined `bus`) their target.
//   edge-on-frame          An edge segment runs along a frame's border, level or upright, on it or within 2 units of it, for more than 2 units.
//   edge-near-box          An edge segment comes within 4 units of a solid box it neither starts nor ends at, without passing through it.
//   caption-on-box         A caption's text overlaps a solid box.
//   caption-on-pill        A caption's text overlaps a name pill.
//   caption-on-line        A caption's text touches an edge.
//   caption-off-canvas     A caption's text is not wholly inside the canvas.
//   caption-crosses-frame  A caption's text overlaps a frame's border (partly in, partly out).
//   captions-overlap       Two captions' texts overlap.
//   node-text-outside      An operation's text is wider or taller than its node.
//   table-text-outside     An ingredient box's text runs out of its box.
//
// Not a flaw but a count, returned beside the flaws: `crossings`, the number of points where
// a horizontal segment of one edge crosses a vertical segment of another strictly inside both.

import type { Recipe } from '../core/index.ts';
import { buildGraph } from '../core/graph.ts';
import type { DetailedLayout, LayoutBox, Point } from './index.ts';
import { legendBox } from './svg.ts';
import type { ThemeReader } from './theme.ts';

export const RULES = [
  'off-canvas',
  'boxes-overlap',
  'box-crosses-frame',
  'frames-cross',
  'frame-membership',
  'pill-on-box',
  'pill-off-canvas',
  'pill-long',
  'pills-overlap',
  'diagonal-segment',
  'edge-through-box',
  'edge-through-pill',
  'edge-through-frame',
  'edges-share-line',
  'edge-on-frame',
  'edge-near-box',
  'caption-on-box',
  'caption-on-pill',
  'caption-on-line',
  'caption-off-canvas',
  'caption-crosses-frame',
  'captions-overlap',
  'node-text-outside',
  'table-text-outside',
] as const;
export type Rule = (typeof RULES)[number];

/**
 * One fault. `ids` names what is involved: box ids (`mix`, `ingredients:mix`, `title`), frame
 * ids (`component:dough`, `choose:topping`), pills by their frame (`pill:component:dough`),
 * edges as `from>to`, captions as `caption:<text>`.
 */
export interface Flaw {
  rule: Rule;
  detail: string;
  ids: string[];
}

export interface GeometryReport {
  flaws: Flaw[];
  /** Crossings between edges (a count, not a flaw). */
  crossings: number;
}

interface R {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The tolerance, in chart units, for touching borders and rounding. */
const E = 0.6;
const overlap = (a: R, b: R): boolean => a.x < b.x + b.width - E && b.x < a.x + a.width - E && a.y < b.y + b.height - E && b.y < a.y + a.height - E;
const inside = (a: R, b: R): boolean => a.x >= b.x - E && a.y >= b.y - E && a.x + a.width <= b.x + b.width + E && a.y + a.height <= b.y + b.height + E;
/** Does the segment's bounding box reach more than `pad` into the rectangle? */
const segHits = (p: Point, q: Point, b: R, pad = 1): boolean => {
  const x1 = Math.min(p.x, q.x);
  const x2 = Math.max(p.x, q.x);
  const y1 = Math.min(p.y, q.y);
  const y2 = Math.max(p.y, q.y);
  return x1 < b.x + b.width - pad && x2 > b.x + pad && y1 < b.y + b.height - pad && y2 > b.y + pad;
};
/** Does the segment cross the rectangle's border (one end in and one out, or passing through)? */
const crossesBorder = (p: Point, q: Point, f: R): boolean => {
  const inF = (z: Point): boolean => z.x > f.x + E && z.x < f.x + f.width - E && z.y > f.y + E && z.y < f.y + f.height - E;
  if (inF(p) !== inF(q)) return true;
  if (inF(p)) return false;
  return segHits(p, q, f, E);
};
const edgeId = (e: { from: string; to: string }): string => `${e.from}>${e.to}`;

/**
 * Two lines closer than this, center to center, read as one: with strokes 1 to 2.25 units wide
 * (the bundled styles' edges) less than a unit of paper shows between them. Lanes are at least
 * 4 apart (`lane-gap`'s floor), and 9 in the tightest bundled style.
 */
const ONE_LINE = 3;
/** An edge this close to a frame's border, or on it, reads as part of the frame. */
const ON_FRAME = 2;
/**
 * The clearance an edge keeps from a box it does not touch: half the narrowest gap the bundled
 * styles leave between a box and an edge by design (Dense's 8, a run midway in its 16-unit
 * row gap; its tightest, 6.4, is an edge over a row coming in through the top), and more than
 * the widest edge stroke.
 */
const NEAR_BOX = 4;
/** A run along a line shorter than this is a touch where two lines meet or turn, not a shared run. */
const RUN = 2;
/**
 * How far two axis-parallel segments run along one line: the length they overlap when they
 * are both level (or both upright) and less than `apart` from each other, otherwise 0.
 */
const runAlong = (p: Point, q: Point, r: Point, s: Point, apart: number): number => {
  for (const [u, v] of [['y', 'x'], ['x', 'y']] as const) {
    if (p[u] !== q[u] || r[u] !== s[u] || Math.abs(p[u] - r[u]) >= apart) continue;
    return Math.max(0, Math.min(Math.max(p[v], q[v]), Math.max(r[v], s[v])) - Math.max(Math.min(p[v], q[v]), Math.min(r[v], s[v])));
  }
  return 0;
};
/** The distance between a segment's bounding box and a rectangle (0 when they meet). */
const gap = (p: Point, q: Point, b: R): number => {
  const dx = Math.max(b.x - Math.max(p.x, q.x), Math.min(p.x, q.x) - (b.x + b.width), 0);
  const dy = Math.max(b.y - Math.max(p.y, q.y), Math.min(p.y, q.y) - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
};

/**
 * Check a finished layout. `t` is the reader of the theme it was laid out with (text widths
 * and the pill and caption sizes come from it). `recipe` is the recipe it was laid out from,
 * for `frame-membership`; pass null to skip that rule (a hand-made layout with no recipe).
 */
export function checkGeometry(layout: DetailedLayout, t: ThemeReader, recipe: Recipe | null): GeometryReport {
  const cw = t.num('font-size') * t.num('char-width');
  const lh = t.num('font-size') * t.num('line-height');
  const cap = t.num('caption-font-size');
  const opMeasure = t.measure(t.num('operation-font-weight'));
  const capMeasure = t.measure(t.num('font-weight'));
  const tableMeasure = t.measure(t.num('ingredient-font-weight'));

  const flaws: Flaw[] = [];
  const seen = new Set<string>();
  const flaw = (rule: Rule, detail: string, ids: string[]): void => {
    const key = `${rule}|${ids.join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    flaws.push({ rule, detail, ids });
  };

  const solid: LayoutBox[] = [...layout.operations.map((o) => o.box), ...layout.tables.map((x) => x.box)];
  if (layout.title) solid.push(layout.title.box);
  const canvas: R = { x: 0, y: 0, width: layout.width, height: layout.height };
  const frames = layout.containers.map((c) => c.box);

  // ---------------------------------------------------------------- boxes and frames

  for (const b of [...solid, ...frames]) if (!inside(b, canvas)) flaw('off-canvas', `off the canvas: ${b.id}`, [b.id]);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      if (overlap(solid[i], solid[j])) flaw('boxes-overlap', `boxes overlap: ${solid[i].id} / ${solid[j].id}`, [solid[i].id, solid[j].id]);
    }
  }
  for (const f of frames) {
    for (const s of solid) if (overlap(f, s) && !inside(s, f)) flaw('box-crosses-frame', `box crosses a frame: ${s.id} / ${f.id}`, [s.id, f.id]);
  }
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const a = frames[i];
      const b = frames[j];
      if (overlap(a, b) && !inside(a, b) && !inside(b, a)) flaw('frames-cross', `frames cross: ${a.id} / ${b.id}`, [a.id, b.id]);
    }
  }

  if (recipe) {
    const frameById = new Map(frames.map((f) => [f.id, f]));
    const boxById = new Map(solid.map((b) => [b.id, b]));
    for (const gs of buildGraph(recipe).steps) {
      const own = new Set(gs.path.flatMap((h) => [`component:${h.anchor}`, `choose:${h.anchor}`]).filter((id) => frameById.has(id)));
      for (const id of [gs.id, `ingredients:${gs.id}`]) {
        const b = boxById.get(id);
        if (!b) continue;
        for (const fid of own) if (!inside(b, frameById.get(fid)!)) flaw('frame-membership', `outside its own frame: ${id} / ${fid}`, [id, fid]);
        for (const f of layout.containers) {
          if (f.choose || own.has(f.box.id)) continue;
          if (inside(b, f.box)) flaw('frame-membership', `inside a frame it does not belong to: ${id} / ${f.box.id}`, [id, f.box.id]);
        }
      }
    }
  }

  // ---------------------------------------------------------------- name pills

  const pills = layout.containers.map((c) => ({
    id: `pill:${c.box.id}`,
    frame: c.box,
    r: legendBox(c.box, c.title, c.choose ? cap : t.num('component-title-font-size'), c.inset ?? (c.choose ? 14 : 18), t, c.note) as R,
  }));
  for (const p of pills) {
    for (const s of solid) if (overlap(p.r, s)) flaw('pill-on-box', `name pill on a box: ${p.id} / ${s.id}`, [p.id, s.id]);
    if (!inside(p.r, canvas)) flaw('pill-off-canvas', `name pill off the canvas: ${p.id}`, [p.id]);
    if (p.r.x + p.r.width > p.frame.x + p.frame.width + E) flaw('pill-long', `name pill longer than its frame: ${p.id}`, [p.id]);
  }
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      if (overlap(pills[i].r, pills[j].r)) flaw('pills-overlap', `name pills overlap: ${pills[i].id} / ${pills[j].id}`, [pills[i].id, pills[j].id]);
    }
  }

  // ---------------------------------------------------------------- edges

  // The frames an edge may cross: those holding its source or its target. An ingredient
  // edge's source sits beside its step, so its step's frames are its own.
  const holders = (id: string): Set<number> => {
    const b = solid.find((s) => s.id === id);
    const s = new Set<number>();
    if (b) frames.forEach((f, i) => inside(b, f) && s.add(i));
    return s;
  };
  for (const e of layout.edges) {
    const id = edgeId(e);
    const own = new Set([...holders(e.from), ...holders(e.to)]);
    const last = e.points.length - 1;
    for (let k = 1; k < e.points.length; k++) {
      const p = e.points[k - 1];
      const q = e.points[k];
      if (p.x !== q.x && p.y !== q.y) flaw('diagonal-segment', `diagonal segment: ${id}`, [id]);
      for (const s of solid) {
        const ownEnd = s.id === e.from || s.id === e.to;
        if (ownEnd && (k === 1 || k === last)) continue;
        if (segHits(p, q, s)) flaw('edge-through-box', `edge through a box: ${id} / ${s.id}`, [id, s.id]);
        else if (!ownEnd && gap(p, q, s) < NEAR_BOX) flaw('edge-near-box', `edge within ${NEAR_BOX} of a box: ${id} / ${s.id}`, [id, s.id]);
      }
      for (const pl of pills) if (segHits(p, q, pl.r)) flaw('edge-through-pill', `edge through a name pill: ${id} / ${pl.id}`, [id, pl.id]);
      frames.forEach((f, fi) => {
        if (!own.has(fi) && crossesBorder(p, q, f)) flaw('edge-through-frame', `edge crosses a frame it neither starts nor ends in: ${id} / ${f.id}`, [id, f.id]);
        // Its four sides; a segment along one runs beside it and never crosses it.
        const r = { x: f.x + f.width, y: f.y + f.height };
        const sides: [Point, Point][] = [
          [f, { x: r.x, y: f.y }],
          [{ x: f.x, y: r.y }, r],
          [f, { x: f.x, y: r.y }],
          [{ x: r.x, y: f.y }, r],
        ];
        if (sides.some(([a, b]) => runAlong(p, q, a, b, ON_FRAME + 1e-9) > RUN)) flaw('edge-on-frame', `edge along a frame's border: ${id} / ${f.id}`, [id, f.id]);
      });
    }
  }

  // Edges that share a source fan out of one point, and joined `bus` edges into one target
  // merge into one line: both by design. Any other two edges along one line read as one.
  const bus = t.str('join-edges') === 'bus';
  const runs = layout.edges.flatMap((e) => e.points.slice(1).map((q, k) => ({ e, p: e.points[k], q })));
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (a.e === b.e || a.e.from === b.e.from || (bus && a.e.to === b.e.to)) continue;
      if (runAlong(a.p, a.q, b.p, b.q, ONE_LINE) > RUN) {
        const ids = [edgeId(a.e), edgeId(b.e)].sort();
        flaw('edges-share-line', `two edges along one line: ${ids.join(' / ')}`, ids);
      }
    }
  }

  let crossings = 0;
  const segs = layout.edges.flatMap((e, ei) => e.points.slice(1).map((q, k) => ({ ei, p: e.points[k], q })));
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      if (a.ei === b.ei) continue;
      const av = a.p.x === a.q.x;
      const bv = b.p.x === b.q.x;
      const ah = a.p.y === a.q.y;
      const bh = b.p.y === b.q.y;
      // Only a vertical against a horizontal (a diagonal is its own flaw).
      if (!((av && bh) || (ah && bv))) continue;
      const v = av ? a : b;
      const h = av ? b : a;
      const x = v.p.x;
      const y = h.p.y;
      if (x > Math.min(h.p.x, h.q.x) + 0.5 && x < Math.max(h.p.x, h.q.x) - 0.5 && y > Math.min(v.p.y, v.q.y) + 0.5 && y < Math.max(v.p.y, v.q.y) - 0.5) crossings++;
    }
  }

  // ---------------------------------------------------------------- captions

  const caps = layout.captions.map((c) => {
    const w = capMeasure(c.text) * cap * t.num('char-width');
    const x = c.anchor === 'middle' ? c.x - w / 2 : c.anchor === 'end' ? c.x - w : c.x;
    return { id: `caption:${c.text}`, r: { x, y: c.y - cap * 0.75, width: w, height: cap * 0.95 } };
  });
  for (const c of caps) {
    for (const s of solid) if (overlap(c.r, s)) flaw('caption-on-box', `caption on a box: ${c.id} / ${s.id}`, [c.id, s.id]);
    for (const p of pills) if (overlap(c.r, p.r)) flaw('caption-on-pill', `caption on a name pill: ${c.id} / ${p.id}`, [c.id, p.id]);
    for (const e of layout.edges) {
      for (let k = 1; k < e.points.length; k++) {
        if (segHits(e.points[k - 1], e.points[k], c.r, 0)) {
          flaw('caption-on-line', `caption on a line: ${c.id} / ${edgeId(e)}`, [c.id, edgeId(e)]);
          break;
        }
      }
    }
    if (!inside(c.r, canvas)) flaw('caption-off-canvas', `caption off the canvas: ${c.id}`, [c.id]);
    for (const f of frames) if (overlap(c.r, f) && !inside(c.r, f)) flaw('caption-crosses-frame', `caption crosses a frame: ${c.id} / ${f.id}`, [c.id, f.id]);
  }
  for (let i = 0; i < caps.length; i++) {
    for (let j = i + 1; j < caps.length; j++) {
      if (overlap(caps[i].r, caps[j].r)) flaw('captions-overlap', `captions overlap: ${caps[i].id} / ${caps[j].id}`, [caps[i].id, caps[j].id]);
    }
  }

  // ---------------------------------------------------------------- text in its box

  for (const o of layout.operations) {
    const w = Math.max(0, ...o.box.lines.map((line) => opMeasure(line) * cw));
    if (w > o.box.width + E || o.box.lines.length * lh > o.box.height + E) flaw('node-text-outside', `text outside its node: ${o.box.id}`, [o.box.id]);
  }
  for (const tb of layout.tables) {
    const right = Math.max(0, ...tb.rows.flatMap((r) => r.item.map((text, i) => (i === 0 && r.inline ? tb.unitLeft : tb.itemLeft) + tableMeasure(text) * cw)));
    const leftmost = Math.min(tb.quantityRight - Math.max(0, ...tb.rows.map((r) => tableMeasure(r.quantity) * cw)), tb.unitLeft);
    const lines = tb.rows.reduce((s, r) => s + r.item.length, 0);
    if (right > tb.box.x + tb.box.width + E || leftmost < tb.box.x - E || lines * lh > tb.box.height + E) flaw('table-text-outside', `text outside its box: ${tb.box.id}`, [tb.box.id]);
  }

  return { flaws, crossings };
}
