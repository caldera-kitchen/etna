// `etna dag`'s note on small print: when a chart fitted to a sheet prints its body text under
// 7 pt and Dense prints it larger, one line on standard error says so (dag/small-print.ts, the
// rule the app's chart tab uses). It changes nothing else: standard output, the file, the exit code.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// The bundle's data, as build.ts compiles it, without esbuild (as engine.test.ts does): the app's
// own line is worked out here too, to show the two agree.
vi.mock('virtual:etna-data', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { listThemes, readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');
  const { ETNA_ROOT: root } = await import('../../src/node/files.ts');
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(j(THEMES_DIR, name));
  const { dagThemeDir, listDagThemes, readDagThemeFiles } = await import('../../src/dag/node.ts');
  const chartThemes: Record<string, Record<string, string>> = {};
  for (const name of listDagThemes()) chartThemes[name] = readDagThemeFiles(dagThemeDir(name));
  return { unitsYaml: read(j(root, 'registries', 'units.yaml'), 'utf8'), themes, chartThemes, fontMode: 'web', fontCss: {}, localServer: true, about: null };
});

const { ETNA_ROOT } = await import('../../src/node/files.ts');
const { run } = await import('../../src/dag/cli.ts');
const { dagThemeDir } = await import('../../src/dag/node.ts');
const { pointsText } = await import('../../src/dag/small-print.ts');
const { analyze, builtinChartThemes, builtinThemes, chart, pickChartTheme, pickTheme } = await import('../../src/web/engine.ts');
const { denseHint } = await import('../../src/web/dense-hint.ts');
const { cardType } = await import('../../src/card/index.ts');

const recipes = join(ETNA_ROOT, 'cookbook');
const example = (slug: string) => join(recipes, slug, 'recipe.md');
const rolls = example('next-day-soft-cinnamon-rolls');
const malted = example('malted-chocolate');
const dir = mkdtempSync(join(tmpdir(), 'etna-dag-small-print-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const out = (name: string) => join(dir, name);

/** Runs `etna dag`, returning its exit code, what it wrote on standard error, and on standard output. */
async function dag(argv: string[]): Promise<{ code: number; err: string[]; stdout: string }> {
  const err: string[] = [];
  let stdout = '';
  const e = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')));
  const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => ((stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('latin1')), true));
  try {
    return { code: await run(argv), err, stdout };
  } finally {
    e.mockRestore();
    o.mockRestore();
  }
}
const notes = (err: string[]) => err.filter((l) => / text prints at /.test(l));

describe('etna dag: the small-print note', { timeout: 60_000 }, () => {
  it('prints one note on standard error for a sheet, with both sizes and the option', async () => {
    const r = await dag([rolls, '--fonts', 'none', '--shape', 'auto', '--out', out('rolls.svg')]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    // In Flow on Letter, auto, the rolls print at about 5.5 pt and Dense prints them at about 6.9 (tests/web/dense-hint.test.ts).
    expect(notes(r.err)).toEqual(['etna dag: next-day-soft-cinnamon-rolls: text prints at 5.5 pt on this page. The Dense style prints it at 6.9 pt (--theme dense).']);
    // After the line saying where the chart went.
    expect(r.err.at(-1)).toBe(notes(r.err)[0]);
  });

  it('prints it for a PDF, which is always a sheet (auto without --shape)', async () => {
    const r = await dag([rolls, '--pdf', '--out', out('rolls.pdf')]);
    expect(r.code).toBe(0);
    expect(notes(r.err)).toEqual(['etna dag: next-day-soft-cinnamon-rolls: text prints at 5.5 pt on this page. The Dense style prints it at 6.9 pt (--theme dense).']);
  });

  it('keeps standard output the chart alone when the chart goes there', async () => {
    const r = await dag([rolls, '--fonts', 'none', '--shape', 'auto']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(readFileSync(out('rolls.svg'), 'utf8'));
    expect(r.stdout).not.toMatch(/prints at/);
    expect(notes(r.err)).toHaveLength(1);
  });

  it('says nothing on the screen, at 7 pt or more, or in Dense itself', async () => {
    expect(notes((await dag([rolls, '--fonts', 'none', '--out', out('screen.svg')])).err)).toEqual([]);
    expect(notes((await dag([rolls, '--fonts', 'none', '--shape', 'screen', '--out', out('screen.svg')])).err)).toEqual([]);
    expect(notes((await dag([malted, '--fonts', 'none', '--shape', 'auto', '--out', out('malted.svg')])).err)).toEqual([]);
    expect(notes((await dag([rolls, '--fonts', 'none', '--shape', 'auto', '--theme', 'dense', '--out', out('dense.svg')])).err)).toEqual([]);
    // Dense named by its folder is still Dense.
    expect(notes((await dag([rolls, '--fonts', 'none', '--shape', 'auto', '--theme', dagThemeDir('dense'), '--out', out('dense.svg')])).err)).toEqual([]);
  });

  it('gives a third-party style the note, unless it already prints as large as Dense', async () => {
    const own = out('my-flow');
    cpSync(dagThemeDir('flow'), own, { recursive: true });
    const r = await dag([rolls, '--fonts', 'none', '--shape', 'auto', '--theme', own, '--out', out('own.svg')]);
    expect(notes(r.err)).toEqual(['etna dag: next-day-soft-cinnamon-rolls: text prints at 5.5 pt on this page. The Dense style prints it at 6.9 pt (--theme dense).']);
    // A renamed copy of Dense is not Dense, but Dense prints it no larger (not more than TIE): no note.
    const twin = out('my-dense');
    cpSync(dagThemeDir('dense'), twin, { recursive: true });
    const yaml = join(twin, 'theme.yaml');
    writeFileSync(yaml, readFileSync(yaml, 'utf8').replace(/^name:.*$/m, 'name: my-dense'));
    expect(notes((await dag([rolls, '--fonts', 'none', '--shape', 'auto', '--theme', twin, '--out', out('twin.svg')])).err)).toEqual([]);
  });

  it('prints one note per chart that needs it among several, each with its recipe’s name', async () => {
    const r = await dag([recipes, '--fonts', 'none', '--shape', 'auto', '--margin', '1in', '--out-dir', out('all')]);
    expect(r.code).toBe(0);
    const named = notes(r.err).map((l) => /^etna dag: ([a-z0-9-]+): /.exec(l)?.[1]);
    expect(named.length).toBeGreaterThan(1);
    expect(new Set(named).size).toBe(named.length);
    // Each note comes straight after its chart's "wrote" line.
    for (const slug of named) expect(r.err[r.err.findIndex((l) => l.startsWith(`etna dag: ${slug}: `)) - 1]).toMatch(new RegExp(`wrote .*/${slug}\\.svg$`));
  });

  it('gives the sizes the app’s line gives, for five recipes that ship, every sheet and card font', async () => {
    const flow = pickChartTheme(builtinChartThemes, 'builtin:flow')!;
    const mise = cardType(pickTheme(builtinThemes, 'builtin:mise')!.theme!);
    let shown = 0;
    for (const slug of ['next-day-soft-cinnamon-rolls', 'malted-chocolate', 'easter-bread', 'italian-wedding-soup', 'nana-palumbos-meatloaf']) {
      const a = analyze(readFileSync(example(slug), 'utf8'));
      if (!a.recipe.ok) throw new Error(a.recipe.error);
      for (const shape of ['auto', 'portrait', 'landscape'] as const) {
        for (const card of [null, mise]) {
          const sheet = { paper: 'letter' as const, margin: '1in' as const, shape };
          const svg = chart(a.recipe.value, flow, { sheet, cardType: card });
          if (!svg.ok) throw new Error(svg.error);
          const hint = denseHint(a.recipe.value, flow, builtinChartThemes, svg.value, { joinEdges: null, sheet, cardType: card });
          const r = await dag([example(slug), '--fonts', 'none', '--shape', shape, '--margin', '1in', ...(card ? ['--card', 'mise'] : []), '--out', out('agree.svg')]);
          const expected = hint ? [`etna dag: ${slug}: text prints at ${pointsText(hint.now)} on this page. The Dense style prints it at ${pointsText(hint.dense)} (--theme dense).`] : [];
          expect(notes(r.err), `${slug} ${shape} ${card ? 'mise' : 'own'}`).toEqual(expected);
          if (hint) shown++;
        }
      }
    }
    expect(shown).toBeGreaterThan(3);
  });

  it('says in its help that the note exists', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    try {
      expect(await run(['--help'])).toBe(0);
    } finally {
      log.mockRestore();
    }
    expect(lines.join('\n')).toMatch(/Small print:[\s\S]*under 7 pt[\s\S]*\(--theme dense\)/);
  });
});
