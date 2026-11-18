// The chart pane's worker lane (chart-lane.ts): a new chart abandons the one in progress, whose
// worker is ended and whose result never arrives; and the chart made in the worker is the same
// bytes as the chart the page made itself before.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { ChartAnswer, ChartJob } from '../../src/web/chart-job.ts';

// The bundle's data, as build.ts compiles it, without esbuild (as engine.test.ts has it).
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

const { ABANDONED, ChartLane, chartKey, chartShown } = await import('../../src/web/chart-lane.ts');
const { runChartJob } = await import('../../src/web/chart-job.ts');
const engine = await import('../../src/web/engine.ts');
const { ETNA_ROOT } = await import('../../src/node/files.ts');
const { CHART_SHAPES } = await import('../../src/dag/sheet.ts');

/** A stand-in worker: it keeps what it was sent, says when it has loaded, and answers when told. */
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: { id: number; job: ChartJob }[] = [];
  terminated = false;
  postMessage(message: unknown) {
    this.sent.push(message as { id: number; job: ChartJob });
  }
  terminate() {
    this.terminated = true;
  }
  loaded() {
    this.onmessage?.({ data: { ready: true } });
  }
  answer(answer: ChartAnswer, id = this.sent.at(-1)!.id) {
    this.onmessage?.({ data: { id, answer } });
  }
  fail() {
    this.onerror?.({ message: 'failed' });
  }
}

const job = (n: number): ChartJob => ({ kind: 'svg', recipe: { n } as never, render: {}, fontCss: '' });
const settled = () => new Promise((r) => setTimeout(r, 5));

function lane() {
  const made: FakeWorker[] = [];
  const local = vi.fn(async (j: ChartJob): Promise<ChartAnswer> => ({ ok: true, svg: `local ${(j.recipe as unknown as { n: number }).n}` }));
  const l = new ChartLane(() => {
    const w = new FakeWorker();
    made.push(w);
    return w;
  }, local);
  return { lane: l, made, local };
}

describe('the chart lane', () => {
  it('makes a chart in a worker and answers with it', async () => {
    const { lane: l, made, local } = lane();
    const got = l.run(job(1));
    expect(made).toHaveLength(1);
    expect(made[0].sent[0].job).toEqual(job(1));
    expect(l.busy).toBe(true);
    made[0].loaded();
    made[0].answer({ ok: true, svg: '<svg>1</svg>' });
    expect(await got).toEqual({ ok: true, svg: '<svg>1</svg>' });
    expect(l.busy).toBe(false);
    expect(local).not.toHaveBeenCalled();
  });

  it('abandons the job in progress when asked for another: its worker is ended, its promise says so, a new worker makes the next', async () => {
    const { lane: l, made } = lane();
    const first = l.run(job(1));
    made[0].loaded();
    const second = l.run(job(2));
    expect(await first).toBe(ABANDONED);
    expect(made[0].terminated).toBe(true);
    expect(made).toHaveLength(2);
    expect(made[1].sent.map((m) => m.job)).toEqual([job(2)]);
    made[1].loaded();
    made[1].answer({ ok: true, svg: 'two' });
    expect(await second).toEqual({ ok: true, svg: 'two' });
  });

  it('never delivers a stale result: an answer to an abandoned job is dropped, also one that comes late', async () => {
    const { lane: l, made } = lane();
    const results: unknown[] = [];
    l.run(job(1)).then((r) => results.push(['first', r]));
    made[0].loaded();
    const oldHandler = made[0].onmessage!;
    const oldId = made[0].sent[0].id;
    const second = l.run(job(2));
    second.then((r) => results.push(['second', r]));
    // The ended worker's handler is cleared; were its answer to arrive anyway, it is not the job asked for.
    expect(made[0].onmessage).toBeNull();
    oldHandler({ data: { id: oldId, answer: { ok: true, svg: 'stale' } } });
    made[1].loaded();
    made[1].answer({ ok: true, svg: 'stale' }, oldId);
    await settled();
    expect(results).toEqual([['first', ABANDONED]]);
    expect(l.busy).toBe(true);
    made[1].answer({ ok: true, svg: 'fresh' });
    await settled();
    expect(results).toEqual([['first', ABANDONED], ['second', { ok: true, svg: 'fresh' }]]);
  });

  it('cancel ends a worker that is making a chart, and keeps an idle one for the next chart', async () => {
    const { lane: l, made } = lane();
    const first = l.run(job(1));
    made[0].loaded();
    made[0].answer({ ok: true, svg: 'one' });
    await first;
    l.cancel();
    expect(made[0].terminated).toBe(false);
    const second = l.run(job(2));
    expect(made).toHaveLength(1);
    expect(made[0].sent).toHaveLength(2);
    l.cancel();
    expect(made[0].terminated).toBe(true);
    expect(await second).toBe(ABANDONED);
    expect(l.busy).toBe(false);
    l.dispose();
  });

  it('dispose ends the idle worker too', async () => {
    const { lane: l, made } = lane();
    const first = l.run(job(1));
    made[0].loaded();
    made[0].answer({ ok: true, svg: 'one' });
    await first;
    l.dispose();
    expect(made[0].terminated).toBe(true);
  });

  it('makes the chart on the page when a worker cannot be loaded, this job and the next', async () => {
    const { lane: l, made, local } = lane();
    const got = l.run(job(1));
    made[0].fail(); // before it said it loaded: no module workers, or no file
    expect(await got).toEqual({ ok: true, svg: 'local 1' });
    expect(made[0].terminated).toBe(true);
    expect(l.onPage).toBe(true);
    expect(await l.run(job(2))).toEqual({ ok: true, svg: 'local 2' });
    expect(made).toHaveLength(1);
    expect(local).toHaveBeenCalledTimes(2);
  });

  it('makes the chart on the page when there is no Worker at all, and a job abandoned there never answers', async () => {
    const local = vi.fn(async (j: ChartJob): Promise<ChartAnswer> => ({ ok: true, svg: `local ${(j.recipe as unknown as { n: number }).n}` }));
    const l = new ChartLane(() => null, local);
    const first = l.run(job(1));
    const second = l.run(job(2));
    expect(await first).toBe(ABANDONED);
    expect(await second).toEqual({ ok: true, svg: 'local 2' });
    // The abandoned one was never started: it was still waiting for the page to draw.
    expect(local).toHaveBeenCalledTimes(1);
  });

  it('says so when a loaded worker stops, and the next chart gets a new worker', async () => {
    const { lane: l, made } = lane();
    const got = l.run(job(1));
    made[0].loaded();
    made[0].fail();
    expect(await got).toEqual({ ok: false, error: 'The chart’s worker stopped.' });
    expect(l.onPage).toBe(false);
    l.run(job(2));
    expect(made).toHaveLength(2);
  });
});

describe('what the chart pane shows', () => {
  const svg = (value: string) => ({ ok: true as const, value });

  it('shows a chart only for the chart asked for; meanwhile it is waiting, with the chart it had', () => {
    expect(chartShown(null, null)).toEqual({ pending: false, current: null, last: null });
    expect(chartShown(null, 'a')).toEqual({ pending: true, current: null, last: null });
    expect(chartShown({ key: 'a', svg: svg('A') }, 'a')).toEqual({ pending: false, current: svg('A'), last: svg('A') });
    expect(chartShown({ key: 'a', svg: svg('A') }, 'b')).toEqual({ pending: true, current: null, last: svg('A') });
  });

  it('keys a chart by its recipe, its options and its fonts', () => {
    const r1 = { title: null } as never;
    const r2 = { title: null } as never;
    const render = { sheet: { shape: 'auto' as const } };
    expect(chartKey(r1, render, '')).toBe(chartKey(r1, { sheet: { shape: 'auto' } }, ''));
    expect(chartKey(r1, render, '')).not.toBe(chartKey(r2, render, ''));
    expect(chartKey(r1, render, '')).not.toBe(chartKey(r1, { sheet: { shape: 'portrait' } }, ''));
    expect(chartKey(r1, render, '')).not.toBe(chartKey(r1, render, '@font-face{}'));
  });
});

describe('the chart made in the worker', () => {
  // Every recipe that ships with a chart, in every built-in chart style and fit, as the worker
  // gets the job: copied (structured clone), the recipe parsed on the page.
  const folders = readdirSync(join(ETNA_ROOT, 'cookbook'))
    .map((name) => join(ETNA_ROOT, 'cookbook', name, 'recipe.md'))
    .filter((file) => existsSync(file));

  it('is the same bytes as the chart the page made itself (engine.ts chart)', async () => {
    let compared = 0;
    for (const file of folders) {
      const analysis = engine.analyze(readFileSync(file, 'utf8'));
      if (!analysis.recipe.ok || analysis.recipe.value.form === 'traditional') continue;
      for (const entry of engine.builtinChartThemes) {
        for (const shape of CHART_SHAPES) {
          const options = { sheet: { paper: 'letter' as const, margin: '0.75in' as const, shape }, fontCss: '' };
          const page = engine.chart(analysis.recipe.value, entry, options);
          const render = engine.chartRenderOptions(entry, options);
          expect(render.ok).toBe(true);
          if (!render.ok) continue;
          const answer = await runChartJob(structuredClone({ kind: 'svg', recipe: analysis.recipe.value, render: render.value, fontCss: '' }));
          expect(page.ok, file).toBe(true);
          expect(answer.ok && 'svg' in answer && page.ok && answer.svg === page.value, `${file} ${entry.name} ${shape}`).toBe(true);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  }, 60_000);

  it('gives the Dense line the page gave: the same sizes, or none, for every page fit', async () => {
    const { denseAsk, denseHint } = await import('../../src/web/dense-hint.ts');
    let asked = 0;
    for (const file of folders) {
      const analysis = engine.analyze(readFileSync(file, 'utf8'));
      if (!analysis.recipe.ok || analysis.recipe.value.form === 'traditional') continue;
      for (const entry of engine.builtinChartThemes) {
        for (const shape of ['auto', 'portrait', 'landscape'] as const) {
          // A small page, so some charts print under 7 pt and the line is worked out in full.
          const sheet = { paper: 'letter' as const, margin: '1in' as const, shape };
          const svg = engine.chart(analysis.recipe.value, entry, { sheet });
          if (!svg.ok) continue;
          const options = { joinEdges: null, sheet };
          const onPage = denseHint(analysis.recipe.value, entry, engine.builtinChartThemes, svg.value, options);
          const ask = denseAsk(entry, engine.builtinChartThemes, svg.value, options);
          if (!ask) {
            expect(onPage).toBeNull();
            continue;
          }
          asked++;
          const answer = await runChartJob(structuredClone({ kind: 'dense', recipe: analysis.recipe.value, ask }));
          expect(answer.ok && 'dense' in answer ? answer.dense : 'no answer', `${file} ${entry.name} ${shape}`).toEqual(onPage);
        }
      }
    }
    expect(asked).toBeGreaterThan(0);
  }, 60_000);

  it('says what went wrong rather than throwing', async () => {
    const analysis = engine.analyze(readFileSync(join(ETNA_ROOT, 'cookbook', 'potato-soup-traditional-form', 'recipe.md'), 'utf8'));
    expect(analysis.recipe.ok).toBe(true);
    if (!analysis.recipe.ok) return;
    const answer = await runChartJob({ kind: 'svg', recipe: analysis.recipe.value, render: {}, fontCss: '' });
    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(/traditional form/);
  });
});
