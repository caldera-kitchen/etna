// The facts Settings > About shows, gathered at build time (build.ts): the version and commit,
// the font credits from the font cache's own records, and Etna's licenses. Each comes from a
// committed file or from Git, so two builds of one commit stamp the same bytes: no clock, no
// machine name, no path.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Metafile } from 'esbuild';

import { FONTS_DIR, readFontIndex } from '../card/fonts.ts';
import { ETNA_ROOT } from '../node/files.ts';
import type { AboutData, EtnaLicense, FontCredit, PackageCredit } from './about.ts';

/** Where the build's version and commit come from. */
export interface BuildStamp {
  version: string;
  commit: string | null;
  committed: string | null;
  modified: boolean;
}

/** What the build reads, relative to the repository root: a change to any of it marks the build as modified. */
export const BUILD_INPUTS = ['tools/src', 'tools/package.json', 'tools/package-lock.json', 'themes', 'registries', 'LICENSE', 'LICENSE-docs'];

/** Runs git in `root` and returns its output, or null when git fails (no git, not a checkout). */
export type GitRunner = (args: string[]) => string | null;

function gitIn(root: string): GitRunner {
  return (args) => {
    try {
      return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
}

/** The version (tools/package.json) and the commit the checkout is at, and whether the build's inputs differ from it. */
export function buildStamp(root: string = ETNA_ROOT, git: GitRunner = gitIn(root)): BuildStamp {
  const pkg = JSON.parse(readFileSync(join(root, 'tools', 'package.json'), 'utf8')) as { version?: unknown };
  const version = typeof pkg.version === 'string' ? pkg.version : '';
  const head = git(['rev-parse', '--verify', 'HEAD'])?.trim() ?? '';
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(head)) return { version, commit: null, committed: null, modified: false };
  const date = git(['log', '-1', '--format=%cs', head])?.trim() ?? '';
  // Tracked changes and new files alike, but only under what the build reads (not, say, a note at the root).
  const status = git(['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS]);
  return { version, commit: head, committed: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, modified: status === null || status.trim() !== '' };
}

/** The license file the font cache keeps for a family: `LICENSES/<Family-Name>.OFL.txt`. */
export function fontLicenseFile(family: string): string {
  return `${family.replace(/ /g, '-')}.OFL.txt`;
}

/** A font license file's parts: the copyright paragraph, the license's name and version, and the rest. */
export function parseFontLicense(text: string): { copyright: string; license: string; body: string } {
  const normal = text.replace(/\r\n?/g, '\n');
  const end = normal.search(/\n\s*\n/);
  const copyright = (end < 0 ? normal : normal.slice(0, end)).trim().replace(/\s*\n\s*/g, ' ');
  if (!/^Copyright\b/.test(copyright)) throw new Error('its first paragraph is not a copyright line');
  const body = end < 0 ? '' : normal.slice(end).replace(/^\s*\n/, '').trimEnd() + '\n';
  const named = /licensed under the (.+?),\s+Version\s+(\d+(?:\.\d+)*)/i.exec(body);
  if (!named) throw new Error('it does not say which license, and which version, it is under');
  return { copyright, license: `${named[1].replace(/\s+/g, ' ')} ${named[2]}`, body };
}

/**
 * Every family in the font cache's index (themes/.fonts/index.json), credited from its license
 * file in LICENSES/: the list cannot drift from what is cached. A family without a readable
 * license file stops the build, so a font is never shipped without its credit.
 */
export function fontCredits(dir: string = FONTS_DIR): { fonts: FontCredit[]; texts: string[] } {
  const index = readFontIndex(dir);
  const families = new Set<string>();
  for (const spec of Object.values(index.specs)) families.add(spec.family);
  for (const spec of Object.values(index.ttf ?? {})) families.add(spec.family);
  const texts: string[] = [];
  const fonts: FontCredit[] = [];
  for (const family of [...families].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const file = join(dir, 'LICENSES', fontLicenseFile(family));
    if (!existsSync(file)) throw new Error(`the font cache has ${family} but no license file for it (${file})`);
    let parsed: ReturnType<typeof parseFontLicense>;
    try {
      parsed = parseFontLicense(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
    let text = texts.indexOf(parsed.body);
    if (text < 0) text = texts.push(parsed.body) - 1;
    fonts.push({ family, copyright: parsed.copyright, license: parsed.license, text });
  }
  return { fonts, texts };
}

/** One of Etna's license files: its first line as the name, its copyright line, and (when asked) the whole text. */
export function etnaLicense(file: string, withText: boolean, prefix = ''): EtnaLicense | null {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((l) => l.trim());
  const first = lines.find((l) => l !== '');
  if (!first) return null;
  return { name: `${prefix}${first}`, copyright: lines.find((l) => /^Copyright\b/.test(l)) ?? null, text: withText ? text.trimEnd() + '\n' : null };
}

/** Everything About shows that the build knows. */
export function aboutData(options: { stamp: BuildStamp; sourceUrl: string | null; fontsDir?: string; root?: string }): AboutData {
  const root = options.root ?? ETNA_ROOT;
  const { fonts, texts } = fontCredits(options.fontsDir);
  return {
    ...options.stamp,
    sourceUrl: options.sourceUrl,
    fonts,
    fontLicenseTexts: texts,
    // The MIT text is short and asks to travel with every copy; the CC BY-SA one is long, and named by its address.
    code: etnaLicense(join(root, 'LICENSE'), true),
    docs: etnaLicense(join(root, 'LICENSE-docs'), false, 'Creative Commons '),
  };
}

/**
 * The installed packages whose code went into the bundle, by the bundler's own record (its
 * metafile): every input that put bytes into an output file, app.js or a chunk, and lives under a
 * `node_modules/<name>` (or `node_modules/@scope/name`) folder. A package imported but shaken out
 * entirely, and a development tool that never reaches the browser, are not in it. Returns each
 * package's folder, absolute, sorted by path. `cwd` is the folder the metafile's paths are relative to.
 */
export function bundledPackageDirs(metafile: Metafile, cwd: string = process.cwd()): string[] {
  const dirs = new Set<string>();
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, input] of Object.entries(output.inputs)) {
      if (input.bytesInOutput <= 0) continue;
      const m = /^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(path.replace(/\\/g, '/'));
      if (m) dirs.add(resolve(cwd, m[1]));
    }
  }
  return [...dirs].sort();
}

/** A license, copyright or notice file at a package's root: LICENSE, LICENSE, COPYING, NOTICE, with any suffix. */
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

/**
 * One installed package, credited from its own files: name, version and `license` from its
 * package.json, and the text of its license and notice files (LICENSE*, LICENSE*, COPYING*,
 * NOTICE*), which the usual licenses ask to travel with every copy. Nothing is filled in: a
 * package without a license file gets `text: null`, and one whose files carry no copyright line
 * gets `copyright: null`. package.json's `author` is kept too: for a package without a license
 * file it is all the package says of who made it.
 */
export function packageCredit(dir: string): PackageCredit {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') throw new Error(`${join(dir, 'package.json')} has no name or version`);
  let license: string | null = null;
  if (typeof pkg.license === 'string' && pkg.license.trim() !== '') license = pkg.license.trim();
  else if (pkg.license && typeof pkg.license === 'object' && typeof (pkg.license as { type?: unknown }).type === 'string') license = (pkg.license as { type: string }).type;
  else if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((l: { type?: unknown }) => l?.type).filter((t): t is string => typeof t === 'string');
    if (types.length > 0) license = types.length === 1 ? types[0] : `(${types.join(' OR ')})`;
  }
  // The license first, then any notice: LICENSE* and the rest before NOTICE*.
  const rank = (f: string) => (/^notice/i.test(f) ? 1 : 0);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENSE_FILE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  const texts = files.map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n?/g, '\n').trim());
  const text = texts.length > 0 ? texts.join('\n\n') + '\n' : null;
  const copyright =
    text
      ?.split('\n')
      .map((l) => l.trim())
      .find((l) => /^(copyright\b|\(c\)|©)/i.test(l)) ?? null;
  let author: string | null = null;
  if (typeof pkg.author === 'string' && pkg.author.trim() !== '') author = pkg.author.trim();
  else if (pkg.author && typeof pkg.author === 'object' && typeof (pkg.author as { name?: unknown }).name === 'string') {
    const a = pkg.author as { name: string; email?: unknown };
    author = typeof a.email === 'string' ? `${a.name} <${a.email}>` : a.name;
  }
  return { name: pkg.name, version: pkg.version, license, copyright, author, files, text };
}

/** Every package in the bundle (bundledPackageDirs), credited (packageCredit), sorted by name and version. */
export function packageCredits(metafile: Metafile, cwd?: string): PackageCredit[] {
  return bundledPackageDirs(metafile, cwd)
    .map(packageCredit)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}
