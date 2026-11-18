// A collection may come from someone else's repository. A recipe.md, catalog.json or
// densities.md in it that is a symbolic link to a file elsewhere on the computer is never
// read or rewritten, whether the collection is walked or a recipe is named directly.

import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run as card } from '../../src/card/cli.ts';
import { run as catalog } from '../../src/catalog/cli.ts';
import { run as dag } from '../../src/dag/cli.ts';
import { run as density } from '../../src/density/cli.ts';
import { loadDensities } from '../../src/density/node.ts';
import { run as fmt } from '../../src/fmt/cli.ts';
import { run as lint } from '../../src/lint/cli.ts';
import { run as list } from '../../src/list/cli.ts';
import { findRecipes, writeFileSafely } from '../../src/node/files.ts';
import { run as restructure } from '../../src/restructure/cli.ts';
import { createEtnaServer, foldersFrom } from '../../src/serve/server.ts';

const OWN = '---\netna: 1\n---\n\n# Own\n\n## Step\n\n- 2 g salt\n\nStir.\n';
// Not canonical, so `etna fmt` would rewrite it if it read it.
const SECRET = '---\netna: 1\n---\n# Secret\n## Step\n* 2 grams salt\n\nStir.\n';

let tmp: string;
let coll: string;
let outside: string;
let err: string[];

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'etna-links-')));
  coll = join(tmp, 'coll');
  outside = join(tmp, 'outside');
  mkdirSync(join(coll, 'recipes', 'own'), { recursive: true });
  mkdirSync(join(coll, 'recipes', 'linked'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(coll, 'recipes', 'own', 'recipe.md'), OWN);
  writeFileSync(join(outside, 'recipe.md'), SECRET);
  symlinkSync(join(outside, 'recipe.md'), join(coll, 'recipes', 'linked', 'recipe.md'));
  err = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    if (String(chunk).includes('Secret')) err.push('LEAKED');
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmp, { recursive: true, force: true });
});

const linkedDir = () => join(coll, 'recipes', 'linked');
const linkedFile = () => join(linkedDir(), 'recipe.md');
const secretUnchanged = () => expect(readFileSync(join(outside, 'recipe.md'), 'utf8')).toBe(SECRET);
const noted = () => expect(err.some((l) => /link to a file outside its collection/.test(l))).toBe(true);

describe('a recipe.md named directly that links out of its collection', () => {
  it('is skipped by findRecipes, as file and as directory, with a note', () => {
    for (const path of [linkedDir(), linkedFile()]) {
      const notes: string[] = [];
      expect(findRecipes(path, (m) => notes.push(m))).toEqual([{ slug: 'linked', dir: linkedDir(), file: null }]);
      expect(notes[0]).toMatch(/link to a file outside its collection/);
    }
    // A link that stays inside the collection is still followed.
    symlinkSync(join(coll, 'recipes', 'own', 'recipe.md'), join(coll, 'recipes', 'inner.md'));
    expect(findRecipes(join(coll, 'recipes', 'inner.md'), () => {})[0].file).toBe(join(coll, 'recipes', 'inner.md'));
  });

  it('outside any collection, must stay inside the folder it was named in', () => {
    const loose = join(tmp, 'loose');
    mkdirSync(loose);
    symlinkSync(join(outside, 'recipe.md'), join(loose, 'recipe.md'));
    const notes: string[] = [];
    expect(findRecipes(loose, (m) => notes.push(m))[0].file).toBeNull();
    expect(notes[0]).toMatch(/outside its folder/);
  });

  it('is not rewritten by etna fmt', async () => {
    for (const path of [linkedDir(), linkedFile()]) {
      await fmt([path]);
      secretUnchanged();
    }
    noted();
  });

  it('is not read by lint, card, dag, list or restructure', async () => {
    await lint([linkedDir()]);
    await card([linkedDir()]);
    await card([linkedFile()]);
    await dag([linkedDir()]);
    await list([linkedDir()]);
    expect(await restructure(['check', linkedFile(), join(coll, 'recipes', 'own', 'recipe.md')])).toBe(2);
    expect(err).not.toContain('LEAKED');
    expect(err.join('\n')).not.toContain('Secret');
    noted();
  });

  it('is not served when the served folder is the recipe directory itself', async () => {
    const server = await createEtnaServer(foldersFrom([linkedDir()]));
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const catalogJson = await (await fetch(`${base}/api/sources/linked/catalog`)).json();
      expect(catalogJson.recipes).toEqual([]);
    } finally {
      server.close();
    }
  }, 30_000);
});

describe('catalog.json and densities.md that are links', () => {
  it('etna catalog refuses to write through a linked catalog.json', async () => {
    const victim = join(outside, 'victim.txt');
    writeFileSync(victim, 'keep');
    symlinkSync(victim, join(coll, 'catalog.json'));
    expect(await catalog(['catalog', coll])).toBe(1);
    expect(readFileSync(victim, 'utf8')).toBe('keep');
    expect(lstatSync(join(coll, 'catalog.json')).isSymbolicLink()).toBe(true);
    expect(err.join('\n')).toMatch(/refusing to write .*catalog\.json: it is a symbolic link/);
  });

  it('etna catalog writes a plain catalog.json by temp file and rename', async () => {
    expect(await catalog(['catalog', coll])).toBe(0);
    expect(JSON.parse(readFileSync(join(coll, 'catalog.json'), 'utf8')).recipes.map((r: { slug: string }) => r.slug)).toEqual(['own']);
  });

  it('etna density check --write refuses a linked densities.md and never reads it', async () => {
    const victim = join(outside, 'victim.md');
    writeFileSync(victim, 'keep');
    symlinkSync(victim, join(coll, 'densities.md'));
    expect(await density(['check', coll, '--write'])).toBe(1);
    expect(readFileSync(victim, 'utf8')).toBe('keep');
    expect(() => loadDensities(coll)).toThrow(/outside the collection/);
  });

  it('writeFileSafely refuses a link and a folder outside the root', () => {
    const victim = join(outside, 'v.txt');
    writeFileSync(victim, 'keep');
    symlinkSync(victim, join(coll, 'x.txt'));
    expect(() => writeFileSafely(join(coll, 'x.txt'), 'new')).toThrow(/symbolic link/);
    expect(() => writeFileSafely(join(outside, 'y.txt'), 'new', coll)).toThrow(/outside the collection/);
    expect(readFileSync(victim, 'utf8')).toBe('keep');
    writeFileSafely(join(coll, 'z.txt'), 'new', coll);
    expect(readFileSync(join(coll, 'z.txt'), 'utf8')).toBe('new');
  });
});
