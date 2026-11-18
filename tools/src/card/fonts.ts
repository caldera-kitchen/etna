// Node-only: the local font cache. `etna fonts` downloads the free fonts the bundled themes
// declare (`webfonts:` in theme.yaml) from Google Fonts into `themes/.fonts/` — inside the
// checkout, committed with its licenses — and `loadFontCss` turns a theme's cached fonts into @font-face
// rules with data: URLs, for the `embedded` delivery mode: a card that prints offline.
//
// The cache holds WOFF2 files and an index (index.json) mapping each css2 spec to its faces.
// Beside them, TrueType files for the flow charts' PDFs (`ttf` in the index): a PDF embeds a
// TrueType font, one static file per weight, which Google serves to a client that is not a
// browser (the WOFF2 files are variable fonts split into unicode-range subsets, which the PDF
// library cannot subset).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { THEMES_DIR } from './node.ts';
import type { Theme } from './theme.ts';
import { fontFaceRule, GOOGLE_FONTS_CSS, GOOGLE_FONTS_FILES, KEPT_SUBSETS, parseGoogleCss, specFamily, specStyles, type FontFace } from './webfonts.ts';

/** The cache: a dot-folder beside the themes, so it is never read as a theme; committed with its licenses (themes/.fonts/README.md). */
export const FONTS_DIR = join(THEMES_DIR, '.fonts');
const INDEX = 'index.json';

/**
 * A current desktop browser. Google Fonts answers each browser with the format it supports;
 * this one gets WOFF2 with unicode-range subsets.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

/**
 * What `etna fonts` sends for the TrueType files of the charts' PDFs: Google Fonts answers a
 * client that is not a browser with one static TrueType file per weight, every character in it.
 */
export const TTF_USER_AGENT = 'etna-fonts (TrueType for PDF embedding)';

/** The two kinds of file the cache holds: WOFF2 for cards, TrueType for chart PDFs. */
export type FontFormat = 'woff2' | 'ttf';

export interface CachedFace {
  family: string;
  style: string;
  weight: string;
  stretch: string | null;
  unicodeRange: string | null;
  subset: string;
  /** File name inside the cache folder. */
  file: string;
}

export interface CachedSpec {
  family: string;
  /** When it was downloaded (ISO 8601). */
  fetched: string;
  faces: CachedFace[];
}

export interface FontIndex {
  version: 1;
  /** css2 `family=` value → what was downloaded for it. */
  specs: Record<string, CachedSpec>;
  /** The same for the TrueType files (chart PDFs); absent when there are none. */
  ttf?: Record<string, CachedSpec>;
}

/** The cache index; empty when there is none or it cannot be read. */
export function readFontIndex(dir: string = FONTS_DIR): FontIndex {
  const empty: FontIndex = { version: 1, specs: {} };
  const path = join(dir, INDEX);
  if (!existsSync(path)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<FontIndex>;
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== 1 || typeof parsed.specs !== 'object' || parsed.specs === null) return empty;
    const read = (raw: unknown, file: RegExp): Record<string, CachedSpec> => {
      const specs: Record<string, CachedSpec> = {};
      if (raw === null || typeof raw !== 'object') return specs;
      for (const [spec, entry] of Object.entries(raw as Record<string, CachedSpec>)) {
        if (specFamily(spec) === null || !entry || !Array.isArray(entry.faces)) continue;
        const faces = entry.faces.filter((f): f is CachedFace => !!f && typeof f.family === 'string' && typeof f.file === 'string' && file.test(f.file));
        specs[spec] = { family: String(entry.family ?? specFamily(spec)), fetched: String(entry.fetched ?? ''), faces };
      }
      return specs;
    };
    const index: FontIndex = { version: 1, specs: read(parsed.specs, /^[a-z0-9-]+\.woff2$/) };
    const ttf = read(parsed.ttf, /^[a-z0-9-]+\.ttf$/);
    if (Object.keys(ttf).length > 0) index.ttf = ttf;
    return index;
  } catch {
    return empty;
  }
}

/** A spec's cached faces when every one of their files is present; else null. */
export function cachedSpec(spec: string, dir: string = FONTS_DIR, index: FontIndex = readFontIndex(dir), format: FontFormat = 'woff2'): CachedSpec | null {
  const specs = (format === 'ttf' ? index.ttf : index.specs) ?? {};
  const entry = Object.hasOwn(specs, spec) ? specs[spec] : undefined;
  if (!entry || entry.faces.length === 0) return null;
  return entry.faces.every((f) => existsSync(join(dir, f.file))) ? entry : null;
}

/**
 * The theme's fonts as @font-face rules with data: URLs, from the cache — the `css` of the
 * `embedded` mode. Empty text for a theme that declares no web fonts; null when any of its
 * fonts is missing from the cache.
 */
export function loadFontCss(theme: Pick<Theme, 'webfonts'>, dir: string = FONTS_DIR): string | null {
  const index = readFontIndex(dir);
  const rules: string[] = [];
  const done = new Set<string>();
  for (const font of theme.webfonts) {
    if (done.has(font.google)) continue;
    done.add(font.google);
    const entry = cachedSpec(font.google, dir, index);
    if (entry === null) return null;
    for (const face of entry.faces) rules.push(fontFaceRule(face, readFileSync(join(dir, face.file)).toString('base64')));
  }
  return rules.join('');
}

/** Total size in bytes of a spec's cached files. */
export function specSize(entry: CachedSpec, dir: string = FONTS_DIR): number {
  return [...new Set(entry.faces.map((f) => f.file))].reduce((sum, file) => {
    const path = join(dir, file);
    return sum + (existsSync(path) ? statSync(path).size : 0);
  }, 0);
}

// ------------------------------------------------------------------ fetching

export type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface FetchResult {
  spec: string;
  family: string;
  faces: CachedFace[];
  /** Files downloaded now (0 when all were cached already). */
  downloaded: number;
  bytes: number;
}

/** A network failure, said plainly: offline, a host that cannot be reached, a timeout. */
export function networkMessage(error: unknown, host: string): string {
  const e = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? '';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNRESET'].includes(code)) {
    return `cannot reach ${host} (${code}) — are you offline?`;
  }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return `${host} did not answer in time — are you offline?`;
  return `${host}: ${e?.cause?.message ?? e?.message ?? String(error)}`;
}

/**
 * Download one css2 spec into the cache: request Google's stylesheet as a desktop browser,
 * keep the latin and latin-ext faces, download their WOFF2 files (each URL once), and record
 * them in the index. With `format: 'ttf'`, ask as a plain client instead and keep the static
 * TrueType files Google sends it, whole (no subsets), under `ttf` in the index: the files a
 * chart's PDF embeds. A spec already cached is left alone unless `force`. Throws with a plain
 * message when the network or Google fails.
 */
export async function fetchSpec(
  spec: string,
  options: { dir?: string; force?: boolean; fetch?: Fetch; timeout?: number; format?: FontFormat } = {},
): Promise<FetchResult> {
  const dir = options.dir ?? FONTS_DIR;
  const format: FontFormat = options.format ?? 'woff2';
  const family = specFamily(spec);
  if (family === null) throw new Error(`"${spec}" is not a css2 family= value`);
  const doFetch: Fetch = options.fetch ?? (fetch as unknown as Fetch);
  const timeout = options.timeout ?? 30_000;
  const headers = { 'User-Agent': format === 'ttf' ? TTF_USER_AGENT : BROWSER_USER_AGENT, Accept: 'text/css,*/*;q=0.1' };

  const cached = options.force ? null : cachedSpec(spec, dir, readFontIndex(dir), format);
  if (cached !== null) return { spec, family, faces: cached.faces, downloaded: 0, bytes: specSize(cached, dir) };

  const cssUrl = `${GOOGLE_FONTS_CSS}?family=${spec}&display=swap`;
  const wanted = specStyles(spec);
  let faces: FontFace[] = [];
  // Google has been seen to answer with only some of the styles asked for; ask once more then.
  for (let attempt = 0; attempt < 2; attempt++) {
    let css: string;
    try {
      const response = await doFetch(cssUrl, { headers, signal: AbortSignal.timeout(timeout) });
      if (!response.ok) {
        throw new Error(response.status === 400 ? `Google Fonts does not serve "${spec}" (HTTP 400: check the family name, axes and weights)` : `Google Fonts answered HTTP ${response.status} for "${spec}"`);
      }
      css = await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Google Fonts')) throw error;
      throw new Error(networkMessage(error, 'fonts.googleapis.com'));
    }
    // The TrueType answer has one face per style and weight, every character in it: no subsets.
    faces = format === 'ttf' ? parseGoogleCss(css, 'ttf') : parseGoogleCss(css).filter((f) => f.subset !== null && KEPT_SUBSETS.includes(f.subset));
    if (wanted.every((style) => faces.some((f) => f.style === style))) break;
    if (attempt === 1) {
      const got = [...new Set(faces.map((f) => f.style))];
      const kind = format === 'ttf' ? 'TrueType' : 'latin WOFF2';
      throw new Error(`Google Fonts sent ${got.length === 0 ? `no ${kind} faces` : `only ${got.join(' and ')} faces`} for "${spec}" (asked for ${wanted.join(' and ')})`);
    }
  }

  mkdirSync(dir, { recursive: true });
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const written = new Map<string, string>(); // url -> file
  const result: CachedFace[] = [];
  let downloaded = 0;
  for (const face of faces) {
    if (!face.url.startsWith(`${GOOGLE_FONTS_FILES}/`)) throw new Error(`Google Fonts pointed "${spec}" at an unexpected host: ${face.url.slice(0, 60)}`);
    let file = written.get(face.url);
    if (file === undefined) {
      const hash = createHash('sha256').update(face.url).digest('hex').slice(0, 10);
      const weight = face.weight.replace(/[^0-9]+/g, '-');
      file = format === 'ttf' ? `${slug}-${face.style === 'italic' ? 'italic-' : ''}${weight}-${hash}.ttf` : `${slug}-${face.subset}-${hash}.woff2`;
      const path = join(dir, file);
      if (options.force || !existsSync(path)) {
        let data: Buffer;
        try {
          const response = await doFetch(face.url, { headers, signal: AbortSignal.timeout(timeout) });
          if (!response.ok) throw new Error(`fonts.gstatic.com answered HTTP ${response.status} for a ${family} file`);
          data = Buffer.from(await response.arrayBuffer());
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('fonts.gstatic.com answered')) throw error;
          throw new Error(networkMessage(error, 'fonts.gstatic.com'));
        }
        if (format === 'ttf') {
          const magic = data.subarray(0, 4).toString('latin1');
          if (magic !== '\u0000\u0001\u0000\u0000' && magic !== 'true') throw new Error(`a ${family} file from fonts.gstatic.com is not TrueType`);
        } else if (data.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`a ${family} file from fonts.gstatic.com is not WOFF2`);
        writeFileSync(`${path}.part`, data);
        renameSync(`${path}.part`, path);
        downloaded++;
      }
      written.set(face.url, file);
    }
    result.push({
      family: face.family,
      style: face.style,
      weight: face.weight,
      stretch: face.stretch,
      unicodeRange: face.unicodeRange,
      subset: format === 'ttf' ? 'all' : face.subset!,
      file,
    });
  }

  // Record it; re-read the index so that specs fetched meanwhile are kept.
  const index = readFontIndex(dir);
  const entry: CachedSpec = { family, fetched: new Date().toISOString(), faces: result };
  if (format === 'ttf') index.ttf = { ...(index.ttf ?? {}), [spec]: entry };
  else index.specs[spec] = entry;
  writeFontIndex(index, dir);
  return { spec, family, faces: result, downloaded, bytes: specSize(entry, dir) };
}

export function writeFontIndex(index: FontIndex, dir: string = FONTS_DIR): void {
  mkdirSync(dir, { recursive: true });
  const sort = (specs: Record<string, CachedSpec>) => Object.fromEntries(Object.entries(specs).sort(([a], [b]) => a.localeCompare(b)));
  const sorted: FontIndex = { version: 1, specs: sort(index.specs) };
  if (index.ttf && Object.keys(index.ttf).length > 0) sorted.ttf = sort(index.ttf);
  const path = join(dir, INDEX);
  writeFileSync(`${path}.part`, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(`${path}.part`, path);
}

// ------------------------------------------------------------------ chart PDF fonts

/** The css2 spec of one static face of a chart PDF font: `JetBrains+Mono:wght@700`. */
export const pdfFontSpec = (family: string, weight: number): string => `${family.replace(/ /g, '+')}:wght@${weight}`;

/** Every cached TrueType face (the chart PDF fonts): family, weight and file path. */
export function cachedPdfFaces(dir: string = FONTS_DIR): { family: string; weight: number; path: string }[] {
  const index = readFontIndex(dir);
  const out: { family: string; weight: number; path: string }[] = [];
  for (const spec of Object.keys(index.ttf ?? {})) {
    const entry = cachedSpec(spec, dir, index, 'ttf');
    if (entry === null) continue;
    for (const face of entry.faces) {
      const weight = Number(face.weight);
      if (face.style === 'normal' && Number.isInteger(weight)) out.push({ family: face.family, weight, path: join(dir, face.file) });
    }
  }
  return out.sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);
}

/**
 * @font-face rules with data: URLs for one family, from the cache: its WOFF2 faces (from every
 * spec of that family, each file once), or, when it has none, its TrueType faces. Empty text
 * when the family is not cached. What a chart's SVG embeds (dag/svg.ts).
 */
export function familyFontCss(family: string, dir: string = FONTS_DIR): string {
  const index = readFontIndex(dir);
  const rules: string[] = [];
  // Google sends one variable file for every weight asked of a variable family: each file is
  // embedded once, for the range of weights it was listed under.
  const files = new Map<string, { face: CachedFace; weights: number[] }>();
  for (const spec of Object.keys(index.specs)) {
    const entry = cachedSpec(spec, dir, index);
    if (entry === null) continue;
    for (const face of entry.faces) {
      if (face.family !== family) continue;
      const key = `${face.file} ${face.style}`;
      const seen = files.get(key) ?? { face, weights: [] };
      seen.weights.push(...face.weight.split(/\s+/).map(Number).filter(Number.isFinite));
      files.set(key, seen);
    }
  }
  for (const { face, weights } of files.values()) {
    const low = Math.min(...weights);
    const high = Math.max(...weights);
    const weight = low === high ? String(low) : `${low} ${high}`;
    rules.push(fontFaceRule({ ...face, weight }, readFileSync(join(dir, face.file)).toString('base64')));
  }
  if (rules.length > 0) return rules.join('');
  for (const face of cachedPdfFaces(dir)) {
    if (face.family !== family) continue;
    rules.push(
      '@font-face {\n' +
        `  font-family: "${family.replace(/[^A-Za-z0-9 ]/g, '')}";\n  font-style: normal;\n  font-weight: ${face.weight};\n  font-display: swap;\n` +
        `  src: url(data:font/ttf;base64,${readFileSync(face.path).toString('base64')}) format("truetype");\n}\n`,
    );
  }
  return rules.join('');
}
