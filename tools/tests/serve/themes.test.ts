import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEtnaServer, foldersFrom } from '../../src/serve/server.ts';

const RECIPE = '---\netna: 1\nform: traditional\n---\n\n# Toast\n\n## Ingredients\n\n- 1 slice bread\n\n## Directions\n\n1. Toast the bread.\n';

const tmp = mkdtempSync(join(tmpdir(), 'etna-serve-themes-'));
const root = join(tmp, 'demo');
const theme = (name: string) => join(root, 'themes', name);

function write(path: string, text: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

describe('etna serve: collection themes', () => {
  let base = '';
  let close = () => {};

  beforeAll(async () => {
    write(join(root, 'recipes', 'toast', 'recipe.md'), RECIPE);
    write(join(theme('postcard'), 'theme.yaml'), 'name: Postcard\n');
    write(join(theme('postcard'), 'card.html'), '<article class="card">{{title}}{{ingredients}}{{directions}}</article>');
    write(join(theme('postcard'), 'card.css'), '.card { color: black; }');
    write(join(theme('postcard'), 'README.md'), '# Postcard');
    write(join(theme('postcard'), 'logo.png'), 'not text');
    write(join(theme('postcard'), 'run.js'), 'alert(1)');
    write(join(theme('postcard'), 'nested', 'deep.css'), '.x{}');
    write(join(theme('postcard'), '.hidden.css'), '.x{}');
    // Symbolic links: one inside the folder (followed), one leading out of it (skipped).
    symlinkSync(join(theme('postcard'), 'card.css'), join(theme('postcard'), 'alias.css'));
    write(join(tmp, 'secret.css'), 'secret');
    symlinkSync(join(tmp, 'secret.css'), join(theme('postcard'), 'leak.css'));
    // A theme folder that is a symbolic link out of the collection.
    write(join(tmp, 'outside', 'theme.yaml'), 'name: Outside');
    symlinkSync(join(tmp, 'outside'), theme('elsewhere'));
    // Oversize: one file over 256 KB; too many in total; too many files.
    write(join(theme('big'), 'theme.yaml'), 'name: Big');
    write(join(theme('big'), 'huge.css'), 'a'.repeat(256 * 1024 + 1));
    write(join(theme('heavy'), 'theme.yaml'), 'name: Heavy');
    for (let i = 0; i < 5; i++) write(join(theme('heavy'), `part${i}.css`), 'a'.repeat(250 * 1024));
    write(join(theme('crowded'), 'theme.yaml'), 'name: Crowded');
    for (let i = 0; i < 20; i++) write(join(theme('crowded'), `s${String(i).padStart(2, '0')}.css`), '.x{}');
    write(join(theme('no-manifest'), 'card.html'), '<article></article>');

    const server = await createEtnaServer(foldersFrom([root]));
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  }, 30_000);

  afterAll(() => {
    close();
    rmSync(tmp, { recursive: true, force: true });
  });

  const get = (name: string, source = 'demo') => fetch(`${base}/api/sources/${source}/theme?name=${encodeURIComponent(name)}`);

  it('lists the themes in the catalog', async () => {
    const catalog = await (await fetch(`${base}/api/sources/demo/catalog`)).json();
    expect(catalog.themes).toEqual(['big', 'crowded', 'heavy', 'postcard']);
  });

  it("returns a theme's files, and only theme files directly inside its folder", async () => {
    const res = await get('postcard');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const files = await res.json();
    expect(Object.keys(files)).toEqual(['README.md', 'alias.css', 'card.css', 'card.html', 'theme.yaml']);
    expect(files['alias.css']).toBe('.card { color: black; }');
  });

  it.each(['../x', 'a/b', '..', '../../etc', 'Postcard', '', '%2e%2e', 'post card', 'elsewhere'])('refuses the name %j', async (name) => {
    const res = await get(name);
    expect([400, 404], name).toContain(res.status);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).not.toContain('Outside');
  });

  it('refuses a folder without theme.yaml, an unknown theme and an unknown source', async () => {
    expect((await get('no-manifest')).status).toBe(404);
    expect((await get('missing')).status).toBe(404);
    expect((await get('postcard', 'nope')).status).toBe(404);
  });

  it('refuses a theme over the size limits', async () => {
    const big = await get('big');
    expect(big.status).toBe(413);
    expect(await big.text()).toMatch(/huge\.css is larger than 256 KB/);
    expect((await get('heavy')).status).toBe(413);
    expect((await get('crowded')).status).toBe(413);
  });

  it('is read-only', async () => {
    expect((await fetch(`${base}/api/sources/demo/theme?name=postcard`, { method: 'POST' })).status).toBe(405);
  });
});
