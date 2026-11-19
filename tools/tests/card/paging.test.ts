// Paged cards: the fit decision, papers, the paging script inside the document and its policy,
// the bundled themes' paper support — and, when a Chrome-family browser is installed, a real
// paging and printing run (skipped cleanly otherwise).

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { decideFit, type FitRule, type Layout } from '../../src/card/fit.ts';
import { cardPaging, pageSetup, PAPERS, parseTheme, renderCard, themePapers, toPoints } from '../../src/card/index.ts';
import { run } from '../../src/card/cli.ts';
import { listThemes, loadTheme } from '../../src/card/node.ts';
import { pagingProblems } from '../../src/card/paper.ts';
import { findBrowser, openPrinter } from '../../src/card/pdf.ts';
import { pagingProgram } from '../../src/card/paging.ts';
import { pagingScript } from '../../src/card/script.ts';
import { sha256Base64 } from '../../src/card/sha256.ts';
import { parseRecipe } from '../../src/core/index.ts';
import { ETNA_ROOT, loadUnits, readRecipe } from '../../src/node/files.ts';
import type { Theme } from '../../src/card/index.ts';

const RULE: FitRule = { base: 10, min: 8.5, max: 12, nearlyEmpty: 0.3, short: 0.5, full: 0.9, step: 0.1 };
/** A theme that opts in to the older rule, which also grows a card (`fit.grow: true`). */
const GROW: FitRule = { ...RULE, grow: true };

/**
 * A model card: `lines` lines of `size`-point text with 1.4 leading on pages `height` points
 * tall, broken in blocks of `block` lines. Page count and last-page fill grow with the size.
 */
function model(lines: number, height = 600, block = 4): (size: number) => Layout {
  return (size) => {
    const perPage = Math.floor(height / (size * 1.4) / block) * block;
    const pages = Math.ceil(lines / perPage);
    const last = lines - (pages - 1) * perPage;
    return { pages, fill: (last * size * 1.4) / height };
  };
}

describe('decideFit', () => {
  it('leaves a short one-page card at the base size', () => {
    let d = decideFit(RULE, model(8));
    expect(d).toMatchObject({ size: 10, pages: 1, reason: 'kept' });
    expect(d.tried).toEqual([10]);
    d = decideFit(GROW, model(8));
    expect(d).toMatchObject({ size: 10, pages: 1, reason: 'short' });
    expect(d.tried).toEqual([10]);
  });

  it('shrinks to pull a nearly empty last page back', () => {
    // 45 lines at 10pt: 40 on page one, 5 on page two (12 % full).
    const measure = model(45);
    expect(measure(10)).toMatchObject({ pages: 2 });
    const d = decideFit(RULE, measure);
    expect(d.reason).toBe('shrunk');
    expect(d.pages).toBe(1);
    expect(d.size).toBeLessThan(10);
    expect(d.size).toBeGreaterThanOrEqual(RULE.min);
    // The largest size that does it: one step larger needs two pages.
    expect(measure(Math.round((d.size + 0.1) * 10) / 10).pages).toBe(2);
    expect(decideFit(GROW, measure)).toEqual(d);
  });

  it('never grows: a card that half fills its page prints at the base size', () => {
    for (const lines of [3, 20, 28, 39, 60, 81, 130]) {
      const d = decideFit(RULE, model(lines));
      expect(d.size, `${lines} lines`).toBeLessThanOrEqual(RULE.base);
      expect(d.reason).not.toBe('grown');
      // Nothing above the base size is even measured.
      expect(d.tried.every((s) => s <= RULE.base)).toBe(true);
    }
    expect(decideFit(RULE, model(28))).toMatchObject({ size: 10, reason: 'kept', tried: [10] });
    expect(decideFit({ ...RULE, grow: false }, model(28))).toMatchObject({ size: 10, reason: 'kept' });
  });

  it('with grow, grows a card that half fills its page, but not past "full" or onto another page', () => {
    const d = decideFit(GROW, model(28)); // 65 % at 10pt
    expect(d.reason).toBe('grown');
    expect(d.pages).toBe(1);
    expect(d.size).toBeGreaterThan(10);
    expect(d.fill).toBeLessThanOrEqual(GROW.full);
  });

  it('keeps the size when the page is already comfortably full', () => {
    expect(decideFit(RULE, model(39))).toMatchObject({ size: 10, reason: 'kept' });
    expect(decideFit(GROW, model(39))).toMatchObject({ size: 10, reason: 'kept' });
  });

  it('cannot shrink below min: then it keeps the base size (or, with grow, fills the last page)', () => {
    // 60 lines: 40 + 20 at 10pt — the last page half full: not shrunk.
    expect(decideFit(RULE, model(60))).toMatchObject({ size: 10, reason: 'kept' });
    expect(decideFit(GROW, model(60)).reason).toBe('grown');
    // Far too long to save a page within the limits.
    expect(decideFit({ ...RULE, min: 9.8, max: 10.5 }, model(81))).toMatchObject({ pages: 3, size: 10, reason: 'kept' });
    const d = decideFit({ ...GROW, min: 9.8, max: 10.5 }, model(81));
    expect(d).toMatchObject({ pages: 3, reason: 'grown' });
    expect(d.size).toBeGreaterThan(10);
  });

  it('stays within the limits and on the step grid, and is deterministic', () => {
    for (const lines of [3, 20, 39, 41, 45, 70, 90, 130]) {
      const a = decideFit(RULE, model(lines));
      const b = decideFit(RULE, model(lines));
      expect(a).toEqual(b);
      expect(a.size).toBeGreaterThanOrEqual(RULE.min);
      expect(a.size).toBeLessThanOrEqual(RULE.max);
      expect(Math.abs(a.size * 10 - Math.round(a.size * 10))).toBeLessThan(1e-9);
    }
  });

  it('never chooses a size at which something is cut off, when a size without exists', () => {
    // Cut off above 9.4pt, at any page count.
    const clipped = (size: number): Layout => ({ ...model(28)(size), overflow: size > 9.4 });
    const d = decideFit(RULE, clipped);
    expect(d).toMatchObject({ reason: 'unclipped', size: 9.4, overflow: false });
    // Growing (opted in) stops below a size that would cut something off.
    const grows = (size: number): Layout => ({ ...model(28)(size), overflow: size > 10.6 });
    expect(decideFit(GROW, grows)).toMatchObject({ reason: 'grown', size: 10.6 });
    expect(decideFit(RULE, grows)).toMatchObject({ reason: 'kept', size: 10 });
    // Shrinking only to a clean size.
    const shrinks = (size: number): Layout => ({ ...model(45)(size), overflow: size < 9 });
    const s = decideFit(RULE, shrinks);
    expect(s.overflow).toBeFalsy();
    // Cut off at every size: the base, and nothing else to do.
    expect(decideFit(RULE, (size) => ({ ...model(10)(size), overflow: true }))).toMatchObject({ size: 10, reason: 'kept' });
  });

  it('measures each size once', () => {
    const measure = vi.fn(model(45));
    const d = decideFit(RULE, measure);
    expect(measure).toHaveBeenCalledTimes(new Set(d.tried).size);
  });

  it('is self-contained, as the paging script ships its source', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const copy = new Function(`return (${decideFit.toString()})`)() as typeof decideFit;
    expect(copy(RULE, model(45))).toEqual(decideFit(RULE, model(45)));
    expect(copy(GROW, model(28))).toEqual(decideFit(GROW, model(28)));
  });
});

describe('sha256Base64', () => {
  it('agrees with node:crypto', () => {
    for (const text of ['', 'abc', 'é ✓ 🍰', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(1000), pagingScript().text]) {
      expect(sha256Base64(text)).toBe(createHash('sha256').update(text, 'utf8').digest('base64'));
    }
  });
});

describe('the paging script in a card', () => {
  const recipe = readRecipe(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'));
  const doc = renderCard(recipe, loadTheme('binder'));

  it('is there once, at the end of the body, admitted by its hash and nothing else', () => {
    const scripts = [...doc.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][0].startsWith('<script>')).toBe(true);
    expect(doc.indexOf('<script>')).toBeGreaterThan(doc.indexOf('<div class="card-flow">'));
    expect(doc.trimEnd().endsWith('</script>\n</body>\n</html>')).toBe(true);
    const hash = createHash('sha256').update(scripts[0][1]).digest('base64');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(doc)![1];
    expect(csp).toContain(`script-src 'sha256-${hash}';`);
    expect(csp.match(/script-src[^;]*/)![0]).toBe(`script-src 'sha256-${hash}'`);
    expect(csp).not.toMatch(/unsafe-eval|strict-dynamic|nonce-/);
    expect(scripts[0][1]).toBe(pagingScript().text);
  });

  it('treats the card as data: no markup from text, no evaluation, no network', () => {
    const text = pagingScript().text;
    for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'Function(', 'fetch(', 'XMLHttpRequest', 'import(', 'WebSocket', 'sendBeacon', 'window.open', 'location', 'postMessage', 'localStorage', 'cookie']) {
      expect(text, banned).not.toContain(banned);
    }
    expect(text).not.toMatch(/setTimeout\(\s*['"`]/);
    expect(pagingProgram.length).toBe(1);
  });

  it('keeps the flow, the native @page rules and the theme stylesheet as the fallback', () => {
    expect(doc).toContain('<div class="card-flow">\n<article class="card');
    expect(doc).toMatch(/@page \{ size: letter; margin: 0\.45in 0\.25in 0\.5in; \}/);
    expect(doc).toContain('.card-flow { container: card-page / inline-size; }');
    // The page-box print rules wait, switched off, until the script has paged the card.
    // Paged, the page takes the card's margins as its own and claims every margin box, empty;
    // the sheet is the area inside the margins, with no padding of its own.
    expect(doc).toMatch(/<style id="card-print-paged" media="not all">\n@page \{ size: letter; margin: 0\.45in 0\.25in 0\.5in; padding: 0; border: none; @top-left-corner \{ content: ""; \}/);
    expect(doc).toMatch(/@media print \{\n  \.sheet \{\n    width: calc\(var\(--card-page-width\) - var\(--card-margin-left\) - var\(--card-margin-right\)\);\n    height: calc\(var\(--card-page-height\) - var\(--card-margin-top\) - var\(--card-margin-bottom\) - 0\.01in\);\n    padding: 0;/);
  });

  it('carries its settings as escaped data on the root element', () => {
    expect(doc).toMatch(/<html lang="en" data-paper="letter" data-fit="auto" data-size="11pt" data-fit-rule="\{&quot;base&quot;:11,/);
    const hostile = renderCard({ ...recipe, title: { ...recipe.title!, text: '"><script>x</script>' } }, loadTheme('binder'));
    expect(hostile.match(/<script>/g)).toHaveLength(1);
  });

  it('turns fitting off for an explicit size, and leaves the script out on request', () => {
    expect(renderCard(recipe, loadTheme('mise'), { size: '9.5pt' })).toMatch(/data-fit="off" data-size="9.5pt"/);
    expect(renderCard(recipe, loadTheme('mise'), { fit: 'off' })).toMatch(/data-fit="off" data-size="10.5pt"/);
    expect(renderCard(recipe, loadTheme('mise'), { size: '9.5pt' })).toContain('--card-font-size: 9.5pt;');
    expect(() => renderCard(recipe, loadTheme('mise'), { size: 'big' })).toThrow(/size must be a text size/);
    const plain = renderCard(recipe, loadTheme('mise'), { paging: false });
    expect(plain).not.toContain('<script');
    expect(plain).not.toContain('card-print-paged');
  });
});

describe('papers', () => {
  it('sets the page size, margins and size for each paper a theme supports', () => {
    const binder = loadTheme('binder');
    expect(pageSetup(binder)).toMatchObject({ paper: 'letter', size: 'letter', width: '8.5in', height: '11in', fontSize: '11pt' });
    expect(pageSetup(binder, 'a4')).toMatchObject({ size: 'a4', width: '210mm', height: '297mm' });
    expect(pageSetup(binder, 'half-letter')).toMatchObject({ size: '5.5in 8.5in', margin: '0.35in 0.25in 0.4in', fontSize: '9.5pt' });
    expect(pageSetup(binder, 'index-4x6')).toMatchObject({ size: '6in 4in', width: '6in', height: '4in' });
    expect(pageSetup(binder, 'index-5x7').fit).toMatchObject({ base: 8.5, min: 7.5, max: 9.5 });
  });

  it('refuses a paper the theme does not support, naming those it does', () => {
    expect(() => pageSetup(loadTheme('galley'), 'index-4x6')).toThrow(/theme "Galley" does not support the paper "index-4x6" \(it supports: letter, a4\)/);
    expect(() => pageSetup(loadTheme('galley'), 'tabloid')).toThrow(/unknown paper "tabloid"/);
  });

  it('gives a contract-1 theme its own page as its one paper', () => {
    const theme = parseTheme({ 'theme.yaml': 'name: P\npage:\n  size: a5\n  orientation: landscape\n', 'card.html': '<article class="card">{{title}}{{ingredients}}{{directions}}</article>', 'card.css': '' });
    expect(themePapers(theme)).toMatchObject({ default: 'a5', papers: ['a5'] });
    expect(pageSetup(theme)).toMatchObject({ size: 'a5 landscape', width: '210mm', height: '148mm', margin: '0.5in' });
    expect(cardPaging(theme)).toMatchObject({ paper: 'a5', fit: 'auto', size: 11, limits: { min: 9.4, max: 12.1 } });
  });

  it('reads sizes in points', () => {
    expect(toPoints('10.5pt')).toBe(10.5);
    expect(toPoints('14px')).toBe(10.5);
    expect(toPoints('1in')).toBe(72);
    expect(toPoints('1em')).toBeNull();
  });

  it('checks page.papers and fit: in theme.yaml', () => {
    expect(pagingProblems({ page: { papers: ['letter', 'tabloid'] } })).toEqual(['page.papers: unknown paper "tabloid" (letter, a4, half-letter, index-4x6, index-5x7)']);
    expect(pagingProblems({ page: { papers: { a4: { margins: 1 } } }, fit: { min: '12pt', max: '9pt', full: 2, squeeze: true } })).toEqual([
      'unknown key "page.papers.a4.margins"',
      'fit.full must be a fraction of the page, 0 to 1',
      'unknown key "fit.squeeze"',
      'fit.min is larger than fit.max',
    ]);
    expect(pagingProblems({ fit: { grow: true }, page: { papers: { a4: { fit: { grow: 'yes' } } } } })).toEqual(['page.papers.a4.fit.grow must be true or false']);
  });

  it('never grows unless the theme opts in, and still offers sizes up to max', () => {
    for (const name of listThemes()) {
      const theme = loadTheme(name);
      for (const paper of themePapers(theme).papers) {
        const fit = pageSetup(theme, paper).fit!;
        expect(fit.grow, `${name} ${paper}`).toBe(false);
        // The sizes a reader may pick reach above the theme's size.
        expect(fit.max, `${name} ${paper}`).toBeGreaterThan(fit.base);
      }
    }
    const theme = parseTheme({ 'theme.yaml': 'name: P\nfit:\n  grow: true\n', 'card.html': '<article class="card">{{title}}{{ingredients}}{{directions}}</article>', 'card.css': '' });
    expect(cardPaging(theme).limits).toMatchObject({ grow: true });
  });

  it('prints at a larger size only when asked for one', () => {
    const recipe = readRecipe(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'));
    const mise = loadTheme('mise');
    expect(cardPaging(mise)).toMatchObject({ fit: 'auto', size: 10.5, limits: { base: 10.5, max: 11.5, grow: false } });
    const big = renderCard(recipe, mise, { size: '12pt' });
    expect(big).toMatch(/data-fit="off" data-size="12pt"/);
    expect(big).toContain('--card-font-size: 12pt;');
  });

  it('etna card refuses an unsupported or unknown paper with a usage error', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((m: unknown) => void errors.push(String(m)));
    try {
      const rolls = join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls');
      expect(await run([rolls, '--theme', 'galley', '--paper', 'index-5x7'])).toBe(2);
      expect(errors.join('\n')).toMatch(/does not support the paper "index-5x7" \(it supports: letter, a4\)/);
      expect(await run([rolls, '--paper', 'tabloid'])).toBe(2);
      expect(await run([rolls, '--fit', 'maybe'])).toBe(2);
      expect(await run([rolls, '--size', 'large'])).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the bundled themes', () => {
  const themes = listThemes().map((name) => ({ name, theme: loadTheme(name) }));

  it('are written for contract 2, and do letter and A4 with sane fit limits', () => {
    for (const { name, theme } of themes) {
      expect(theme.contract, name).toBe(2);
      expect(pagingProblems(theme.manifest), name).toEqual([]);
      const { papers, default: first } = themePapers(theme);
      expect(first, name).toBe('letter');
      expect(papers, name).toEqual(expect.arrayContaining(['letter', 'a4']));
      for (const paper of papers) {
        const fit = pageSetup(theme, paper).fit!;
        expect(fit, `${name} ${paper}`).not.toBeNull();
        expect(fit.min, `${name} ${paper}`).toBeLessThanOrEqual(fit.base);
        expect(fit.max, `${name} ${paper}`).toBeGreaterThanOrEqual(fit.base);
      }
    }
  });

  it('cover every paper at least twice', () => {
    for (const paper of PAPERS) {
      const supporting = themes.filter(({ theme }) => themePapers(theme).papers.includes(paper)).map((t) => t.name);
      expect(supporting.length, `${paper}: ${supporting.join(', ')}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('draw an @page frame or rule on the page boxes too, not on @page alone', () => {
    for (const { name, theme } of themes) {
      if (/@page[^{]*\{[^}]*(border|padding)/.test(theme.css)) expect(theme.css, name).toMatch(/\.sheet-box/);
    }
  });
});

// ------------------------------------------------------------------ in a browser

const browser = findBrowser();

describe.skipIf(browser === null)('paging in a real browser', () => {
  /** The page sizes in a PDF, in points, from its /MediaBox entries. */
  const mediaBoxes = (file: string) =>
    [...readFileSync(file, 'latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Math.round(Number(m[1])), Math.round(Number(m[2]))]);

  it('pages, fits and prints: the PDF has the paper size and the pages the script made', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'etna-paging-test-'));
    const printer = await openPrinter(browser!);
    try {
      const recipe = readRecipe(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'));
      const cases: [string, string, [number, number]][] = [
        ['mise', 'letter', [612, 792]],
        ['galley', 'a4', [595, 842]],
        ['binder', 'index-4x6', [432, 288]],
      ];
      for (const [name, paper, size] of cases) {
        const target = join(dir, `${name}-${paper}.pdf`);
        const result = await printer.print(renderCard(recipe, loadTheme(name), { paper }), target);
        expect(result.paged, name).toBe('done');
        expect(result.size, name).toMatch(/^\d+(\.\d)?pt$/);
        const boxes = mediaBoxes(target);
        expect(boxes.length, name).toBe(result.pages);
        for (const box of boxes) expect(box, name).toEqual(size);
      }
      // Fitting off, at the theme's size; and the same answer twice.
      const off = await printer.print(renderCard(recipe, loadTheme('mise'), { fit: 'off' }), join(dir, 'off.pdf'));
      expect(off).toMatchObject({ paged: 'done', size: '10.5pt', fit: null });
      const again = await printer.print(renderCard(recipe, loadTheme('binder'), { paper: 'index-4x6' }), join(dir, 'again.pdf'));
      expect(again.pages).toBe(mediaBoxes(join(dir, 'binder-index-4x6.pdf')).length);
    } finally {
      await printer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});

// ------------------------------------------------- paging edge cases, in a browser

/** A headless browser driven over the DevTools pipe: open a card file, wait for paging, run a check. */
async function inspector(path: string) {
  const dir = mkdtempSync(join(tmpdir(), 'etna-inspect-'));
  const chrome = spawn(path, ['--headless', '--remote-debugging-pipe', `--user-data-dir=${join(dir, 'profile')}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  });
  let id = 0;
  let buffer = '';
  const pending = new Map<number, (m: { result?: Record<string, unknown> }) => void>();
  const events = new Set<(m: { method?: string; sessionId?: string }) => void>();
  (chrome.stdio[4] as NodeJS.ReadableStream).on('data', (d: Buffer) => {
    buffer += d.toString();
    let end: number;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const m = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (m.id && pending.has(m.id)) pending.get(m.id)!(m);
      else for (const e of events) e(m);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const i = ++id;
      pending.set(i, (m) => resolve(m.result ?? {}));
      (chrome.stdio[3] as NodeJS.WritableStream).write(`${JSON.stringify({ id: i, method, params, sessionId })}\0`);
    });
  let count = 0;
  return {
    async check<T>(html: string, expression: string): Promise<T> {
      const file = join(dir, `card-${++count}.html`);
      writeFileSync(file, html);
      const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
      const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })) as { sessionId: string };
      await send('Page.enable', {}, sessionId);
      const loaded = new Promise<void>((resolve) => {
        const on = (m: { method?: string; sessionId?: string }) => {
          if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') {
            events.delete(on);
            resolve();
          }
        };
        events.add(on);
      });
      await send('Page.navigate', { url: `file://${file}` }, sessionId);
      await loaded;
      await send('Runtime.evaluate', { expression: WAIT, awaitPromise: true }, sessionId);
      const r = (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)) as { result: { value: T } };
      await send('Target.closeTarget', { targetId });
      return r.result.value;
    },
    close() {
      chrome.kill();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // the browser may still hold its profile for a moment
      }
    },
  };
}

const ROOT = `Object.getOwnPropertyDescriptor(Document.prototype, 'documentElement').get.call(document)`;
const ALL = (sel: string) => `Document.prototype.querySelectorAll.call(document, '${sel}')`;
// Read through the prototypes: the clobbering test shadows document.documentElement and friends.
// A card rendered without paging (no data-fit, never a data-paged) is ready at once.
const WAIT = `new Promise((r) => { const t = Date.now(); const f = () => { const s = ${ROOT}.getAttribute('data-paged'); if (s === 'done' || s === 'failed' || (s === null && !${ROOT}.hasAttribute('data-fit')) || Date.now() - t > 20000) r(s); else setTimeout(f, 20); }; f(); })`;

/** What a paged card looks like: its state, and every kind of defect the paginator must not make. */
interface Report {
  paged: string;
  pages: number;
  size: string;
  fit: string;
  overflow: boolean;
  blank: number[];
  cut: string[];
  headingAtFoot: string[];
  words: string;
  error: string | null;
}
const WORDS = `(el) => { const a = []; const w = Document.prototype.createTreeWalker.call(document, el, 4); while (w.nextNode()) { if (getComputedStyle(w.currentNode.parentElement).display !== 'none') a.push(w.currentNode.data); } return a.join(' ').toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim().split(' ').sort().join(' '); }`;
const REPORT = `(() => { const root = ${ROOT}; const words = ${WORDS};
  const H = 'h1,h2,h3,h4,h5,h6,th,.ingr-group-label,.part-title,.component-title,.section-title,.card-label,.step-head';
  const sheets = [...${ALL('.sheet')}]; const blank = [], cut = [], headingAtFoot = [];
  sheets.forEach((s, i) => { const c = s.querySelector('.sheet-content'); const cr = c.getBoundingClientRect();
    const vis = [...c.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.getBoundingClientRect().height > 0 && e.textContent.trim() !== '');
    if (vis.length === 0) blank.push(i + 1);
    for (const e of vis) { const r = e.getBoundingClientRect(); if (r.bottom > cr.bottom + 1) { cut.push((i + 1) + ': ' + e.textContent.slice(0, 30)); break; } }
    if (i < sheets.length - 1) { const hs = [...c.querySelectorAll(H)].filter((e) => e.getBoundingClientRect().height > 0); const lh = hs[hs.length - 1];
      if (lh && ![...c.querySelectorAll('*')].some((e) => (lh.compareDocumentPosition(e) & 4) && !lh.contains(e) && e.getBoundingClientRect().height > 0 && e.textContent.trim() !== '')) headingAtFoot.push((i + 1) + ': ' + lh.textContent.slice(0, 30)); }
  });
  const pagedWords = sheets.map((s) => words(s.querySelector('.sheet-content'))).join(' ').split(' ').filter(Boolean).sort().join(' ');
  return { paged: root.getAttribute('data-paged'), pages: sheets.length, size: root.getAttribute('data-size'), fit: root.getAttribute('data-fit-result'),
    overflow: root.hasAttribute('data-overflow'), blank, cut, headingAtFoot, words: root.getAttribute('data-paged') === 'done' ? pagedWords : words(${ALL('.card-flow')}[0]), error: root.getAttribute('data-paging-error') }; })()`;

const units = loadUnits();
const recipeOf = (markdown: string) => parseRecipe(markdown, { units });
const longText = (words: number, seed: string) => Array.from({ length: words }, (_x, i) => `${seed}${i}`).join(' ');

describe.skipIf(browser === null)('paging edge cases in a real browser', () => {
  let page: Awaited<ReturnType<typeof inspector>>;
  /** Page `html`, and the words of the same card unpaged, to compare. */
  const both = async (recipe: ReturnType<typeof recipeOf>, theme: Theme, options: Parameters<typeof renderCard>[2] = {}) => {
    const paged = await page.check<Report>(renderCard(recipe, theme, options), REPORT);
    const flow = await page.check<Report>(renderCard(recipe, theme, { ...options, paging: false }), REPORT);
    return { paged, flowWords: flow.words };
  };
  const clean = (r: Report, words: string, label: string) => {
    expect(r.paged, label).toBe('done');
    expect(r.overflow, label).toBe(false);
    expect(r.blank, label).toEqual([]);
    expect(r.cut, label).toEqual([]);
    expect(r.headingAtFoot, label).toEqual([]);
    expect(r.words, `${label}: no word lost or doubled`).toBe(words);
  };

  it('opens a browser', async () => {
    page = await inspector(browser!);
  });

  it('cuts a step taller than a page between lines, losing and doubling nothing', async () => {
    const recipe = recipeOf(`---\netna: 1\nform: traditional\n---\n\n# Long step\n\n## Ingredients\n\n- 1 cup flour\n\n## Directions\n\n1. ${longText(700, 'w')}\n2. Bake.\n`);
    for (const [theme, paper] of [['mise', 'index-4x6'], ['countertop', 'half-letter'], ['binder', 'index-5x7']] as const) {
      const { paged, flowWords } = await both(recipe, loadTheme(theme), { paper });
      clean(paged, flowWords, `${theme} ${paper}`);
      expect(paged.pages, theme).toBeGreaterThan(1);
    }
  }, 120_000);

  it('starts a lone step under its part title, with no blank page (hidden step number)', async () => {
    const recipe = recipeOf(
      `---\netna: 1\nform: traditional\n---\n\n# Parts\n\n## Ingredients\n\n${Array.from({ length: 24 }, (_x, i) => `- ${i + 1} g thing-${i}`).join('\n')}\n\n## Directions\n\n### First\n\n1. ${longText(260, 'a')}\n\n### Second\n\n1. ${longText(40, 'b')}\n`,
    );
    for (const [theme, paper] of [['countertop', 'half-letter'], ['mise', 'index-4x6'], ['folio', 'half-letter']] as const) {
      const { paged, flowWords } = await both(recipe, loadTheme(theme), { paper, fit: 'off' });
      clean(paged, flowWords, `${theme} ${paper}`);
    }
  }, 120_000);

  it('fills pages with a long ingredient list (side by side and single column)', async () => {
    const recipe = recipeOf(
      `---\netna: 1\nform: traditional\n---\n\n# Many\n\n## Ingredients\n\n### First part\n\n${Array.from({ length: 70 }, (_x, i) => `- ${i + 1} g ingredient-${i + 1}, chopped`).join('\n')}\n\n### Second part\n\n${Array.from({ length: 70 }, (_x, i) => `- ${i + 71} g ingredient-${i + 71}`).join('\n')}\n\n## Directions\n\n1. Combine.\n2. Rest.\n`,
    );
    for (const theme of ['countertop', 'mise', 'grid']) {
      const { paged, flowWords } = await both(recipe, loadTheme(theme));
      clean(paged, flowWords, theme);
      const fills = await page.check<number[]>(
        renderCard(recipe, loadTheme(theme)),
        `[...document.querySelectorAll('.sheet-content')].slice(0, -1).map((c) => { const cr = c.getBoundingClientRect(); const b = Math.max(...[...c.querySelectorAll('td')].map((e) => e.getBoundingClientRect().bottom)); return (b - cr.top) / cr.height; })`,
      );
      for (const f of fills) expect(f, theme).toBeGreaterThan(0.5);
    }
  }, 120_000);

  /** Mise, with ingredient rows `rows` rem tall: unbreakable blocks of a chosen height. */
  const tallRows = (rows: number): Theme => {
    const mise = loadTheme('mise');
    return { ...mise, css: `${mise.css}\n.ingr-table tr.ingr { height: ${rows}rem; }` };
  };
  const twoRows = recipeOf(`---\netna: 1\nform: traditional\n---\n\n# Tall\n\n## Ingredients\n\n- 1 cup flour\n- 1 cup sugar\n\n## Directions\n\n1. Mix.\n`);

  it('prints an unbreakable block taller than any page cut off, and says so', async () => {
    const r = await page.check<Report>(renderCard(twoRows, tallRows(80), { paper: 'index-4x6' }), REPORT);
    expect(r.paged).toBe('done');
    expect(r.overflow).toBe(true);
    expect(r.blank).toEqual([]);
  }, 60_000);

  it('never fits to a size at which something is cut off, when a smaller size avoids it', async () => {
    // 31rem rows: taller than an index card's page at 8pt (the base), not at 7pt (the minimum).
    const r = await page.check<Report>(renderCard(twoRows, tallRows(31), { paper: 'index-4x6' }), REPORT);
    expect(r.paged).toBe('done');
    expect(r.overflow).toBe(false);
    expect(r.cut).toEqual([]);
    expect(r.fit).toBe('unclipped');
    expect(parseFloat(r.size)).toBeLessThan(8);
    // And growing never creates it: a short card on a large page stays clean at every size it grows to.
    const grown = await page.check<Report>(renderCard(twoRows, tallRows(12), { paper: 'letter' }), REPORT);
    expect(grown.overflow).toBe(false);
  }, 60_000);

  it('shrinks a multi-column card whose last page is nearly empty (the columns measured balanced)', async () => {
    // Galley sets everything in two columns. Find the fewest steps that spill onto a second page
    // at the theme's size (whatever font this machine sets it in): that page holds one short
    // step, so fitting must shrink the card back onto one page.
    const galley = loadTheme('galley');
    const steps = (n: number) =>
      recipeOf(`---\netna: 1\nform: traditional\n---\n\n# Columns\n\n## Ingredients\n\n- 1 cup flour\n\n## Directions\n\n${Array.from({ length: n }, (_x, i) => `${i + 1}. ${longText(30, `s${i}x`)}`).join('\n')}\n`);
    const pagesAt = async (n: number) => (await page.check<Report>(renderCard(steps(n), galley, { fit: 'off' }), REPORT)).pages;
    let lo = 1;
    let hi = 120;
    expect(await pagesAt(hi)).toBeGreaterThan(1);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((await pagesAt(mid)) > 1) hi = mid;
      else lo = mid;
    }
    const r = await page.check<Report>(renderCard(steps(hi), galley), REPORT);
    expect(r.paged).toBe('done');
    expect(r.fit).toBe('shrunk');
    expect(r.pages).toBe(1);
    expect(parseFloat(r.size)).toBeGreaterThanOrEqual(8.5);
  }, 180_000);

  it('pages a card with a picture: the square kept whole on the first page, nothing lost', async () => {
    const png = readFileSync(join(ETNA_ROOT, 'tests', 'linter', 'clean-picture', 'input', 'test-soup', 'image', 'etna.png'));
    const picture = { src: `data:image/png;base64,${png.toString('base64')}` };
    const PICTURE = `(() => { const boxes = [...${ALL('.sheet .card-picture')}].map((e) => { const r = e.getBoundingClientRect(); const c = e.closest('.sheet-content').getBoundingClientRect();
      return { page: Number(e.closest('.sheet').getAttribute('data-page')), width: r.width, height: r.height, inside: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.right <= c.right + 1 }; });
      return boxes; })()`;
    const soup = readRecipe(join(ETNA_ROOT, 'cookbook', 'potato-soup', 'recipe.md'));
    const rolls = readRecipe(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'));
    const wedding = readRecipe(join(ETNA_ROOT, 'cookbook', 'italian-wedding-soup', 'recipe.md'));
    const cases: [string, ReturnType<typeof readRecipe>, Parameters<typeof renderCard>[2]][] = [
      ['mise', rolls, {}],
      ['folio', soup, {}],
      ['binder', rolls, {}],
      ['binder', soup, { layout: 'paired' }],
      ['binder', wedding, { paper: 'half-letter' }],
      ['countertop', soup, { paper: 'half-letter' }],
      ['grid', rolls, {}],
    ];
    for (const [name, recipe, options] of cases) {
      const label = `${name} ${JSON.stringify(options)}`;
      const { paged, flowWords } = await both(recipe, loadTheme(name), { ...options, picture });
      clean(paged, flowWords, label);
      const boxes = await page.check<{ page: number; width: number; height: number; inside: boolean }[]>(renderCard(recipe, loadTheme(name), { ...options, picture }), PICTURE);
      expect(boxes.length, label).toBe(1);
      expect(boxes[0], label).toMatchObject({ page: 1, inside: true });
      expect(boxes[0].width, label).toBeGreaterThan(90); // an inch is 96 CSS pixels
      expect(Math.abs(boxes[0].width - boxes[0].height), label).toBeLessThan(1);
    }
  }, 180_000);

  it('pages columns built from a floated side column (Mise beside a picture) as it pages a grid', async () => {
    const png = readFileSync(join(ETNA_ROOT, 'tests', 'linter', 'clean-picture', 'input', 'test-soup', 'image', 'etna.png'));
    const picture = { src: `data:image/png;base64,${png.toString('base64')}` };
    const mise = loadTheme('mise');
    const rows = (from: number, n: number) => Array.from({ length: n }, (_x, i) => `- ${from + i} g ingredient-${from + i}, chopped`).join('\n');
    const list = recipeOf(
      `---\netna: 1\nform: traditional\n---\n\n# Many\n\n## Ingredients\n\n### First part\n\n${rows(1, 70)}\n\n### Second part\n\n${rows(71, 70)}\n\n## Directions\n\n### First part\n\n1. ${longText(300, 'm')}\n\n### Second part\n\n1. ${longText(60, 'n')}\n`,
    );
    const steps = recipeOf(`---\netna: 1\n---\n\n# Steps\n\n## Mix\n\n${rows(1, 60)}\n\n${longText(900, 'w')}\n\n## Bake\n\n- 2 g other\n\nBake.\n`);
    // On the first page: the picture, and both columns begun (a table cell and a line of the method).
    const FIRST = `(() => { const c = ${ALL('.sheet-content')}[0]; const cr = c.getBoundingClientRect(); const low = (q) => Math.max(0, ...[...c.querySelectorAll(q)].map((e) => e.getBoundingClientRect().bottom - cr.top)) / cr.height;
      return { picture: c.querySelectorAll('.card-picture').length, list: low('td'), method: low('.direction-text') }; })()`;
    const cases: [string, ReturnType<typeof recipeOf>, Parameters<typeof renderCard>[2]][] = [
      ['one list', list, { parts: 'sections' }],
      ['parts beside their ingredients', list, { parts: 'paired' }],
      ['steps', steps, {}],
    ];
    for (const [label, recipe, options] of cases) {
      const { paged, flowWords } = await both(recipe, mise, { ...options, picture });
      clean(paged, flowWords, label);
      expect(paged.pages, label).toBeGreaterThan(1);
      const first = await page.check<{ picture: number; list: number; method: number }>(renderCard(recipe, mise, { ...options, picture }), FIRST);
      expect(first.picture, label).toBe(1);
      expect(first.list, label).toBeGreaterThan(0.5);
      expect(first.method, label).toBeGreaterThan(0.5);
      // The same card without the picture, laid out by the grid, takes as many pages or one fewer.
      const plain = await page.check<Report>(renderCard(recipe, mise, options), REPORT);
      expect(paged.pages - plain.pages, label).toBeGreaterThanOrEqual(0);
      expect(paged.pages - plain.pages, label).toBeLessThanOrEqual(1);
    }
  }, 180_000);

  it('cannot be stopped by a theme element that shadows a document method', async () => {
    const mise = loadTheme('mise');
    const clobber = '<img name="createElement" src="data:,"><img name="querySelector" src="data:,"><img name="getElementById" src="data:,"><img name="fonts" src="data:,"><img name="documentElement" src="data:,"><form name="dispatchEvent"></form>';
    const theme: Theme = { ...mise, skeleton: mise.skeleton.replace('</article>', `${clobber}</article>`) };
    const r = await page.check<Report>(renderCard(twoRows, theme), REPORT);
    expect(r.error).toBeNull();
    expect(r.paged).toBe('done');
  }, 60_000);

  it('leaves the flow in place, printable, when paging fails', async () => {
    // Make every clone fail, before the paging script runs (the policy is lifted for this test only).
    const html = renderCard(twoRows, loadTheme('mise'))
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      .replace('<div class="card-flow">', '<script>Node.prototype.cloneNode = () => { throw new Error("no clones"); };</script><div class="card-flow">');
    const r = await page.check<{ paged: string; error: string; flow: boolean; sheets: number; media: string }>(
      html,
      `({ paged: document.documentElement.getAttribute('data-paged'), error: document.documentElement.getAttribute('data-paging-error'), flow: !!document.querySelector('body > .card-flow .card-title'), sheets: document.querySelectorAll('.sheet').length, media: document.getElementById('card-print-paged').media })`,
    );
    expect(r).toMatchObject({ paged: 'failed', flow: true, sheets: 0, media: 'not all' });
    expect(r.error).toMatch(/no clones/);
  }, 60_000);

  it('closes the browser', () => {
    page.close();
  });
});
