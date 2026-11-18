// Three chart theme values that change what a chart says or how its edges run:
// `choose-label`, `ingredient-text` and `join-edges`, and the CLI flags over the last two.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkDagTheme, layoutDag, renderDag, type DagTheme } from '../../src/dag/index.ts';
import { run } from '../../src/dag/cli.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const parse = (body: string): Recipe => parseRecipe(`---\netna: 1\n---\n\n# Test Recipe\n\n${body}`, { units });
const themed = (values: Record<string, string>): DagTheme => ({ name: 'flow', values });
type Layout = ReturnType<typeof layoutDag>;
const EPS = 0.011;

/** Every edge segment that passes through the inside of a box, other than its own target at its last point. */
function crossings(layout: Layout): string[] {
  const solid = layout.boxes.filter((b) => b.kind !== 'component');
  const found: string[] = [];
  for (const e of layout.edges) {
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1];
      const b = e.points[i];
      for (const s of solid) {
        if (i === e.points.length - 1 && s.id === e.to) continue;
        const x1 = Math.max(Math.min(a.x, b.x), s.x);
        const x2 = Math.min(Math.max(a.x, b.x), s.x + s.width);
        const y1 = Math.max(Math.min(a.y, b.y), s.y);
        const y2 = Math.min(Math.max(a.y, b.y), s.y + s.height);
        const through =
          a.y === b.y ? a.y > s.y + EPS && a.y < s.y + s.height - EPS && x2 - x1 > EPS : a.x > s.x + EPS && a.x < s.x + s.width - EPS && y2 - y1 > EPS;
        if (through) found.push(`${e.from}>${e.to} through ${s.id}`);
      }
    }
  }
  return found;
}

/** Pairs of edges (from different sources) whose straight segments cross or run along each other. */
function edgeClashes(layout: Layout): string[] {
  const segs = layout.edges.flatMap((e, k) => e.points.slice(1).map((b, i) => ({ a: e.points[i], b, k, name: `${e.from}>${e.to}` })));
  const found: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const u = segs[j];
      if (s.k === u.k || layout.edges[s.k].from === layout.edges[u.k].from) continue;
      const sh = s.a.y === s.b.y;
      const uh = u.a.y === u.b.y;
      if (sh !== uh) {
        const h = sh ? s : u;
        const v = sh ? u : s;
        const x = v.a.x;
        const y = h.a.y;
        if (x > Math.min(h.a.x, h.b.x) + EPS && x < Math.max(h.a.x, h.b.x) - EPS && y > Math.min(v.a.y, v.b.y) + EPS && y < Math.max(v.a.y, v.b.y) - EPS) {
          found.push(`${s.name} crosses ${u.name}`);
        }
      } else if (sh ? Math.abs(s.a.y - u.a.y) < EPS : Math.abs(s.a.x - u.a.x) < EPS) {
        const lo = (p: typeof s) => (sh ? Math.min(p.a.x, p.b.x) : Math.min(p.a.y, p.b.y));
        const hi = (p: typeof s) => (sh ? Math.max(p.a.x, p.b.x) : Math.max(p.a.y, p.b.y));
        if (Math.min(hi(s), hi(u)) - Math.max(lo(s), lo(u)) > EPS) found.push(`${s.name} runs along ${u.name}`);
      }
    }
  }
  return found;
}

// A placeholder recipe: two sub-component outputs join one step; two components join the last.
const FRITTERS = parse(
  '## Part A\n\n### Part B\n\n#### Do the first thing\n\n- 100 g flour\n- 1 tsp salt\n\nWhisk.\n\n' +
    '### Part C\n\n#### Do the second thing\n\n- 100 g water\n- 2 eggs, beaten\n\nWhisk.\n\n' +
    '### Do the third thing\n\n- 150 g russet potato, peeled and small-diced\n\nPat dry.\n\n' +
    '### Do the fourth thing\n\n- [part b](#part-b)\n- [part c](#part-c)\n\nStir.\n\n' +
    '### Do the fifth thing\n\n- frying oil\n\nFry.\n\n' +
    '## Part D\n\n### Do the sixth thing\n\n- 100 g sugar\n\nWhisk.\n\n' +
    '## Assembly\n\n### Do the last thing\n\n- [part a](#part-a)\n- [part d](#part-d)\n\nDrizzle.\n',
);

const lastPoint = (layout: Layout, from: string, to: string) => {
  const e = layout.edges.find((x) => x.from === from && x.to === to);
  expect(e, `${from}>${to}`).toBeDefined();
  return e!.points[e!.points.length - 1];
};
const tableLines = (layout: Layout, step: string): string[] => layout.boxes.find((b) => b.id === `ingredients:${step}`)!.lines;

describe('choose-label', () => {
  const recipe = parse('## Cook\n\n> **Choose** — one method.\n\n### Do the fifth thing\n\n- 5 g butter\n\nFry.\n\n### Bake\n\nBake.\n');

  it('names a Choose group "Choose", the callout\'s own name, by default', () => {
    const group = layoutDag(recipe).boxes.find((b) => b.id === 'choose:cook')!;
    expect(group.lines).toEqual(['Choose — Cook']);
    expect(renderDag(recipe)).toContain('Choose — Cook');
    expect(renderDag(recipe)).not.toContain('XOR');
  });

  it('still takes the word a theme gives', () => {
    const group = layoutDag(recipe, { theme: themed({ 'choose-label': 'XOR' }) }).boxes.find((b) => b.id === 'choose:cook')!;
    expect(group.lines).toEqual(['XOR — Cook']);
  });
});

describe('ingredient-text', () => {
  const recipe = parse(
    '## Mix\n\n- 600 g Water, 115°F, 50%\n- 150 g russet potato, peeled and small-diced\n- 25 g Syrup\n- 1 pinch kosher salt, fine\n- frying oil\n\nMix.\n',
  );

  it('shows each line in full by default, notes and all', () => {
    const lines = tableLines(layoutDag(recipe), 'mix').join(' ').replace(/\s+/g, ' ');
    expect(lines).toContain('600 g Water, 115°F, 50%');
    expect(lines).toContain('russet potato, peeled and small-diced');
    expect(renderDag(recipe)).toBe(renderDag(recipe, { theme: themed({ 'ingredient-text': 'full' }) }));
  });

  it('with `name`, keeps the quantity, unit and name and drops everything from the first comma', () => {
    const lines = tableLines(layoutDag(recipe, { theme: themed({ 'ingredient-text': 'name' }) }), 'mix').map((l) => l.replace(/\s+/g, ' ').trim());
    expect(lines).toEqual(['600 g Water', '150 g russet potato', '25 g Syrup', '1 pinch kosher salt', 'frying oil']);
    const svg = renderDag(recipe, { theme: themed({ 'ingredient-text': 'name' }) });
    expect(svg).not.toContain('115°F');
    expect(svg).not.toContain('peeled');
  });

  it('leaves a line with no comma the same either way', () => {
    const plain = parse('## Mix\n\n- 25 g Syrup\n- 2 l Water\n\nMix.\n');
    expect(renderDag(plain, { theme: themed({ 'ingredient-text': 'name' }) })).toBe(renderDag(plain));
  });

  it('makes a box no taller than in full', () => {
    const height = (mode: string) => layoutDag(FRITTERS, { theme: themed({ 'ingredient-text': mode }) }).boxes.find((b) => b.id === 'ingredients:do-the-third-thing')!.height;
    expect(height('name')).toBeLessThan(height('full'));
  });

  it('is checked like any value', () => {
    const report = checkDagTheme({ 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: t\nvalues:\n  ingredient-text: short\n' });
    expect(report.errors.join('\n')).toMatch(/ingredient-text.*must be one of `full`, `name`/);
    expect(() => renderDag(FRITTERS, { theme: themed({ 'ingredient-text': 'short' }) })).toThrow(/ingredient-text/);
    expect(checkDagTheme({ 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: t\nvalues:\n  ingredient-text: name\n' }).errors).toEqual([]);
  });
});

describe('join-edges', () => {
  it('is `separate` by default', () => {
    expect(renderDag(FRITTERS)).toBe(renderDag(FRITTERS, { theme: themed({ 'join-edges': 'separate' }) }));
    expect(renderDag(FRITTERS)).not.toBe(renderDag(FRITTERS, { theme: themed({ 'join-edges': 'bus' }) }));
  });

  it('with `bus`, runs edges joining one node into one point', () => {
    const layout = layoutDag(FRITTERS, { theme: themed({ 'join-edges': 'bus' }) });
    expect(lastPoint(layout, 'do-the-first-thing', 'do-the-fourth-thing')).toEqual(lastPoint(layout, 'do-the-second-thing', 'do-the-fourth-thing'));
    expect(lastPoint(layout, 'do-the-fifth-thing', 'do-the-last-thing')).toEqual(lastPoint(layout, 'do-the-sixth-thing', 'do-the-last-thing'));
  });

  it('with `separate`, gives each its own lane and its own point on the node, crossing nothing', () => {
    const bus = layoutDag(FRITTERS, { theme: themed({ 'join-edges': 'bus' }) });
    const layout = layoutDag(FRITTERS, { theme: themed({ 'join-edges': 'separate' }) });
    for (const [a, b, to] of [
      ['do-the-first-thing', 'do-the-second-thing', 'do-the-fourth-thing'],
      ['do-the-fifth-thing', 'do-the-sixth-thing', 'do-the-last-thing'],
    ]) {
      const p = lastPoint(layout, a, to);
      const q = lastPoint(layout, b, to);
      expect(p.y).not.toBe(q.y);
      // Both still end on the node's side, within its height.
      const node = layout.boxes.find((x) => x.id === to)!;
      for (const end of [p, q]) {
        expect(end.y).toBeGreaterThan(node.y);
        expect(end.y).toBeLessThan(node.y + node.height);
        expect(end.x).toBeGreaterThan(node.x + node.width / 2);
        expect(end.x).toBeLessThanOrEqual(node.x + node.width + EPS);
      }
    }
    expect(crossings(layout)).toEqual([]);
    expect(edgeClashes(layout)).toEqual([]);
    // The bus version shares a lane, which the clash check sees as edges running along each other.
    expect(edgeClashes(bus).length).toBeGreaterThan(0);
    // Boxes do not move; only the lanes widen the chart.
    const ops = (l: Layout) => l.boxes.filter((b) => b.kind !== 'component').map((b) => [b.id, b.y]);
    expect(ops(layout)).toEqual(ops(bus));
  });

  it('with `separate`, spreads edges that come in through a node\'s top along it, each turning in at its own height', () => {
    // Both branches join "Serve", whose left and right are taken by the spine: they come in from the top.
    const r = parse(
      '## Sauce\n\n### Simmer\n\n- 100 g tomatoes\n\nSimmer.\n\n' +
        '## Pesto\n\n### Blend\n\n- 50 g basil\n\nBlend.\n\n' +
        '## Pasta\n\n### Boil\n\n- 100 g pasta\n\nBoil.\n\n### Drain\n\nDrain.\n\n### Toss\n\nToss.\n\n### Serve\n\n- [sauce](#sauce)\n- [pesto](#pesto)\n- 5 g cheese\n\nServe.\n',
    );
    // Laid out with the third column, as a sheet lays it out: then both branches come in through the top.
    const bus = layoutDag(r, { theme: themed({ 'join-edges': 'bus', 'third-column': 'always' }) });
    const layout = layoutDag(r, { theme: themed({ 'join-edges': 'separate', 'third-column': 'always' }) });
    const p = layout.edges.find((e) => e.from === 'simmer' && e.to === 'serve')!.points;
    const q = layout.edges.find((e) => e.from === 'blend' && e.to === 'serve')!.points;
    // In bus, both end at one point on the top; in separate, each has its own drop and turn.
    expect(lastPoint(bus, 'simmer', 'serve')).toEqual(lastPoint(bus, 'blend', 'serve'));
    expect(p[p.length - 1].y).toBe(q[q.length - 1].y);
    expect(p[p.length - 1].x).not.toBe(q[q.length - 1].x);
    expect(p[p.length - 2].y).not.toBe(q[q.length - 2].y);
    expect(crossings(layout)).toEqual([]);
    // The lanes cross the Boil → Drain hop either way; separate adds no clash of its own.
    expect(edgeClashes(layout).filter((c) => c.includes('runs along'))).toEqual([]);
    expect(edgeClashes(layout).length).toBeLessThanOrEqual(edgeClashes(bus).filter((c) => c.includes('crosses')).length);
  });

  it('is checked like any value', () => {
    expect(() => renderDag(FRITTERS, { theme: themed({ 'join-edges': 'merged' }) })).toThrow(/join-edges/);
  });
});

describe('etna dag --ingredient-text and --join-edges', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-dag-options-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, 'recipe.md');
  writeFileSync(
    source,
    '---\netna: 1\n---\n\n# Test Recipe\n\n## Part A\n\n### Part B\n\n#### Do the first thing\n\n- 100 g flour, sifted\n\nWhisk.\n\n' +
      '### Part C\n\n#### Do the second thing\n\n- 100 g water\n\nWhisk.\n\n### Do the fourth thing\n\n- [part b](#part-b)\n- [part c](#part-c)\n- 1 tsp salt\n\nStir.\n',
  );
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});
  const quietRun = async (argv: string[]) => {
    const spy = quiet();
    try {
      return await run(argv);
    } finally {
      spy.mockRestore();
    }
  };

  it('override the theme', async () => {
    const spy = quiet();
    const out = (name: string) => join(dir, name);
    expect(await run([source, '--out', out('full.svg')])).toBe(0);
    expect(await run([source, '--ingredient-text', 'name', '--out', out('name.svg')])).toBe(0);
    expect(await run([source, '--ingredient-text=name', '--join-edges=separate', '--out', out('both.svg')])).toBe(0);
    expect(await run([source, '--theme', 'ink', '--join-edges', 'bus', '--out', out('ink.svg')])).toBe(0);
    spy.mockRestore();
    expect(readFileSync(out('full.svg'), 'utf8')).toContain('sifted');
    expect(readFileSync(out('name.svg'), 'utf8')).not.toContain('sifted');
    expect(readFileSync(out('both.svg'), 'utf8')).toBe(readFileSync(out('name.svg'), 'utf8'));
    expect(await quietRun([source, '--ingredient-text=name', '--join-edges=bus', '--out', out('bus.svg')])).toBe(0);
    expect(readFileSync(out('bus.svg'), 'utf8')).not.toBe(readFileSync(out('name.svg'), 'utf8'));
  });

  it('set the chart in a card style\'s fonts with --card', async () => {
    const out = (name: string) => join(dir, name);
    expect(await quietRun([source, '--fonts', 'none', '--out', out('own.svg')])).toBe(0);
    expect(await quietRun([source, '--fonts', 'none', '--card', 'folio', '--out', out('folio.svg')])).toBe(0);
    expect(readFileSync(out('own.svg'), 'utf8')).toContain('JetBrains Mono');
    expect(readFileSync(out('folio.svg'), 'utf8')).toContain('font-family:Spectral');
    // Ink says fonts: card: --card sets it in the card's fonts; without it, Arimo.
    expect(await quietRun([source, '--theme', 'ink', '--fonts', 'none', '--card', 'folio', '--out', out('ink-folio.svg')])).toBe(0);
    expect(await quietRun([source, '--theme', 'ink', '--fonts', 'none', '--out', out('ink-own.svg')])).toBe(0);
    expect(readFileSync(out('ink-folio.svg'), 'utf8')).toContain('font-family:Spectral');
    expect(readFileSync(out('ink-own.svg'), 'utf8')).toContain('font-family:Arimo');
    expect(readFileSync(out('ink-own.svg'), 'utf8')).not.toContain('Spectral');
    // A theme that keeps its own fonts says so, and draws as without --card.
    const notes: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void notes.push(a.join(' ')));
    expect(await run([source, '--theme', 'station', '--card', 'folio', '--out', out('station-folio.svg')])).toBe(0);
    expect(await run([source, '--theme', 'station', '--out', out('station-own.svg')])).toBe(0);
    expect(await run([source, '--card', 'no-such-card'])).toBe(2);
    spy.mockRestore();
    expect(notes.join('\n')).toContain('the Station style keeps its own fonts');
    expect(readFileSync(out('station-folio.svg'), 'utf8')).toBe(readFileSync(out('station-own.svg'), 'utf8'));
  });

  it('refuse a value they do not know', async () => {
    const spy = quiet();
    expect(await run([source, '--ingredient-text', 'short'])).toBe(2);
    expect(await run([source, '--join-edges', 'merged'])).toBe(2);
    expect(await run([source, '--join-edges'])).toBe(2);
    spy.mockRestore();
  });
});
