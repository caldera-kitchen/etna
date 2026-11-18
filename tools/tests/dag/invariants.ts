// The invariants every laid-out chart must hold, whatever the recipe, the style and the sheet:
// shared by dag.test.ts and fold.test.ts. They hold for a chart in any number of columns, with
// or without its third column: nothing here assumes one left edge for the ingredient boxes,
// one stack of containers, or one spine.

import { expect } from 'vitest';

import { buildGraph, type Recipe } from '../../src/core/index.ts';
import type { DagLayout, DagTheme } from '../../src/dag/index.ts';
import { readTheme } from '../../src/dag/theme.ts';

export type Layout = DagLayout;
export type Box = Layout['boxes'][number];

export const byKind = (layout: Layout, kind: Box['kind']): Box[] => layout.boxes.filter((b) => b.kind === kind);
export const box = (layout: Layout, id: string): Box => {
  const found = layout.boxes.find((b) => b.id === id);
  if (!found) throw new Error(`no box ${id}`);
  return found;
};
export const centerY = (b: Box): number => b.y + b.height / 2;
export const EPS = 0.011;

/**
 * The invariants every chart must hold. `theme` is the style it was laid out with (the
 * default when left out): the side the ingredients are on and the gap between an ingredient
 * box and its step come from it.
 */
export function checkInvariants(recipe: Recipe, layout: Layout, theme?: DagTheme): void {
  const t = readTheme(theme);
  const mirrored = t.str('ingredient-side') === 'right';
  const gap = t.num('column-gap');
  const graph = buildGraph(recipe);
  const solid = layout.boxes.filter((b) => b.kind !== 'component');
  const ingredients = byKind(layout, 'ingredients');
  const operations = byKind(layout, 'operation');

  // One operation per step; one ingredient box per step that has raw ingredients.
  expect(operations.map((b) => b.id).sort()).toEqual(graph.steps.map((s) => s.id).sort());
  expect(ingredients.map((b) => b.id).sort()).toEqual(
    graph.steps.filter((s) => s.ingredients.length > 0 || graph.external.some((x) => x.step === s.step)).map((s) => `ingredients:${s.id}`).sort(),
  );

  // One width for every ingredient box, one for every operation node.
  expect(new Set(ingredients.map((b) => b.width)).size).toBeLessThanOrEqual(1);
  expect(new Set(operations.map((b) => b.width)).size).toBe(1);

  // Containers never overlap one another.
  const containers = layout.boxes.filter((b) => b.id.startsWith('component:'));
  for (let i = 0; i < containers.length; i++) {
    for (let j = i + 1; j < containers.length; j++) {
      const a = containers[i];
      const b = containers[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      if (!apart) throw new Error(`containers overlap: ${a.id} and ${b.id}`);
    }
  }

  // Each ingredient box sits on its operation's row, beside it at the style's gap (on the
  // ingredient side), and feeds it straight across. In whatever column the step stands.
  for (const b of ingredients) {
    const op = box(layout, b.id.slice('ingredients:'.length));
    expect(Math.abs(centerY(b) - centerY(op))).toBeLessThan(EPS);
    const between = mirrored ? b.x - (op.x + op.width) : op.x - (b.x + b.width);
    if (Math.abs(between - gap) >= EPS) throw new Error(`ingredients:${op.id} is ${between} from its step, not the gap of ${gap}`);
    const edge = layout.edges.find((e) => e.from === b.id && e.to === op.id);
    expect(edge?.kind).toBe('ingredients');
    expect(edge?.points).toHaveLength(2);
  }

  // Everything is on the page, and no two boxes overlap.
  for (const b of layout.boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(layout.width);
    expect(b.y + b.height).toBeLessThanOrEqual(layout.height);
  }
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      if (!apart) throw new Error(`boxes overlap: ${a.id} and ${b.id}`);
    }
  }

  // Every graph edge is drawn once.
  const drawn = layout.edges.filter((e) => e.kind !== 'ingredients').map((e) => `${e.from}>${e.to}`);
  expect(drawn.sort()).toEqual([...new Set(graph.edges.map((e) => `${e.from}>${e.to}`))].sort());

  for (const e of layout.edges) {
    expect(e.points.length).toBeGreaterThanOrEqual(2);
    const from = box(layout, e.from);
    const to = box(layout, e.to);
    const onBorder = (p: { x: number; y: number }, b: Box): boolean => {
      const inX = p.x >= b.x - EPS && p.x <= b.x + b.width + EPS;
      const inY = p.y >= b.y - EPS && p.y <= b.y + b.height + EPS;
      const edgeX = Math.abs(p.x - b.x) < EPS || Math.abs(p.x - (b.x + b.width)) < EPS;
      const edgeY = Math.abs(p.y - b.y) < EPS || Math.abs(p.y - (b.y + b.height)) < EPS;
      return (edgeX && inY) || (edgeY && inX);
    };
    // With `join-edges: separate`, an edge into an operation's side off its middle stops on the
    // shape's outline, inside the box, and one out of it off its middle starts there: within the
    // reach of the shape's ends (`operation-point` is at most 100; a pill or rounded end reaches
    // at most half the height).
    const onSide = (p: { x: number; y: number }, b: Box): boolean => {
      if (b.kind !== 'operation') return false;
      const inY = p.y >= b.y - EPS && p.y <= b.y + b.height + EPS;
      const inX = p.x >= b.x - EPS && p.x <= b.x + b.width + EPS;
      const reach = Math.max(100, b.height / 2) + EPS;
      return inX && inY && Math.min(p.x - b.x, b.x + b.width - p.x) <= reach;
    };
    const start = e.points[0];
    if (!onBorder(start, from) && !onSide(start, from)) throw new Error(`edge ${e.from}>${e.to} does not start on ${e.from}`);
    const end = e.points[e.points.length - 1];
    if (!onBorder(end, to) && !onSide(end, to)) throw new Error(`edge ${e.from}>${e.to} does not end on ${e.to}`);

    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1];
      const b = e.points[i];
      // Orthogonal, and long enough to be a real segment.
      if (a.x !== b.x && a.y !== b.y) throw new Error(`edge ${e.from}>${e.to} has a diagonal segment`);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(1);
      // The segment passes through no box (its own ends only touch a border, or, for the last
      // segment, stop on its target's outline).
      for (const s of solid) {
        if (i === e.points.length - 1 && s.id === e.to && onSide(end, to)) continue;
        if (i === 1 && s.id === e.from && onSide(start, from)) continue;
        const x1 = Math.max(Math.min(a.x, b.x), s.x);
        const x2 = Math.min(Math.max(a.x, b.x), s.x + s.width);
        const y1 = Math.max(Math.min(a.y, b.y), s.y);
        const y2 = Math.min(Math.max(a.y, b.y), s.y + s.height);
        const through =
          a.y === b.y ? a.y > s.y + EPS && a.y < s.y + s.height - EPS && x2 - x1 > EPS : a.x > s.x + EPS && a.x < s.x + s.width - EPS && y2 - y1 > EPS;
        if (through) throw new Error(`edge ${e.from}>${e.to} passes through ${s.id}`);
      }
    }
  }
}
