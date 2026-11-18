// Top-level steps after the last component (the closing steps) are set apart from it on every
// card style, as the first component is set apart from steps before it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRecipe } from '../../src/core/index.ts';
import { renderCardParts } from '../../src/card/index.ts';
import { loadTheme, THEMES_DIR } from '../../src/card/node.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const recipe = parseRecipe(
  '# Pie\n\n## Preheat\n\nHeat.\n\n## Crust\n\n### Roll\n\n- 1 g flour\n\nGo.\n\n## Filling\n\n### Combine\n\n- 1 g berries\n\nGo.\n\n' +
    '## Fill and cover\n\n- [crust](#crust)\n- [filling](#filling)\n\nGo.\n\n## Bake\n\nGo.\n',
  { units },
);
const STYLES = ['binder', 'countertop', 'folio', 'galley', 'grid', 'mise'];
const body = (html: string): string => html.replace(/<style[\s\S]*?<\/style>/g, '');

describe('closing steps on a card', () => {
  it('paired: the closing steps are a run of steps directly after the last component', () => {
    const { html } = renderCardParts(recipe, loadTheme('mise'), { layout: 'paired' });
    const b = body(html);
    const filling = b.indexOf('id="card-filling"');
    const run = b.lastIndexOf('<div class="steps', b.indexOf('id="card-fill-and-cover"'));
    expect(filling).toBeGreaterThan(0);
    expect(run).toBeGreaterThan(filling);
    // The run's previous sibling is the Filling section: `.component + .steps` applies.
    expect(b.slice(run - '</div></section>'.length, run)).toBe('</div></section>');
    expect(b.slice(filling, run).match(/<section class="component"/g) ?? []).toHaveLength(0);
  });

  it('hoisted: each closing step is a part of its own, titled with its step heading', () => {
    const { html } = renderCardParts(recipe, loadTheme('binder'), { layout: 'hoisted' });
    expect(body(html)).toMatch(/<section class="part part-step"><h3 class="part-title part-step-title"><span class="direction-label">Fill and cover<\/span>/);
  });

  for (const style of STYLES) {
    it(`${style}: sets a run of steps after a component apart with a rule`, () => {
      const css = readFileSync(join(THEMES_DIR, style, 'card.css'), 'utf8');
      const rules = [...css.matchAll(/([^{}]*\.component \+ \.steps[^{}]*)\{([^}]*)\}/g)];
      expect(rules.some(([, , decl]) => /border-top\s*:/.test(decl)), style).toBe(true);
    });
  }
});
