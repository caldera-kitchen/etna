// `etna dag --shape`, and `--paper` and `--margin` without `--pdf`: the sheet the chart is laid
// out for reaches the renderer as `sheet` (DagOptions), and the PDF's sheet turns as it says.
// renderDag and renderDagPdf are wrapped to record the options the command line hands them.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ETNA_ROOT } from '../../src/node/files.ts';

const seen = vi.hoisted(() => ({ svg: [] as unknown[], pdf: [] as unknown[] }));
vi.mock('../../src/dag/index.ts', async (original) => {
  const real = await original<typeof import('../../src/dag/index.ts')>();
  type Options = Parameters<typeof real.renderDag>[1];
  return { ...real, renderDag: (recipe: never, options: Options = {}) => (seen.svg.push(options.sheet), real.renderDag(recipe, options)) };
});
vi.mock('../../src/dag/pdf.ts', async (original) => {
  const real = await original<typeof import('../../src/dag/pdf.ts')>();
  type Options = Parameters<typeof real.renderDagPdf>[1];
  return { ...real, renderDagPdf: (recipe: never, options: Options) => (seen.pdf.push(options.sheet), real.renderDagPdf(recipe, options)) };
});

const { run } = await import('../../src/dag/cli.ts');

const recipe = join(ETNA_ROOT, 'cookbook', 'nana-palumbos-meatloaf', 'recipe.md');
const dir = mkdtempSync(join(tmpdir(), 'etna-dag-shape-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const out = (name: string) => join(dir, name);
const quietRun = async (argv: string[]) => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return await run(argv);
  } finally {
    spy.mockRestore();
  }
};

beforeEach(() => {
  seen.svg.length = 0;
  seen.pdf.length = 0;
});

describe('etna dag --shape', () => {
  it('hands the sheet to the SVG renderer, with or without --paper and --margin', async () => {
    expect(await quietRun([recipe, '--fonts', 'none', '--out', out('plain.svg')])).toBe(0);
    expect(await quietRun([recipe, '--fonts', 'none', '--shape', 'portrait', '--out', out('portrait.svg')])).toBe(0);
    expect(await quietRun([recipe, '--fonts', 'none', '--shape=landscape', '--paper', 'a4', '--margin', '1in', '--out', out('landscape.svg')])).toBe(0);
    expect(seen.svg).toEqual([
      { paper: undefined, margin: undefined, shape: undefined },
      { paper: undefined, margin: undefined, shape: 'portrait' },
      { paper: 'a4', margin: '1in', shape: 'landscape' },
    ]);
  });

  // Runs the command line for charts and PDFs: well over a second when the machine is busy, so a long timeout.
  it('fits an SVG to the screen and a PDF to auto when no shape is given', { timeout: 60_000 }, async () => {
    // The long stack: one column on the screen, folded on a sheet, so the two differ.
    const long = join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md');
    expect(await quietRun([long, '--fonts', 'none', '--out', out('none.svg')])).toBe(0);
    expect(await quietRun([long, '--fonts', 'none', '--shape', 'screen', '--out', out('screen.svg')])).toBe(0);
    expect(await quietRun([long, '--fonts', 'none', '--shape', 'auto', '--out', out('auto.svg')])).toBe(0);
    expect(readFileSync(out('screen.svg'), 'utf8')).toBe(readFileSync(out('none.svg'), 'utf8'));
    expect(readFileSync(out('auto.svg'), 'utf8')).not.toBe(readFileSync(out('none.svg'), 'utf8'));
    expect(await quietRun([long, '--pdf', '--out', out('none.pdf')])).toBe(0);
    expect(await quietRun([long, '--pdf', '--shape', 'auto', '--out', out('auto.pdf')])).toBe(0);
    expect(await quietRun([long, '--pdf', '--shape', 'screen', '--out', out('screen.pdf')])).toBe(0);
    expect(readFileSync(out('auto.pdf')).equals(readFileSync(out('none.pdf')))).toBe(true);
    expect(readFileSync(out('screen.pdf')).equals(readFileSync(out('none.pdf')))).toBe(true);
  });

  it('turns the PDF sheet as the shape says', async () => {
    expect(await quietRun([recipe, '--pdf', '--shape', 'landscape', '--paper', 'a4', '--out', out('landscape.pdf')])).toBe(0);
    expect(await quietRun([recipe, '--pdf', '--shape', 'portrait', '--margin', '0.75in', '--out', out('portrait.pdf')])).toBe(0);
    expect(seen.pdf).toEqual([
      { paper: 'a4', margin: undefined, shape: 'landscape' },
      { paper: undefined, margin: '0.75in', shape: 'portrait' },
    ]);
    const size = async (name: string) => (await PDFDocument.load(readFileSync(out(name)))).getPage(0).getSize();
    const landscape = await size('landscape.pdf');
    expect(landscape.width).toBeCloseTo(841.89, 1);
    expect(landscape.height).toBeCloseTo(595.276, 1);
    expect(await size('portrait.pdf')).toEqual({ width: 612, height: 792 });
  });

  it('refuses a shape it does not know, or none', async () => {
    expect(await quietRun([recipe, '--shape', 'square'])).toBe(2);
    expect(await quietRun([recipe, '--shape', 'Portrait'])).toBe(2);
    expect(await quietRun([recipe, '--shape', 'sheet'])).toBe(2);
    expect(await quietRun([recipe, '--shape'])).toBe(2);
    expect(await quietRun([recipe, '--shape='])).toBe(2);
    // --paper and --margin are still checked, now without --pdf too.
    expect(await quietRun([recipe, '--paper', 'legal'])).toBe(2);
    expect(await quietRun([recipe, '--margin', '2in'])).toBe(2);
    expect(seen.svg).toEqual([]);
  });

  it('names the shape in its help', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
    expect(await run(['--help'])).toBe(0);
    spy.mockRestore();
    expect(lines.join('\n')).toMatch(/--shape <shape>\s+What the chart is fitted to: the screen or a sheet\. screen:/);
    expect(lines.join('\n')).not.toContain('With --pdf: letter');
  });
});
