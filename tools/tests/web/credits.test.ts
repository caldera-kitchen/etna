// Settings › About credits every third-party package whose code is in the GUI bundle, with the
// license text its own files carry (about-data.ts `packageCredits`, from esbuild's metafile).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Metafile } from 'esbuild';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { groupCredits, readPackageCredits } from '../../src/web/about.ts';
import { bundledPackageDirs, packageCredit } from '../../src/web/about-data.ts';
import { buildWeb, type WebBundle } from '../../src/web/build.ts';

/**
 * Bundled packages that ship no license file of their own (their package.json names MIT). About
 * says so for each rather than supplying a text. A package that gains a file must leave this list,
 * and a new one without a file must be looked at before it joins it.
 */
const NO_LICENSE_FILE = ['brotli', 'dfa', 'format'];

/** A metafile with one output whose inputs put the given bytes in it. */
function metafile(inputs: Record<string, number>): Metafile {
  return {
    inputs: {},
    outputs: { 'out/app.js': { bytes: 1, inputs: Object.fromEntries(Object.entries(inputs).map(([p, n]) => [p, { bytesInOutput: n }])), imports: [], exports: [] } },
  } as unknown as Metafile;
}

describe('which packages are in the bundle', () => {
  it('takes each input under node_modules that put bytes into an output, scoped and nested alike', () => {
    const dirs = bundledPackageDirs(
      metafile({
        'node_modules/preact/dist/preact.module.js': 100,
        'node_modules/preact/hooks/dist/hooks.module.js': 20,
        'node_modules/@cantoo/pdf-lib/es/index.js': 5,
        'node_modules/a/node_modules/b/lib/x.js': 3,
        'node_modules/shaken/index.js': 0,
        'src/web/main.tsx': 400,
        'etna-data:etna-data': 9,
      }),
      '/root',
    );
    expect(dirs).toEqual(['/root/node_modules/@cantoo/pdf-lib', '/root/node_modules/a/node_modules/b', '/root/node_modules/preact']);
  });
});

describe('a package’s credit', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });
  const pkg = (json: object, files: Record<string, string> = {}) => {
    dir = mkdtempSync(join(tmpdir(), 'etna-credit-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    mkdirSync(join(dir, 'LICENSE-dir-not-a-file'));
    return dir;
  };

  it('is read from its package.json and its license and notice files, license first', () => {
    const credit = packageCredit(
      pkg({ name: 'x', version: '1.2.3', license: 'Apache-2.0', author: { name: 'A. Author', email: 'a@example.org' } }, { 'NOTICE': 'x\nCopyright 2020 Notice Holder\n', 'LICENSE.txt': 'Apache License\r\n\r\nCopyright 2019 X Holder\r\n', 'README.md': 'not this' }),
    );
    expect(credit).toEqual({
      name: 'x',
      version: '1.2.3',
      license: 'Apache-2.0',
      copyright: 'Copyright 2019 X Holder',
      author: 'A. Author <a@example.org>',
      files: ['LICENSE.txt', 'NOTICE'],
      text: 'Apache License\n\nCopyright 2019 X Holder\n\nx\nCopyright 2020 Notice Holder\n',
    });
  });

  it('says there is no text when there is no license file, and fills nothing in', () => {
    const credit = packageCredit(pkg({ name: 'y', version: '0.1.0', licenses: [{ type: 'MIT', url: 'http://example.org' }], author: 'Someone' }));
    expect(credit).toEqual({ name: 'y', version: '0.1.0', license: 'MIT', copyright: null, author: 'Someone', files: [], text: null });
    expect(packageCredit(pkg({ name: 'z', version: '1.0.0' })).license).toBeNull();
  });

  it('comes back from the chunk as written, and an entry of the wrong shape is dropped', () => {
    const good = { name: 'p', version: '1', license: 'MIT', copyright: null, author: null, files: ['LICENSE'], text: 'T' };
    expect(readPackageCredits([good, { ...good, version: 2 }, null, 'x'])).toEqual([good]);
    expect(readPackageCredits(undefined)).toEqual([]);
  });

  it('shares an entry with the packages whose license files read the same, and with no others', () => {
    const one = { name: 'a', version: '1', license: 'MIT', copyright: 'Copyright (c) A', author: 'A', files: ['license'], text: 'Copyright (c) A\n\nT' };
    const same = { ...one, name: 'c', version: '2' };
    const otherYear = { ...one, name: 'b', text: 'Copyright (c) 2015 A\n\nT' };
    const otherFile = { ...one, name: 'd', files: ['LICENSE'] };
    const none = { ...one, name: 'e', copyright: null, files: [], text: null };
    const noneToo = { ...none, name: 'f' };
    const noneOther = { ...none, name: 'g', author: 'B' };
    expect(groupCredits([one, otherYear, same, otherFile, none, noneToo, noneOther]).map((g) => g.map((p) => p.name))).toEqual([['a', 'c'], ['b'], ['d'], ['e', 'f'], ['g']]);
    expect(groupCredits([])).toEqual([]);
  });
});

describe('the credits in the GUI bundle', () => {
  let bundle: WebBundle;
  beforeAll(async () => {
    // Not minified, so each module's code keeps esbuild's `// <path>` comment above it.
    bundle = await buildWeb({ fonts: 'web', localServer: false });
  }, 60_000);

  const scripts = () => Object.entries(bundle.files).filter(([name]) => name.endsWith('.js'));

  it('name every package whose code is in app.js or a chunk', () => {
    const shipped = new Set<string>();
    for (const [, code] of scripts()) {
      // `\S*` is greedy, so the name is the one after the path's last node_modules/.
      for (const m of code.matchAll(/^\s*\/\/ \S*node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//gm)) shipped.add(m[1]);
    }
    expect(shipped.size).toBeGreaterThan(10);
    const credited = new Set(bundle.credits.map((p) => p.name));
    expect([...shipped].filter((name) => !credited.has(name))).toEqual([]);
    // and nothing that is not there
    expect([...credited].filter((name) => !shipped.has(name))).toEqual([]);
    // never the development tools
    for (const dev of ['esbuild', 'typescript', 'vitest', '@types/node']) expect(credited.has(dev), dev).toBe(false);
  });

  it('carry a license text for every package, except those that ship none, which say so', () => {
    for (const p of bundle.credits) {
      expect(p.license, p.name).not.toBeNull();
      if (NO_LICENSE_FILE.includes(p.name)) {
        expect(p.text, p.name).toBeNull();
        expect(p.files, p.name).toEqual([]);
      } else {
        expect(p.text?.trim(), p.name).toBeTruthy();
        expect(p.files.length, p.name).toBeGreaterThan(0);
      }
    }
    expect(bundle.credits.filter((p) => p.text === null).map((p) => p.name)).toEqual(NO_LICENSE_FILE);
  });

  it('are listed once each, the packages of one text together', () => {
    const groups = groupCredits(bundle.credits);
    expect(groups.flat().map((p) => p.name).sort()).toEqual(bundle.credits.map((p) => p.name).sort());
    expect(groups.length).toBeLessThan(bundle.credits.length);
    for (const group of groups) expect(new Set(group.map((p) => p.text)).size, group[0].name).toBe(1);
  });

  it('are a chunk of their own, loaded when About asks for it, not in app.js', () => {
    const preact = bundle.credits.find((p) => p.name === 'preact');
    expect(preact?.text).toBeTruthy();
    const marker = JSON.stringify(preact!.text).slice(1, 200);
    const holders = scripts().filter(([, code]) => code.includes(marker));
    expect(holders.map(([name]) => name)).toHaveLength(1);
    expect(holders[0][0]).toMatch(/^chunk-.*\.js$/);
  });
});
