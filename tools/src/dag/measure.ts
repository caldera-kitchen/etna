// Text width without reading a font: how wide a line of chart text is, the same in Node and the
// browser.
//
// The layout counts widths in "cells": one cell is `char-width` × `font-size`. A character is
// its advance in em divided by `char-width`, so `char-width` is the nominal average character,
// which turns the `*-wrap` settings (counted in characters) into widths. The advance comes from:
//
// 1. The font's own widths, when the first family of the theme's stack is a cached font
//    (font-metrics.ts, generated from its TrueType files by `etna fonts metrics`), at the
//    nearest weight there is. Exact: the widths the PDF embeds and the SVG draws, before
//    kerning. JetBrains Mono's advances are all 0.6 em, so at `char-width: 0.6` each character
//    is one cell, as with `mono`.
// 2. Otherwise `text-measure`: with `mono`, a character is one cell (right for any monospace
//    font); with `sans` or `serif`, its advance from the built-in tables (metrics.ts).
//
// Either way, a character a table does not cover counts as the widest one it has.

import { FONT_METRICS, FONT_X_HEIGHTS } from './font-metrics.ts';
import { ADVANCES, CHARS } from './metrics.ts';

export const TEXT_MEASURES = ['mono', 'sans', 'serif'] as const;
export type TextMeasure = (typeof TEXT_MEASURES)[number];

/** Width of a string in cells. */
export type Measure = (text: string) => number;

const INDEX = new Map<string, number>([...CHARS].map((c, i) => [c, i]));

interface Table {
  advances: readonly number[];
  widest: number;
}
const tables = new Map<string, Table>();
function table(key: string, advances: readonly number[]): Table {
  let t = tables.get(key);
  if (!t) {
    t = { advances, widest: Math.max(...advances) };
    tables.set(key, t);
  }
  return t;
}

/** The families with generated metrics (font-metrics.ts), in name order. */
export const METRIC_FAMILIES: readonly string[] = Object.keys(FONT_METRICS).sort();

/** The weights a family has metrics for, ascending; empty when it has none. */
export function metricWeights(family: string): number[] {
  if (!Object.hasOwn(FONT_METRICS, family)) return [];
  return Object.keys(FONT_METRICS[family]).map(Number).sort((a, b) => a - b);
}

/**
 * The weight a family is measured at for `weight`: the nearest it has metrics for, the heavier
 * on a tie (as the PDF picks its face, pickPdfFace); null when the family has no metrics.
 */
export function metricWeight(family: string, weight: number): number | null {
  const weights = metricWeights(family);
  if (weights.length === 0) return null;
  return weights.reduce((best, w) => {
    const d = Math.abs(w - weight);
    const bd = Math.abs(best - weight);
    return d < bd || (d === bd && w > best) ? w : best;
  });
}

/**
 * The x-height of `family` at `weight`, in em: the face it is measured at (metricWeight), from
 * the generated metrics; null when the family has no metrics or that face no x-height.
 */
export function metricXHeight(family: string, weight: number): number | null {
  const w = metricWeight(family, weight);
  const x = w === null || !Object.hasOwn(FONT_X_HEIGHTS, family) ? undefined : FONT_X_HEIGHTS[family][w];
  return x === undefined ? null : x / 1000;
}

function fromTable({ advances, widest }: Table, charWidth: number): Measure {
  const scale = 1000 * charWidth;
  return (text) => {
    let sum = 0;
    for (const c of text) {
      const i = INDEX.get(c);
      sum += i === undefined ? widest : advances[i];
    }
    return sum / scale;
  };
}

/**
 * The measure for text set in `family` at `weight`, in cells of `charWidth` em: the family's
 * own widths when it has metrics (at the nearest weight), else `fallback` (`mono`, or the
 * `sans` or `serif` table). With `charWidth` 1 it gives widths in em. Pure: no font is read.
 */
export function measurer(fallback: TextMeasure, weight: number, charWidth: number, family?: string): Measure {
  const w = family === undefined ? null : metricWeight(family, weight);
  if (family !== undefined && w !== null) return fromTable(table(`${family}|${w}`, FONT_METRICS[family][w]), charWidth);
  if (fallback === 'mono') return (text) => text.length;
  const name = `${fallback}-${weight <= 400 ? 'regular' : 'bold'}`;
  return fromTable(table(name, ADVANCES[name]), charWidth);
}
