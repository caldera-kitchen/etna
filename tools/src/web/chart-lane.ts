// Runs the chart pane's jobs (chart-job.ts) in a Web Worker, so laying out a large chart does
// not freeze the page (decision D8: no size cap, off the main thread).
//
// A lane makes one chart at a time. Asking it for another, or canceling, abandons the job in
// progress: the worker making it is ended (terminate), so the job stops costing CPU, and its
// promise resolves to ABANDONED, never to a result; the next job gets a new worker. An idle
// worker is kept for the next job. The worker is a module worker (chart-worker.js beside app.js,
// shared chunks and lazy imports as the page has them); where none can be made or loaded (no
// Worker, or one that fails to load), the lane makes the chart on the page, as before.

import { useEffect, useState } from 'preact/hooks';

import type { Recipe } from '../core/index.ts';
import { runChartJob, type ChartAnswer, type ChartJob } from './chart-job.ts';
import type { DenseAsk, DenseHint } from '../dag/small-print.ts';
import type { ChartRender, Outcome } from './engine.ts';

/** What a job nobody waits for any more resolves to. */
export const ABANDONED = Symbol('abandoned');
export type Abandoned = typeof ABANDONED;

/** The part of a Worker a lane uses (a stand-in in the tests). */
export interface WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

/** The chart's worker, chart-worker.js, from beside the script that holds this code (so under any sub-path); null without Worker. */
export function chartWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./chart-worker.js', import.meta.url), { type: 'module', name: 'etna-chart' }) as unknown as WorkerLike;
}

interface Running {
  id: number;
  job: ChartJob;
  done: (answer: ChartAnswer | Abandoned) => void;
}

export class ChartLane {
  private worker: WorkerLike | null = null;
  /** The worker has said it loaded (chart-worker.ts): a later error is a job's, not a failure to load. */
  private loaded = false;
  /** No worker could be made or loaded: every job runs on the page. */
  private inline = false;
  private running: Running | null = null;
  private serial = 0;

  /**
   * `make` makes a worker (chartWorker in the GUI); `local` runs a job on the page when there is
   * none (runChartJob).
   */
  private readonly make: () => WorkerLike | null;
  private readonly local: (job: ChartJob) => Promise<ChartAnswer>;
  constructor(make: () => WorkerLike | null = chartWorker, local: (job: ChartJob) => Promise<ChartAnswer> = runChartJob) {
    this.make = make;
    this.local = local;
  }

  /** True while a job is being made. */
  get busy(): boolean {
    return this.running !== null;
  }

  /** True when jobs run on the page (no worker could be made or loaded). */
  get onPage(): boolean {
    return this.inline;
  }

  /** Make `job`, abandoning the job in progress, if any. */
  run(job: ChartJob): Promise<ChartAnswer | Abandoned> {
    this.cancel();
    const id = ++this.serial;
    return new Promise((done) => {
      this.running = { id, job, done };
      if (!this.inline && !this.worker) this.start();
      if (this.inline || !this.worker) return this.runLocally(id);
      try {
        this.worker.postMessage({ id, job });
      } catch {
        // Something in the job cannot be copied to a worker: this one is made here.
        this.runLocally(id);
      }
    });
  }

  /** Abandon the job in progress, if any: its worker is ended and its promise resolves to ABANDONED. An idle worker is kept. */
  cancel(): void {
    const running = this.running;
    if (!running) return;
    this.running = null;
    if (this.worker) this.end();
    running.done(ABANDONED);
  }

  /** Cancel, and end the idle worker too. */
  dispose(): void {
    this.cancel();
    if (this.worker) this.end();
  }

  private start(): void {
    let worker: WorkerLike | null = null;
    try {
      worker = this.make();
    } catch {
      worker = null;
    }
    if (!worker) {
      this.inline = true;
      return;
    }
    this.worker = worker;
    this.loaded = false;
    worker.onmessage = (event) => {
      if (worker !== this.worker) return;
      const data = event.data as { ready?: true; id: number; answer: ChartAnswer };
      if (data.ready) return void (this.loaded = true);
      const { id, answer } = data;
      // Only the job in progress is answered: a late answer to an abandoned one is dropped.
      if (!this.running || this.running.id !== id) return;
      const { done } = this.running;
      this.running = null;
      done(answer);
    };
    worker.onerror = () => {
      if (worker !== this.worker) return;
      const loaded = this.loaded;
      this.end();
      // A worker that never said it loaded did not load (no module workers, a missing file): charts
      // are made on the page from now on, this one included.
      if (!loaded) this.inline = true;
      const running = this.running;
      if (!running) return;
      if (!loaded) return void this.runLocally(running.id);
      this.running = null;
      running.done({ ok: false, error: 'The chart’s worker stopped.' });
    };
  }

  private end(): void {
    const worker = this.worker!;
    this.worker = null;
    worker.onmessage = null;
    worker.onerror = null;
    worker.terminate();
  }

  private async runLocally(id: number): Promise<void> {
    // After the page has drawn what it has (the waiting state), as a worker's answer would come.
    await new Promise((later) => setTimeout(later, 0));
    if (!this.running || this.running.id !== id) return;
    const answer = await this.local(this.running.job);
    if (!this.running || this.running.id !== id) return;
    const { done } = this.running;
    this.running = null;
    done(answer);
  }
}

/**
 * The chart pane's lanes: the chart on screen; the Dense line under a page-fitted chart
 * (dense-hint.ts), which lays the chart out again; and the PDF, which a new chart does not abandon.
 */
export const chartLane = new ChartLane();
export const denseLane = new ChartLane();
export const pdfLane = new ChartLane();

/** A chart the pane has, and what it was asked for with (chartKey). */
export interface ChartDrawn {
  key: string;
  svg: Outcome<string>;
}

/**
 * What the pane shows for the chart asked for by `key`, given the last chart drawn: that chart,
 * when it is the one asked for (`current`); else it is waiting (`pending`), and `last` is the
 * chart it had before, which it keeps in place only for a moment (150 ms: app.css's
 * `.chart-stage`), so a quick chart replaces it without a blank between them.
 */
export function chartShown(drawn: ChartDrawn | null, key: string | null): { pending: boolean; current: Outcome<string> | null; last: Outcome<string> | null } {
  if (key === null) return { pending: false, current: null, last: null };
  if (drawn && drawn.key === key) return { pending: false, current: drawn.svg, last: drawn.svg };
  return { pending: true, current: null, last: drawn?.svg ?? null };
}

const recipeIds = new WeakMap<Recipe, number>();
let recipeCount = 0;

/**
 * A key for one chart: the recipe (by identity: the GUI parses a text once), what it is
 * rendered with, and its fonts' css. Two jobs with one key make the same chart.
 */
export function chartKey(recipe: Recipe, render: ChartRender, fontCss: string): string {
  let id = recipeIds.get(recipe);
  if (id === undefined) recipeIds.set(recipe, (id = ++recipeCount));
  return `${id}\n${JSON.stringify(render)}\n${fontCss}`;
}

/**
 * The chart for `job` (null: none wanted), made by `lane`: a new job abandons the one before
 * it, and leaving the pane (unmounting) abandons the job in progress. A result arrives only for
 * the job asked for last. `hold`: wanted, but not to be started yet (its fonts are on their way),
 * so the pane waits rather than making a chart it would at once abandon.
 */
export function useChart(job: Extract<ChartJob, { kind: 'svg' }> | null, hold = false, lane: ChartLane = chartLane): ReturnType<typeof chartShown> & { key: string | null } {
  const key = job ? chartKey(job.recipe, job.render, job.fontCss) : null;
  const [drawn, setDrawn] = useState<ChartDrawn | null>(null);
  useEffect(() => {
    if (!job || hold || key === null || drawn?.key === key) return;
    let live = true;
    lane.run(job).then((answer) => {
      if (!live || answer === ABANDONED) return;
      setDrawn({ key, svg: answer.ok ? ('svg' in answer ? { ok: true, value: answer.svg } : { ok: false, error: 'not a chart' }) : answer });
    });
    return () => {
      live = false;
      lane.cancel();
    };
  }, [key, hold]);
  return { ...chartShown(drawn, key), key };
}

/**
 * The Dense line for the chart on screen (`ask`: dense-hint.ts denseAsk, null when no line can
 * show), made in `lane` as a chart is: a new ask or leaving the pane abandons the one in
 * progress, and a line shows only for the chart it was asked for (`key`, its chartKey).
 */
export function useDenseHint(recipe: Recipe | null, ask: DenseAsk<ChartRender> | null, key: string | null, lane: ChartLane = denseLane): DenseHint | null {
  const askKey = recipe && ask && key !== null ? `${key}\n${JSON.stringify(ask)}` : null;
  const [found, setFound] = useState<{ key: string; hint: DenseHint | null } | null>(null);
  useEffect(() => {
    if (!recipe || !ask || askKey === null || found?.key === askKey) return;
    let live = true;
    lane.run({ kind: 'dense', recipe, ask }).then((answer) => {
      if (!live || answer === ABANDONED) return;
      setFound({ key: askKey, hint: answer.ok && 'dense' in answer ? answer.dense : null });
    });
    return () => {
      live = false;
      lane.cancel();
    };
  }, [askKey]);
  return found && found.key === askKey ? found.hint : null;
}
