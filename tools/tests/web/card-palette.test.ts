import { describe, expect, it } from 'vitest';

import { cardPaletteCss, readCardColors, type CardColors } from '../../src/web/card-palette.ts';
import { parseSettings } from '../../src/web/settings.ts';

/** A computed style stand-in over a map of variables. */
const style = (vars: Record<string, string>) => ({ getPropertyValue: (name: string) => vars[name] ?? '' });

// Slate dark, as palettes.css has it.
const SLATE_DARK = { '--paper': '#1a2128', '--ink': '#e6ebf0', '--ink-soft': '#9ca8b4', '--hairline': '#2d3741', '--rule': '#76828e', '--desk': '#222a33', '--mark': '#5c5214', '--ground': '#12171c' };
const colors: CardColors = { paper: '#1a2128', ink: '#e6ebf0', inkSoft: '#9ca8b4', desk: '#222a33', mark: '#5c5214' };
const light: CardColors = { paper: '#ffffff', ink: '#1a2129', inkSoft: '#55606c', desk: '#e2e7ed', mark: '#ffe27a' };

describe('readCardColors', () => {
  it('reads the five variables, trimmed', () => {
    expect(readCardColors(style({ ...SLATE_DARK, '--ink': '  #e6ebf0 ' }))).toEqual(colors);
  });

  it('takes color functions and keywords', () => {
    const read = readCardColors(style({ ...SLATE_DARK, '--paper': 'rgb(26, 33, 40)', '--ink': 'oklch(0.9 0.01 250 / 1)', '--desk': 'canvas' }));
    expect(read).toMatchObject({ paper: 'rgb(26, 33, 40)', ink: 'oklch(0.9 0.01 250 / 1)', desk: 'canvas' });
  });

  it('is null when a variable is missing', () => {
    const { '--desk': _, ...rest } = SLATE_DARK;
    expect(readCardColors(style(rest))).toBeNull();
  });

  it('is null for anything that could leave its declaration', () => {
    for (const bad of ['#fff;color:red', 'red}body{display:none', 'url(x)x', '#fff</style>', 'rgb(1,2,3);x:y']) {
      expect(readCardColors(style({ ...SLATE_DARK, '--ink': bad })), bad).toBeNull();
    }
  });
});

describe('cardPaletteCss', () => {
  it('sets the four roles on screen, each from the app role of the same name', () => {
    expect(cardPaletteCss(colors, 'app')).toBe(
      '@media screen{html:root{--card-desk:#222a33;--card-paper:#1a2128;--card-ink:#e6ebf0;--card-ink-soft:#9ca8b4;--etna-hit:#5c5214}}',
    );
  });

  it('never uses the app’s line colors', () => {
    const css = cardPaletteCss(colors, 'app');
    expect(css).not.toContain(SLATE_DARK['--hairline']);
    expect(css).not.toContain(SLATE_DARK['--rule']);
  });

  it('with the style’s own colors, sets only the desk', () => {
    expect(cardPaletteCss(colors, 'own')).toBe('@media screen{html:root{--card-desk:#222a33}}');
  });

  it('a search hit takes the app’s mark; on a card in its own colors, the light one', () => {
    expect(cardPaletteCss(colors, 'app', light)).toContain('--etna-hit:#5c5214');
    expect(cardPaletteCss(colors, 'own', light)).toBe('@media screen{html:root{--card-desk:#222a33;--etna-hit:#ffe27a}}');
  });

  it('is screen-only: one @media screen block and nothing outside it', () => {
    const css = cardPaletteCss(colors, 'app');
    expect(css.startsWith('@media screen{')).toBe(true);
    expect(css.endsWith('}}')).toBe(true);
    expect(css.match(/@media/g)).toHaveLength(1);
  });
});

describe('cards.palette setting', () => {
  const parse = (value: unknown) => {
    const r = parseSettings({ 'etna-settings': 1, cards: { palette: value } });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it('keeps app and own', () => {
    expect(parse('own').settings.cards).toEqual({ palette: 'own' });
    expect(parse('app').settings.cards).toEqual({ palette: 'app' });
  });

  it('drops anything else', () => {
    for (const bad of ['dark', 'theme', true, null]) {
      const parsed = parse(bad);
      expect(parsed.settings.cards).toEqual({});
      expect(parsed.ignored).toContain('cards.palette');
    }
  });
});
