// Draws the two pictures the front README shows, from the cookbook's Potato Soup: its card in
// the default style and its flow chart, each a PNG about 800 pixels wide on its own white
// background, written to ../docs/images/. Run it from tools/ after Potato Soup or a default style
// changes:
//
//   node scripts/readme-pictures.mjs
//
// It runs `etna card` and `etna dag` into a temporary folder, then photographs both in headless
// Chrome (or the browser ETNA_BROWSER names), which it closes when it is done, also on failure.
// The browser is kept off the network: the card and the chart carry their own fonts.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findBrowser } from '../src/card/pdf.ts';

const tools = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recipe = join(tools, '..', 'cookbook', 'potato-soup');
const images = join(tools, '..', 'docs', 'images');
const WIDTH = 800;

const browser = findBrowser();
if (!browser) {
  console.error('readme-pictures: needs Chrome, Chromium, Edge or Brave (or ETNA_BROWSER set to one).');
  process.exit(1);
}
const temp = mkdtempSync(join(tmpdir(), 'etna-readme-pictures-'));
const etna = (...args) => execFileSync(process.execPath, [join(tools, 'bin', 'etna.js'), ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
etna('card', recipe, '--out', join(temp, 'card.html'));
etna('dag', recipe, '--out', join(temp, 'chart.svg'));
writeFileSync(join(temp, 'chart.html'), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}img{display:block;width:${WIDTH}px}</style><img src="chart.svg">`);

const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${join(temp, 'profile')}`, '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await wait(200);
    }
  }
  if (!targets) throw new Error('the browser did not start');
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const open = async (file, width, height) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    await wait(1500);
    await evaluate('document.fonts.ready.then(() => 1)');
  };
  const capture = async (clip, name) => {
    const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
    writeFileSync(join(images, name), Buffer.from(shot.result.data, 'base64'));
    console.log(`wrote ../docs/images/${name}`);
  };

  // The card: its first page as the browser shows it, from the page's top edge to just below the
  // last line of the recipe (the empty rest of the sheet left out), on the page's own white.
  await open(join(temp, 'card.html'), 900, 1400);
  const card = await evaluate(`(() => {
    const page = [...document.querySelectorAll('body *')].find((el) => { const r = el.getBoundingClientRect(); return r.width >= 700 && r.width <= 900 && getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)'; });
    const p = page.getBoundingClientRect();
    const texts = [...page.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent.trim()).map((el) => el.getBoundingClientRect().bottom);
    return { x: p.left, y: p.top, width: p.width, height: Math.min(p.height, Math.max(...texts) - p.top + 48) };
  })()`);
  await capture(card, 'potato-soup-card.png');

  // The chart: the SVG drawn WIDTH pixels wide on white.
  await open(join(temp, 'chart.html'), WIDTH, 2000);
  const height = await evaluate(`document.querySelector('img').getBoundingClientRect().height`);
  await capture({ x: 0, y: 0, width: WIDTH, height: Math.ceil(height) }, 'potato-soup-chart.png');
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGTERM');
  await wait(500);
  if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
  rmSync(temp, { recursive: true, force: true });
}
