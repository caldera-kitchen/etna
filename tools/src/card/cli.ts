// `etna card <recipe-path...> [--theme name] [--pdf] [--out file | --out-dir dir]`

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { findRecipes, loadUnits, readRecipe, type RecipeFile } from '../node/files.ts';
import { findCollectionRoot, loadDensities } from '../density/node.ts';
import type { DensityTable } from '../density/index.ts';
import { loadFontCss } from './fonts.ts';
import { DEFAULT_THEME, renderCard, type CardOptions } from './index.ts';
import { loadTheme } from './node.ts';
import { PAPERS, pageSetup } from './paper.ts';
import { findBrowser, openPrinter, type Printer } from './pdf.ts';

const HELP = `Usage: etna card <recipe-path...> [options]

Render recipes to printable cards: one standalone HTML file each. Opened in a browser, the card
shows as pages of the chosen paper, exactly as they print; print it from there, or to PDF.

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories.

Options:
  --theme <name|dir>   Theme to use: a bundled theme name or a theme directory. Default: mise.
  --out <file>         Write the card to this file. One recipe only.
  --out-dir <dir>      Write each card to <dir>/<slug>.html (or .pdf with --pdf).
  --pdf                Write PDF instead of HTML, by printing the card with a Chrome-family
                       browser already installed on this computer (set ETNA_BROWSER to its
                       path if it is not found). Needs --out or --out-dir.
  --paper <name>       The paper: ${PAPERS.join(', ')} (index cards are
                       landscape). Default: the theme's own. Each theme supports some of them.
  --parts <how>        A traditional recipe's parts: sections (one ingredient list, then the
                       directions part by part) or paired (each part's ingredients beside
                       its steps). Default: the theme's own.
  --notes              Print the recipe's Notes section, where the theme has a place for it.
                       Default: notes are left out (step callouts always print).
  --fit off            Print at the theme's text size, whatever the pages. Default: auto —
                       the theme's size, made smaller (within the theme's limits) only to
                       save a nearly empty last page or to keep a block from being cut off.
                       Fitting never makes the text larger.
  --size <size>        Print at this text size (12pt), larger or smaller than the theme's;
                       implies --fit off.
  --fonts <mode>       How the theme's free fonts reach the card:
                         embedded  inside the card, from the cache "etna fonts" fills:
                                   works offline, and PDFs print with them
                         web       a link to Google Fonts: needs the network to show
                         none      only the fonts installed on the machine
                       Default: embedded when this theme's fonts are cached, else none.
  --no-paging          Leave out the paging script: one continuous flow that the browser
                       cuts into pages when printing (the card's fallback without scripts).
  --help               Show this help.

A list theme totals weight with volume as "etna list" does (densities.md, the collection's own over etna's).

One recipe with neither --out nor --out-dir prints to standard output.
With --pdf, each file is reported on standard error with its pages and text size.

Exit code: 0 on success, 1 when a recipe could not be rendered, 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let themeName: string = DEFAULT_THEME;
  let out: string | undefined;
  let outDir: string | undefined;
  let pdf = false;
  let fonts: 'embedded' | 'web' | 'none' | undefined;
  let paper: string | undefined;
  let fit: 'auto' | 'off' | undefined;
  let size: string | undefined;
  let paging = true;
  let notes = false;
  let parts: 'sections' | 'paired' | undefined;

  const fail = (message: string): number => {
    console.error(`etna card: ${message}\n\n${HELP}`);
    return 2;
  };

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inlineValue: string | undefined;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    if (eq !== -1) {
      inlineValue = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (arg === '--help' || arg === '-h') {
      console.log(HELP);
      return 0;
    }
    if (arg === '--pdf') {
      pdf = true;
      continue;
    }
    if (arg === '--notes') {
      notes = true;
      continue;
    }
    if (arg === '--no-paging') {
      paging = false;
      continue;
    }
    if (['--theme', '--out', '--out-dir', '--fonts', '--paper', '--fit', '--size', '--parts'].includes(arg)) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value === '') return fail(`${arg} needs a value`);
      if (arg === '--paper') {
        if (!(PAPERS as readonly string[]).includes(value)) return fail(`--paper must be one of ${PAPERS.join(', ')}, not "${value}"`);
        paper = value;
      } else if (arg === '--fit') {
        if (value !== 'auto' && value !== 'off') return fail(`--fit must be auto or off, not "${value}"`);
        fit = value;
      } else if (arg === '--parts') {
        if (value !== 'sections' && value !== 'paired') return fail(`--parts must be sections or paired, not "${value}"`);
        parts = value;
      } else if (arg === '--size') {
        if (!/^\d+(\.\d+)?(pt|px)$/.test(value)) return fail(`--size must be a text size such as 10.5pt, not "${value}"`);
        size = value;
      } else if (arg === '--fonts') {
        if (value !== 'embedded' && value !== 'web' && value !== 'none') return fail(`--fonts must be embedded, web or none, not "${value}"`);
        fonts = value;
      } else if (arg === '--theme') themeName = value;
      else if (arg === '--out') out = value;
      else outDir = value;
    } else if (arg.startsWith('-') && arg !== '-') return fail(`unknown option ${arg}`);
    else paths.push(arg);
  }

  if (paths.length === 0) return fail('no recipe path given');
  if (out !== undefined && outDir !== undefined) return fail('give --out or --out-dir, not both');
  if (pdf && out === undefined && outDir === undefined) return fail('--pdf needs --out or --out-dir');
  const browser = pdf ? findBrowser() : null;
  if (pdf && browser === null) {
    console.error('etna card: --pdf needs Chrome, Chromium, Edge or Brave installed; none was found. Set ETNA_BROWSER to the browser\'s path, or print the HTML card from any browser.');
    return 1;
  }
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna card: no such file or directory: ${p}`);
    return 2;
  }

  let theme;
  try {
    theme = loadTheme(themeName);
  } catch (error) {
    console.error(`etna card: ${(error as Error).message}`);
    return 2;
  }
  try {
    pageSetup(theme, paper);
  } catch (error) {
    console.error(`etna card: ${(error as Error).message}`);
    return 2;
  }

  // Fonts: embedded from the cache when it has them all, unless asked otherwise.
  let webfonts: CardOptions['webfonts'] = { mode: 'none' };
  if (fonts === 'web') webfonts = { mode: 'web' };
  else if (fonts !== 'none' && theme.webfonts.length > 0) {
    const css = loadFontCss(theme);
    if (css !== null) webfonts = { mode: 'embedded', css };
    else if (fonts === 'embedded') {
      console.error(`etna card: the fonts of theme "${theme.name}" are not all downloaded; run "etna fonts" first`);
      return 1;
    } else console.error(`etna card: run "etna fonts" to download this theme's fonts (${theme.webfonts.map((f) => f.family).join(', ')}); using the installed fonts meanwhile`);
  }

  const recipes: (RecipeFile & { file: string })[] = [];
  for (const path of paths) {
    for (const found of findRecipes(path)) {
      if (found.file !== null) recipes.push({ ...found, file: found.file });
      else console.error(`etna card: ${found.dir}: no recipe.md, skipped`);
    }
  }
  if (recipes.length === 0) {
    console.error('etna card: no recipes found');
    return 2;
  }
  if (recipes.length > 1 && outDir === undefined) {
    return fail(`${recipes.length} recipes to render: give --out-dir`);
  }

  // A list theme totals the shopping list through the density table, as `etna list` does: the
  // reference table, overlaid by the collection's own densities.md. Read once per collection.
  const units = theme.layout === 'list' ? loadUnits() : null;
  const tables = new Map<string | null, DensityTable | null>();
  const shopping = (file: string): CardOptions['shopping'] => {
    if (units === null) return undefined;
    const collection = findCollectionRoot(file);
    if (!tables.has(collection)) {
      let table: DensityTable | null = null;
      try {
        table = loadDensities(collection);
        for (const p of table.problems) console.error(`etna card: ${p.file ?? 'densities.md'}:${p.line}: ${p.reason} (row ignored)`);
      } catch (error) {
        console.error(`etna card: cannot read the density table: ${error instanceof Error ? error.message : String(error)}`);
      }
      tables.set(collection, table);
    }
    return { densities: tables.get(collection) ?? null, units };
  };

  let failed = 0;
  let printer: Printer | null = null;
  if (browser !== null) {
    try {
      printer = await openPrinter(browser);
    } catch (error) {
      console.error(`etna card: could not start ${browser}: ${(error as Error).message}`);
      return 1;
    }
  }
  try {
  for (const recipe of recipes) {
    let html: string;
    try {
      html = renderCard(readRecipe(recipe.file), theme, { webfonts, paper, fit, size, paging, parts, notes, shopping: shopping(recipe.file) });
    } catch (error) {
      failed++;
      console.error(`etna card: ${recipe.file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (printer !== null) {
      const target = outDir !== undefined ? join(resolve(outDir), `${recipe.slug}.pdf`) : resolve(out!);
      mkdirSync(dirname(target), { recursive: true });
      try {
        const result = await printer.print(html, target);
        if (result.paged === 'done') {
          const pages = `${result.pages} ${result.pages === 1 ? 'page' : 'pages'}`;
          console.error(`${target}\t${pages}, ${result.size}${result.fit ? ` (fit: ${result.fit})` : ''}${result.overflow ? '; a block taller than a page is cut off' : ''}`);
        } else if (result.paged === 'failed') {
          console.error(`${target}\tnot paged (${result.error ?? 'the paging script failed'}): printed as one flow`);
        } else console.error(target);
      } catch (error) {
        failed++;
        console.error(`etna card: ${recipe.file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (outDir !== undefined) {
      const target = join(resolve(outDir), `${recipe.slug}.html`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, html);
      console.error(target);
    } else if (out !== undefined) {
      const target = resolve(out);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, html);
      console.error(target);
    } else {
      process.stdout.write(html);
    }
  }
  } finally {
    await printer?.close();
  }
  return failed > 0 ? 1 : 0;
}
