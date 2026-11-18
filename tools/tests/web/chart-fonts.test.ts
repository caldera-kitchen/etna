// The chart pane's fonts, loaded on first use (chart-fonts.ts): each family once, a family the
// bundle does not carry recorded as having none, and nothing loaded twice.

import { describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('virtual:etna-chart-fonts', () => ({
  families: {
    'JetBrains Mono': async () => {
      calls.push('JetBrains Mono');
      return '@font-face { font-family: "JetBrains Mono"; }\n';
    },
  },
}));

const { chartFontsLoaded, loadChartFonts, loadedChartFontCss } = await import('../../src/web/chart-fonts.ts');

describe('chart fonts', () => {
  it('draws without them until they arrive, then with them; loads each family once', async () => {
    expect(loadedChartFontCss(['JetBrains Mono'])).toBe('');
    expect(chartFontsLoaded(['JetBrains Mono'])).toBe(false);
    const [a, b] = await Promise.all([loadChartFonts(['JetBrains Mono', 'Comic Sans']), loadChartFonts(['JetBrains Mono'])]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(calls).toEqual(['JetBrains Mono']);
    expect(loadedChartFontCss(['JetBrains Mono', 'Comic Sans'])).toBe('@font-face { font-family: "JetBrains Mono"; }\n');
    expect(chartFontsLoaded(['JetBrains Mono', 'Comic Sans'])).toBe(true);
    expect(await loadChartFonts(['JetBrains Mono'])).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
