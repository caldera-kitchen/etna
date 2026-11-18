// The static build (etna build-web) works when it is not at the root of its host: GitHub Pages
// serves a project's site under /<repo>/. Every URL the page and its scripts ask for is relative,
// so it resolves under whatever path index.html was served from.

import { readFile } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, normalize, sep } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ETNA_ROOT } from '../../src/node/files.ts';
import { buildWeb, type WebBundle } from '../../src/web/build.ts';

const SUB = '/some/sub/path/';

/** The URLs a script asks the browser for by itself: its static and dynamic imports, fetch() of a literal, and a worker's script (`new URL(…, import.meta.url)`). */
function scriptUrls(code: string): string[] {
  const urls: string[] = [];
  for (const m of code.matchAll(/\bnew URL\(\s*["'`]([^"'`]+)["'`]\s*,\s*import\.meta\.url\s*\)/g)) urls.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) urls.push(m[1]);
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) urls.push(m[1]);
  for (const m of code.matchAll(/\bfetch\s*\(\s*["'`]([^"'`$]+)["'`]/g)) urls.push(m[1]);
  return urls;
}

describe('etna build-web under a sub-path', () => {
  let bundle: WebBundle;
  let dir = '';
  let server: Server;
  let base = '';

  beforeAll(async () => {
    bundle = await buildWeb({ fonts: 'web', localServer: false });
    // A plain static server over a folder, the site written under /some/sub/path/ in it.
    dir = mkdtempSync(join(tmpdir(), 'etna-build-web-'));
    const site = join(dir, ...SUB.split('/').filter(Boolean));
    mkdirSync(site, { recursive: true });
    for (const [name, content] of Object.entries(bundle.files)) writeFileSync(join(site, name), content);
    server = createServer(async (req, res) => {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      const file = normalize(join(dir, path.endsWith('/') ? `${path}index.html` : path));
      if (!file.startsWith(dir + sep)) return res.writeHead(403).end();
      try {
        res.writeHead(200).end(await readFile(file));
      } catch {
        res.writeHead(404).end('Not found');
      }
    });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(() => {
    server?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('names every file of its own by a relative URL', () => {
    const html = bundle.files['index.html'];
    const attrs = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]);
    expect(attrs).toEqual(expect.arrayContaining(['app.css', 'app.js']));
    for (const url of attrs) expect(url, url).toMatch(/^(data:|[a-z0-9])/i);
    for (const [name, code] of Object.entries(bundle.files)) {
      if (!name.endsWith('.js')) continue;
      for (const url of scriptUrls(code)) expect(url, `${name}: ${url}`).not.toMatch(/^\//);
    }
  });

  it('serves the page and everything it loads from under the sub-path', async () => {
    const page = `${base}${SUB}`;
    const html = await (await fetch(page)).text();
    expect(html).toContain('<div id="app">');
    // index.html's files, then each script's imports, resolved as a browser resolves them.
    const queue = [...html.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')).map((u) => new URL(u, page).href);
    const seen = new Set<string>();
    while (queue.length > 0) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      expect(new URL(url).pathname.startsWith(SUB), url).toBe(true);
      const response = await fetch(url);
      expect(response.status, url).toBe(200);
      if (url.endsWith('.js')) {
        for (const spec of scriptUrls(await response.text())) {
          // fetch() of a literal is a request to the page's own server (api/sources); a static build makes none (below).
          if (spec.startsWith('./')) queue.push(new URL(spec, url).href);
        }
      }
    }
    // The page, app.css, app.js, the chart's worker and every chunk.
    const chunks = Object.keys(bundle.files).filter((n) => n.startsWith('chunk-'));
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(seen.has(new URL(chunk, page).href), chunk).toBe(true);
    expect(seen.has(new URL('chart-worker.js', page).href)).toBe(true);
  });

  it('gives the chart worker only code a worker can run: no module of the page’s that needs a document', () => {
    // The worker and every chunk it imports, statically or when first needed (the PDF's).
    const closure = new Set<string>();
    const visit = (name: string) => {
      if (closure.has(name) || !bundle.files[name]) return;
      closure.add(name);
      for (const spec of scriptUrls(bundle.files[name])) if (spec.startsWith('./')) visit(spec.slice(2));
    };
    visit('chart-worker.js');
    expect(closure.size).toBeGreaterThan(1);
    expect(closure.has('app.js')).toBe(false);
    // Not minified: each module keeps esbuild's `// <path>` comment. The Markdown parser (whose
    // entity decoder makes an element when loaded) and the GUI's own modules stay on the page.
    const modules = [...closure].flatMap((name) => [...bundle.files[name].matchAll(/^\/\/ (\S+\.[jt]sx?)$/gm)].map((m) => m[1]));
    expect(modules.some((m) => m.endsWith('src/dag/layout/labels.ts'))).toBe(true);
    for (const m of modules) {
      expect(m, m).not.toMatch(/index\.dom\.js$|micromark|mdast-util-from-markdown|src\/core\/parse\.ts$|src\/web\/(main|engine|settings)/);
    }
  });

  it('allows what a hosted page loads, by origin and not by path', () => {
    // 'self' is the host, whatever the path; Google Fonts (cards) and GitHub (sources) by name.
    expect(bundle.csp).toContain("default-src 'self'");
    expect(bundle.csp).toContain('https://fonts.googleapis.com');
    expect(bundle.csp).toContain('https://fonts.gstatic.com');
    expect(bundle.csp).toContain('https://raw.githubusercontent.com');
    expect(bundle.csp).toContain("worker-src 'self'");
    expect(bundle.files['index.html']).toContain(`content="${bundle.csp}"`);
  });

  it('does not ask a static host for local folders; the bundle etna serve serves does', async () => {
    expect(bundle.files['app.js']).toMatch(/\blocalServer\d* = false;/);
    const served = await buildWeb();
    expect(served.files['app.js']).toMatch(/\blocalServer\d* = true;/);
  }, 60_000);

  it('is the same bytes when built again from the same commit', async () => {
    const stamp = { version: '0.1.0', commit: '0123456789abcdef0123456789abcdef01234567', committed: '2026-11-11', modified: false };
    const a = await buildWeb({ minify: true, fonts: 'web', localServer: false, stamp, sourceUrl: 'https://github.com/owner/etna' });
    const b = await buildWeb({ minify: true, fonts: 'web', localServer: false, stamp, sourceUrl: 'https://github.com/owner/etna' });
    expect(Object.keys(b.files).sort()).toEqual(Object.keys(a.files).sort());
    for (const name of Object.keys(a.files)) expect(b.files[name] === a.files[name], name).toBe(true);
    // The stamp and the links are in it, and nothing else of the moment or the machine.
    expect(a.files['app.js']).toContain(stamp.commit);
    expect(a.files['app.js']).toContain('https://github.com/owner/etna');
    for (const text of Object.values(a.files)) {
      expect(text).not.toContain(ETNA_ROOT);
      expect(text).not.toContain(new Date().toISOString().slice(0, 10) + 'T');
    }
  }, 120_000);

  it('refuses a source URL that is not an https address', async () => {
    await expect(buildWeb({ sourceUrl: 'http://example.org/etna' })).rejects.toThrow(/https address/);
  });
});
