// The chart as a PDF (dag/pdf.ts): a valid one-page file on the sheet the chart's shape asks
// for, the theme's free fonts embedded, the recipe's name as its title, the same bytes every
// time; every kind of thing the SVG draws drawn; and the sheet math.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import fontkit, { type Font } from '@cantoo/fontkit';
import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { cachedPdfFaces } from '../../src/card/fonts.ts';
import { parseColor } from '../../src/dag/color.ts';
import { defaultDagTheme } from '../../src/dag/index.ts';
import { computeLayout } from '../../src/dag/layout/index.ts';
import type { DetailedLayout } from '../../src/dag/layout/types.ts';
import { CHARS } from '../../src/dag/metrics.ts';
import { loadDagTheme, listDagThemes } from '../../src/dag/node.ts';
import { pdfFaces, pickPdfFace } from '../../src/dag/pdf-fonts.ts';
import { cachedPdfFonts } from '../../src/dag/pdf-node.ts';
import { cubicPath, drawList, DRAW_KINDS, drawPdf, renderDagPdf } from '../../src/dag/pdf.ts';
import { CHART_MARGINS, CHART_SHAPES, chartBox, chartShape, chartSheet, chartSheetFor, pageShape } from '../../src/dag/sheet.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { ETNA_ROOT, loadUnits, readRecipe } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n${source}`, { units });
const example = (slug: string): Recipe => readRecipe(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'));
const fonts = cachedPdfFonts();
const latin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1');

// A Choose with a Checkpoint inside (dag.test.ts), and a preparation step: what no example has.
const CHOICES = parse(
  '# Choices\n\n## Mix\n\n- 10 g flour\n\nMix.\n\n## Cook\n\n> **Choose** — one method.\n\n### Stovetop\n\n- 5 g butter\n\nFry.\n\n' +
    '### Oven\n\n#### Heat\n\nHeat.\n\n#### Roast\n\n- 5 g oil\n\nRoast.\n\n> **Checkpoint** — golden at the edges.\n\n### Grill\n\nGrill.\n\n## Rest\n\nRest.\n\n## Serve\n\n- 1 pinch salt\n\nServe.\n',
);
const PREP = parse(
  '# Biscuits\n\n## Heat the oven\n\nHeat the oven to 450°F.\n\n## Flour mixture\n\n### Combine the flour\n\n- 1 cup flour\n\nCombine.\n\n' +
    '## Milk mixture\n\n### Whisk the milk\n\n- 1 cup milk\n\nWhisk.\n\n## Assembly\n\n### Stir together\n\n- [flour mixture](#flour-mixture)\n- [milk mixture](#milk-mixture)\n\nStir.\n\n### Bake\n\nBake.\n',
);

describe('the chart PDF', () => {
  it('has the chart PDF fonts of every bundled chart theme in the font cache', () => {
    const cached = cachedPdfFaces().map((f) => `${f.family} ${f.weight}`);
    for (const name of listDagThemes()) {
      for (const face of pdfFaces(readTheme(loadDagTheme(name)))) expect(cached, `${name} needs ${face.family} ${face.weight}`).toContain(`${face.family} ${face.weight}`);
    }
    // The stand-in for characters a theme's font lacks (⅓, ⅔, ⅛).
    expect(cached).toContain('Arimo 400');
  });

  for (const [slug, themeName, paper] of [
    ['nana-palumbos-meatloaf', 'flow', 'letter'],
    ['easter-bread', 'station', 'a4'],
    ['next-day-soft-cinnamon-rolls', 'ink', 'letter'],
  ] as const) {
    it(`is a valid one-page PDF with its fonts and title: ${slug} (${themeName}, ${paper})`, async () => {
      const recipe = example(slug);
      const theme = loadDagTheme(themeName);
      const bytes = await renderDagPdf(recipe, { theme, sheet: { paper }, fonts });
      expect(latin1(bytes.subarray(0, 5))).toBe('%PDF-');
      expect(latin1(bytes.subarray(bytes.length - 8)).trim().endsWith('%%EOF')).toBe(true);

      const doc = await PDFDocument.load(bytes, { updateMetadata: false });
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe(recipe.title!.text);
      expect(doc.getCreationDate()).toBeUndefined();

      // A PDF is always a sheet: with no shape it is laid out and printed for `auto`.
      const layout = computeLayout(recipe, { theme, sheet: { paper, shape: 'auto' } });
      const sheet = chartSheetFor(layout.width, layout.height, paper);
      const { width, height } = doc.getPage(0).getSize();
      expect(width).toBeCloseTo(sheet.points.width, 2);
      expect(height).toBeCloseTo(sheet.points.height, 2);
      expect(width > height).toBe(layout.width > layout.height);

      // Every face the theme sets text in, embedded as a subset (a tag, then the font's name).
      const text = latin1(bytes);
      expect(text).toContain('/FontFile2');
      const families = new Set(pdfFaces(readTheme(theme)).map((f) => f.family.replace(/ /g, '')));
      for (const family of families) expect(text).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${family}-`));

      // The same bytes again.
      expect(Buffer.from(await renderDagPdf(recipe, { theme, sheet: { paper }, fonts })).equals(Buffer.from(bytes))).toBe(true);
    });
  }

  it('lays out and prints Flow exactly as the mono cell grid does, now that JetBrains Mono has metrics', async () => {
    // A font with no metrics falls back to `mono`; the PDF then stands in JetBrains Mono for it.
    const grid = { name: 'Flow', values: { ...defaultDagTheme.values, 'font-family': '"Unmeasured Mono", monospace', 'title-font-family': '"Unmeasured Mono", monospace' } };
    for (const slug of ['nana-palumbos-meatloaf', 'next-day-soft-cinnamon-rolls']) {
      const recipe = example(slug);
      expect(computeLayout(recipe, { theme: defaultDagTheme }), slug).toEqual(computeLayout(recipe, { theme: grid }));
      const a = await renderDagPdf(recipe, { theme: defaultDagTheme, fonts });
      const b = await renderDagPdf(recipe, { theme: grid, fonts });
      expect(Buffer.from(a).equals(Buffer.from(b)), slug).toBe(true);
    }
  });

  it('prints a chart in a card theme\'s font, measured and embedded from the cache', async () => {
    const theme = { name: 'Folio type', values: { 'font-family': 'Spectral, serif', 'text-measure': 'serif', 'title-font-family': 'Spectral, serif', 'title-text-measure': 'serif' } };
    const bytes = await renderDagPdf(example('nana-palumbos-meatloaf'), { theme, fonts });
    const text = latin1(bytes);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Spectral-Regular/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Spectral-Bold/);
    // Without the font to hand it stands in Arimo, held to the widths the layout measured.
    const arimo = { faces: fonts.faces.filter((f) => f.family === 'Arimo'), load: fonts.load };
    const stand = latin1(await renderDagPdf(example('nana-palumbos-meatloaf'), { theme, fonts: arimo }));
    expect(stand).toMatch(/\/BaseFont \/[A-Z]{6}\+Arimo-Regular/);
    expect(stand).not.toContain('Spectral');
  });

  it('sets a character the theme font lacks in Arimo at the nearest cached weight (Station: 300, 500, 600)', async () => {
    // Nunito Sans has no ⅓ ⅔ ⅛, and Arimo is cached only at 400 and 700: the stand-in for the
    // title (300) and ingredients (500) is Arimo 400, for the steps (600) Arimo 700. Asking for
    // Arimo at the theme's own weight found nothing and left the characters as empty boxes.
    expect(fonts.faces.filter((f) => f.family === 'Arimo').map((f) => f.weight)).toEqual([400, 700]);
    expect([300, 500, 600].map((weight) => pickPdfFace({ family: 'Arimo', weight }, fonts.faces, 'Arimo')?.weight)).toEqual([400, 400, 700]);
    const recipe = parse('# Thirds ⅓\n\n## Mix ⅔\n\n- ⅛ tsp salt\n\nMix.\n');
    const text = latin1(await renderDagPdf(recipe, { theme: loadDagTheme('station'), fonts }));
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Arimo-Regular/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Arimo-Bold/);
    // Without them the chart embeds Nunito Sans only.
    const plain = latin1(await renderDagPdf(parse('# Thirds\n\n## Mix\n\n- 1 tsp salt\n\nMix.\n'), { theme: loadDagTheme('station'), fonts }));
    expect(plain).not.toContain('Arimo');
  });

  // Subsets every cached font face: well over a second when the machine is busy, so a long timeout.
  it('subsets every cached face with each glyph whole, odd-length ones too (Arimo, Inter)', { timeout: 60_000 }, () => {
    // The subsetter pdf-lib calls: the glyphs of every character the layout measures, read back
    // from the subset and drawn as the source font draws them. The old @pdf-lib/fontkit halved
    // each offset into a short `loca` and lost odd-length glyphs; @cantoo/fontkit keeps the font's
    // own `loca` format, so Etna carries no fix for it.
    const outline = (font: Font, gid: number): string | null => {
      try {
        return font.getGlyph(gid)?.path.toSVG() ?? null;
      } catch {
        return null;
      }
    };
    // Read, not in the package's types: the `head` table and a subset's source glyph ids.
    const locFormat = (font: Font): number => (font as unknown as { head: { indexToLocFormat: number } }).head.indexToLocFormat;
    const open = (bytes: Uint8Array): Font => {
      const font = fontkit.create(bytes);
      if ('fonts' in font) throw new Error('a font collection');
      return font;
    };
    for (const face of cachedPdfFaces()) {
      const font = open(readFileSync(face.path));
      const subset = font.createSubset();
      for (const ch of CHARS) {
        const glyph = font.hasGlyphForCodePoint(ch.codePointAt(0)!) ? font.glyphForCodePoint(ch.codePointAt(0)!) : null;
        if (glyph) subset.includeGlyph(glyph);
      }
      const back = open(subset.encode());
      expect(locFormat(back), face.path).toBe(locFormat(font));
      const glyphs = (subset as unknown as { glyphs: number[] }).glyphs;
      expect(glyphs.length, face.path).toBeGreaterThan(100);
      const damaged = glyphs.filter((gid, i) => outline(back, i) === null || outline(back, i) !== outline(font, gid));
      expect(damaged, `${face.family} ${face.weight}`).toEqual([]);
    }
  });

  it('sets the chart in its box: scaled to fit, centered, inside the margin', async () => {
    const recipe = example('nana-palumbos-meatloaf');
    const layout = computeLayout(recipe, { theme: defaultDagTheme });
    const sheet = chartSheetFor(layout.width, layout.height, 'letter', '1in');
    const scale = Math.min(sheet.points.box.width / layout.width, sheet.points.box.height / layout.height);
    // The background rectangle is the first thing drawn: its corners are the chart's.
    const bytes = await drawPdf(layout, readTheme(defaultDagTheme), { title: 'T', sheet: { margin: '1in' }, fonts });
    const doc = await PDFDocument.load(bytes);
    // Nana Palumbo's Meatloaf, its loaf and sauce framed above the finish, charts taller than
    // wide: letter, portrait.
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getPage(0).getSize()).toEqual({ width: sheet.points.width, height: sheet.points.height });
    const drawn = { width: layout.width * scale, height: layout.height * scale };
    expect(drawn.width).toBeLessThanOrEqual(sheet.points.box.width + 1e-6);
    expect(drawn.height).toBeLessThanOrEqual(sheet.points.box.height + 1e-6);
    expect(Math.max(drawn.width / sheet.points.box.width, drawn.height / sheet.points.box.height)).toBeCloseTo(1, 6);
  });

  it('keeps the text real: a viewer can find the recipe’s words in it', async () => {
    const bytes = await renderDagPdf(example('nana-palumbos-meatloaf'), { fonts });
    // Text is shown with a font, through Tj, and the font maps its glyphs back to text.
    const text = latin1(bytes);
    expect(text).toContain('/ToUnicode');
    expect(text).toMatch(/\/Type \/Font\s*\/Subtype \/Type0/);
  });

  it('refuses a recipe in the traditional form, as the SVG does', async () => {
    const traditional = parseRecipe('---\netna: 1\nform: traditional\n---\n\n# Toast\n\n## Ingredients\n\n- 1 slice bread\n\n## Directions\n\n1. Toast it.\n', { units });
    expect(traditional.form).toBe('traditional');
    await expect(renderDagPdf(traditional, { fonts })).rejects.toThrow(/traditional/);
  });

  it('says what to do when no font for the theme is to hand', async () => {
    const none = { faces: [], load: async () => new Uint8Array() };
    await expect(renderDagPdf(example('nana-palumbos-meatloaf'), { fonts: none })).rejects.toThrow(/etna fonts/);
  });
});

describe('what the PDF draws', () => {
  const kinds = (recipe: Recipe, values: Record<string, string | number> = {}): Set<string> => {
    const theme = { name: 'test', values: { ...defaultDagTheme.values, ...values } };
    return new Set(drawList(computeLayout(recipe, { theme }), readTheme(theme)).map((i) => i.kind));
  };

  it('draws every kind of thing the SVG draws, across charts that have them all', () => {
    const seen = new Set<string>([
      ...kinds(example('an-etna-recipe')),
      ...kinds(example('italian-wedding-soup')),
      ...kinds(example('easter-bread')),
      ...kinds(example('pistachio-in-the-style-of-van-leeuwen')),
      ...kinds(example('frosty-chocolate'), { 'title-shape': 'underline', 'title-position': 'left' }),
      ...kinds(CHOICES),
      ...kinds(PREP),
      ...kinds(PREP, { 'ingredient-side': 'right', 'ingredient-shape': 'hexagon' }),
    ]);
    expect([...seen].sort()).toEqual([...DRAW_KINDS].sort());
  });

  it('draws every box of the layout, mirrored or not', () => {
    for (const recipe of [CHOICES, PREP, example('an-etna-recipe')]) {
      for (const side of ['left', 'right']) {
        const theme = { name: 'test', values: { ...defaultDagTheme.values, 'ingredient-side': side } };
        const layout = computeLayout(recipe, { theme });
        const items = drawList(layout, readTheme(theme));
        const drawn = new Set(items.map((i) => i.box));
        for (const b of layout.boxes) expect(drawn.has(b.id), `${b.kind} ${b.id}`).toBe(true);
      }
    }
  });

  it('refuses a layout holding a box it does not know how to draw, rather than leaving it out', () => {
    const layout = computeLayout(PREP, { theme: defaultDagTheme });
    const odd = { ...layout, boxes: [...layout.boxes, { id: 'odd', kind: 'mystery', x: 0, y: 0, width: 1, height: 1, lines: [] }] } as unknown as DetailedLayout;
    expect(() => drawList(odd, readTheme(defaultDagTheme))).toThrow(/kind the PDF does not draw: "mystery"/);
    const lost = { ...layout, boxes: [...layout.boxes, { ...layout.boxes[0], id: 'lost' }] } as DetailedLayout;
    expect(() => drawList(lost, readTheme(defaultDagTheme))).toThrow(/lost is not drawn/);
  });

  it('dashes what the SVG dashes', () => {
    const theme = readTheme(defaultDagTheme);
    const items = [...drawList(computeLayout(CHOICES, { theme: defaultDagTheme }), theme), ...drawList(computeLayout(PREP, { theme: defaultDagTheme }), theme)];
    const dash = (kind: string) => items.find((i) => i.kind === kind && i.type === 'path');
    expect(dash('choose')).toMatchObject({ dash: [6, 5], fill: null });
    expect(dash('separator')).toMatchObject({ dash: [6, 5] });
    expect(dash('prep')).toMatchObject({ dash: [5, 4], fill: '#ffffff' });
    expect(dash('operation')).toMatchObject({ dash: [], fill: '#c1e4f7', join: 'round' });
  });

  it('turns quadratic curves into cubic ones, the same curve', () => {
    expect(cubicPath('M0 0Q3 3 6 0Z')).toBe('M0 0C2 2 4 2 6 0Z');
  });

  it('turns arcs into cubic curves of at most a quarter turn, ending exactly on the end point', () => {
    // A quarter circle of radius 2: the control points 4/3·(√2 − 1)·2 along the tangents.
    const k = (4 / 3) * (Math.SQRT2 - 1) * 2;
    const quarter = cubicPath('M0 0A2 2 0 0 1 2 2').match(/-?[\d.e-]+/g)!.map(Number);
    expect(cubicPath('M0 0A2 2 0 0 1 2 2')).toMatch(/^M0 0C[^A]* 2 2$/);
    [0, 0, k, 0, 2, 2 - k, 2, 2].forEach((v, i) => expect(quarter[i]).toBeCloseTo(v, 12));
    // The checkpoint's circle: two half turns, each two quarters; the other way round mirrored.
    const circle = cubicPath('M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z');
    expect(circle.match(/C/g)).toHaveLength(4);
    expect(circle).not.toMatch(/A/);
    expect(circle).toMatch(/ 10 5C.* 0 5Z$/);
    const other = cubicPath('M0 0A2 2 0 0 0 2 2').match(/-?[\d.e-]+/g)!.map(Number);
    [0, 0, 0, k, 2 - k, 2, 2, 2].forEach((v, i) => expect(other[i]).toBeCloseTo(v, 12));
    // No radius is a straight line; the same point, nothing; an arc turned on its axis is refused.
    expect(cubicPath('M0 0A0 2 0 0 1 4 4')).toBe('M0 0L4 4');
    expect(cubicPath('M1 1A2 2 0 0 1 1 1Z')).toBe('M1 1Z');
    expect(() => cubicPath('M0 0A2 1 30 0 1 4 4')).toThrow(/turned 30/);
  });
});

/** `x` moved by one unit in the last place (away from zero, or toward it): what another engine's sin or cos might return. */
const nudge = (x: number, step: 1n | -1n): number => {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigInt64(0, view.getBigInt64(0) + step);
  return view.getFloat64(0);
};

describe('the same bytes in every JavaScript engine', () => {
  // The bytes of three charts' PDFs, pinned from Node after the PDFs were looked at. Arcs and
  // names are made without sin and cos so that every JavaScript engine writes the same bytes;
  // Node, Chrome and Firefox did, for the charts checked in all three. A change to the chart's
  // layout or drawing, or to one of these recipes, changes them on purpose: update them then,
  // after checking the PDFs.
  const PINNED: [string, string, string][] = [
    ['next-day-soft-cinnamon-rolls', 'flow', '1f0c60e3812c37916fa72484d866622a073290cf0acbfe7d2109e272de245dcb'],
    ['easter-bread', 'dense', 'dd8bf260aaf649617f839331e4b354ee3a847d0cab97fa3dd36fdd4dfa560c01'],
    ['nana-palumbos-meatloaf', 'station', '4cb73792e00fb0fc0151bd1178580e4c41b7d4ad65b4372e51109b935647a88c'],
  ];
  const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
  const render = (slug: string, themeName: string): Promise<Uint8Array> => renderDagPdf(example(slug), { theme: loadDagTheme(themeName), fonts });

  for (const [slug, themeName, hash] of PINNED) {
    it(`writes the pinned bytes: ${slug} (${themeName})`, async () => {
      expect(sha256(await render(slug, themeName))).toBe(hash);
    });
  }

  // JavaScript defines +, −, ×, ÷ and square root to the last bit, and leaves sin, cos, atan2,
  // exp, log, pow and the rest to each engine. Here every one of those returns one unit in the
  // last place off Node's, one way and then the other, as another engine might: the PDF must not
  // change at all. Left alone, as every engine gives them exactly: Math.hypot with one length
  // only (the layout measures its straight runs so); a whole power of 2 or 10, and the log of a
  // whole power of 2 (fontkit writes log(4) / LN2 = 2 into each font's table directory; pdf-lib
  // uses powers of 10 for its numbers). The `**` operator cannot be caught here.
  for (const step of [1n, -1n] as const) {
    it(`does not change when sin, cos, atan2 and the other engine-rounded functions are a unit ${step > 0 ? 'away from zero' : 'toward zero'} in the last place`, async () => {
      const names = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot'] as const;
      const math = Math as unknown as Record<string, (...a: number[]) => number>;
      const real = Object.fromEntries(names.map((n) => [n, math[n]]));
      const exact = (n: string, a: number[]): boolean =>
        (n === 'hypot' && a.filter((v) => v !== 0).length < 2) || (n === 'pow' && (a[0] === 2 || a[0] === 10) && Number.isInteger(a[1])) ||
        (n === 'log' && Number.isInteger(a[0]) && a[0] > 0 && a[0] < 2 ** 31 && (a[0] & (a[0] - 1)) === 0);
      const expected = await Promise.all(PINNED.map(([slug, themeName]) => render(slug, themeName)));
      let calls = 0;
      try {
        for (const n of names) math[n] = (...a: number[]) => (exact(n, a) ? real[n](...a) : (calls++, nudge(real[n](...a), step)));
        for (const [i, [slug, themeName]] of PINNED.entries()) expect(sha256(await render(slug, themeName)), `${slug} (${themeName})`).toBe(sha256(expected[i]));
      } finally {
        for (const n of names) math[n] = real[n];
      }
      // The nudged functions were called (by the layout, pdf-lib, fontkit), and nothing of them reached the page.
      expect(calls).toBeGreaterThan(0);
    });
  }
});

describe('PDF fonts', () => {
  it('picks the theme’s family at the nearest weight, else the stand-in for its measure', () => {
    const faces = [
      { family: 'Nunito Sans', weight: 300 },
      { family: 'Nunito Sans', weight: 600 },
      { family: 'Arimo', weight: 400 },
    ];
    expect(pickPdfFace({ family: 'Nunito Sans', weight: 500 }, faces, 'Arimo')).toEqual({ family: 'Nunito Sans', weight: 600 });
    expect(pickPdfFace({ family: 'Nunito Sans', weight: 400 }, faces, 'Arimo')).toEqual({ family: 'Nunito Sans', weight: 300 });
    expect(pickPdfFace({ family: 'Lato', weight: 700 }, faces, 'Arimo')).toEqual({ family: 'Arimo', weight: 400 });
    expect(pickPdfFace({ family: 'Lato', weight: 700 }, faces, 'Inter')).toBeNull();
  });

  it('reads every color the schema accepts', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor('#33333380')).toMatchObject({ a: 128 / 255 });
    expect(parseColor('rebeccapurple')).toEqual({ r: 0x66 / 255, g: 0x33 / 255, b: 0x99 / 255, a: 1 });
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0 0 255 / 0.5)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(parseColor('hsl(120, 100%, 25%)')).toEqual({ r: 0, g: 0.5, b: 0, a: 1 });
    expect(parseColor('none')).toBeNull();
    expect(parseColor('transparent')).toBeNull();
  });
});

describe('the chart sheet', () => {
  it('turns landscape for a wide chart and fits the box inside the margin and the inset', () => {
    const wide = chartSheetFor(900, 500, 'letter');
    expect(wide).toMatchObject({ landscape: true, width: '11in', height: '8.5in', imgWidth: '9.75in', imgHeight: '7.25in', size: 'letter landscape' });
    expect(wide.points).toEqual({ width: 792, height: 612, box: { x: 45, y: 45, width: 702, height: 522 } });
    const tall = chartSheetFor(500, 900, 'letter', '1in');
    expect(tall).toMatchObject({ landscape: false, margin: '1in', imgWidth: '6.25in', imgHeight: '8.75in' });
    expect(tall.points).toEqual({ width: 612, height: 792, box: { x: 81, y: 81, width: 450, height: 630 } });
    const a4 = chartSheetFor(500, 900, 'a4');
    expect(a4).toMatchObject({ imgWidth: '178.2mm', imgHeight: '265.2mm', size: 'A4' });
    expect(a4.points.width).toBeCloseTo(595.276, 3);
    expect(a4.points.height).toBeCloseTo(841.89, 2);
    expect(a4.points.box.x).toBeCloseTo((12.7 + 3.2) * (72 / 25.4), 3);
    // A square chart stays portrait.
    expect(chartSheetFor(600, 600, 'a4').landscape).toBe(false);
  });

  it('reads the chart’s size from an SVG viewBox, as the GUI did', () => {
    expect(chartSheet('<svg viewBox="0 0 900 500">', 'letter')).toEqual(chartSheetFor(900, 500, 'letter'));
    expect(chartSheet('<svg>', 'letter').landscape).toBe(false);
  });

  it('turns the sheet as the page shape says: auto as before, portrait and landscape whatever the chart', () => {
    for (const [w, h] of [[900, 500], [500, 900], [600, 600]] as const) {
      expect(chartSheetFor(w, h, 'letter', '0.5in', 'auto')).toEqual(chartSheetFor(w, h, 'letter'));
      expect(chartSheetFor(w, h, 'letter', '0.5in', 'portrait')).toMatchObject({ landscape: false, width: '8.5in', height: '11in', size: 'letter' });
      expect(chartSheetFor(w, h, 'a4', '1in', 'landscape')).toMatchObject({ landscape: true, width: '297mm', height: '210mm', size: 'A4 landscape', margin: '1in' });
    }
    // A wide chart on a portrait sheet: the box is the upright one.
    expect(chartSheetFor(900, 500, 'letter', '0.5in', 'portrait').points).toEqual({ width: 612, height: 792, box: { x: 45, y: 45, width: 522, height: 702 } });
    expect(chartSheet('<svg viewBox="0 0 500 900">', 'letter', '0.75in', 'landscape')).toEqual(chartSheetFor(500, 900, 'letter', '0.75in', 'landscape'));
    // No viewBox: portrait, unless the shape says landscape.
    expect(chartSheet('<svg>', 'letter', '0.5in', 'landscape').landscape).toBe(true);
  });

  it('gives the box a chart may fill on an upright sheet, as chartSheetFor does', () => {
    for (const paper of ['letter', 'a4'] as const) {
      for (const margin of CHART_MARGINS) {
        const { box } = chartSheetFor(1, 1, paper, margin, 'portrait').points;
        expect(chartBox(paper, margin), `${paper} ${margin}`).toEqual({ width: box.width, height: box.height });
        // Landscape is the same box on its side.
        const turned = chartSheetFor(1, 1, paper, margin, 'landscape').points.box;
        expect(chartBox(paper, margin)).toEqual({ width: turned.height, height: turned.width });
      }
      expect(chartBox(paper)).toEqual(chartBox(paper, '0.5in'));
    }
    expect(chartBox('letter')).toEqual({ width: 522, height: 702 });
  });

  it('reads what a chart is fitted to, anything else as the screen; a PDF of a screen chart prints on auto', () => {
    expect(CHART_SHAPES).toEqual(['screen', 'auto', 'portrait', 'landscape']);
    for (const shape of CHART_SHAPES) expect(chartShape(shape)).toBe(shape);
    for (const bad of ['', 'Portrait', 'Screen', 'square', null, undefined]) expect(chartShape(bad)).toBe('screen');
    for (const shape of ['auto', 'portrait', 'landscape'] as const) expect(pageShape(shape)).toBe(shape);
    for (const value of ['screen', '', 'square', null, undefined]) expect(pageShape(value)).toBe('auto');
  });

  it('prints on the sheet the shape asks for, and with auto or screen exactly as with no shape', async () => {
    const recipe = example('nana-palumbos-meatloaf');
    const plain = await renderDagPdf(recipe, { fonts });
    expect(Buffer.from(await renderDagPdf(recipe, { sheet: { shape: 'screen' }, fonts })).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(await renderDagPdf(recipe, { sheet: { shape: 'auto' }, fonts })).equals(Buffer.from(plain))).toBe(true);
    expect(Buffer.from(await renderDagPdf(recipe, { sheet: { paper: 'letter', margin: '0.5in', shape: 'auto' }, fonts })).equals(Buffer.from(plain))).toBe(true);
    for (const shape of ['portrait', 'landscape'] as const) {
      const doc = await PDFDocument.load(await renderDagPdf(recipe, { sheet: { paper: 'a4', shape }, fonts }));
      // A fixed shape does not depend on the chart's proportions.
      const sheet = chartSheetFor(1, 1, 'a4', '0.5in', shape);
      const size = doc.getPage(0).getSize();
      expect(size.width).toBeCloseTo(sheet.points.width, 2);
      expect(size.height).toBeCloseTo(sheet.points.height, 2);
      expect(size.width > size.height).toBe(shape === 'landscape');
    }
  });
});

describe('fonts in the SVG', () => {
  it('embeds the theme’s free fonts in `embedded` mode, and none in `none` mode or by the theme’s choice', async () => {
    const { renderDag, chartFontFamilies } = await import('../../src/dag/index.ts');
    const { chartFontCss } = await import('../../src/dag/pdf-node.ts');
    const recipe = example('nana-palumbos-meatloaf');
    for (const [name, family] of [
      ['flow', 'JetBrains Mono'],
      ['ink', 'Arimo'],
      ['station', 'Nunito Sans'],
    ] as const) {
      const theme = loadDagTheme(name);
      expect(chartFontFamilies(theme)).toEqual([family]);
      const css = chartFontCss(theme);
      // WOFF2 from the cache, as data: URLs.
      expect(css).toContain(`font-family: "${family}";`);
      expect(css).toMatch(/src: url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\("woff2"\)/);
      // One variable file per subset, embedded once, for every weight the theme draws at.
      expect(css).toContain({ flow: 'font-weight: 400 700;', ink: 'font-weight: 400 700;', station: 'font-weight: 300 600;' }[name]);
      expect(css.match(/@font-face/g)).toHaveLength(2);
      const embedded = renderDag(recipe, { theme, fonts: { css } });
      const none = renderDag(recipe, { theme, fonts: { mode: 'none', css } });
      expect(embedded).toContain(`@font-face {\n  font-family: "${family}";`);
      expect(embedded).toMatch(new RegExp(`\\.etna-dag text\\{font-family:"?${family}"?, `));
      expect(none).not.toContain('@font-face');
      expect(embedded.length).toBeGreaterThan(none.length);
      // The stack still names the fallbacks, and nothing in the SVG loads from anywhere.
      expect(embedded).not.toMatch(/url\((?!data:)/);
      const off = renderDag(recipe, { theme: { ...theme, values: { ...theme.values, 'font-embedding': 'none' } }, fonts: { css } });
      expect(off).not.toContain('@font-face');
    }
  });

  it('refuses font css that could break out of the style block', async () => {
    const { renderDag } = await import('../../src/dag/index.ts');
    expect(() => renderDag(example('nana-palumbos-meatloaf'), { fonts: { css: '</style><script>x</script>' } })).toThrow(/@font-face rules only/);
  });
});
