// A flow chart as a PDF: the same picture the SVG draws (svg.ts), from the same layout, drawn
// with pdf-lib (the maintained fork, @cantoo/pdf-lib) into one page of the sheet `chartSheetFor`
// picks, with the theme's free fonts embedded. Vector paths and real, selectable text; no browser involved, so the bytes are the
// same in Node and in any browser, on any system. To keep them so, every number written is
// made with +, −, ×, ÷ and square root, which JavaScript defines to the last bit, never with
// sin, cos, atan2 or the like, which each engine rounds its own way: arcs are turned into
// cubic curves here (`arcCubics`), and pdf-lib's names for graphics states are counted.
//
// Browser-safe (no file system): the font files come in through `PdfFonts`. The web GUI loads
// this module on first use only (chart-pdf.ts), so its first load does not carry pdf-lib.

import fontkit from '@cantoo/fontkit';
import {
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setLineJoin,
  type PDFFont,
  type PDFPage,
} from '@cantoo/pdf-lib';

import type { Recipe } from '../core/index.ts';
import { parseColor } from './color.ts';
import { computeLayout } from './layout/index.ts';
import { cornerInset } from './layout/shapes.ts';
import type { DetailedLayout, LayoutBox } from './layout/types.ts';
import { metricWeight } from './measure.ts';
import { pdfRoles, PDF_FALLBACK_FAMILY, pickPdfFace, type PdfFace, type PdfRole } from './pdf-fonts.ts';
import { chartSheetFor, pageShape, type ChartSheet } from './sheet.ts';
import { arrowHeadPoints, checkmarkPath, edgePath, legendBox, roundedRect, shapePath } from './svg.ts';
import { readTheme, type DagOptions, type ThemeReader } from './theme.ts';

export type { PdfFace } from './pdf-fonts.ts';

/** The font files a PDF may embed: the faces to hand, and how to read one. */
export interface PdfFonts {
  faces: readonly PdfFace[];
  load(face: PdfFace): Promise<Uint8Array>;
}

export interface PdfOptions {
  /** The document title (the recipe's name): the PDF's Title, shown by viewers as the window's. */
  title: string;
  /** The sheet (sheet.ts): letter, the half-inch margin and `auto` where left out. */
  sheet?: DagOptions['sheet'];
  fonts: PdfFonts;
}

// ------------------------------------------------------------------ what is drawn

/** Every kind of thing a chart draws; `drawList` names each item with one. */
export const DRAW_KINDS = [
  'background',
  'component',
  'choose',
  'legend',
  'separator',
  'edge',
  'arrow',
  'caption',
  'ingredients',
  'quantity',
  'unit',
  'item',
  'operation',
  'prep',
  'operation-text',
  'checkpoint',
  'checkmark',
  'title',
  'title-rule',
  'title-text',
  'subtitle',
] as const;
export type DrawKind = (typeof DRAW_KINDS)[number];

/** A path in the chart's units, as SVG path data, filled and/or stroked. */
export interface PathItem {
  type: 'path';
  kind: DrawKind;
  /** The layout box it draws, when it draws one. */
  box?: string;
  d: string;
  fill: string | null;
  stroke: string | null;
  width: number;
  dash: number[];
  join?: 'round';
  cap?: 'round';
}

/** One line of text, its baseline at (x, y) in the chart's units. */
export interface TextItem {
  type: 'text';
  kind: DrawKind;
  box?: string;
  text: string;
  x: number;
  y: number;
  size: number;
  role: PdfRole;
  anchor: 'start' | 'middle' | 'end';
  color: string;
}

export type DrawItem = PathItem | TextItem;

const BOX_KINDS = new Set<LayoutBox['kind']>(['ingredients', 'operation', 'title', 'component']);

/** Dash lengths from a theme's `none` or `6 5`. */
const dashes = (value: string): number[] => (value === 'none' ? [] : value.split(/[\s,]+/).filter(Boolean).map(Number));

/** Text as the SVG has it: line breaks and tabs as spaces, other control characters dropped. */
// eslint-disable-next-line no-control-regex
const clean = (text: string): string => text.replace(/[\t\n\r]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f￾￿]/g, '');

/**
 * Everything the chart draws, back to front, in the chart's own units: what svg.ts puts in its
 * markup, with the styles its <style> block gives each element resolved from the theme. Throws
 * when the layout holds a box this list does not draw, so no new kind of box is left out of the
 * PDF unnoticed.
 */
export function drawList(layout: DetailedLayout, t: ThemeReader): DrawItem[] {
  const out: DrawItem[] = [];
  const fontSize = t.num('font-size');
  const lineHeight = fontSize * t.num('line-height');
  const baseline = (centerY: number, size: number): number => centerY + size * 0.35;
  const color = (key: string): string | null => (parseColor(t.str(key)) === null ? null : t.str(key));
  const path = (kind: DrawKind, d: string, style: Omit<PathItem, 'type' | 'kind' | 'd'>): void => {
    out.push({ type: 'path', kind, d, ...style });
  };
  const text = (kind: DrawKind, item: Omit<TextItem, 'type' | 'kind' | 'text'>, value: string): void => {
    const cleaned = clean(value);
    if (cleaned !== '') out.push({ type: 'text', kind, text: cleaned, ...item });
  };
  const textColor = t.str('text-color');

  path('background', `M0 0H${layout.width}V${layout.height}H0Z`, { fill: color('background'), stroke: null, width: 0, dash: [] });

  const captionSize = t.num('caption-font-size');
  const legend = (b: LayoutBox, title: string, size: number, inset: number, stroke: string, strokeWidth: number, note?: string): void => {
    const l = legendBox(b, title, size, inset, t, note);
    path('legend', roundedRect(l, l.height / 2), { box: b.id, fill: color('component-title-fill'), stroke: color(stroke), width: strokeWidth, dash: [] });
    text('legend', { box: b.id, x: l.nameX, y: l.baseline, size, role: 'text', anchor: 'middle', color: textColor }, title);
    if (note !== undefined) text('legend', { box: b.id, x: l.noteX, y: l.baseline, size: captionSize, role: 'text', anchor: 'middle', color: textColor }, note);
  };

  // Containers, behind everything else: components, then Choose groups.
  for (const c of layout.containers.filter((c) => !c.choose)) {
    path('component', roundedRect(c.box, t.num('component-radius')), {
      box: c.box.id,
      fill: color('component-fill'),
      stroke: color('component-stroke'),
      width: t.num('component-stroke-width'),
      dash: [],
    });
    legend(c.box, c.title, t.num('component-title-font-size'), c.inset ?? 18, 'component-stroke', t.num('component-title-stroke-width'), c.note);
  }
  for (const c of layout.containers.filter((c) => c.choose)) {
    path('choose', roundedRect(c.box, 10), { box: c.box.id, fill: null, stroke: color('choose-stroke'), width: t.num('choose-stroke-width'), dash: dashes(t.str('choose-dash')) });
    legend(c.box, c.title, t.num('caption-font-size'), c.inset ?? 14, 'choose-stroke', t.num('choose-stroke-width'), c.note);
  }
  for (const s of layout.separators) {
    path('separator', `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`, { fill: null, stroke: color('choose-stroke'), width: t.num('choose-stroke-width'), dash: dashes(t.str('choose-dash')) });
  }

  // Edges, under the nodes.
  const arrowLength = t.num('arrow-length');
  const curved = t.str('edge-style') === 'curved';
  for (const e of layout.edges) {
    if (e.points.length < 2) continue;
    const d = edgePath(e.points, t.num('edge-radius'), arrowLength * 0.7, curved, arrowLength * 0.3 + 2);
    path('edge', d, { fill: null, stroke: color('edge-stroke'), width: t.num('edge-stroke-width'), dash: [] });
    const [a, b, c] = arrowHeadPoints(e.points, arrowLength, t.num('arrow-width'));
    path('arrow', `M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}Z`, { fill: color('edge-stroke'), stroke: null, width: 0, dash: [] });
  }

  for (const c of layout.captions) {
    text('caption', { x: c.x, y: c.y, size: t.num('caption-font-size'), role: 'text', anchor: c.anchor ?? 'start', color: t.str('caption-color') }, c.text);
  }

  // Ingredient boxes.
  const ingredientShape = t.str('ingredient-shape');
  for (const table of layout.tables) {
    const b = table.box;
    const d =
      ingredientShape === 'hexagon'
        ? shapePath('hexagon', b, t.num('ingredient-point'), t.num('ingredient-radius'))
        : roundedRect(b, ingredientShape === 'pill' ? b.height / 2 : t.num('ingredient-radius'));
    path('ingredients', d, {
      box: b.id,
      fill: color('ingredient-fill'),
      stroke: color('ingredient-stroke'),
      width: t.num('ingredient-stroke-width'),
      dash: dashes(t.str('ingredient-stroke-dash')),
    });
    const count = table.rows.reduce((sum, r) => sum + r.item.length, 0);
    let center = b.y + (b.height - count * lineHeight) / 2 + lineHeight / 2;
    const style = { box: b.id, size: fontSize, role: 'ingredient' as const, color: t.str('ingredient-text-color') };
    for (const row of table.rows) {
      row.item.forEach((line, i) => {
        const y = baseline(center, fontSize);
        if (i === 0 && row.quantity) text('quantity', { ...style, x: table.quantityRight, y, anchor: 'end' }, row.quantity);
        if (i === 0 && row.unit) text('unit', { ...style, x: table.unitLeft, y, anchor: 'start' }, row.unit);
        text('item', { ...style, x: i === 0 && row.inline ? table.unitLeft : table.itemLeft, y, anchor: 'start' }, line);
        center += lineHeight;
      });
    }
  }

  // Operation nodes; a preparation step dashed, with its own fill.
  const operationShape = t.str('operation-shape');
  const point = t.num('operation-point');
  for (const op of layout.operations) {
    const b = op.box;
    const prepDash = dashes(t.str('prep-dash'));
    path(op.prep ? 'prep' : 'operation', shapePath(operationShape, b, point, t.num('operation-radius')), {
      box: b.id,
      fill: color(op.prep ? 'prep-fill' : 'operation-fill'),
      stroke: color('operation-stroke'),
      width: t.num('operation-stroke-width'),
      dash: op.prep ? prepDash : dashes(t.str('operation-stroke-dash')),
      join: 'round',
    });
    const mid = b.y + b.height / 2;
    // As svg.ts: the optional mark is one more line under the text, at the caption size.
    const markLine = op.mark ? captionSize * t.num('line-height') : 0;
    const opText = t.str(op.prep ? 'prep-text-color' : 'operation-text-color');
    b.lines.forEach((line, i) => {
      const center = mid - markLine / 2 + (i - (b.lines.length - 1) / 2) * lineHeight;
      text('operation-text', { box: b.id, x: b.x + b.width / 2, y: baseline(center, fontSize), size: fontSize, role: 'operation', anchor: 'middle', color: opText }, line);
    });
    if (op.mark) {
      const center = mid - markLine / 2 + (b.lines.length * lineHeight) / 2 + markLine / 2;
      text('operation-text', { box: b.id, x: b.x + b.width / 2, y: baseline(center, captionSize), size: captionSize, role: 'operation', anchor: 'middle', color: opText }, op.mark);
    }
    if (op.checkpoints.length > 0) {
      const x = b.x + b.width - cornerInset(operationShape, b.width, b.height, point, t.num('operation-radius'));
      const y = b.y;
      const r = t.num('checkpoint-radius');
      const stroke = color('checkpoint-stroke');
      const width = t.num('checkpoint-stroke-width');
      path('checkpoint', `M${x - r} ${y}A${r} ${r} 0 1 0 ${x + r} ${y}A${r} ${r} 0 1 0 ${x - r} ${y}Z`, { box: b.id, fill: color('checkpoint-fill'), stroke, width, dash: [] });
      // In the SVG the preparation rule's dashes reach the check mark too (`.dag-prep path`).
      path('checkmark', checkmarkPath(x, y, r), { box: b.id, fill: null, stroke, width, dash: op.prep ? prepDash : [], join: 'round', cap: 'round' });
    }
  }

  // The title.
  if (layout.title) {
    const b = layout.title.box;
    const titleShape = t.str('title-shape');
    const titleLeft = t.str('title-position') === 'left';
    const titleSize = t.num('title-font-size');
    const subSize = t.num('subtitle-font-size');
    const { main, sub } = layout.title;
    const stroke = { stroke: color('title-stroke'), width: t.num('title-stroke-width'), dash: [] };
    if (titleShape === 'pill') path('title', roundedRect(b, b.height / 2), { box: b.id, fill: color('title-fill'), ...stroke });
    else if (titleShape === 'rectangle') path('title', roundedRect(b, t.num('title-radius')), { box: b.id, fill: color('title-fill'), ...stroke });
    else if (titleShape === 'underline') {
      const y = b.y + b.height;
      path('title-rule', `M${t.num('margin')} ${y}L${layout.width - t.num('margin')} ${y}`, { box: b.id, fill: null, ...stroke });
    }
    const content = main.length * titleSize * 1.15 + sub.length * subSize * 1.35;
    let y = b.y + (b.height - content) / 2;
    const x = titleLeft ? b.x + t.num('title-padding-x') : b.x + b.width / 2;
    const anchor = titleLeft ? 'start' : 'middle';
    for (const line of main) {
      text('title-text', { box: b.id, x, y: baseline(y + (titleSize * 1.15) / 2, titleSize), size: titleSize, role: 'title', anchor, color: textColor }, line);
      y += titleSize * 1.15;
    }
    for (const line of sub) {
      text('subtitle', { box: b.id, x, y: baseline(y + (subSize * 1.35) / 2, subSize), size: subSize, role: 'title', anchor, color: textColor }, line);
      y += subSize * 1.35;
    }
  }

  // Every box of the layout must have been drawn.
  const drawn = new Set(out.map((item) => item.box).filter((id) => id !== undefined));
  for (const b of layout.boxes) {
    if (!BOX_KINDS.has(b.kind)) throw new Error(`PDF: the layout has a box of a kind the PDF does not draw: "${b.kind}" (${b.id})`);
    if (!drawn.has(b.id)) throw new Error(`PDF: the layout's ${b.kind} box ${b.id} is not drawn`);
  }
  return out;
}

// ------------------------------------------------------------------ the PDF

/**
 * An SVG arc from (x0, y0) as cubic segments of at most a quarter turn each, computed with
 * +, −, ×, ÷ and square root only. JavaScript defines those to the last bit; sin, cos and
 * atan2, which pdf-lib's own arc code uses, it leaves to each engine, and Chrome, Firefox and
 * Node round them differently in the last digit. So every engine writes the same numbers, and
 * the PDF the same bytes. Each segment ends exactly on its end point. Etna draws circular
 * arcs only (rounded corners, the checkpoint's circle); an arc turned on its axis is refused.
 */
function arcCubics(x0: number, y0: number, a: number[]): string {
  const [radiusX, radiusY, rotation, large, sweep, x, y] = a;
  if (x0 === x && y0 === y) return '';
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx === 0 || ry === 0) return `L${x} ${y}`;
  if (rotation % 180 !== 0) throw new Error(`PDF: an arc turned ${rotation}° is not drawn`);
  // Radii too small to reach the end point grow until they do (SVG 2, appendix B.2.5).
  const hx = (x0 - x) / 2;
  const hy = (y0 - y) / 2;
  const reach = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry);
  if (reach > 1) {
    rx *= Math.sqrt(reach);
    ry *= Math.sqrt(reach);
  }
  // On the unit circle (x over rx, y over ry): the center, and the start and end directions.
  const ux0 = x0 / rx;
  const uy0 = y0 / ry;
  const ux1 = x / rx;
  const uy1 = y / ry;
  const d = (ux1 - ux0) * (ux1 - ux0) + (uy1 - uy0) * (uy1 - uy0);
  let f = Math.sqrt(Math.max(0, 1 / d - 0.25));
  if ((large !== 0) === (sweep !== 0)) f = -f;
  const cx = (ux0 + ux1) / 2 - f * (uy1 - uy0);
  const cy = (uy0 + uy1) / 2 + f * (ux1 - ux0);
  const unit = (vx: number, vy: number): [number, number] => {
    const length = Math.sqrt(vx * vx + vy * vy);
    return [vx / length, vy / length];
  };
  // The way the arc turns: +1 toward positive angles (SVG's sweep 1), −1 the other way.
  const turn = sweep !== 0 ? 1 : -1;
  const at = (u: [number, number]): string => `${(cx + u[0]) * rx} ${(cy + u[1]) * ry}`;
  let out = '';
  // One piece from direction u to v, turning `turn`; split in two while it turns more than a
  // quarter (and a thousandth of a radian, as pdf-lib splits), so a half circle is two quarters.
  const piece = (u: [number, number], v: [number, number], end: string): void => {
    const cos = u[0] * v[0] + u[1] * v[1];
    const sin = turn * (u[0] * v[1] - u[1] * v[0]);
    if (sin < 0 || cos < -0.0009999998333333417) {
      // The middle direction: across a half turn, u turned a quarter; else halfway between u and v.
      const sx = u[0] + v[0];
      const sy = u[1] + v[1];
      const across = sx * sx + sy * sy < 1e-12;
      const m: [number, number] = across ? [-turn * u[1], turn * u[0]] : sin < 0 ? unit(-sx, -sy) : unit(sx, sy);
      piece(u, m, at(m));
      piece(m, v, end);
      return;
    }
    // The control points lie along the tangents, 4/3·tan(θ/4) of the radius out (θ the turn):
    // tan(θ/2) = sin θ / (1 + cos θ), and tan(θ/4) = tan(θ/2) / (1 + √(1 + tan²(θ/2))).
    const half = sin / (1 + cos);
    const k = ((4 / 3) * half) / (1 + Math.sqrt(1 + half * half));
    const c1x = (cx + u[0] - turn * k * u[1]) * rx;
    const c1y = (cy + u[1] + turn * k * u[0]) * ry;
    const c2x = (cx + v[0] + turn * k * v[1]) * rx;
    const c2y = (cy + v[1] - turn * k * v[0]) * ry;
    out += `C${c1x} ${c1y} ${c2x} ${c2y} ${end}`;
  };
  piece(unit(ux0 - cx, uy0 - cy), unit(ux1 - cx, uy1 - cy), `${x} ${y}`);
  return out;
}

/**
 * Quadratic segments as cubic ones (PDF has no quadratic curve; pdf-lib's stand-in is not one),
 * and arcs as cubic ones too (`arcCubics`), so pdf-lib draws only lines and cubic curves.
 */
export function cubicPath(d: string): string {
  let out = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const m of d.matchAll(/([MLHVQAZ])([^MLHVQAZ]*)/gi)) {
    const cmd = m[1];
    const a = m[2].trim() === '' ? [] : m[2].trim().split(/[\s,]+/).map(Number);
    switch (cmd) {
      case 'M':
        [cx, cy] = [a[0], a[1]];
        [sx, sy] = [cx, cy];
        out += `M${cx} ${cy}`;
        break;
      case 'L':
        [cx, cy] = [a[0], a[1]];
        out += `L${cx} ${cy}`;
        break;
      case 'H':
        cx = a[0];
        out += `L${cx} ${cy}`;
        break;
      case 'V':
        cy = a[0];
        out += `L${cx} ${cy}`;
        break;
      case 'Q': {
        const [qx, qy, x, y] = a;
        const c1x = cx + ((qx - cx) * 2) / 3;
        const c1y = cy + ((qy - cy) * 2) / 3;
        const c2x = x + ((qx - x) * 2) / 3;
        const c2y = y + ((qy - y) * 2) / 3;
        out += `C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`;
        [cx, cy] = [x, y];
        break;
      }
      case 'A':
        out += arcCubics(cx, cy, a);
        [cx, cy] = [a[5], a[6]];
        break;
      case 'Z':
        out += 'Z';
        [cx, cy] = [sx, sy];
        break;
      default:
        throw new Error(`PDF: path command "${cmd}" is not drawn`);
    }
  }
  return out;
}

const pdfColor = (css: string | null): { color: ReturnType<typeof rgb>; opacity: number } | null => {
  const c = css === null ? null : parseColor(css);
  return c === null || c.a === 0 ? null : { color: rgb(c.r, c.g, c.b), opacity: c.a };
};

/** One embedded face, with its outlines for checking which characters it has. */
interface Face {
  pdf: PDFFont;
  has(codePoint: number): boolean;
  /** Advance of a string at `size`, in points. */
  width(text: string, size: number): number;
}

/** Six capitals from a name (FNV-1a), the same every time. */
function subsetTag(name: string): string {
  let h = 0x811c9dc5;
  for (const c of name) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193) >>> 0;
  let tag = '';
  for (let i = 0; i < 6; i++) {
    tag += String.fromCharCode(65 + (h % 26));
    h = Math.floor(h / 26) + (i + 1) * 7919;
  }
  return tag;
}

/** Ligatures off: the screen's fonts draw `->`, `fi`, `www` as separate letters, and so must the PDF. */
const FEATURES = { liga: false, clig: false, dlig: false, calt: false, rlig: false };

/** The face that stands in for characters the theme's font lacks (fractions such as ⅓). */
const GLYPH_FALLBACK = 'Arimo';

/**
 * A one-page PDF of the laid-out chart: the sheet from `chartSheetFor` (with shape `auto`,
 * landscape for a wide chart; `portrait` or `landscape`, that way), the chart scaled
 * uniformly to fit its image box and centered in it.
 */
export async function drawPdf(layout: DetailedLayout, t: ThemeReader, options: PdfOptions): Promise<Uint8Array> {
  const items = drawList(layout, t);
  const sheet: ChartSheet = chartSheetFor(layout.width, layout.height, options.sheet?.paper ?? 'letter', options.sheet?.margin ?? '0.5in', pageShape(options.sheet?.shape));
  const { width: pageWidth, height: pageHeight, box } = sheet.points;
  const scale = Math.min(box.width / layout.width, box.height / layout.height);
  const left = box.x + (box.width - layout.width * scale) / 2;
  const top = box.y + (box.height - layout.height * scale) / 2;
  const pageY = (y: number): number => pageHeight - (top + y * scale);

  // No creation or modification date and a fixed producer: the same chart gives the same bytes.
  const doc = await PDFDocument.create({ updateMetadata: false });
  // The fork's own fontkit. Its TrueType subsetter keeps the font's own `loca` format, so a
  // glyph of odd length (Arimo has them) survives (tests/dag/pdf.test.ts).
  doc.registerFontkit(fontkit);
  // pdf-lib names each graphics state (/GS-…) from a sequence made with Math.sin, which engines
  // may round differently in the last bit, enough to change a name now and then. Counted
  // instead, with exact arithmetic only: /GS-1, /GS-2, … in the order they are drawn.
  let named = 0;
  (doc.context as unknown as { rng: { nextInt(): number } }).rng = { nextInt: () => (++named + 0.5) / 1e10 };
  doc.setTitle(options.title, { showInWindowTitleBar: true });
  doc.setCreator('Etna (etna dag --pdf)');
  doc.setProducer('Etna with pdf-lib');
  const page = doc.addPage([pageWidth, pageHeight]);

  // Fonts: each role's face, embedded once, and the glyph stand-in when a character needs it.
  const roles = pdfRoles(t);
  const embedded = new Map<string, Promise<Face>>();
  const embed = (face: PdfFace): Promise<Face> => {
    const key = `${face.family}|${face.weight}`;
    let f = embedded.get(key);
    if (!f) {
      f = (async () => {
        const bytes = await options.fonts.load(face);
        const outlines = fontkit.create(bytes);
        if ('fonts' in outlines) throw new Error(`${face.family} ${face.weight} is a font collection, not one face`);
        // A subset font's name starts with a tag of six capitals (PDF 9.6.4); this one is made
        // from the font's name, not drawn at random, so the bytes stay the same.
        const name = (outlines.postscriptName || `${face.family.replace(/ /g, '')}-${face.weight}`).replace(/[^A-Za-z0-9-]/g, '');
        const pdf = await doc.embedFont(bytes, { subset: true, features: FEATURES, customName: `${subsetTag(name)}+${name}` });
        return { pdf, has: (cp) => outlines.hasGlyphForCodePoint(cp), width: (text, size) => pdf.widthOfTextAtSize(text, size) };
      })();
      embedded.set(key, f);
    }
    return f;
  };
  const faceFor = (role: PdfRole): PdfFace => {
    const want = roles[role];
    const measure = t.str(role === 'title' ? 'title-text-measure' : 'text-measure');
    const face = pickPdfFace(want, options.fonts.faces, PDF_FALLBACK_FAMILY[measure] ?? GLYPH_FALLBACK);
    if (face === null) throw new Error(`no PDF font for ${want.family} ${want.weight} (nor ${PDF_FALLBACK_FAMILY[measure]}): run "etna fonts" to cache the chart themes' fonts`);
    return face;
  };

  // The stand-in is cached at fewer weights than the themes use (Arimo: 400 and 700), so it is
  // taken at the nearest cached weight, the heavier on a tie, as the layout measures a family.
  const standIn = (weight: number): PdfFace | null => pickPdfFace({ family: GLYPH_FALLBACK, weight }, options.fonts.faces, GLYPH_FALLBACK);

  const strokeStyle = (item: PathItem): PDFOperator[] => {
    const ops: PDFOperator[] = [PDFOperator.of(PDFOperatorNames.SetLineMiterLimit, [PDFNumber.of(4)])];
    if (item.join === 'round') ops.push(setLineJoin(LineJoinStyle.Round));
    return ops;
  };

  for (const item of items) {
    if (item.type === 'path') drawPath(page, item, left, pageY(0), scale, strokeStyle(item));
    else await drawText(page, item, roles[item.role], faceFor(item.role), embed, standIn, left, pageY, scale, t);
  }
  // Without object streams the dictionaries stay readable (`strings file.pdf | grep FontFile`).
  return doc.save({ useObjectStreams: false });
}

function drawPath(page: PDFPage, item: PathItem, x: number, y: number, scale: number, style: PDFOperator[]): void {
  const fill = pdfColor(item.fill);
  const stroke = item.width > 0 ? pdfColor(item.stroke) : null;
  if (fill === null && stroke === null) return;
  page.pushOperators(pushGraphicsState(), ...style);
  page.drawSvgPath(cubicPath(item.d), {
    x,
    y,
    scale,
    ...(fill ? { color: fill.color, opacity: fill.opacity } : {}),
    ...(stroke
      ? { borderColor: stroke.color, borderOpacity: stroke.opacity, borderWidth: item.width, borderDashArray: item.dash, ...(item.cap === 'round' ? { borderLineCap: LineCapStyle.Round } : {}) }
      : {}),
  });
  page.pushOperators(popGraphicsState());
}

async function drawText(
  page: PDFPage,
  item: TextItem,
  role: PdfFace,
  want: PdfFace,
  embed: (face: PdfFace) => Promise<Face>,
  standIn: (weight: number) => PdfFace | null,
  left: number,
  pageY: (y: number) => number,
  scale: number,
  t: ThemeReader,
): Promise<void> {
  const color = pdfColor(item.color);
  if (color === null) return;
  const primary = await embed(want);
  const size = item.size * scale;
  const cell = t.num('char-width') * size;
  // The layout measured the text with the role's own family when it has metrics (measure.ts):
  // the face drawn here, if it is that family at the weight measured, draws at that width; any
  // other run (a character it lacks, set in the stand-in, or a whole substitute family) is
  // held to the width the layout gave it. Without metrics and with `mono`, the layout gave
  // every character one cell of `char-width` em, and every run keeps to that grid.
  const which = item.role === 'title' ? 'title' : 'text';
  const metric = metricWeight(role.family, role.weight);
  const grid = metric === null && t.str(which === 'title' ? 'title-text-measure' : 'text-measure') === 'mono';
  const measure = metric === null ? null : t.measure(role.weight, which);
  const measured = metric !== null && want.family === role.family && want.weight === metric;

  // Runs of characters the primary face has, and of those only the stand-in has.
  const runs: { text: string; face: Face; chars: number }[] = [];
  let fallback: Face | null = null;
  for (const ch of item.text) {
    let face = primary;
    if (!primary.has(ch.codePointAt(0)!) && want.family !== GLYPH_FALLBACK) {
      if (!fallback) {
        const face = standIn(want.weight);
        fallback = face ? await embed(face).catch(() => primary) : primary;
      }
      if (fallback.has(ch.codePointAt(0)!)) face = fallback;
    }
    const last = runs[runs.length - 1];
    if (last && last.face === face) {
      last.text += ch;
      last.chars++;
    } else runs.push({ text: ch, face, chars: 1 });
  }
  type Run = (typeof runs)[number];
  const advance = (run: Run): number => (grid ? run.chars * cell : measure ? measure(run.text) * cell : run.face.width(run.text, size));
  const held = (run: Run): boolean => grid || (measure !== null && !(measured && run.face === primary));
  const total = runs.reduce((sum, run) => sum + advance(run), 0);
  let x = left + item.x * scale - (item.anchor === 'middle' ? total / 2 : item.anchor === 'end' ? total : 0);
  const y = pageY(item.y);
  for (const run of runs) {
    const natural = run.face.width(run.text, size);
    const squeeze = held(run) && natural > 0 ? (advance(run) * 100) / natural : 100;
    const squeezed = Math.abs(squeeze - 100) > 0.01;
    if (squeezed) page.pushOperators(pushGraphicsState(), setCharacterSqueeze(squeeze));
    page.drawText(run.text, { x, y, size, font: run.face.pdf, color: color.color, opacity: color.opacity });
    if (squeezed) page.pushOperators(popGraphicsState());
    x += advance(run);
  }
}

// ------------------------------------------------------------------ from a recipe

/** As renderDag's options (the sheet among them), plus the fonts. */
export type RenderDagPdfOptions = Omit<DagOptions, 'fonts'> & Omit<PdfOptions, 'title' | 'sheet'> & { title?: boolean };

/**
 * The flow chart of a recipe as a one-page PDF, laid out exactly as `renderDag` lays it out.
 * The document title is the recipe's name. Throws as renderDag does (a traditional recipe has
 * no chart), and when no font for the theme is to hand.
 */
export async function renderDagPdf(recipe: Recipe, options: RenderDagPdfOptions): Promise<Uint8Array> {
  const layout = computeLayout(recipe, { theme: options.theme, title: options.title, sheet: { ...options.sheet, shape: pageShape(options.sheet?.shape) } });
  return drawPdf(layout, readTheme(options.theme), {
    title: recipe.title?.text ?? 'Flow chart',
    sheet: options.sheet,
    fonts: options.fonts,
  });
}
