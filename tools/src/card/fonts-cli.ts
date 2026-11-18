// `etna fonts [fetch] [theme…] [--force]`, `etna fonts list`, `etna fonts clean`

import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { leadFamily, pdfFaces, svgFontSpecs, type PdfFace } from '../dag/pdf-fonts.ts';
import { readTheme } from '../dag/theme.ts';
import { listDagThemes, loadDagTheme } from '../dag/node.ts';
import { ETNA_ROOT } from '../node/files.ts';
import { FONT_METRICS_FILE, fontMetricsModule } from '../dag/metrics-node.ts';
import { cachedPdfFaces, cachedSpec, fetchSpec, FONTS_DIR, pdfFontSpec, readFontIndex, specSize, type Fetch, type FontFormat } from './fonts.ts';
import { listThemes, loadTheme } from './node.ts';
import { cardType } from './render.ts';
import { GENERIC_FAMILIES } from '../dag/schema.ts';
import type { WebFont } from './webfonts.ts';

const HELP = `Usage: etna fonts [fetch] [<theme|dir>...] [--force]
       etna fonts list
       etna fonts clean
       etna fonts metrics

The free fonts the card themes use (webfonts: in each theme.yaml), downloaded from Google
Fonts into themes/.fonts/, which is committed with its license texts (themes/.fonts/README.md)
so a fresh clone prints the same cards. etna card embeds them in each card, so cards and PDFs
look the same offline and on every machine.

The chart themes' fonts (the first family of font-family and title-font-family, at the
weights the theme uses) are cached the same way: as WOFF2, which every chart SVG embeds, and
as TrueType, one file per weight, which etna dag --pdf and the GUI's PDF button embed. The
card themes' body and title fonts are cached as TrueType too (400, 700 and the title's
weight, options.fonts.title-weight), so a chart can be measured and printed in them
("Match the card").

  fetch   Download the fonts of the themes named (card or chart; default: every bundled
          theme) that are not cached yet. The default command.
  list    What each bundled theme declares, and whether it is cached, with sizes.
  clean   Delete the cached font files (the licenses and README stay).
  metrics Write the advance widths of every cached TrueType face to
          tools/src/dag/font-metrics.ts, which the chart layout measures text with.
          Run it after fetching a new chart or card font, and commit the result.

Options:
  --force  fetch: download again even what is cached.
  --help   Show this help.

For cards, only the latin and latin-ext subsets are kept, as WOFF2; a chart PDF font is kept
whole, one TrueType file per weight.

Exit code: 0 on success, 1 when a font could not be fetched, 2 on a usage error.`;

/** For tests: replace the network and the cache folder. */
export const testing: { fetch?: Fetch; dir?: string } = {};

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const force = argv.includes('--force');
  const unknown = argv.find((a) => a.startsWith('-') && a !== '--force');
  if (unknown !== undefined) return usage(`unknown option ${unknown}`);
  const words = argv.filter((a) => !a.startsWith('-'));
  const [command, ...rest] = ['fetch', 'list', 'clean', 'metrics'].includes(words[0]) ? words : ['fetch', ...words];
  const dir = testing.dir ?? FONTS_DIR;

  if (command === 'list') {
    if (rest.length > 0 || force) return usage('list takes no arguments');
    return list(dir);
  }
  if (command === 'clean') {
    if (rest.length > 0 || force) return usage('clean takes no arguments');
    return clean(dir);
  }
  if (command === 'metrics') {
    if (rest.length > 0 || force) return usage('metrics takes no arguments');
    return metrics(dir);
  }
  return fetchFonts(rest, force, dir);
}

function usage(message: string): number {
  console.error(`etna fonts: ${message}\n\n${HELP}`);
  return 2;
}

/** A font a theme needs: a card theme's web font (WOFF2), or one face of a chart PDF font (TrueType). */
type ThemeFont = WebFont & { format: FontFormat };

/**
 * The fonts each theme declares, by theme; a theme that cannot be loaded is an error. A chart
 * theme's are its PDF fonts, one spec per weight it uses.
 */
function themeFonts(names: string[]): { fonts: Map<string, ThemeFont[]>; errors: string[] } {
  const fonts = new Map<string, ThemeFont[]>();
  const errors: string[] = [];
  const charts = new Set(listDagThemes());
  for (const name of names) {
    try {
      if (charts.has(name)) {
        const t = readTheme(loadDagTheme(name));
        fonts.set(name, [
          ...svgFontSpecs(t).map((f) => ({ family: f.family, google: f.spec, format: 'woff2' as const })),
          ...pdfFaces(t).map((f) => ({ family: f.family, google: pdfFontSpec(f.family, f.weight), format: 'ttf' as const })),
        ]);
      } else {
        fonts.set(name, [
          ...loadTheme(name).webfonts.map((f) => ({ ...f, format: 'woff2' as const })),
          ...cardPdfFaces(name).map((f) => ({ family: f.family, google: pdfFontSpec(f.family, f.weight), format: 'ttf' as const })),
        ]);
      }
    } catch (error) {
      errors.push(`${name}: ${(error as Error).message}`);
    }
  }
  return { fonts, errors };
}

/**
 * A card theme's fonts as static TrueType faces, so a chart can be measured and printed in
 * them: the first family of its body and of its title font (`options.fonts`), each at 400 and
 * 700, and the title's at its stated weight (`options.fonts.title-weight`) too. No italics.
 */
export function cardPdfFaces(name: string): PdfFace[] {
  const type = cardType(loadTheme(name));
  const faces = new Map<string, PdfFace>();
  const add = (family: string, weight: number) => faces.set(`${family}|${weight}`, { family, weight });
  const families = [type.body.stack, type.title.stack].map(leadFamily);
  for (const family of families) {
    if (GENERIC_FAMILIES.has(family)) continue;
    add(family, 400);
    add(family, 700);
  }
  if (!GENERIC_FAMILIES.has(families[1])) add(families[1], type.title.weight);
  return [...faces.values()].sort((a, b) => a.family.localeCompare(b.family) || a.weight - b.weight);
}

async function fetchFonts(names: string[], force: boolean, dir: string): Promise<number> {
  const { fonts, errors } = themeFonts(names.length > 0 ? names : [...listThemes(), ...listDagThemes()]);
  for (const e of errors) console.error(`etna fonts: ${e}`);
  if (errors.length > 0 && fonts.size === 0) return 2;

  // Each distinct spec once, with the themes that use it.
  const specs = new Map<string, { family: string; spec: string; format: FontFormat; themes: string[] }>();
  for (const [theme, list] of fonts) {
    for (const f of list) {
      const key = `${f.format} ${f.google}`;
      const entry = specs.get(key) ?? { family: f.format === 'ttf' ? `${f.family} ${f.google.split('@')[1]} (PDF)` : f.family, spec: f.google, format: f.format, themes: [] };
      entry.themes.push(theme);
      specs.set(key, entry);
    }
  }
  if (specs.size === 0) {
    console.log('No web fonts declared by the themes given.');
    return 0;
  }

  let failed = 0;
  let downloaded = 0;
  let offline = false;
  for (const { family, spec, format, themes } of specs.values()) {
    if (offline) {
      failed++;
      console.error(`  ${family.padEnd(24)} skipped (offline)`);
      continue;
    }
    try {
      const r = await fetchSpec(spec, { dir, force, fetch: testing.fetch, format });
      downloaded += r.downloaded;
      const subsets = [...new Set(r.faces.map((f) => f.subset))].join(', ');
      const files = new Set(r.faces.map((f) => f.file)).size;
      const state = r.downloaded > 0 ? `downloaded ${r.downloaded}` : 'cached';
      console.log(`  ${family.padEnd(24)} ${String(files).padStart(2)} files ${kb(r.bytes).padStart(7)}  ${subsets}  (${state}; ${themes.join(', ')})`);
    } catch (error) {
      failed++;
      const message = (error as Error).message;
      console.error(`  ${family.padEnd(24)} FAILED: ${message}`);
      if (/are you offline\?/.test(message)) offline = true;
    }
  }
  const where = relative(process.cwd(), dir) || dir;
  if (failed > 0) {
    console.error(`etna fonts: ${failed} of ${specs.size} font${specs.size === 1 ? '' : 's'} could not be fetched${offline ? '; connect to the internet and run "etna fonts" again' : ''}. Cards use the fonts installed on this machine meanwhile.`);
  } else {
    console.log(`${specs.size} font${specs.size === 1 ? '' : 's'} ready in ${where} (${downloaded} file${downloaded === 1 ? '' : 's'} downloaded; ${kb(folderSize(dir))} in all).`);
  }
  return failed > 0 ? 1 : 0;
}

function list(dir: string): number {
  const index = readFontIndex(dir);
  const { fonts, errors } = themeFonts([...listThemes(), ...listDagThemes()]);
  for (const e of errors) console.error(`etna fonts: ${e}`);
  const rows: string[][] = [];
  for (const [theme, list] of fonts) {
    if (list.length === 0) rows.push([theme, '-', '(declares no web fonts)', '', '']);
    for (const f of list) {
      const entry = cachedSpec(f.google, dir, index, f.format);
      const family = f.format === 'ttf' ? `${f.family} (PDF)` : f.family;
      rows.push([theme, family, f.google, entry === null ? 'missing' : 'cached', entry === null ? '' : kb(specSize(entry, dir))]);
    }
  }
  const header = ['theme', 'family', 'google', 'cache', 'size'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();
  console.log(line(header));
  for (const row of rows) console.log(line(row));
  const where = relative(ETNA_ROOT, dir).startsWith('..') ? dir : relative(ETNA_ROOT, dir);
  const missing = rows.filter((r) => r[3] === 'missing').length;
  console.log(`\nCache: ${where}, ${kb(folderSize(dir))}.${missing > 0 ? ' Run "etna fonts" to download what is missing.' : ''}`);
  return errors.length > 0 ? 1 : 0;
}

function clean(dir: string): number {
  if (!existsSync(dir)) {
    console.log('No font cache to remove.');
    return 0;
  }
  // Only the downloaded files go: the license texts and README are part of the checkout.
  let files = 0;
  let size = 0;
  for (const name of readdirSync(dir)) {
    if (name === 'LICENSES' || name === 'README.md') continue;
    const path = join(dir, name);
    size += statSync(path).size;
    rmSync(path, { recursive: true, force: true });
    files++;
  }
  if (files === 0) {
    console.log('No cached font files to remove.');
    return 0;
  }
  console.log(`Removed ${files} cached files (${kb(size)}) from ${dir}; licenses kept.`);
  return 0;
}

function metrics(dir: string): number {
  const faces = cachedPdfFaces(dir);
  if (faces.length === 0) {
    console.error('etna fonts: no TrueType faces are cached: run "etna fonts" first.');
    return 1;
  }
  const text = fontMetricsModule(faces);
  const changed = !existsSync(FONT_METRICS_FILE) || readFileSync(FONT_METRICS_FILE, 'utf8') !== text;
  if (changed) writeFileSync(FONT_METRICS_FILE, text);
  const families = new Set(faces.map((f) => f.family)).size;
  console.log(`${changed ? 'Wrote' : 'Unchanged:'} ${relative(process.cwd(), FONT_METRICS_FILE)}: ${faces.length} faces of ${families} families.`);
  return 0;
}

function folderSize(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
