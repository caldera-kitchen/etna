// PDF output: print the card with a Chrome-family browser that is already installed.
// Nothing is downloaded; without such a browser, print the HTML card from any browser instead.
//
// The browser is driven over the DevTools protocol on a pipe (--remote-debugging-pipe: no
// network port is opened). For each card it opens the page, waits until the paging script says
// it is done (`data-paged` on the root element: done or failed), and prints with the page size
// the card's CSS sets. One browser serves a whole batch.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Path of a Chrome-family browser, from ETNA_BROWSER or the usual install locations. */
export function findBrowser(): string | null {
  const fromEnv = process.env.ETNA_BROWSER;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/** What the paging script reported for a printed card. */
export interface PrintResult {
  /** `done`, `failed` (printed as the plain flow), or `none` (a card without the paging script). */
  paged: 'done' | 'failed' | 'none';
  /** Pages the script made; null when it did not page. */
  pages: number | null;
  /** The text size printed (`10.2pt`); null when not known. */
  size: string | null;
  /** How fitting decided (`kept`, `shrunk`, `unclipped`; `grown` or `short` only for a theme with `fit.grow`); null when it did not fit. */
  fit: string | null;
  /** The script's error, when it failed. */
  error: string | null;
  /** Something taller than a page, and not to be split, was printed cut off. */
  overflow: boolean;
}

export interface Printer {
  /** Print one HTML document to a PDF file. Rejects when the browser fails or times out. */
  print(html: string, target: string): Promise<PrintResult>;
  close(): Promise<void>;
}

interface Message {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

const PAGE_TIMEOUT = 30_000;

/** Start a headless browser for printing cards; close it when done. */
export async function openPrinter(browser: string): Promise<Printer> {
  const dir = mkdtempSync(join(tmpdir(), 'etna-card-'));
  const child: ChildProcess = spawn(
    browser,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--remote-debugging-pipe',
      `--user-data-dir=${join(dir, 'profile')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
  );
  const toBrowser = child.stdio[3] as Writable;
  const fromBrowser = child.stdio[4] as Readable;
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-4000);
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (m: Message) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(m: Message) => void>();
  let exited: Error | null = null;
  const fail = (error: Error) => {
    exited = error;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', (code) => fail(new Error(`the browser exited (code ${code})${stderr ? `: ${stderr.trim().split('\n').pop()}` : ''}`)));

  let buffer = '';
  fromBrowser.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let end: number;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end)) as Message;
      buffer = buffer.slice(end + 1);
      if (message.id !== undefined && pending.has(message.id)) {
        const p = pending.get(message.id)!;
        pending.delete(message.id);
        if (message.error) p.reject(new Error(message.error.message));
        else p.resolve(message);
      } else for (const listen of listeners) listen(message);
    }
  });

  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> => {
    if (exited) return Promise.reject(exited);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: (m) => resolve(m.result ?? {}), reject });
      toBrowser.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  };
  const withTimeout = <T>(promise: Promise<T>, what: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out ${what}`)), PAGE_TIMEOUT);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });

  /** Stop the browser, let go of its pipes and remove its temporary folder. Safe to call twice. */
  const shutdown = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      const gone = new Promise((r) => child.once('exit', r));
      const wait = (ms: number) => Promise.race([gone, new Promise((r) => setTimeout(r, ms).unref())]);
      if (!exited) {
        send('Browser.close').catch(() => undefined);
        await wait(3000);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await wait(2000);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await wait(1000);
      }
    }
    // Open pipes to a browser that never answered would keep this process alive.
    toBrowser.destroy();
    fromBrowser.destroy();
    child.stderr?.destroy();
    child.unref();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // A browser that is slow to let go of its profile leaves a temporary folder behind.
    }
  };

  try {
    await withTimeout(send('Browser.getVersion'), 'starting the browser');
  } catch (error) {
    // A browser that did not start is still a process and a folder: clean both up.
    exited ??= error instanceof Error ? error : new Error(String(error));
    await shutdown();
    throw error;
  }
  let count = 0;

  return {
    async print(html: string, target: string): Promise<PrintResult> {
      const page = join(dir, `card-${++count}.html`);
      writeFileSync(page, html);
      const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      try {
        const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
        await send('Page.enable', {}, sessionId);
        const loaded = new Promise<void>((resolve) => {
          const listen = (m: Message) => {
            if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
              listeners.delete(listen);
              resolve();
            }
          };
          listeners.add(listen);
        });
        await send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);
        await withTimeout(loaded, 'loading the card');
        const evaluated = await withTimeout(send('Runtime.evaluate', { expression: WAIT_FOR_PAGING, awaitPromise: true, returnByValue: true }, sessionId), 'paging the card');
        const result = (evaluated.result as { value?: PrintResult } | undefined)?.value;
        if (!result) throw new Error('could not read the paging result');
        const pdf = await withTimeout(
          send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, transferMode: 'ReturnAsBase64' }, sessionId),
          'printing the card',
        );
        rmSync(target, { force: true });
        writeFileSync(target, Buffer.from(pdf.data as string, 'base64'));
        return result;
      } finally {
        await send('Target.closeTarget', { targetId }).catch(() => undefined);
        rmSync(page, { force: true });
      }
    },
    close: shutdown,
  };
}

/** Evaluated in the card: resolves when the paging script has finished (or at once without one). */
const WAIT_FOR_PAGING = `new Promise((resolve) => {
  const root = document.documentElement;
  const read = (paged) => ({
    paged,
    pages: root.hasAttribute('data-pages') ? Number(root.getAttribute('data-pages')) : null,
    size: root.getAttribute('data-size'),
    fit: root.getAttribute('data-fit-result'),
    error: root.getAttribute('data-paging-error'),
    overflow: root.hasAttribute('data-overflow'),
  });
  const check = () => {
    const state = root.getAttribute('data-paged');
    if (state === 'done' || state === 'failed') resolve(read(state));
    else if (!root.hasAttribute('data-fit') && state === null) resolve(read('none'));
    else setTimeout(check, 20);
  };
  check();
})`;
