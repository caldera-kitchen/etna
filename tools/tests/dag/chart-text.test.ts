// Author text in a chart's SVG, and what the GUI reads back out of that SVG (a security
// check): the background of a chart shown on its sheet (main.tsx ChartPage) and its size
// come from where only the renderer writes, never from the recipe's own words; and a recipe
// with many long amounts is charted in reasonable time.

import { describe, expect, it } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { renderDag } from '../../src/dag/index.ts';
import { computeLayout } from '../../src/dag/layout/index.ts';
import { chartBackground, chartSheet, chartSheetFor, chartViewBox } from '../../src/dag/sheet.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (text: string): Recipe => parseRecipe(text, { units });

const recipe = (title: string) =>
  parse(['---', 'etna: 1', '---', '', `# ${title}`, '', '### Mix', '', '- 100 g flour', '- 50 g water', '', 'Mix.', '', '### Bake', '', 'Bake.', ''].join('\n'));

describe('what the GUI reads out of a chart', () => {
  it('takes the background from the style block, not from a title that spells the same rule', () => {
    const svg = renderDag(recipe('Pie .dag-background{fill:url(https://attacker.example/beacon.png)}'));
    // The title is written first, in <title> and aria-label: the GUI's old regular expression found it there.
    expect(/\.dag-background\{fill:([^;}]+)/.exec(svg)?.[1]).toBe('url(https://attacker.example/beacon.png)');
    expect(chartBackground(svg)).toBe('#ffffff');
  });

  it('takes the theme’s own background, and falls back when the value is not a color', () => {
    const svg = renderDag(recipe('Pie'), { theme: { name: 'x', values: { background: 'rgb(10, 20, 30)' } } });
    expect(chartBackground(svg)).toBe('rgb(10, 20, 30)');
    expect(chartBackground('<svg><style>.etna-dag .dag-background{fill:image-set("https://a.example/x" 1x)}</style></svg>')).toBe('#fff');
    expect(chartBackground('<svg><style>.etna-dag .dag-background{fill:none}</style></svg>')).toBe('none');
    expect(chartBackground('<svg></svg>')).toBe('#fff');
  });

  it('takes the size from the root element’s viewBox, whatever the title says', () => {
    const r = recipe('Pie viewBox="0 0 1 99999"');
    const layout = computeLayout(r);
    const svg = renderDag(r);
    expect(chartViewBox(svg)).toEqual({ width: layout.width, height: layout.height });
    expect(chartSheet(svg, 'letter')).toEqual(chartSheetFor(layout.width, layout.height, 'letter'));
    expect(chartViewBox('<svg viewBox="0 0 0 0">')).toBeNull();
    expect(chartViewBox('<svg>')).toBeNull();
  });
});

describe('a recipe with many long amounts', () => {
  // 80 components, each used by the last step with a long amount. Before the captions' widths
  // were measured once, this took about 14 seconds on the reference machine; now under one.
  it('is charted in reasonable time', { timeout: 10_000 }, () => {
    const n = 80;
    const lines = ['---', 'etna: 1', '---', '', '# Many', ''];
    const name = 'long name '.repeat(8).trim();
    for (let i = 0; i < n; i++) lines.push(`## Part ${i} ${name}`, '', `### Mix part ${i}`, '', `- 10 g flour ${i}`, '', 'Mix.', '');
    lines.push('## Finish', '', '### Combine everything', '');
    for (let i = 0; i < n; i++) lines.push(`- 100 g plus a very long amount remark [part ${i}](#part-${i}-${name.replace(/ /g, '-')})`);
    lines.push('', 'Combine.', '');
    const svg = renderDag(parse(lines.join('\n')));
    expect(svg.match(/dag-edge-label/g)?.length).toBe(n);
  });
});
