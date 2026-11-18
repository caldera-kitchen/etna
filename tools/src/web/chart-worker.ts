// The chart's Web Worker (build.ts bundles it as chart-worker.js, a module worker beside app.js):
// it makes the charts chart-lane.ts sends it, one at a time, off the page's main thread. A job
// the page no longer wants is not stopped from in here: the page ends the worker (terminate).

import { runChartJob, type ChartJob } from './chart-job.ts';

/** The worker's global scope, typed by hand: the project's types are the page's (lib DOM). */
const scope = self as unknown as {
  onmessage: ((event: { data: { id: number; job: ChartJob } }) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async ({ data: { id, job } }) => {
  const answer = await runChartJob(job);
  // The PDF's bytes move to the page rather than being copied.
  scope.postMessage({ id, answer }, answer.ok && 'pdf' in answer ? [answer.pdf.buffer as ArrayBuffer] : []);
};

// Loaded: from here on an error is a job's, not the worker's failing to load (chart-lane.ts).
scope.postMessage({ ready: true });
