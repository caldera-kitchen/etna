// The shapes' outlines, as the layout needs them: how far in from its box an outline is. And
// the rounding every coordinate of the output goes through.

/** Rounded to hundredths, as every coordinate of the layout is. */
export const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * How far in from its box a shape's outline is, at `reach` above or below the box's middle:
 * the room text at that height loses to the shape, on each side.
 */
export function sideInset(shape: string, height: number, point: number, radius: number, reach: number): number {
  const half = height / 2;
  if (shape === 'hexagon') return point * Math.min(1, reach / half);
  const r = shape === 'pill' ? half : Math.min(radius, half);
  const dy = reach - (half - r);
  if (dy <= 0) return 0;
  const k = Math.min(dy, r);
  return r - Math.sqrt(r * r - k * k);
}

/** Where a shape's flat top starts, from its left edge (its top-left corner, in effect). */
export function cornerInset(shape: string, width: number, height: number, point: number, radius: number): number {
  if (shape === 'hexagon') return Math.min(point, width / 2);
  if (shape === 'pill') return Math.min(height / 2, width / 2);
  return Math.min(radius, height / 2, width / 2);
}
