import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pagingScript } from '../../src/card/index.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';
import { createEtnaServer, foldersFrom, isLocalHost, readCollectionDensities } from '../../src/serve/server.ts';
import { guiCsp } from '../../src/web/build.ts';
import { parseRepo } from '../../src/web/sources.ts';

describe('etna serve', () => {
  let base = '';
  let close = () => {};

  beforeAll(async () => {
    const server = await createEtnaServer(foldersFrom([join(ETNA_ROOT, 'cookbook')]));
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  }, 30_000);

  afterAll(() => close());

  it('serves the bundled GUI', async () => {
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<div id="app">');
    const script = await fetch(`${base}/app.js`);
    expect(script.headers.get('content-type')).toContain('javascript');
    // The units registry and the card theme are compiled in, so the browser needs nothing else.
    const js = await script.text();
    expect(js).toContain('heaped tablespoon');
    expect(js).toContain('card.html');
  });

  it('lists its folders and builds a catalog for each', async () => {
    expect(await (await fetch(`${base}/api/sources`)).json()).toEqual([{ id: 'cookbook', label: 'cookbook' }]);
    const catalog = await (await fetch(`${base}/api/sources/cookbook/catalog`)).json();
    expect(catalog.recipes.map((r: { slug: string }) => r.slug)).toContain('malted-chocolate');
  });

  it('reads recipe files inside the folder, and nothing else', async () => {
    const entry = (await (await fetch(`${base}/api/sources/cookbook/catalog`)).json()).recipes[0];
    const ok = await fetch(`${base}/api/sources/cookbook/file?path=${encodeURIComponent(entry.path)}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toMatch(/^---\netna: 1/);
    for (const path of ['../SPEC.md', '../../../etc/passwd', '../cookbook/malted-chocolate/recipe.md/../../../SPEC.md', '/etc/passwd']) {
      const res = await fetch(`${base}/api/sources/cookbook/file?path=${encodeURIComponent(path)}`);
      expect([403, 404], path).toContain(res.status);
    }
    expect((await fetch(`${base}/api/sources/nope/catalog`)).status).toBe(404);
  });

  it('answers 404 for densities.md when the folder has none', async () => {
    const res = await fetch(`${base}/api/sources/cookbook/densities`);
    expect(res.status).toBe(404);
  });

  it('is read-only', async () => {
    expect((await fetch(`${base}/api/sources/cookbook/catalog`, { method: 'POST' })).status).toBe(405);
  });

  it('answers a prototype name with 404 and keeps running', async () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '__defineGetter__', 'valueOf']) {
      const res = await fetch(`${base}/${name}`);
      expect(res.status, name).toBe(404);
      await res.text();
    }
    // A second request after them: the server is still up.
    expect((await fetch(`${base}/api/sources`)).status).toBe(200);
  });

  it('refuses requests another site’s page sent, and answers the rest', async () => {
    const ask = (site: string | undefined) =>
      new Promise<number>((done, fail) => {
        const url = new URL(`${base}/__proto__`);
        request({ host: url.hostname, port: url.port, path: '/api/sources', headers: site === undefined ? {} : { 'Sec-Fetch-Site': site } }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        })
          .on('error', fail)
          .end();
      });
    expect(await ask('cross-site')).toBe(403);
    expect(await ask('Cross-Site')).toBe(403);
    for (const site of ['same-origin', 'same-site', 'none', undefined]) expect(await ask(site), String(site)).toBe(200);
    const proto = await fetch(`${base}/__proto__`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    expect(proto.status).toBe(403);
    expect((await fetch(`${base}/api/sources`)).status).toBe(200);
  });

  it('sends hardening headers, and the GUI page carries its own policy', async () => {
    const page = await fetch(`${base}/`);
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect(page.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const header = page.headers.get('content-security-policy') ?? '';
    expect(header).toContain("frame-ancestors 'none'");
    const html = await page.text();
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1] ?? '';
    expect(header.startsWith(meta)).toBe(true);
    expect(meta).toContain("default-src 'self'");
    expect(meta).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/]{43}=' 'sha256-[A-Za-z0-9+/]{43}='/);
    expect(meta).toContain("img-src 'self' data: blob:");
    expect(meta).toContain("object-src 'none'");
    // `etna serve` bundles the fonts: the page names no Google host.
    expect(meta).not.toContain('google');
    // The policy is the first thing in <head> after the charset, and admits the boot script by hash.
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    const boot = /<script>([\s\S]*?)<\/script>/.exec(html)![1];
    expect(meta).toContain(`'sha256-${createHash('sha256').update(boot).digest('base64')}'`);
    expect(meta).toContain(`'${pagingScript().hash}'`);
    // The GUI's cards carry that very script, so the page's policy lets it run in the card frame.
    expect(await (await fetch(`${base}/app.js`)).text()).toContain(JSON.stringify(pagingScript().hash));
    // The chart's worker from this origin only (no blob: or data: worker, no eval).
    expect(meta).toContain("worker-src 'self'");
    expect(meta).not.toMatch(/(script|worker)-src[^;]*(blob:|data:|unsafe-eval)/);
  });

  it('serves the chart worker with a policy of its own: its code and chunks, nothing else', async () => {
    const worker = await fetch(`${base}/chart-worker.js`);
    expect(worker.status).toBe(200);
    expect(worker.headers.get('content-type')).toContain('javascript');
    expect(worker.headers.get('content-security-policy')).toBe("default-src 'none'; script-src 'self'");
    // Other scripts carry none: they run under the page's.
    expect((await fetch(`${base}/app.js`)).headers.get('content-security-policy')).toBeNull();
  });

  it('names Google Fonts in the GUI policy only for a bundle built with web fonts', () => {
    const hash = `sha256-${'A'.repeat(43)}=`;
    expect(guiCsp(hash, 'embedded')).not.toContain('google');
    const web = guiCsp(hash, 'web');
    expect(web).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(web).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });
});

describe('etna serve: a collection from someone else', () => {
  let base = '';
  let port = 0;
  let close = () => {};
  const root = mkdtempSync(join(tmpdir(), 'etna-serve-'));

  beforeAll(async () => {
    writeFileSync(join(root, 'secret.txt'), 'SECRET-OUTSIDE\n');
    const collection = join(root, 'collection');
    mkdirSync(join(collection, 'recipes', 'evil'), { recursive: true });
    mkdirSync(join(collection, 'recipes', 'toast'), { recursive: true });
    symlinkSync(join(root, 'secret.txt'), join(collection, 'recipes', 'evil', 'recipe.md'));
    writeFileSync(join(collection, 'densities.md'), '# Ingredient densities\n');
    writeFileSync(join(collection, 'README.md'), '# Ours\n\n- [Toast](recipes/toast/) — bread, toasted.\n- [Nothing](recipes/nothing/)\n');
    writeFileSync(join(collection, 'recipes', 'toast', 'recipe.md'), '---\netna: 1\n---\n\n# Toast\n\n## Toast\n\n- 1 slice bread\n\nToast it.\n');
    const server = await createEtnaServer(foldersFrom([collection]));
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
    close = () => server.close();
  }, 30_000);

  afterAll(() => {
    close();
    rmSync(root, { recursive: true, force: true });
  });

  it('answers the order its README states: the recipes it links, by slug (listorder.ts)', async () => {
    expect(await (await fetch(`${base}/api/sources/collection/order`)).json()).toEqual(['toast']);
    expect((await fetch(`${base}/api/sources/nope/order`)).status).toBe(404);
  });

  it('does not read a recipe.md that is a link to a file outside the folder, nor put its text in the catalog', async () => {
    const res = await fetch(`${base}/api/sources/collection/file?path=${encodeURIComponent('recipes/evil/recipe.md')}`);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('SECRET');
    const catalog = await (await fetch(`${base}/api/sources/collection/catalog`)).text();
    expect(catalog).not.toContain('SECRET');
    expect(catalog).toContain('Toast');
    expect((await fetch(`${base}/api/sources/collection/file?path=${encodeURIComponent('recipes/toast/recipe.md')}`)).status).toBe(200);
  });

  it('serves the collection’s own densities.md, and only that file', async () => {
    const res = await fetch(`${base}/api/sources/collection/densities`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('# Ingredient densities\n');
    // The endpoint takes no path: a query is ignored.
    const other = await fetch(`${base}/api/sources/collection/densities?path=${encodeURIComponent('../secret.txt')}`);
    expect(await other.text()).not.toContain('SECRET');
  });

  it('refuses a densities.md that is a link out of the collection, or too large', () => {
    const linked = join(root, 'linked');
    mkdirSync(join(linked, 'recipes'), { recursive: true });
    symlinkSync(join(root, 'secret.txt'), join(linked, 'densities.md'));
    expect(() => readCollectionDensities(linked)).toThrow(/Only the collection/);
    const big = join(root, 'big');
    mkdirSync(join(big, 'recipes'), { recursive: true });
    writeFileSync(join(big, 'densities.md'), 'x'.repeat(300 * 1024));
    expect(() => readCollectionDensities(big)).toThrow(/larger than/);
    const none = join(root, 'none');
    mkdirSync(join(none, 'recipes'), { recursive: true });
    expect(readCollectionDensities(none)).toBeNull();
    const folder = join(root, 'folder');
    mkdirSync(join(folder, 'recipes'), { recursive: true });
    mkdirSync(join(folder, 'densities.md'));
    expect(() => readCollectionDensities(folder)).toThrow(/Only the collection/);
  });

  it('answers only when the request names localhost', async () => {
    const ask = (host: string) =>
      new Promise<number>((done, fail) => {
        request({ host: '127.0.0.1', port, path: '/api/sources', headers: { Host: host } }, (res) => {
          res.resume();
          done(res.statusCode ?? 0);
        })
          .on('error', fail)
          .end();
      });
    expect(await ask('attacker.example:' + port)).toBe(403);
    expect(await ask('attacker.example')).toBe(403);
    expect(await ask(`localhost:${port}`)).toBe(200);
    expect(await ask(`127.0.0.1:${port}`)).toBe(200);
    expect(isLocalHost(undefined)).toBe(false);
    expect(isLocalHost('[::1]:4173')).toBe(true);
    expect(isLocalHost('localhost.attacker.example')).toBe(false);
  });
});

describe('parseRepo', () => {
  it.each([
    ['owner/recipes', 'owner/recipes'],
    ['https://github.com/owner/recipes', 'owner/recipes'],
    ['https://github.com/owner/recipes.git', 'owner/recipes'],
    ['https://github.com/owner/recipes/tree/main/recipes', 'owner/recipes'],
    [' owner/recipes/ ', 'owner/recipes'],
  ])('%s', (input, repo) => expect(parseRepo(input)).toBe(repo));
  it('rejects what is not a repository', () => {
    expect(parseRepo('recipes')).toBeNull();
    expect(parseRepo('a b/c')).toBeNull();
    expect(parseRepo('')).toBeNull();
  });
});
