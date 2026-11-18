import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { appColors, applyAppPalette, contrast, defaultDagTheme, mix, parseDagTheme, readAppPalette, separation, themePalette, type AppPalette } from '../../src/dag/index.ts';
import { dagThemeDir, readDagThemeFiles } from '../../src/dag/node.ts';
import { SCHEMA } from '../../src/dag/schema.ts';
import { MIN_TEXT_CONTRAST } from '../../src/dag/palette.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';

/** Every appearance in palettes.css, as the computed style would give it: `plain/light` → its variables. */
function appearances(): Map<string, Record<string, string>> {
  const css = readFileSync(join(ETNA_ROOT, 'tools', 'src', 'web', 'palettes.css'), 'utf8');
  const out = new Map<string, Record<string, string>>();
  for (const m of css.matchAll(/\[data-palette="([a-z]+)"\]\[data-scheme="(light|dark)"\]\s*\{([^}]*)\}/g)) {
    const vars: Record<string, string> = {};
    for (const d of m[3].matchAll(/(--[a-z-]+):\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    out.set(`${m[1]}/${m[2]}`, vars);
  }
  return out;
}

const style = (vars: Record<string, string>) => ({ getPropertyValue: (name: string) => vars[name] ?? '' });
const palette = (key: string): AppPalette => {
  const vars = appearances().get(key);
  if (!vars) throw new Error(`no appearance ${key}`);
  const p = readAppPalette(style(vars));
  if (!p) throw new Error(`appearance ${key} has no full palette`);
  return p;
};

const distance = separation;

const flow = () => parseDagTheme(readDagThemeFiles(dagThemeDir('flow'))).theme;
const ink = () => parseDagTheme(readDagThemeFiles(dagThemeDir('ink'))).theme;

describe('color arithmetic', () => {
  it('blends in sRGB, deterministically, to #rrggbb', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', 'blue', 0)).toBe('#ff0000');
    expect(mix('#ff0000', 'blue', 1)).toBe('#0000ff');
    expect(mix('rgb(10, 20, 30)', '#fff', 0.25)).toBe(mix('rgb(10, 20, 30)', '#fff', 0.25));
  });

  it('measures separation as the sRGB distance, 0 to 441', () => {
    expect(separation('#000', '#fff')).toBeCloseTo(441.67, 1);
    expect(separation('#123456', '#123456')).toBe(0);
  });

  it('gives WCAG contrast ratios', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#777', '#777')).toBe(1);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('readAppPalette', () => {
  it('reads the CSS variables, and refuses a page without them', () => {
    const p = palette('plain/light');
    expect(p).toMatchObject({ ground: '#fbfaf7', paper: '#ffffff', ink: '#1d1c1a', inkSoft: '#6b675f', hairline: '#dedad2', accent: '#1f5f8b', onAccent: '#ffffff' });
    expect(readAppPalette(style({}))).toBeNull();
    expect(readAppPalette(style({ '--ground': '#fff', '--paper': '#fff', '--ink': '#000', '--ink-soft': '#555', '--hairline': '#ccc', '--accent': 'not a color' }))).toBeNull();
  });
});

describe('applyAppPalette', () => {
  it('covers every color value of the schema', () => {
    const colors = SCHEMA.filter((s) => s.spec.type === 'color').map((s) => s.key);
    expect(Object.keys(appColors(palette('plain/light'))).sort()).toEqual([...colors].sort());
  });

  it('maps flow onto a light and a dark appearance: solid accent operations, soft accent ingredients', () => {
    for (const key of ['plain/light', 'slate/dark']) {
      const p = palette(key);
      const v = applyAppPalette(flow(), p).values;
      expect(v.background, key).toBe(p.ground);
      for (const k of ['text-color', 'title-stroke', 'edge-stroke', 'ingredient-text-color', 'choose-stroke', 'checkpoint-stroke']) expect(v[k], `${key} ${k}`).toBe(p.ink);
      for (const k of ['title-fill', 'component-fill', 'component-title-fill', 'checkpoint-fill']) expect(v[k], `${key} ${k}`).toBe(p.paper);
      expect(v['operation-fill'], key).toBe(p.accent);
      expect(v['operation-stroke'], key).toBe(p.accent);
      expect(v['operation-text-color'], key).toBe(p.onAccent);
      expect(v['ingredient-fill'], key).toBe(p.accentSoft);
      expect(v['ingredient-stroke'], key).toBe(p.rule);
      expect(v['component-stroke'], key).toBe(p.rule);
      expect(v['caption-color'], key).toBe(p.inkSoft);
      // The fills differ from the page and from each other.
      const ing = String(v['ingredient-fill']);
      const op = String(v['operation-fill']);
      expect(distance(ing, p.ground), `${key} ingredient vs ground`).toBeGreaterThanOrEqual(12);
      expect(distance(op, p.ground), `${key} operation vs ground`).toBeGreaterThanOrEqual(24);
      expect(distance(ing, op), `${key} ingredient vs operation`).toBeGreaterThanOrEqual(24);
    }
  });

  it('keeps the text readable on every fill, and the node types apart, in every appearance', () => {
    const all = appearances();
    expect(all.size).toBe(14);
    for (const key of all.keys()) {
      const v = appColors(palette(key));
      expect(contrast(v['operation-text-color'], v['operation-fill']), `${key} operation text`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrast(v['prep-text-color'], v['prep-fill']), `${key} preparation text`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrast(v['ingredient-text-color'], v['ingredient-fill']), `${key} ingredient text`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(contrast(v['text-color'], v.background), `${key} text`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(distance(v['ingredient-fill'], v['operation-fill']), `${key} fills apart`).toBeGreaterThanOrEqual(24);
      expect(distance(v['operation-fill'], v.background), `${key} operation vs page`).toBeGreaterThanOrEqual(24);
    }
  });

  it('brings in no hue of its own: every color is a role of the appearance, or a blend of two', () => {
    for (const [key, vars] of appearances()) {
      const p = palette(key);
      const roles = Object.values(p) as string[];
      const blends = new Set(roles);
      for (const a of roles) for (const b of roles) for (let i = 1; i < 20; i++) blends.add(mix(a, b, i / 20));
      for (const [k, color] of Object.entries(appColors(p))) expect(blends.has(color), `${key} ${k} ${color}`).toBe(true);
      // The search highlight is not one of the roles read.
      expect(roles).not.toContain(vars['--mark']);
    }
  });

  it('falls back to soft operations with ink text where on-accent does not read on the accent', () => {
    const p: AppPalette = { ground: '#ffffff', paper: '#ffffff', ink: '#222222', inkSoft: '#666666', hairline: '#dddddd', rule: '#888888', accent: '#7fb0e0', onAccent: '#ffffff', accentSoft: '#e4eef8' };
    const v = appColors(p);
    expect(v['operation-fill']).toBe(p.accentSoft);
    expect(v['operation-text-color']).toBe(p.ink);
    expect(v['operation-stroke']).toBe(p.accent);
    expect(v['ingredient-fill']).toBe(p.paper);
    // Without accent-soft and rule: made from the paper, the accent, the hairline and the ink.
    const bare = appColors({ ground: '#fbfaf7', paper: '#ffffff', ink: '#1d1c1a', inkSoft: '#6b675f', hairline: '#dedad2', accent: '#1f5f8b', onAccent: '#ffffff' });
    expect(bare['ingredient-fill']).toBe(mix('#ffffff', '#1f5f8b', 0.12));
    expect(bare['ingredient-stroke']).toBe(mix('#dedad2', '#1d1c1a', 0.4));
  });

  it('leaves values that are not colors alone', () => {
    const theme = flow();
    const mapped = applyAppPalette(theme, palette('catppuccin/dark'));
    const colors = new Set(SCHEMA.filter((s) => s.spec.type === 'color').map((s) => s.key));
    for (const [key, value] of Object.entries(theme.values)) if (!colors.has(key)) expect(mapped.values[key], key).toBe(value);
    expect(mapped.name).toBe('Flow');
  });

  it('returns a theme with palette: own unchanged, and so a theme that does not say', () => {
    const own = ink();
    expect(themePalette(own)).toBe('own');
    expect(applyAppPalette(own, palette('slate/dark'))).toBe(own);
    const silent = { name: 'quiet', values: { 'operation-fill': '#ffffff' } };
    expect(themePalette(silent)).toBe('own');
    expect(applyAppPalette(silent, palette('slate/dark'))).toBe(silent);
    expect(themePalette(flow())).toBe('app');
    expect(themePalette(defaultDagTheme)).toBe('app');
    expect(themePalette(parseDagTheme(readDagThemeFiles(dagThemeDir('dense'))).theme)).toBe('app');
    expect(themePalette(parseDagTheme(readDagThemeFiles(dagThemeDir('station'))).theme)).toBe('own');
  });
});
