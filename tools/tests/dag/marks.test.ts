// A chart box is the step's heading, then the words its instruction marks (ADR 0021; SPEC §8):
// each mark on a line of its own, wrapped as the heading is, nothing shortened or dropped.

import { describe, expect, it } from 'vitest';

import { allSteps, parseRecipe, type Recipe } from '../../src/core/index.ts';
import { NODE_WRAP, nodeText, renderDag } from '../../src/dag/index.ts';
import { computeLayout } from '../../src/dag/layout/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (prose: string, heading = 'Sweat'): Recipe =>
  parseRecipe(`---\netna: 1\n---\n\n# Soup\n\n## ${heading}\n\n- 1 onion\n\n${prose}\n\n## Serve\n\nServe.\n`, { units });
const box = (prose: string, heading?: string): string[] => {
  const recipe = parse(prose, heading);
  return computeLayout(recipe).boxes.filter((b) => b.kind === 'operation')[0].lines;
};

describe('a chart box', () => {
  it('is the heading alone when nothing is marked', () => {
    expect(box('Cook over medium-low heat until soft, 8-10 minutes.')).toEqual(['Sweat']);
  });

  it('is the heading, then each mark on a line of its own, in the order written', () => {
    expect(box('Cook over *medium-low* heat until *soft*, *8-10 minutes*.')).toEqual(['Sweat', 'medium-low', 'soft', '8-10 minutes']);
  });

  it('wraps a long mark by the same width as the heading, and keeps every word', () => {
    const lines = box('Cook *until the onion is soft and translucent and just starting to color*.', 'Sweat');
    expect(lines[0]).toBe('Sweat');
    expect(lines.slice(1).join(' ')).toBe('until the onion is soft and translucent and just starting to color');
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(NODE_WRAP);
  });

  it('has no cap on its lines: a box over five lines is drawn as marked', () => {
    const lines = box('*one* *two* *three* *four* *five* *six* *seven*', 'Mix');
    expect(lines).toEqual(['Mix', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']);
  });

  it('draws what nodeText gives, and the SVG carries the marked words escaped', () => {
    const recipe = parse('Cook on *low & slow <heat>*.');
    const step = allSteps(recipe.nodes)[0];
    expect(nodeText(step)).toEqual(['Sweat', 'low & slow <heat>']);
    const svg = renderDag(recipe);
    expect(svg).toContain('low &amp; slow &lt;heat&gt;');
    expect(svg).not.toContain('<heat>');
  });

  it('changes only when a mark is written: bold is never a mark', () => {
    expect(renderDag(parse('Cook until **soft**.'))).toBe(renderDag(parse('Cook until soft.')));
    expect(renderDag(parse('Cook until *soft*.'))).not.toBe(renderDag(parse('Cook until soft.')));
  });
});
