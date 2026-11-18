import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allSteps, buildGraph, hasCycle, parseRecipe, partKey, slugify, splitQualifier, traditionalParts, type Component, type Step } from '../../src/core/index.ts';
import { ETNA_ROOT, findRecipes, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });
const example = (slug: string) => parse(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'));

describe('structured form', () => {
  it('reads a flat recipe as a spine of steps', () => {
    const r = example('malted-chocolate');
    expect(r.form).toBe('structured');
    expect(r.formRaw).toBeNull();
    expect(r.etna).toBe(1);
    expect(r.title?.text).toBe('Malted Chocolate');
    expect(r.nodes.map((n) => n.kind)).toEqual(['step', 'step', 'step', 'step', 'step', 'step', 'step']);
    const first = r.nodes[0] as Step;
    expect(first.heading.text).toBe('Blend the base');
    expect(first.ingredients).toHaveLength(7);
    expect(first.instructions[0].text).toBe('Blend on high in a Vitamix for 5 minutes.');
    const g = buildGraph(r);
    expect(g.edges.every((e) => e.kind === 'spine')).toBe(true);
    expect(g.edges).toHaveLength(6);
    expect(g.sinks).toEqual(['freeze']);
  });

  it('applies the leaf-vs-parent rule at any depth', () => {
    const r = example('next-day-soft-cinnamon-rolls');
    const dough = r.nodes[0] as Component;
    expect(dough.kind).toBe('component');
    expect(dough.children[0].kind).toBe('component'); // Yudane: H3 with an H4 step
    expect((dough.children[0] as Component).children[0].kind).toBe('step');
    expect(dough.children[2].kind).toBe('step'); // Mix
    expect(allSteps(r.nodes)).toHaveLength(15);
  });

  it('merges branches only through reference links', () => {
    const g = buildGraph(example('frosty-chocolate'));
    expect(g.problems).toEqual([]);
    const refs = g.edges.filter((e) => e.kind === 'reference');
    expect(refs.map((e) => `${e.from}>${e.to}`)).toEqual(['combine--rest>add-to-vitamix']);
    // The side branch is not on the spine of the component that follows it.
    expect(g.edges.some((e) => e.from === 'combine--rest' && e.kind === 'spine')).toBe(false);
    expect(g.sinks).toEqual(['churn']);
    expect(hasCycle(g)).toBe(false);
  });

  it('every structured recipe that ships has one product, resolved references and no cycle', () => {
    const ends: Record<string, string[]> = {};
    for (const f of findRecipes(join(ETNA_ROOT, 'cookbook'))) {
      const recipe = parse(readFileSync(f.file!, 'utf8'));
      if (recipe.form !== 'structured') continue;
      const g = buildGraph(recipe);
      expect(g.problems, f.slug).toEqual([]);
      // A top-level step that takes nothing in and joins nothing is preparation (SPEC §4), not a product.
      const prep = new Set(recipe.nodes.filter((n) => n.kind === 'step' && n.ingredients.length === 0 && !g.edges.some((e) => e.from === n.heading.anchor || e.to === n.heading.anchor)).map((n) => (n.kind === 'step' ? n.heading.anchor : '')));
      const sinks = g.sinks.filter((s) => !prep.has(s));
      if (sinks.length > 1) {
        // A recipe that ends in a Choose (SPEC §5.2) makes one of its branches: one sink in each.
        const last = recipe.nodes.at(-1)!;
        expect(last.kind === 'component' && last.choose, f.slug).toBeTruthy();
        const branches = last.kind === 'component' ? last.children.map((c) => allSteps([c]).map((st) => st.heading.anchor)) : [];
        expect(branches.map((b) => sinks.filter((s) => b.includes(s)).length), f.slug).toEqual(branches.map(() => 1));
        ends[f.slug] = sinks;
      } else expect(sinks, f.slug).toHaveLength(1);
      expect(hasCycle(g), f.slug).toBe(false);
    }
    // Boiled Eggs ends in a choice: serve warm or refrigerate.
    expect(ends).toEqual({ 'boiled-eggs': ['dip-and-peel', 'chill'] });
  });

  it('reads callouts and marks Choose components', () => {
    const r = parse(`---
etna: 1
---

# Pudding

## Base

- 500 g whole milk

Cook to nappe.

> **Checkpoint** — if it curdles, strain it.

## Flavor

> **Choose** — make one.

### Vanilla

- 1 vanilla bean

Steep off heat.

### Chocolate

- 60 g cocoa

Whisk in.

## Chill

Chill until set.
`);
    const base = r.nodes[0] as Step;
    expect(base.callouts[0]).toMatchObject({ keyword: 'Checkpoint', separator: '—', text: 'if it curdles, strain it.' });
    const flavor = r.nodes[1] as Component;
    expect(flavor.choose).toBe(true);
    const g = buildGraph(r);
    const pairs = g.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort();
    expect(pairs).toEqual(['base>chocolate:choose', 'base>vanilla:choose', 'chocolate>chill:spine', 'vanilla>chill:spine']);
    expect(g.sinks).toEqual(['chill']);
  });

  it('reports unresolved and ambiguous references', () => {
    const r = parse(`---
etna: 1
---

# T

## A

### Mix

- 1 g salt

Mix.

## B

### Mix

- 1 g salt

Mix.

## C

### Join

- [gone](#missing)
- [mix](#mix)

Join.
`);
    const g = buildGraph(r);
    expect(g.problems.map((p) => p.reason).sort()).toEqual(['ambiguous', 'unresolved']);
  });

  it('reads a reference with an amount and an external target', () => {
    const r = parse('---\netna: 1\n---\n\n# T\n\n## Dress\n\n- 80 g [mango chutney](../mango-chutney/), strained\n\nDress.\n');
    const line = (r.nodes[0] as Step).ingredients[0];
    expect(line).toMatchObject({ kind: 'reference', label: 'mango chutney', target: '../mango-chutney/', internal: false, note: 'strained' });
    expect(line.quantity?.raw).toBe('80');
    expect(line.unit?.def.name).toBe('gram');
    expect(buildGraph(r).external).toHaveLength(1);
  });
});

describe('traditional form', () => {
  const source = `---
etna: 1
form: traditional
source: Test
extra:
  mg_recipe_id: 1
---

# Cake

## Ingredients

- 240 grams flour

**Frosting**

- 113 grams butter, softened
- 2 large eggs

## Directions

1. **Beat** — Beat the butter until light.
2. Spread over the cake.

## Notes

Keeps three days.

◊ Total Time — 2 hours
`;
  it('reads ingredient groups, labeled directions and notes', () => {
    const r = parse(source);
    expect(r.form).toBe('traditional');
    expect(r.nodes).toEqual([]);
    const t = r.traditional!;
    expect(t.ingredients!.items.map((g) => [g.label, g.items.length])).toEqual([[null, 1], ['Frosting', 2]]);
    expect(t.ingredients!.count).toBe(3);
    expect(t.directions!.items.map((d) => [d.number, d.label, d.text])).toEqual([
      [1, 'Beat', 'Beat the butter until light.'],
      [2, null, 'Spread over the cake.'],
    ]);
    expect(t.notes!.items).toHaveLength(2);
    expect(t.directions!.none).toBe(false);
  });

  it('recognizes the _none_ placeholder', () => {
    const r = parse('---\netna: 1\nform: traditional\n---\n\n# Rub\n\n## Ingredients\n\n- 2 tablespoons salt\n\n## Directions\n\n_none_\n');
    expect(r.traditional!.directions!.none).toBe(true);
    expect(r.traditional!.directions!.items).toEqual([]);
  });
});

describe('traditional parts', () => {
  const headed = `---
etna: 1
form: traditional
---

# Test Beans

## Ingredients

- 1 tsp oil

### Beans

- 100 g kidney beans
- salt

### Sauce

- 28 g olive oil

## Directions

### Beans

1. Rinse and soak the beans.
2. Drain and cook the beans.

### Sauce

1. **Fry** — Heat the oil.
2. Blend.

#### Tip

Strain it.

### Finish

1. Combine.

## Notes

### Not a part

Keeps.
`;

  it('reads ### under Ingredients as ingredient parts', () => {
    const t = parse(headed).traditional!;
    expect(t.ingredients!.items.map((g) => [g.label, g.items.length, g.heading?.text ?? null, g.legacy])).toEqual([
      [null, 1, null, false],
      ['Beans', 2, 'Beans', false],
      ['Sauce', 1, 'Sauce', false],
    ]);
    expect(t.ingredients!.other).toEqual([]);
    expect(t.ingredients!.items[1].labelPos).toEqual(t.ingredients!.items[1].heading!.pos);
  });

  it('reads ### under Directions as direction parts, numbering restarting in each', () => {
    const d = parse(headed).traditional!.directions!;
    expect(d.parts.map((p) => [p.label, p.steps.map((s) => [s.number, s.label, s.text])])).toEqual([
      ['Beans', [[1, null, 'Rinse and soak the beans.'], [2, null, 'Drain and cook the beans.']]],
      ['Sauce', [[1, 'Fry', 'Heat the oil.'], [2, null, 'Blend.']]],
      ['Finish', [[1, null, 'Combine.']]],
    ]);
    // `items` stays the flat list of every direction.
    expect(d.items.map((s) => s.text)).toEqual(d.parts.flatMap((p) => p.steps.map((s) => s.text)));
    // A deeper heading inside a part is other content, kept verbatim.
    expect(d.other.map((o) => [o.nodeType, o.raw])).toEqual([
      ['heading', '#### Tip'],
      ['paragraph', 'Strain it.'],
    ]);
  });

  it('keeps ### elsewhere as other content', () => {
    const t = parse(headed).traditional!;
    expect(t.notes!.other.map((o) => o.raw)).toEqual(['### Not a part']);
  });

  it('puts directions before the first ### in an unnamed leading part', () => {
    const d = parse(traditionalOf('- salt', '1. Preheat.\n\n### Bake\n\n1. Bake.')).traditional!.directions!;
    expect(d.parts.map((p) => [p.label, p.steps.length])).toEqual([
      [null, 1],
      ['Bake', 1],
    ]);
  });

  it('gives a recipe without part headings one unnamed part holding every direction', () => {
    const r = parse(traditionalOf('**Beans**\n\n- beans', '1. **Beans** — Soak.\n2. Cook.'));
    const t = r.traditional!;
    expect(t.ingredients!.items.map((g) => [g.label, g.legacy, g.heading])).toEqual([['Beans', true, null]]);
    expect(t.directions!.parts).toHaveLength(1);
    expect(t.directions!.parts[0]).toMatchObject({ label: null, heading: null });
    expect(t.directions!.parts[0].steps).toEqual(t.directions!.items);
    expect(t.directions!.items.map((d) => [d.number, d.label])).toEqual([
      [1, 'Beans'],
      [2, null],
    ]);
  });

  it('pairs parts by name', () => {
    const { parts, unpairedIngredients, unpairedDirections } = traditionalParts(parse(headed));
    expect(parts.map((p) => [p.name, p.ingredients ? p.ingredients.label : '-', p.directions ? p.directions.label : '-'])).toEqual([
      [null, null, '-'],
      ['Beans', 'Beans', 'Beans'],
      ['Sauce', 'Sauce', 'Sauce'],
      ['Finish', '-', 'Finish'],
    ]);
    expect(unpairedIngredients).toEqual([]);
    expect(unpairedDirections.map((p) => p.label)).toEqual(['Finish']);
  });

  it('matches names ignoring case and white space, and places unmatched direction parts in order', () => {
    const r = parse(traditionalOf('### Pie  Crust\n\n- flour\n\n### Filling\n\n- apples', '### Night Before\n\n1. Chill.\n\n### pie crust\n\n1. Roll.\n\n### Bake\n\n1. Bake.\n\n### Fillings\n\n1. Fill.'));
    const { parts, unpairedIngredients, unpairedDirections } = traditionalParts(r);
    expect(parts.map((p) => [p.name, p.ingredients ? p.ingredients.label : '-', p.directions ? p.directions.label : '-'])).toEqual([
      ['Night Before', '-', 'Night Before'],
      ['Pie  Crust', 'Pie  Crust', 'pie crust'],
      ['Bake', '-', 'Bake'],
      ['Fillings', '-', 'Fillings'],
      ['Filling', 'Filling', '-'],
    ]);
    expect(partKey(' Pie  Crust ')).toBe('pie crust');
    expect(unpairedIngredients.map((g) => g.label)).toEqual(['Filling']);
    expect(unpairedDirections.map((p) => p.label)).toEqual(['Night Before', 'Bake', 'Fillings']);
  });

  it('pairs a part heading with a qualifier after an em dash, which stays in the heading', () => {
    const pairs = (ingredients: string, directions: string) =>
      traditionalParts(parse(traditionalOf(ingredients, directions))).parts.map((p) => [p.name, p.ingredients?.label ?? '-', p.directions?.label ?? '-']);
    // Qualifier on the direction side only.
    const r = parse(traditionalOf('### Part Á\n\n- 100 g flour', '### Part Á — the night before\n\n1. Stir.'));
    expect(traditionalParts(r).parts.map((p) => [p.name, p.ingredients?.label ?? '-', p.directions?.label ?? '-'])).toEqual([
      ['Part Á', 'Part Á', 'Part Á — the night before'],
    ]);
    // The heading keeps its full text, and its anchor is built from it.
    expect(r.traditional!.directions!.parts[0].heading!.text).toBe('Part Á — the night before');
    expect(r.traditional!.directions!.parts[0].heading!.anchor).toBe('part-á--the-night-before');
    // Without a qualifier, on the ingredient side only, and on both sides (different ones).
    expect(pairs('### Dough\n\n- 1 g flour', '### Dough\n\n1. Knead.')).toEqual([['Dough', 'Dough', 'Dough']]);
    expect(pairs('### Biga — 50% hydration\n\n- 1 g flour', '### biga\n\n1. Mix.')).toEqual([['Biga — 50% hydration', 'Biga — 50% hydration', 'biga']]);
    expect(pairs('### Dough — 2%\n\n- 1 g flour', '### Dough — Day 1\n\n1. Knead.')).toEqual([['Dough — 2%', 'Dough — 2%', 'Dough — Day 1']]);
  });

  it('takes a qualifier only after a spaced em dash; parentheses, hyphens and en dashes are part of the name', () => {
    expect(partKey('Dough — Day 1')).toBe('dough');
    expect(partKey('Biga  —  50% hydration — cold')).toBe('biga');
    expect(splitQualifier('Biga — 50% hydration')).toEqual({ name: 'Biga', qualifier: '50% hydration' });
    expect(splitQualifier('— only')).toEqual({ name: '— only', qualifier: null });
    expect(partKey('Mix-ins (for 1024 g of mashed potato)')).toBe('mix-ins (for 1024 g of mashed potato)');
    expect(partKey('Day 1 - Dough')).toBe('day 1 - dough');
    expect(partKey('Day 1 – Dough')).toBe('day 1 – dough');
    expect(partKey('Pain—levain')).toBe('pain—levain');
    expect(pairs('### Dough - Day 1\n\n- 1 g flour', '### Dough\n\n1. Knead.')).toEqual([
      ['Dough', '-', 'Dough'],
      ['Dough - Day 1', 'Dough - Day 1', '-'],
    ]);
    function pairs(ingredients: string, directions: string) {
      return traditionalParts(parse(traditionalOf(ingredients, directions))).parts.map((p) => [p.name, p.ingredients?.label ?? '-', p.directions?.label ?? '-']);
    }
  });
});

describe('frontmatter and title', () => {
  it('records malformed and missing frontmatter without throwing', () => {
    expect(parse('# T\n\n## S\n\nDo.\n').frontmatter.raw).toBeNull();
    const bad = parse('---\netna: [1\n---\n\n# T\n');
    expect(bad.frontmatter.error).not.toBeNull();
    expect(bad.etna).toBeNull();
    expect(parse('---\netna: 1\n\n# T\n').frontmatter.error).toMatch(/not closed/);
  });
  it('reads an unknown form as structured and keeps what was written', () => {
    const r = parse('---\netna: 1\nform: classic\n---\n\n# T\n\n## S\n\nDo.\n');
    expect(r.form).toBe('structured');
    expect(r.formRaw).toBe('classic');
  });
  it('notes a formatted or missing title', () => {
    expect(parse('---\netna: 1\n---\n\n# My *best* cake\n').title?.plain).toBe(false);
    expect(parse('---\netna: 1\n---\n\n## S\n\nDo.\n').title).toBeNull();
  });
});

describe('slugify', () => {
  it.each([
    ['Salt & Pepper', 'salt-and-pepper'],
    ["Baker's Rolls (2nd Batch)", 'bakers-rolls-2nd-batch'],
    ['Crème Brûlée', 'creme-brulee'],
    ['Pizza :: Brooklyn Style', 'pizza-brooklyn-style'],
  ])('%s → %s', (title, slug) => expect(slugify(title)).toBe(slug));
});

function traditionalOf(ingredients: string, directions: string): string {
  return `---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n${ingredients}\n\n## Directions\n\n${directions}\n`;
}

describe('the Notes section of a structured recipe', () => {
  const SHAKE = `---
etna: 1
---

# Shake

## Blend

- 300 g milk

Blend until smooth.

> **Note** — a cold glass helps.

## Serve

Pour.

## Notes

**Storage** — keeps a day.

Oat milk works too.

- Frozen banana makes it thicker.

### Variations

Add espresso.
`;

  it('reads the last H2 named Notes, with everything after it, as the notes: not a step', () => {
    const r = parse(SHAKE);
    expect(r.nodes.map((n) => n.heading.text)).toEqual(['Blend', 'Serve']);
    expect(allSteps(r.nodes)).toHaveLength(2);
    expect(r.notes?.heading.text).toBe('Notes');
    expect(r.notes?.items.map((n) => [n.label, n.text])).toEqual([
      ['Storage', 'keeps a day.'],
      [null, 'Oat milk works too.'],
      [null, 'Frozen banana makes it thicker.'],
      [null, 'Add espresso.'],
    ]);
    expect(r.notes?.items.map((n) => n.form)).toEqual(['paragraph', 'paragraph', 'item', 'paragraph']);
    expect(r.notes?.other.map((o) => o.nodeType)).toEqual(['heading']);
    expect(r.notes?.pos.end.offset).toBe(SHAKE.trimEnd().length);
    // Every heading is still listed; the graph has only the steps.
    expect(r.headings.map((h) => h.text)).toEqual(['Blend', 'Serve', 'Notes', 'Variations']);
    expect(buildGraph(r).steps.map((s) => s.id)).toEqual(['blend', 'serve']);
    // A step's own Note callout is not the Notes section.
    expect((r.nodes[0] as Step).callouts.map((c) => c.keyword)).toEqual(['Note']);
  });

  it('ignores case, as the traditional form does', () => {
    expect(parse(SHAKE.replace('## Notes', '## NOTES')).notes?.heading.text).toBe('NOTES');
  });

  it('reads a Notes heading that is not the last H2 as an ordinary step', () => {
    const r = parse(SHAKE.replace('## Notes\n', '## Later\n\nRest.\n\n## Notes\n').replace('## Serve', '## Notes'));
    expect(r.nodes.map((n) => n.heading.text)).toEqual(['Blend', 'Notes', 'Later']);
    expect(r.notes?.heading.pos.start.line).toBeGreaterThan(r.nodes[2].heading.pos.start.line);
    const middle = parse(SHAKE.replace('## Notes', '## Afterward').replace('## Serve', '## Notes'));
    expect(middle.notes).toBeNull();
    expect(middle.nodes.map((n) => n.heading.text)).toEqual(['Blend', 'Notes', 'Afterward']);
  });

  it('has no notes when the last H2 is not Notes; an H3 named Notes is a step', () => {
    const r = parse(SHAKE.replace('## Notes', '## Store'));
    expect(r.notes).toBeNull();
    const nested = parse('---\netna: 1\n---\n\n# T\n\n## Part\n\n### Mix\n\nMix.\n\n### Notes\n\nRest.\n');
    expect(nested.notes).toBeNull();
    expect(allSteps(nested.nodes).map((s) => s.heading.text)).toEqual(['Mix', 'Notes']);
  });

  it('gives a traditional recipe the same notes object in both places', () => {
    const t = parse('---\netna: 1\nform: traditional\n---\n\n# T\n\n## Directions\n\n1. Mix.\n\n## Notes\n\nKeeps.\n');
    expect(t.notes).not.toBeNull();
    expect(t.notes).toBe(t.traditional?.notes);
    expect(parse('---\netna: 1\nform: traditional\n---\n\n# T\n\n## Directions\n\n1. Mix.\n').notes).toBeNull();
  });
});
