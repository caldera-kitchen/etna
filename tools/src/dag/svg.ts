// Draws a laid-out chart as a self-contained SVG document.

import { cornerInset } from './layout/shapes.ts';
import type { DetailedLayout, LayoutBox, Point } from './layout/types.ts';
import type { ThemeReader } from './theme.ts';

const n = (value: number): string => String(Math.round(value * 100) / 100);

// Control characters are not allowed in XML at all, escaped or not: one in a recipe's text
// would make the whole chart unreadable, so they are dropped (tab and line breaks become spaces).
const escape = (text: string): string =>
  text
    .replace(/[\t\n\r]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A closed polygon with its corners rounded to radius `r`. */
export function roundedPolygon(points: Point[], r: number): string {
  const toward = (from: Point, to: Point): Point => {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const d = Math.min(r, length / 2);
    return { x: from.x + ((to.x - from.x) * d) / length, y: from.y + ((to.y - from.y) * d) / length };
  };
  let d = '';
  points.forEach((p, i) => {
    const a = toward(p, points[(i - 1 + points.length) % points.length]);
    const b = toward(p, points[(i + 1) % points.length]);
    d += `${i === 0 ? 'M' : 'L'}${n(a.x)} ${n(a.y)}Q${n(p.x)} ${n(p.y)} ${n(b.x)} ${n(b.y)}`;
  });
  return d + 'Z';
}

/** A rounded rectangle, or a pill when `r` is half the height, as a path. */
export function roundedRect(b: Pick<LayoutBox, 'x' | 'y' | 'width' | 'height'>, r: number): string {
  const k = Math.min(r, b.width / 2, b.height / 2);
  if (k <= 0) return `M${n(b.x)} ${n(b.y)}H${n(b.x + b.width)}V${n(b.y + b.height)}H${n(b.x)}Z`;
  const x2 = b.x + b.width;
  const y2 = b.y + b.height;
  const arc = `A${n(k)} ${n(k)} 0 0 1 `;
  return (
    `M${n(b.x + k)} ${n(b.y)}H${n(x2 - k)}${arc}${n(x2)} ${n(b.y + k)}V${n(y2 - k)}${arc}${n(x2 - k)} ${n(y2)}` +
    `H${n(b.x + k)}${arc}${n(b.x)} ${n(y2 - k)}V${n(b.y + k)}${arc}${n(b.x + k)} ${n(b.y)}Z`
  );
}

/** The outline of a node or box: `hexagon`, `rectangle` or `pill`, as a path. */
export function shapePath(shape: string, b: LayoutBox, point: number, radius: number): string {
  if (shape === 'pill') return roundedRect(b, b.height / 2);
  if (shape === 'rectangle') return roundedRect(b, radius);
  const inset = Math.min(point, b.width / 2);
  const mid = b.y + b.height / 2;
  return roundedPolygon(
    [
      { x: b.x + inset, y: b.y },
      { x: b.x + b.width - inset, y: b.y },
      { x: b.x + b.width, y: mid },
      { x: b.x + b.width - inset, y: b.y + b.height },
      { x: b.x + inset, y: b.y + b.height },
      { x: b.x, y: mid },
    ],
    radius,
  );
}

/**
 * An orthogonal polyline with rounded corners, stopping `trim` short of its last point.
 * `curved` turns every bend as wide as its two runs allow (half of each, so two bends that
 * share a run meet in an S), keeping the last `keep` of the final run straight for the
 * arrowhead.
 */
export function edgePath(points: Point[], r: number, trim: number, curved = false, keep = 0): string {
  const pts = points.map((p) => ({ ...p }));
  const last = pts[pts.length - 1];
  const before = pts[pts.length - 2];
  const length = Math.hypot(last.x - before.x, last.y - before.y);
  const cut = Math.min(trim, Math.max(0, length - 1));
  last.x -= ((last.x - before.x) / length) * cut;
  last.y -= ((last.y - before.y) / length) * cut;
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = pts[i - 1];
    const b = pts[i + 1];
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const last = i === pts.length - 2;
    const d1 = curved ? Math.max(0, Math.min(la / 2, last ? lb - keep : lb / 2)) : Math.min(r, la / 2, lb / 2);
    if (d1 <= 0) {
      d += `L${n(p.x)} ${n(p.y)}`;
      continue;
    }
    const start = { x: p.x + ((a.x - p.x) * d1) / la, y: p.y + ((a.y - p.y) * d1) / la };
    const end = { x: p.x + ((b.x - p.x) * d1) / lb, y: p.y + ((b.y - p.y) * d1) / lb };
    d += `L${n(start.x)} ${n(start.y)}Q${n(p.x)} ${n(p.y)} ${n(end.x)} ${n(end.y)}`;
  }
  return d + `L${n(last.x)} ${n(last.y)}`;
}

/** The arrowhead at the end of an edge: its tip and the two corners of its base. */
export function arrowHeadPoints(points: Point[], length: number, width: number): [Point, Point, Point] {
  const tip = points[points.length - 1];
  const before = points[points.length - 2];
  const d = Math.hypot(tip.x - before.x, tip.y - before.y);
  const ux = (tip.x - before.x) / d;
  const uy = (tip.y - before.y) / d;
  const bx = tip.x - ux * length;
  const by = tip.y - uy * length;
  const hx = (-uy * width) / 2;
  const hy = (ux * width) / 2;
  return [tip, { x: bx + hx, y: by + hy }, { x: bx - hx, y: by - hy }];
}

function arrowHead(points: Point[], length: number, width: number): string {
  return arrowHeadPoints(points, length, width)
    .map((p) => `${n(p.x)},${n(p.y)}`)
    .join(' ');
}

/**
 * Where a container's name pill sits: on the top border of `b`, `inset` from its left. `note`
 * (the optional mark) follows the name inside the pill, at the caption size; `nameX` and
 * `noteX` are the centers of the two texts.
 */
export function legendBox(
  b: LayoutBox,
  text: string,
  size: number,
  inset: number,
  t: ThemeReader,
  note?: string,
): { x: number; y: number; width: number; height: number; baseline: number; nameX: number; noteX: number } {
  const h = size + 11;
  const measure = t.measure(t.num('font-weight'));
  const name = measure(text) * size * t.num('char-width');
  const noteSize = t.num('caption-font-size');
  const noteWidth = note === undefined ? 0 : measure(note) * noteSize * t.num('char-width');
  const gap = note === undefined ? 0 : noteSize * 0.5;
  const w = name + gap + noteWidth + 2 * (size * 0.9);
  const x = b.x + inset;
  return { x, y: b.y - h / 2, width: w, height: h, baseline: b.y + size * 0.35, nameX: note === undefined ? x + w / 2 : x + size * 0.9 + name / 2, noteX: x + size * 0.9 + name + gap + noteWidth / 2 };
}

/** The checkmark of a Checkpoint mark centered at (x, y), for a mark of radius `r`. */
export function checkmarkPath(x: number, y: number, r: number): string {
  const k = r / 9;
  return `M${n(x - 4 * k)} ${n(y + 0.5 * k)}L${n(x - 1.2 * k)} ${n(y + 3.4 * k)}L${n(x + 4.2 * k)} ${n(y - 3.2 * k)}`;
}

/** `fontCss`: @font-face rules to put first in the style block (the theme's embedded fonts), or ''. */
export function drawSvg(layout: DetailedLayout, t: ThemeReader, label: string, fontCss = ''): string {
  const fontSize = t.num('font-size');
  const lineHeight = fontSize * t.num('line-height');
  const baseline = (centerY: number, size: number): number => centerY + size * 0.35;
  const out: string[] = [];
  // Theme values were checked against the schema (theme.ts); this is a second guard, since
  // they go into a <style> block: nothing that could close it or start a new rule survives.
  const css = (key: string): string => t.str(key).replace(/[<>&{};\\]/g, '');
  const differs = (key: string, from: string): boolean => t.str(key) !== t.str(from);
  const ingredientShape = t.str('ingredient-shape');
  const operationShape = t.str('operation-shape');
  const titleShape = t.str('title-shape');
  const titleLeft = t.str('title-position') === 'left';
  const dashed = (key: string): string => (t.str(key) === 'none' ? '' : `;stroke-dasharray:${css(key)}`);
  // Rules a theme only needs when it sets a value apart from the one it would inherit, so the
  // default chart's style block stays as it was.
  const extra: string[] = [];
  if (differs('ingredient-font-weight', 'font-weight') || differs('ingredient-text-color', 'text-color')) {
    extra.push(`.etna-dag .dag-ingredients text{font-weight:${css('ingredient-font-weight')};fill:${css('ingredient-text-color')}}`);
  }
  if (differs('operation-font-weight', 'font-weight') || differs('operation-text-color', 'text-color')) {
    extra.push(`.etna-dag .dag-operation text{font-weight:${css('operation-font-weight')};fill:${css('operation-text-color')}}`);
  }
  if (titleLeft) extra.push('.etna-dag .dag-title text{text-anchor:start}');
  // The optional mark, only in a chart that has one, so every other chart's style block stays as it was.
  const captionSize = t.num('caption-font-size');
  if (layout.operations.some((o) => o.mark) || layout.containers.some((c) => c.note)) {
    extra.push(`.etna-dag .dag-legend text.dag-optional,.etna-dag .dag-operation text.dag-optional{font-size:${n(captionSize)}px}`);
  }
  if (titleShape === 'underline') extra.push(`.etna-dag .dag-title line{stroke:${css('title-stroke')};stroke-width:${css('title-stroke-width')}}`);
  const themeClass = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="etna-dag theme-${escape(themeClass)}" viewBox="0 0 ${n(layout.width)} ${n(layout.height)}" role="img" aria-label="${escape(label)}">`,
    `<title>${escape(label)}</title>`,
    '<style>',
    ...(fontCss === '' ? [] : [fontCss.trimEnd()]),
    `.etna-dag text{font-family:${css('font-family')};font-size:${n(fontSize)}px;font-weight:${css('font-weight')};fill:${css('text-color')}}`,
    `.etna-dag .dag-background{fill:${css('background')}}`,
    `.etna-dag .dag-title rect{fill:${css('title-fill')};stroke:${css('title-stroke')};stroke-width:${css('title-stroke-width')}}`,
    `.etna-dag .dag-title text{font-family:${css('title-font-family')};font-size:${css('title-font-size')}px;font-weight:${css('title-font-weight')};text-anchor:middle}`,
    `.etna-dag .dag-title .dag-subtitle{font-size:${css('subtitle-font-size')}px}`,
    `.etna-dag .dag-ingredients ${ingredientShape === 'hexagon' ? 'path' : 'rect'}{fill:${css('ingredient-fill')};stroke:${css('ingredient-stroke')};stroke-width:${css('ingredient-stroke-width')}${dashed('ingredient-stroke-dash')}}`,
    `.etna-dag .dag-quantity{text-anchor:end}`,
    `.etna-dag .dag-operation path{fill:${css('operation-fill')};stroke:${css('operation-stroke')};stroke-width:${css('operation-stroke-width')};stroke-linejoin:round${dashed('operation-stroke-dash')}}`,
    `.etna-dag .dag-operation text{text-anchor:middle}`,
    // Preparation steps (a preheat, a pan to line) join nothing: a dashed outline sets them apart.
    `.etna-dag .dag-prep path{fill:${css('prep-fill')};stroke-dasharray:${css('prep-dash')}}`,
    ...(differs('prep-text-color', 'operation-text-color') ? [`.etna-dag .dag-operation.dag-prep text{fill:${css('prep-text-color')}}`] : []),
    `.etna-dag .dag-edge{fill:none;stroke:${css('edge-stroke')};stroke-width:${css('edge-stroke-width')}}`,
    `.etna-dag .dag-arrow{fill:${css('edge-stroke')}}`,
    `.etna-dag .dag-component>rect{fill:${css('component-fill')};stroke:${css('component-stroke')};stroke-width:${css('component-stroke-width')}}`,
    `.etna-dag .dag-component .dag-legend rect{fill:${css('component-title-fill')};stroke:${css('component-stroke')};stroke-width:${css('component-title-stroke-width')}}`,
    `.etna-dag .dag-component .dag-legend text{font-size:${css('component-title-font-size')}px;text-anchor:middle}`,
    `.etna-dag .dag-choose>rect{fill:none;stroke:${css('choose-stroke')};stroke-width:${css('choose-stroke-width')};stroke-dasharray:${css('choose-dash')}}`,
    `.etna-dag .dag-choose .dag-legend rect{fill:${css('component-title-fill')};stroke:${css('choose-stroke')};stroke-width:${css('choose-stroke-width')}}`,
    `.etna-dag .dag-choose .dag-legend text{font-size:${css('caption-font-size')}px;text-anchor:middle}`,
    `.etna-dag .dag-separator{stroke:${css('choose-stroke')};stroke-width:${css('choose-stroke-width')};stroke-dasharray:${css('choose-dash')}}`,
    `.etna-dag .dag-caption{font-size:${css('caption-font-size')}px;fill:${css('caption-color')}}`,
    `.etna-dag .dag-checkpoint circle{fill:${css('checkpoint-fill')};stroke:${css('checkpoint-stroke')};stroke-width:${css('checkpoint-stroke-width')}}`,
    `.etna-dag .dag-checkpoint path{fill:none;stroke:${css('checkpoint-stroke')};stroke-width:${css('checkpoint-stroke-width')};stroke-linecap:round;stroke-linejoin:round}`,
    ...extra,
    '</style>',
    `<rect class="dag-background" width="${n(layout.width)}" height="${n(layout.height)}"/>`,
  );

  const rect = (b: LayoutBox, radius: number): string =>
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="${n(radius)}"/>`;

  // A legend: the name of a container, in a pill sitting on its top border; the optional mark after it, small.
  const legend = (b: LayoutBox, text: string, size: number, inset: number, note?: string): string => {
    const { x, y, width: w, height: h, nameX, noteX } = legendBox(b, text, size, inset, t, note);
    return (
      `<g class="dag-legend"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}"/>` +
      `<text x="${n(nameX)}" y="${n(baseline(b.y, size))}">${escape(text)}</text>` +
      (note === undefined ? '' : `<text class="dag-optional" x="${n(noteX)}" y="${n(baseline(b.y, size))}">${escape(note)}</text>`) +
      '</g>'
    );
  };

  // Containers, behind everything else.
  for (const c of layout.containers.filter((c) => !c.choose)) {
    out.push(
      `<g class="dag-component" data-component="${escape(c.box.id.slice(c.box.id.indexOf(':') + 1))}">${rect(c.box, t.num('component-radius'))}` +
        `${legend(c.box, c.title, t.num('component-title-font-size'), c.inset ?? 18, c.note)}</g>`,
    );
  }
  for (const c of layout.containers.filter((c) => c.choose)) {
    out.push(`<g class="dag-choose" data-component="${escape(c.box.id.slice(c.box.id.indexOf(':') + 1))}">${rect(c.box, 10)}${legend(c.box, c.title, t.num('caption-font-size'), c.inset ?? 14, c.note)}</g>`);
  }
  for (const s of layout.separators) {
    out.push(`<line class="dag-separator" x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}"/>`);
  }

  // Edges, under the nodes so every line end is clean.
  const arrowLength = t.num('arrow-length');
  const curved = t.str('edge-style') === 'curved';
  for (const e of layout.edges) {
    if (e.points.length < 2) continue;
    const d = edgePath(e.points, t.num('edge-radius'), arrowLength * 0.7, curved, arrowLength * 0.3 + 2);
    out.push(
      `<g class="dag-edge-${escape(e.kind)}" data-from="${escape(e.from.slice(e.from.indexOf(':') + 1))}" data-to="${escape(e.to)}"><path class="dag-edge" d="${d}"/>` +
        `<polygon class="dag-arrow" points="${arrowHead(e.points, arrowLength, t.num('arrow-width'))}"/></g>`,
    );
  }

  for (const c of layout.captions) {
    const anchor = c.anchor && c.anchor !== 'start' ? ` text-anchor="${c.anchor}"` : '';
    out.push(`<text class="dag-caption${c.edge ? ' dag-edge-label' : ''}" x="${n(c.x)}" y="${n(c.y)}"${anchor}>${escape(c.text)}</text>`);
  }

  // Ingredient boxes: a small table, one ingredient per line.
  for (const table of layout.tables) {
    const b = table.box;
    const count = table.rows.reduce((sum, r) => sum + r.item.length, 0);
    let center = b.y + (b.height - count * lineHeight) / 2 + lineHeight / 2;
    const parts: string[] = [
      ingredientShape === 'hexagon'
        ? `<path d="${shapePath('hexagon', b, t.num('ingredient-point'), t.num('ingredient-radius'))}"/>`
        : rect(b, ingredientShape === 'pill' ? b.height / 2 : t.num('ingredient-radius')),
    ];
    for (const row of table.rows) {
      row.item.forEach((text, i) => {
        const y = n(baseline(center, fontSize));
        if (i === 0 && row.quantity) parts.push(`<text class="dag-quantity" x="${n(table.quantityRight)}" y="${y}">${escape(row.quantity)}</text>`);
        if (i === 0 && row.unit) parts.push(`<text x="${n(table.unitLeft)}" y="${y}">${escape(row.unit)}</text>`);
        parts.push(`<text x="${n(i === 0 && row.inline ? table.unitLeft : table.itemLeft)}" y="${y}">${escape(text)}</text>`);
        center += lineHeight;
      });
    }
    out.push(`<g class="dag-ingredients" data-step="${escape(b.id.slice(b.id.indexOf(':') + 1))}">${parts.join('')}</g>`);
  }

  // Operation nodes: elongated hexagons, rectangles or pills.
  const point = t.num('operation-point');
  for (const op of layout.operations) {
    const b = op.box;
    const inset = cornerInset(operationShape, b.width, b.height, point, t.num('operation-radius'));
    const mid = b.y + b.height / 2;
    const shape = shapePath(operationShape, b, point, t.num('operation-radius'));
    const parts: string[] = [`<path d="${shape}"/>`];
    // The optional mark is one more line under the text, at the caption size; the two are centered together.
    const markLine = op.mark ? captionSize * t.num('line-height') : 0;
    b.lines.forEach((line, i) => {
      const center = mid - markLine / 2 + (i - (b.lines.length - 1) / 2) * lineHeight;
      parts.push(`<text x="${n(b.x + b.width / 2)}" y="${n(baseline(center, fontSize))}">${escape(line)}</text>`);
    });
    if (op.mark) {
      const center = mid - markLine / 2 + (b.lines.length * lineHeight) / 2 + markLine / 2;
      parts.push(`<text class="dag-optional" x="${n(b.x + b.width / 2)}" y="${n(baseline(center, captionSize))}">${escape(op.mark)}</text>`);
    }
    if (op.checkpoints.length > 0) {
      // A Checkpoint is a marker on the node, not a branch.
      const x = b.x + b.width - inset;
      const y = b.y;
      const r = t.num('checkpoint-radius');
      parts.push(
        `<g class="dag-checkpoint"><title>${escape(op.checkpoints.map((c) => `Checkpoint — ${c}`).join('\n'))}</title>` +
          `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}"/>` +
          `<path d="${checkmarkPath(x, y, r)}"/></g>`,
      );
    }
    out.push(`<g class="dag-operation${op.prep ? ' dag-prep' : ''}" data-step="${escape(b.id)}">${parts.join('')}</g>`);
  }

  // The title pill.
  if (layout.title) {
    const b = layout.title.box;
    const titleSize = t.num('title-font-size');
    const subSize = t.num('subtitle-font-size');
    const { main, sub } = layout.title;
    const content = main.length * titleSize * 1.15 + sub.length * subSize * 1.35;
    let y = b.y + (b.height - content) / 2;
    const parts: string[] = [];
    if (titleShape === 'pill') parts.push(rect(b, b.height / 2));
    else if (titleShape === 'rectangle') parts.push(rect(b, t.num('title-radius')));
    else if (titleShape === 'underline') {
      const y = b.y + b.height;
      parts.push(`<line x1="${n(t.num('margin'))}" y1="${n(y)}" x2="${n(layout.width - t.num('margin'))}" y2="${n(y)}"/>`);
    }
    const x = titleLeft ? b.x + t.num('title-padding-x') : b.x + b.width / 2;
    for (const line of main) {
      parts.push(`<text x="${n(x)}" y="${n(baseline(y + (titleSize * 1.15) / 2, titleSize))}">${escape(line)}</text>`);
      y += titleSize * 1.15;
    }
    for (const line of sub) {
      parts.push(
        `<text class="dag-subtitle" x="${n(x)}" y="${n(baseline(y + (subSize * 1.35) / 2, subSize))}">${escape(line)}</text>`,
      );
      y += subSize * 1.35;
    }
    out.push(`<g class="dag-title">${parts.join('')}</g>`);
  }

  out.push('</svg>');
  return out.join('\n') + '\n';
}
