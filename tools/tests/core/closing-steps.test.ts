// SPEC §7: at the top level, the steps before the first component are a run of
// their own; the spine does not carry them past a component. After the first component, and
// under any component, a sub-component between two steps is a side branch the spine runs past.

import { describe, expect, it } from 'vitest';
import { buildGraph, parseRecipe } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const edges = (source: string): string[] =>
  buildGraph(parseRecipe(source, { units }))
    .edges.map((e) => `${e.from}>${e.to}${e.kind === 'spine' ? '' : ` (${e.kind})`}`)
    .sort();
const sinks = (source: string): string[] => buildGraph(parseRecipe(source, { units })).sinks;

describe('chaining around top-level components', () => {
  it('a step before the components joins nothing; the closing steps chain among themselves', () => {
    const src =
      '# R\n\n## Preheat\n\nHeat.\n\n## Dough\n\n### Mix\n\n- 1 g a\n\nGo.\n\n### Knead\n\nGo.\n\n' +
      '## Filling\n\n### Stir\n\n- 1 g b\n\nGo.\n\n## Fill\n\n- [dough](#dough)\n- [filling](#filling)\n\nGo.\n\n## Bake\n\nGo.\n';
    expect(edges(src)).toEqual(['fill>bake', 'knead>fill (reference)', 'mix>knead', 'stir>fill (reference)']);
    expect(sinks(src)).toEqual(['preheat', 'bake']);
  });

  it('closing steps after the components take the components only through their links', () => {
    const src = '# R\n\n## Dough\n\n### Mix\n\nGo.\n\n## Shape\n\nGo.\n\n## Bake\n\nGo.\n';
    expect(edges(src)).toEqual(['shape>bake']);
  });

  it('steps before the first component chain among themselves', () => {
    const src = '# R\n\n## Heat the oven\n\nGo.\n\n## Grease the pan\n\n- 1 g butter\n\nGo.\n\n## Batter\n\n### Mix\n\nGo.\n';
    expect(edges(src)).toEqual(['heat-the-oven>grease-the-pan']);
  });

  it('a step between two components: the closing chain runs past a later component', () => {
    // Prepare / [Cake] / Assemble / Bake / [Glaze] / Glaze the cake.
    const src =
      '# R\n\n## Prepare the pan\n\nGo.\n\n## Cake\n\n### Mix\n\nGo.\n\n## Assemble\n\n- [cake](#cake)\n\nGo.\n\n' +
      '## Bake\n\nGo.\n\n## Glaze\n\n### Whisk\n\nGo.\n\n## Glaze the cake\n\n- [glaze](#glaze)\n\nGo.\n';
    expect(edges(src)).toEqual(['assemble>bake', 'bake>glaze-the-cake', 'mix>assemble (reference)', 'whisk>glaze-the-cake (reference)']);
  });

  it('under a component, a sub-component between two steps stays a side branch the spine runs past', () => {
    const src =
      '# R\n\n## Filling\n\n### Slice the apples\n\nGo.\n\n### Flour mixture\n\n#### Combine\n\nGo.\n\n' +
      '### Cook the apples\n\nGo.\n\n### Thicken\n\n- [flour mixture](#flour-mixture)\n\nGo.\n\n## Crust\n\n### Roll\n\nGo.\n';
    expect(edges(src)).toEqual(['combine>thicken (reference)', 'cook-the-apples>thicken', 'slice-the-apples>cook-the-apples']);
  });

  it('a top-level Choose sits on the spine, before and after it, as before', () => {
    const src =
      '# R\n\n## Brown\n\nGo.\n\n## Beans\n\n> **Choose**\n\n### Slow\n\n#### Cook slow\n\nGo.\n\n### Fast\n\n#### Cook fast\n\nGo.\n\n## Blend\n\nGo.\n';
    expect(edges(src)).toEqual(['brown>cook-fast (choose)', 'brown>cook-slow (choose)', 'cook-fast>blend', 'cook-slow>blend']);
  });

  it('a flat recipe is one spine, as before', () => {
    expect(edges('# R\n\n## A\n\nGo.\n\n## B\n\nGo.\n\n## C\n\nGo.\n')).toEqual(['a>b', 'b>c']);
  });
});
