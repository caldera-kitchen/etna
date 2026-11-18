// "Match the card": dag/card-type.ts, and that every face a matched chart draws is cached.

import { describe, expect, it } from 'vitest';

import { cardType } from '../../src/card/index.ts';
import { readFontIndex } from '../../src/card/fonts.ts';
import { cachedPdfFaces } from '../../src/card/fonts.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import {
  applyCardType,
  cardTypeValues,
  chartCanUse,
  chartFontFamilies,
  defaultDagTheme,
  nominalWidth,
  renderDag,
  stackMeasure,
  themeFonts,
  xHeightFactor,
  type CardType,
  type DagTheme,
} from '../../src/dag/index.ts';
import { listDagThemes, loadDagTheme } from '../../src/dag/node.ts';
import { pdfFaces } from '../../src/dag/pdf-fonts.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const folio: CardType = { body: { stack: 'Spectral, "Spectral SC", serif' }, title: { stack: 'Spectral, serif', weight: 400 } };
const mise: CardType = { body: { stack: 'Figtree, sans-serif' }, title: { stack: 'Figtree, sans-serif', weight: 300 } };
const countertop: CardType = { body: { stack: 'Merriweather, serif' }, title: { stack: 'Merriweather, serif', weight: 500 } };

describe('the fonts value', () => {
  it('is own unless a theme says card; flow, dense and ink say card, station own', () => {
    expect(themeFonts({ name: 'x', values: {} })).toBe('own');
    expect(themeFonts(undefined)).toBe('own');
    expect(themeFonts(defaultDagTheme)).toBe('card');
    expect(Object.fromEntries(listDagThemes().map((n) => [n, themeFonts(loadDagTheme(n))]))).toEqual({ dense: 'card', flow: 'card', ink: 'card', station: 'own' });
  });

  it('leaves a theme that says own, or nothing, as it is', () => {
    const station = loadDagTheme('station');
    expect(applyCardType(station, folio)).toBe(station);
    const silent: DagTheme = { name: 'Silent', values: { 'font-size': 12 } };
    expect(applyCardType(silent, folio)).toBe(silent);
  });

  it('refuses a card stack a chart theme may not hold, and keeps the theme', () => {
    const odd: CardType = { body: { stack: 'Font_With.Underscore, serif' }, title: { stack: 'Georgia, serif', weight: 700 } };
    expect(chartCanUse(odd)).toBe(false);
    const flow = loadDagTheme('flow');
    expect(applyCardType(flow, odd)).toBe(flow);
  });
});

describe('the nominal character', () => {
  it('is the mean advance over the lowercase alphabet, from the font\'s own widths', () => {
    expect(nominalWidth('"JetBrains Mono", monospace', 700)).toBe(0.6);
    expect(nominalWidth('Spectral, serif', 700)).toBe(0.523);
    expect(nominalWidth('Figtree, sans-serif', 400)).toBe(0.507);
    // 500 is measured at the nearest cached weight, the heavier on a tie: 700 for Spectral.
    expect(nominalWidth('Spectral, serif', 600)).toBe(nominalWidth('Spectral, serif', 700));
  });

  it('falls back to the table the generic family names, for a family without metrics', () => {
    expect(stackMeasure('Georgia, serif')).toBe('serif');
    expect(stackMeasure('"Some Mono", ui-monospace')).toBe('mono');
    expect(stackMeasure('Futura, "Jost"')).toBe('sans');
    expect(nominalWidth('Uncached Serif, serif', 400)).toBe(0.551);
    expect(nominalWidth('Uncached Sans, sans-serif', 400)).toBe(0.533);
    expect(nominalWidth('Uncached Mono, monospace', 400)).toBe(0.6);
  });
});

describe('the mapping', () => {
  it('sets the title in the card\'s title font and weight, the rest in its body font', () => {
    const v = cardTypeValues(loadDagTheme('flow'), mise);
    expect(v).toEqual({
      'font-family': 'Figtree, sans-serif',
      'text-measure': 'sans',
      'font-weight': 700,
      'ingredient-font-weight': 400,
      'operation-font-weight': 700,
      'char-width': 0.507,
      'title-font-family': 'Figtree, sans-serif',
      'title-text-measure': 'sans',
      'title-font-weight': 300,
      'title-wrap': 22,
      'font-size': 15.4,
      'caption-font-size': 12.1,
      'component-title-font-size': 16.5,
      'title-font-size': 33,
      'subtitle-font-size': 16.5,
    });
  });

  it('sets ingredients in the body font\'s regular weight, and keeps the theme\'s operation weight', () => {
    for (const chart of ['flow', 'dense', 'ink']) {
      for (const card of [folio, mise, countertop]) {
        const v = cardTypeValues(loadDagTheme(chart), card);
        expect(v['ingredient-font-weight'], chart).toBe(400);
        expect(v['operation-font-weight'], chart).toBe(readTheme(loadDagTheme(chart)).num('operation-font-weight'));
      }
    }
    // The nominal character is taken at that weight: Spectral's regular, not Flow's bold.
    expect(cardTypeValues(loadDagTheme('flow'), folio)['char-width']).toBe(nominalWidth('Spectral, serif', 400));
    // A body font not cached at 400 takes the nearest weight it is: Nunito Sans's 500.
    const nunito: CardType = { body: { stack: '"Nunito Sans", sans-serif' }, title: { stack: '"Nunito Sans", sans-serif', weight: 300 } };
    expect(cardTypeValues(loadDagTheme('flow'), nunito)['ingredient-font-weight']).toBe(500);
  });

  it('scales every text size by x-height: Flow in Folio, Mise and Countertop', () => {
    // JetBrains Mono's x-height is 0.550 em; Spectral's 0.450, Figtree's 0.500, Merriweather's 0.5555.
    const flow = loadDagTheme('flow');
    const factors = [folio, mise, countertop].map((card) => xHeightFactor(flow.values['font-family'] as string, 700, card.body.stack, 400));
    expect(factors.map((f) => Math.round(f * 1000) / 1000)).toEqual([1.222, 1.1, 0.99]);
    const sizes = (card: CardType): number[] => {
      const v = cardTypeValues(flow, card);
      return ['font-size', 'title-font-size', 'subtitle-font-size', 'caption-font-size', 'component-title-font-size'].map((k) => v[k] as number);
    };
    // Flow's 14, 30, 15, 11, 15.
    expect(sizes(folio)).toEqual([17.11, 36.67, 18.33, 13.44, 18.33]);
    expect(sizes(mise)).toEqual([15.4, 33, 16.5, 12.1, 16.5]);
    expect(sizes(countertop)).toEqual([13.86, 29.7, 14.85, 10.89, 14.85]);
  });

  it('scales the title by the title fonts, the rest by the body fonts', () => {
    // Galley: IBM Plex Sans Condensed, 0.516 em at 400 and 0.525 at its title's 700; Dense is Arimo, 0.5283 at both.
    const galley: CardType = { body: { stack: '"IBM Plex Sans Condensed", sans-serif' }, title: { stack: '"IBM Plex Sans Condensed", sans-serif', weight: 700 } };
    const v = cardTypeValues(loadDagTheme('dense'), galley);
    expect(v['font-size']).toBe(Math.round(11 * (528.3 / 516) * 100) / 100);
    expect(v['title-font-size']).toBe(Math.round(20 * (528.3 / 525) * 100) / 100);
    expect(v['subtitle-font-size']).toBe(Math.round(11 * (528.3 / 525) * 100) / 100);
  });

  it('leaves the sizes alone for a font without metrics, and for the theme\'s own family', () => {
    const flow = loadDagTheme('flow');
    const own = readTheme(flow);
    const keys = ['font-size', 'title-font-size', 'subtitle-font-size', 'caption-font-size', 'component-title-font-size'];
    const uncached: CardType = { body: { stack: 'Georgia, serif' }, title: { stack: 'Palatino, serif', weight: 700 } };
    expect(xHeightFactor('"JetBrains Mono", monospace', 700, 'Georgia, serif', 400)).toBe(1);
    expect(xHeightFactor('Georgia, serif', 400, 'Spectral, serif', 400)).toBe(1);
    for (const k of keys) expect(cardTypeValues(flow, uncached)[k], k).toBe(own.num(k));
    // The same family: nothing changes, even at weights whose x-heights differ (Spectral 400 and 700).
    expect(xHeightFactor('Spectral, serif', 700, 'Spectral, "Spectral SC", serif', 400)).toBe(1);
    const mono: CardType = { body: { stack: '"JetBrains Mono", monospace' }, title: { stack: '"JetBrains Mono", monospace', weight: 400 } };
    for (const k of keys) expect(cardTypeValues(flow, mono)[k], k).toBe(own.num(k));
    const arimo: CardType = { body: { stack: 'Arimo, sans-serif' }, title: { stack: 'Arimo, sans-serif', weight: 700 } };
    const dense = loadDagTheme('dense');
    for (const k of keys) expect(cardTypeValues(dense, arimo)[k], k).toBe(readTheme(dense).num(k));
  });

  it('keeps every other value the chart theme\'s own', () => {
    const dense = loadDagTheme('dense');
    const typed = applyCardType(dense, folio);
    const before = readTheme(dense);
    const after = readTheme(typed);
    const changed = Object.keys(typed.values).filter((k) => after.str(k) !== before.str(k));
    expect(changed.sort()).toEqual([
      'caption-font-size', 'char-width', 'component-title-font-size', 'font-family', 'font-size',
      'subtitle-font-size', 'text-measure', 'title-font-family', 'title-font-size', 'title-font-weight', 'title-text-measure',
    ]);
    expect(typed.values['char-width']).toBe(0.502); // Spectral 400, Dense's ingredient weight
    expect(typed.values['title-wrap']).toBe(30); // Dense's 30: Spectral's title and body characters are as wide
  });

  it('moves a weight the body family is not cached at to the nearest that is', () => {
    const station = { name: 'S', values: { ...loadDagTheme('station').values, fonts: 'card', 'operation-font-weight': 500 } };
    const v = cardTypeValues(station, folio);
    // Station's 600 is drawn at Spectral's 700, a 500 at 400 (the nearer).
    expect([v['font-weight'], v['ingredient-font-weight'], v['operation-font-weight']]).toEqual([700, 400, 400]);
  });

  it('sets ink in the card\'s fonts and keeps its black, strokes and spacing', () => {
    const ink = loadDagTheme('ink');
    const theme = applyCardType(ink, mise);
    // Ink's Arimo is 0.5283 em in lower case, Figtree 0.500: Ink's 28 title becomes 29.58.
    expect(theme.values).toMatchObject({ 'font-family': 'Figtree, sans-serif', 'title-font-family': 'Figtree, sans-serif', 'title-font-weight': 300, 'ingredient-font-weight': 400, 'char-width': 0.507, 'title-font-size': 29.58 });
    for (const key of ['text-color', 'operation-stroke', 'operation-stroke-width', 'title-padding-x', 'ingredient-min-width', 'palette'] as const) expect(theme.values[key]).toBe(ink.values[key]);
    expect(chartFontFamilies(theme)).toEqual(['Figtree']);
  });

  it('draws a chart in the card\'s fonts with them embedded', () => {
    const recipe = parseRecipe('---\netna: 1\nform: structured\n---\n\n# Toast\n\n## Steps\n\n### Toast the bread\n\n- 2 slices bread\n\nToast it.\n', { units: loadUnits() });
    const theme = applyCardType(loadDagTheme('flow'), folio);
    expect(chartFontFamilies(theme)).toEqual(['Spectral']);
    const svg = renderDag(recipe, { theme, fonts: { css: '' } });
    expect(svg).toContain('font-family:Spectral, "Spectral SC", serif');
  });
});

describe('the bundled card styles', () => {
  // Every face a `fonts: card` chart theme draws in each card style's fonts is in the cache as
  // TrueType (measured, and embedded in the PDF) and as WOFF2 (embedded in the SVG): no
  // synthetic bold or light on screen, no stand-in face in the PDF.
  const ttf = new Set(cachedPdfFaces().map((f) => `${f.family}|${f.weight}`));
  const woff2 = new Map<string, number[]>();
  for (const entry of Object.values(readFontIndex().specs)) {
    for (const face of entry.faces) {
      if (face.style !== 'normal') continue;
      const [lo, hi = lo] = face.weight.split(/\s+/).map(Number);
      const list = woff2.get(face.family) ?? [];
      list.push(lo, hi);
      woff2.set(face.family, list);
    }
  }
  const woff2Has = (family: string, weight: number): boolean => {
    const list = woff2.get(family) ?? [];
    for (let i = 0; i < list.length; i += 2) if (weight >= list[i] && weight <= list[i + 1]) return true;
    return false;
  };

  for (const card of listThemes()) {
    for (const chart of listDagThemes().filter((n) => themeFonts(loadDagTheme(n)) === 'card')) {
      it(`${chart} in ${card}'s fonts draws only cached faces`, () => {
        const theme = applyCardType(loadDagTheme(chart), cardType(loadTheme(card)));
        expect(theme.values['font-family']).not.toBe(loadDagTheme(chart).values['font-family']);
        for (const face of pdfFaces(readTheme(theme))) {
          expect(ttf.has(`${face.family}|${face.weight}`), `${face.family} ${face.weight} TrueType`).toBe(true);
          expect(woff2Has(face.family, face.weight), `${face.family} ${face.weight} WOFF2`).toBe(true);
        }
      });
    }
  }
});
