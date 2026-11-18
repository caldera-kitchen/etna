// Settings > About: what the build stamps (about-data.ts) and how the page words it (about.ts).

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { FONTS_DIR, readFontIndex } from '../../src/card/fonts.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';
import { creativeCommonsUrl, NO_ABOUT, parseSourceUrl, projectLinks, readAbout, requestHosts, requestSummary, shortCommit } from '../../src/web/about.ts';
import { aboutData, BUILD_INPUTS, buildStamp, etnaLicense, fontCredits, fontLicenseFile, parseFontLicense, type GitRunner } from '../../src/web/about-data.ts';
import { bundledData, guiCsp } from '../../src/web/build.ts';
import { run as buildWebCli } from '../../src/web/build-cli.ts';

const VERSION = (JSON.parse(readFileSync(join(ETNA_ROOT, 'tools', 'package.json'), 'utf8')) as { version: string }).version;
const HASH = '0123456789abcdef0123456789abcdef01234567';

/** A git that answers from a table, keyed by its first argument. */
function fakeGit(answers: Record<string, string | null>): GitRunner {
  return (args) => answers[args[0]] ?? null;
}

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

describe('the build stamp', () => {
  it('is the package version and the checkout’s commit, with its date', () => {
    const stamp = buildStamp(ETNA_ROOT, fakeGit({ 'rev-parse': `${HASH}\n`, log: '2026-11-11\n', status: '' }));
    expect(stamp).toEqual({ version: VERSION, commit: HASH, committed: '2026-11-11', modified: false });
  });

  it('is marked modified when what the build reads differs from the commit', () => {
    const calls: string[][] = [];
    const git: GitRunner = (args) => {
      calls.push(args);
      return { 'rev-parse': HASH, log: '2026-11-11', status: ' M themes/folio/card.css\n' }[args[0]] ?? null;
    };
    expect(buildStamp(ETNA_ROOT, git).modified).toBe(true);
    // Only the build's inputs are asked about: a note at the root does not mark the build.
    expect(calls.find((a) => a[0] === 'status')).toEqual(['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS]);
  });

  it('records no commit outside a Git checkout', () => {
    expect(buildStamp(ETNA_ROOT, fakeGit({}))).toEqual({ version: VERSION, commit: null, committed: null, modified: false });
    expect(buildStamp(ETNA_ROOT, fakeGit({ 'rev-parse': 'not a hash' })).commit).toBeNull();
  });

  it('reads the real checkout, and no commit where the folder is not one (a downloaded archive)', () => {
    const stamp = buildStamp();
    expect(stamp.version).toMatch(/^\d+\.\d+\.\d+/);
    if (stamp.commit === null) {
      expect(stamp.committed).toBeNull();
    } else {
      expect(stamp.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(stamp.committed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('the font credits', () => {
  it('credit every family in the font cache’s index, from its license file', () => {
    const index = readFontIndex();
    const families = new Set([...Object.values(index.specs), ...Object.values(index.ttf ?? {})].map((s) => s.family));
    const { fonts, texts } = fontCredits();
    expect(fonts.map((f) => f.family)).toEqual([...families].sort());
    expect(fonts.length).toBeGreaterThanOrEqual(10);
    for (const f of fonts) {
      expect(f.copyright, f.family).toMatch(/^Copyright /);
      expect(f.license, f.family).toBe('SIL Open Font License 1.1');
      expect(texts[f.text], f.family).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
    // The license text is the same in every file: it is carried once.
    expect(texts).toHaveLength(1);
  });

  it('leave no license file in the cache unused', () => {
    const used = new Set(fontCredits().fonts.map((f) => fontLicenseFile(f.family)));
    expect(readdirSync(join(FONTS_DIR, 'LICENSES')).filter((f) => !used.has(f))).toEqual([]);
  });

  it('stop the build when a cached family has no license file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'etna-about-'));
    temps.push(dir);
    mkdirSync(join(dir, 'LICENSES'));
    const face = { family: 'Some Sans', style: 'normal', weight: '400', stretch: null, unicodeRange: null, subset: 'latin', file: 'some-sans-latin-0000000000.woff2' };
    writeFileSync(join(dir, 'index.json'), JSON.stringify({ version: 1, specs: { 'Some+Sans:wght@400': { family: 'Some Sans', fetched: '', faces: [face] } } }));
    expect(() => fontCredits(dir)).toThrow(/Some Sans but no license file/);
    writeFileSync(join(dir, 'LICENSES', 'Some-Sans.OFL.txt'), 'Copyright 2020 Someone\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\n');
    expect(fontCredits(dir).fonts).toEqual([{ family: 'Some Sans', copyright: 'Copyright 2020 Someone', license: 'SIL Open Font License 1.1', text: 0 }]);
  });

  it('read a license file’s copyright paragraph and the license it names', () => {
    const parsed = parseFontLicense('Copyright 2017 IBM Corp.\nwith Reserved Font Name "Plex"\n\nThis Font Software is licensed under the SIL Open Font License, Version 1.1.\nMore.\n');
    expect(parsed.copyright).toBe('Copyright 2017 IBM Corp. with Reserved Font Name "Plex"');
    expect(parsed.license).toBe('SIL Open Font License 1.1');
    expect(parsed.body.startsWith('This Font Software')).toBe(true);
    expect(() => parseFontLicense('Some text\n\nlicensed under the X, Version 1.')).toThrow(/copyright/);
    expect(() => parseFontLicense('Copyright 2020 A\n\nNo license named here.')).toThrow(/which license/);
  });
});

describe('Etna’s own licenses', () => {
  it('are read from LICENSE and LICENSE-docs', () => {
    const code = etnaLicense(join(ETNA_ROOT, 'LICENSE'), true);
    expect(code?.name).toBe('MIT License');
    expect(code?.copyright).toMatch(/^Copyright \(c\) \d{4} /);
    expect(code?.text).toContain('Permission is hereby granted');
    const docs = etnaLicense(join(ETNA_ROOT, 'LICENSE-docs'), false, 'Creative Commons ');
    expect(docs).toEqual({ name: 'Creative Commons Attribution-ShareAlike 4.0 International', copyright: null, text: null });
    expect(creativeCommonsUrl(docs!.name)).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(creativeCommonsUrl('MIT License')).toBeNull();
  });
});

describe('the data About reads back', () => {
  it('round-trips through the bundle', () => {
    const data = aboutData({ stamp: { version: '0.1.0', commit: HASH, committed: '2026-11-11', modified: false }, sourceUrl: 'https://github.com/owner/etna' });
    expect(readAbout(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('drops what is not the shape the build makes', () => {
    expect(readAbout(undefined)).toEqual(NO_ABOUT);
    expect(readAbout([])).toEqual(NO_ABOUT);
    const r = readAbout({ version: 3, commit: '', modified: 'yes', fonts: [{ family: 'A', copyright: 'C', license: 'L', text: 4 }, 'x'], fontLicenseTexts: ['t'], code: { name: '' } });
    expect(r).toEqual({ ...NO_ABOUT, fontLicenseTexts: ['t'] });
  });

  it('is compiled into the app’s data', () => {
    const text = bundledData('web', undefined, false, { ...NO_ABOUT, version: '9.9.9', sourceUrl: 'https://example.org/etna' });
    expect(text).toContain('export const about = {"version":"9.9.9"');
    expect(text).toContain('"sourceUrl":"https://example.org/etna"');
  });
});

describe('the source URL setting', () => {
  it('takes an https address of a repository, without a trailing slash', () => {
    expect(parseSourceUrl('https://github.com/owner/etna')).toBe('https://github.com/owner/etna');
    expect(parseSourceUrl(' https://github.com/owner/etna/ ')).toBe('https://github.com/owner/etna');
    expect(parseSourceUrl('https://codeberg.org/owner/etna')).toBe('https://codeberg.org/owner/etna');
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'github.com/owner/etna', 'http://github.com/owner/etna', 'https://github.com', 'https://github.com/', 'https://x@github.com/o/e', 'https://github.com/o/e?x=1', 'https://github.com/o/e#top', 'javascript:alert(1)'])
      expect(parseSourceUrl(bad), bad).toBeNull();
  });

  it('gives no link when unset, and on GitHub the docs and the contributing guide', () => {
    expect(projectLinks(null)).toEqual([]);
    expect(projectLinks('https://github.com/owner/etna')).toEqual([
      { label: 'Source code', href: 'https://github.com/owner/etna' },
      { label: 'Documentation', href: 'https://github.com/owner/etna/tree/main/docs' },
      { label: 'Contributing a recipe', href: 'https://github.com/owner/etna/blob/main/docs/contributing-a-recipe.md' },
    ]);
    expect(projectLinks('https://codeberg.org/owner/etna')).toEqual([{ label: 'Source code', href: 'https://codeberg.org/owner/etna' }]);
  });

  it('is checked by etna build-web', async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (m: string) => errors.push(m);
    try {
      expect(await buildWebCli(['--source-url', 'http://example.org/etna'])).toBe(2);
    } finally {
      console.error = original;
    }
    expect(errors[0]).toMatch(/--source-url must be an https address/);
  });
});

describe('the hosts About names', () => {
  it('follow the bundle', () => {
    expect(requestHosts({ localServer: true, fontMode: 'embedded' }).map((h) => h.what)).toEqual(['etna serve, on this computer', 'GitHub']);
    expect(requestHosts({ localServer: false, fontMode: 'web' }).map((h) => h.what)).toEqual(['GitHub', 'Google Fonts']);
    expect(requestSummary(requestHosts({ localServer: false, fontMode: 'embedded' }))).toBe('GitHub');
    expect(requestSummary(requestHosts({ localServer: true, fontMode: 'web' }))).toBe('etna serve on this computer, GitHub and Google Fonts');
  });

  it('are the hosts the page’s policy admits, and no others', () => {
    for (const fontMode of ['web', 'embedded'] as const) {
      const csp = guiCsp('sha256-x', fontMode);
      const admitted = new Set([...csp.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => m[1]));
      const named = new Set(requestHosts({ localServer: false, fontMode }).flatMap((h) => h.hosts));
      expect([...named].sort(), fontMode).toEqual([...admitted].sort());
    }
  });

  it('show a commit by its first 12 digits', () => {
    expect(shortCommit(HASH)).toBe('0123456789ab');
  });
});
