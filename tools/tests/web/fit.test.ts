// The shopping list's sheet fitted to a phone-wide frame.

import { describe, expect, it } from 'vitest';

import { FIT_GUTTER, fitCss, fitZoom } from '../../src/web/fit.ts';

describe('fitZoom', () => {
  it('leaves a frame as wide as the page or wider alone', () => {
    expect(fitZoom(816, 816)).toBeNull();
    expect(fitZoom(816, 960)).toBeNull();
    expect(fitZoom(0, 375)).toBeNull();
  });

  it('fits a letter page into a 375 px frame, with a gutter on each side', () => {
    const zoom = fitZoom(816, 375)!;
    expect(zoom * 816).toBeCloseTo(375 - 2 * FIT_GUTTER, 0);
    expect(zoom).toBeLessThan(1);
  });

  it('never zooms to nothing', () => {
    expect(fitZoom(816, 10)).toBe(0.1);
  });
});

describe('fitCss', () => {
  it('is for the screen only, so printing never sees it', () => {
    const css = fitCss(0.44);
    expect(css.startsWith('@media screen{')).toBe(true);
    expect(css).toContain('.card-sheets,.card-flow{zoom:0.44}');
    expect(css).not.toContain('print');
  });
});
