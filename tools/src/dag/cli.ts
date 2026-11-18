// `etna dag <recipe-path...> [--theme flow] [--card <name|dir>] [--ingredient-text full|name]
//   [--join-edges separate|bus] [--fonts embedded|none] [--pdf]
//   [--paper letter|a4] [--margin 0.5in|0.75in|1in] [--shape screen|auto|portrait|landscape]
//   [--out file.svg | --out-dir dir]`
// `etna dag --list-themes | --check-theme <name|dir>... | --list-values`

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import type { Recipe } from '../core/index.ts';
import { ETNA_ROOT, findRecipes, readRecipe, type RecipeFile } from '../node/files.ts';
import { applyCardType, checkDagTheme, dagThemeValuesTable, layoutDag, parseDagTheme, renderDag, themeFonts, type DagOptions, type DagTheme } from './index.ts';
import { cardType } from '../card/render.ts';
import { loadTheme } from '../card/node.ts';
import { dagThemeDir, listDagThemes, loadDagTheme, readDagThemeFiles } from './node.ts';
import { CHART_MARGINS, CHART_SHAPES, chartShape, chartViewBox, pageShape, type ChartMargin, type ChartPaper, type ChartShape } from './sheet.ts';
import { pointsText, smallPrintHint, type SmallPrintSheet } from './small-print.ts';
import { readTheme } from './theme.ts';

const HELP = `Usage: etna dag <recipe-path...> [options]

Render the flow chart of structured recipes: one self-contained SVG file each, or with
--pdf one PDF each. Open an SVG in a browser to view it; print the PDF. Each step's box
shows its heading, then the words its instruction marks with *asterisks*, one mark to a
line (SPEC §5, "Marks").

A path may be a recipe.md file, a recipe directory, a collection root (holding recipes/),
or a directory of recipe directories. Only structured recipes have a chart: a recipe in the
traditional form is an error when named alone, and is skipped with a note among several.

Options:
  --theme <name|dir>   Theme to use: a bundled theme name or a theme directory. Default: flow.
  --card <name|dir>    Set the chart in a card style's fonts ("Match the card"): a bundled
                       card theme name (mise, folio, …) or a card theme directory. A chart
                       theme that says fonts: card (flow, dense, ink) takes the card's
                       title font and title weight for its title and the card's body font
                       for all other text; one that says fonts: own (station) keeps its
                       own. Without it every chart theme uses its own fonts. SVG and PDF.
  --out <file>         Write the chart to this file (.svg, or .pdf with --pdf). One recipe only.
  --out-dir <dir>      Write each chart to <dir>/<slug>.svg (or <slug>.pdf).
  --pdf                Write a PDF instead of an SVG: one page, the chart scaled to fit it,
                       vector paths and real text, with the theme's free fonts embedded
                       (cached by "etna fonts"). The same bytes on every machine, and the
                       same as the GUI's PDF button gives.
  --shape <shape>      What the chart is fitted to: the screen or a sheet. screen: one
                       column, as large as the window allows (a screen scrolls). A sheet:
                       auto, whichever way up prints the chart larger (a chart wider than
                       tall turns it landscape); portrait; or landscape. On a sheet the
                       chart may drop its third column or be folded into columns to print
                       larger. Without it an SVG is fitted to the screen and a PDF to
                       auto; a PDF is always a sheet, so screen with --pdf means auto.
  --paper <size>       The sheet the chart is fitted to, and with --pdf printed on: letter
                       (the default) or a4.
  --margin <length>    The sheet's page margin, 0.5in (the default), 0.75in or 1in; the
                       chart sits an eighth of an inch further in.
  --fonts <mode>       SVG: embedded (the default, unless the theme's font-embedding says
                       none) carries the theme's free fonts (the first family of its font
                       stacks, from the font cache) as data: URLs, so the chart looks the
                       same anywhere; none makes a smaller file that uses the machine's fonts.
                       A PDF always embeds its fonts.
  --no-title           Leave out the title pill.
  --ingredient-text <mode>  What an ingredient box shows of each line, over the theme's
                       \`ingredient-text\`: full, the line as written; or name, the quantity,
                       unit and name only (everything from the first comma on is dropped).
  --join-edges <mode>  How edges joining one node come in, and edges leaving one node for
                       different nodes go out, over the theme's \`join-edges\`: separate (the
                       default), each in its own lane from its own point on the node it
                       leaves to its own point on the node it joins; or bus, edges joining
                       one node down one shared lane, edges leaving one node from one point.
  --help               Show this help.

Chart themes (documented in themes/README.md, "Chart themes"):
  --list-themes            The bundled chart themes, with their descriptions.
  --check-theme <name|dir> Check a chart theme: theme.yaml, every value's type and range,
                           unknown keys, fonts the width tables do not cover; then render
                           the bundled example recipes with it. Repeatable.
  --list-values            Every themeable value, as a Markdown table.

One recipe with neither --out nor --out-dir prints to standard output.

Small print: when a chart is fitted to a sheet (--shape auto, portrait or landscape, or --pdf)
and its body text prints under 7 pt, and the Dense style would print it more than 2% larger,
one line on standard error per chart says so, named by its recipe, with both sizes:
  etna dag: <recipe>: text prints at 6.3 pt on this page. The Dense style prints it at 8.4 pt (--theme dense).
Both sizes count --card and the other options given, as the app's line does.
Nothing else changes: not standard output, not the file, not the exit code. No note in Dense.

Exit code: 0 on success, 1 when a recipe could not be rendered (or a theme checked has
errors), 2 on a usage error.`;

export async function run(argv: string[]): Promise<number> {
  const paths: string[] = [];
  let themeName = 'flow';
  let cardName: string | undefined;
  let out: string | undefined;
  let outDir: string | undefined;
  let title = true;
  let pdf = false;
  let fontMode: 'embedded' | 'none' | undefined;
  let paper: ChartPaper | undefined;
  let margin: ChartMargin | undefined;
  let shape: ChartShape | undefined;
  /** Theme values given on the command line, over the theme's own. */
  const overrides: Record<string, string> = {};
  const checks: string[] = [];
  let listThemes = false;
  let listValues = false;

  const fail = (message: string): number => {
    console.error(`etna dag: ${message}\n\n${HELP}`);
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
    if (
      arg === '--theme' ||
      arg === '--card' ||
      arg === '--out' ||
      arg === '--out-dir' ||
      arg === '--check-theme' ||
      arg === '--ingredient-text' ||
      arg === '--join-edges' ||
      arg === '--paper' ||
      arg === '--fonts' ||
      arg === '--margin' ||
      arg === '--shape'
    ) {
      const value = inlineValue ?? argv[++i];
      if (value === undefined || value === '') return fail(`${arg} needs a value`);
      if (arg === '--fonts') {
        if (value !== 'embedded' && value !== 'none') return fail(`--fonts must be embedded or none, not ${value}`);
        fontMode = value;
      } else if (arg === '--paper') {
        if (value !== 'letter' && value !== 'a4') return fail(`--paper must be letter or a4, not ${value}`);
        paper = value;
      } else if (arg === '--margin') {
        if (!CHART_MARGINS.includes(value as ChartMargin)) return fail(`--margin must be ${CHART_MARGINS.join(', ')}, not ${value}`);
        margin = value as ChartMargin;
      } else if (arg === '--shape') {
        if (!CHART_SHAPES.includes(value as ChartShape)) return fail(`--shape must be ${CHART_SHAPES.join(', ')}, not ${value}`);
        shape = value as ChartShape;
      } else if (arg === '--ingredient-text') {
        if (value !== 'full' && value !== 'name') return fail(`--ingredient-text must be full or name, not ${value}`);
        overrides['ingredient-text'] = value;
      } else if (arg === '--join-edges') {
        if (value !== 'bus' && value !== 'separate') return fail(`--join-edges must be bus or separate, not ${value}`);
        overrides['join-edges'] = value;
      } else if (arg === '--theme') themeName = value;
      else if (arg === '--card') cardName = value;
      else if (arg === '--out') out = value;
      else if (arg === '--check-theme') checks.push(value);
      else outDir = value;
    } else if (arg === '--no-title') title = false;
    else if (arg === '--pdf') pdf = true;
    else if (arg === '--list-themes') listThemes = true;
    else if (arg === '--list-values') listValues = true;
    else if (arg.startsWith('-') && arg !== '-') return fail(`unknown option ${arg}`);
    else paths.push(arg);
  }

  if (listThemes || listValues || checks.length > 0) {
    if (paths.length > 0) return fail('--list-themes, --list-values and --check-theme take no recipe paths');
    if (listValues) process.stdout.write(dagThemeValuesTable());
    if (listThemes) list();
    return checks.length > 0 ? check(checks) : 0;
  }

  if (paths.length === 0) return fail('no recipe path given');
  if (out !== undefined && outDir !== undefined) return fail('give --out or --out-dir, not both');
  if (pdf && out === undefined && outDir === undefined && process.stdout.isTTY) return fail('--pdf writes a binary file: give --out or --out-dir');
  const missing = paths.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    for (const p of missing) console.error(`etna dag: no such file or directory: ${p}`);
    return 2;
  }

  let theme;
  try {
    theme = loadDagTheme(themeName);
    if (Object.keys(overrides).length > 0) theme = { ...theme, values: { ...theme.values, ...overrides } };
    if (cardName !== undefined) {
      const card = cardType(loadTheme(cardName));
      if (themeFonts(theme) === 'card') theme = applyCardType(theme, card);
      else console.error(`etna dag: the ${theme.name} style keeps its own fonts (fonts: own); --card changes nothing`);
    }
  } catch (error) {
    console.error(`etna dag: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  // The note on small print (small-print.ts): Dense as `--theme dense` with the same other
  // options would draw it, loaded on first need; none when the chart is already in Dense.
  const inDense = sameThemeDir(themeName, 'dense');
  let denseTheme: DagTheme | null | undefined;
  const dense = (): DagTheme | null => {
    if (denseTheme !== undefined) return denseTheme;
    try {
      let d = loadDagTheme('dense');
      if (Object.keys(overrides).length > 0) d = { ...d, values: { ...d.values, ...overrides } };
      if (cardName !== undefined && themeFonts(d) === 'card') d = applyCardType(d, cardType(loadTheme(cardName)));
      denseTheme = d;
    } catch {
      denseTheme = null;
    }
    return denseTheme;
  };

  const recipes: (RecipeFile & { file: string })[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    for (const found of findRecipes(path)) {
      if (found.file === null) {
        console.error(`etna dag: ${found.dir}: no recipe.md, skipped`);
        continue;
      }
      if (seen.has(found.file)) continue;
      seen.add(found.file);
      recipes.push({ ...found, file: found.file });
    }
  }
  if (recipes.length === 0) {
    console.error('etna dag: no recipes found');
    return 1;
  }
  if (recipes.length > 1 && outDir === undefined) {
    return fail(`${recipes.length} recipes found: give --out-dir to write one file each`);
  }

  // Loaded only for --pdf, so an SVG run does not read pdf-lib.
  const pdfModule = pdf ? await import('./pdf.ts') : null;
  const fonts = pdf ? (await import('./pdf-node.ts')).cachedPdfFonts() : null;
  const ext = pdf ? 'pdf' : 'svg';
  // The theme's free fonts for the SVG, read from the cache once (unless none are wanted).
  const fontCss = pdf || fontMode === 'none' ? '' : (await import('./pdf-node.ts')).chartFontCss(theme);

  let rendered = 0;
  let failed = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    let svg: string | Uint8Array;
    let note: string | null = null;
    try {
      const parsed = readRecipe(recipe.file);
      if (parsed.form === 'traditional' && recipes.length > 1) {
        skipped++;
        continue;
      }
      // What the chart is fitted to: without --shape the screen, and with --pdf the sheet it prints on (`auto` for the screen).
      const sheet = { paper, margin, shape };
      const options = { theme, title, sheet };
      svg =
        pdfModule && fonts
          ? await pdfModule.renderDagPdf(parsed, { ...options, fonts })
          : renderDag(parsed, { ...options, fonts: { mode: fontMode, css: fontCss } });
      // The sheet the chart was laid out for: a PDF's screen is `auto` (pdf.ts).
      const fitted: SmallPrintSheet = pdf ? { ...sheet, shape: pageShape(shape) } : sheet;
      note = smallPrintNote(parsed, recipe.slug, typeof svg === 'string' ? svg : null, { ...options, sheet: fitted }, inDense, dense);
    } catch (error) {
      console.error(`etna dag: ${recipe.file}: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
      continue;
    }
    if (outDir !== undefined) {
      const target = join(resolve(outDir), `${recipe.slug}.${ext}`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, svg);
      console.error(`etna dag: wrote ${target}`);
    } else if (out !== undefined) {
      const target = resolve(out);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, svg);
      console.error(`etna dag: wrote ${target}`);
    } else {
      process.stdout.write(svg);
    }
    if (note) console.error(note);
    rendered++;
  }
  if (skipped > 0) console.error(`etna dag: skipped ${skipped} recipe${skipped === 1 ? '' : 's'} in the traditional form (no chart)`);
  return failed > 0 || rendered === 0 ? 1 : 0;
}

/**
 * The note for a chart whose text prints small on its sheet, or null (small-print.ts's rule,
 * the one the app's chart tab uses). `svg`: the chart drawn, whose viewBox is its layout's
 * size; null for a PDF, which is laid out once more to measure it. It never fails the run.
 */
function smallPrintNote(recipe: Recipe, name: string, svg: string | null, options: DagOptions & { theme: DagTheme; sheet: SmallPrintSheet }, inDense: boolean, dense: () => DagTheme | null): string | null {
  // The rule's own first tests, made here too so that a PDF is not laid out again for nothing.
  if (inDense || chartShape(options.sheet.shape) === 'screen') return null;
  try {
    const size = svg !== null ? chartViewBox(svg) : layoutDag(recipe, options);
    if (!size) return null;
    const chart = { width: size.width, height: size.height, fontSize: readTheme(options.theme).num('font-size'), sheet: options.sheet, dense: inDense };
    const hint = smallPrintHint(recipe, chart, () => {
      const theme = dense();
      return theme ? { ...options, theme } : null;
    });
    return hint ? `etna dag: ${name}: text prints at ${pointsText(hint.now)} on this page. The Dense style prints it at ${pointsText(hint.dense)} (--theme dense).` : null;
  } catch {
    return null;
  }
}

/** Whether two chart theme names or directories are the same theme folder. */
function sameThemeDir(a: string, b: string): boolean {
  try {
    return resolve(dagThemeDir(a)) === resolve(dagThemeDir(b));
  } catch {
    return false;
  }
}

function list(): void {
  const rows = listDagThemes().map((name) => {
    const files = readDagThemeFiles(dagThemeDir(name));
    const { theme, problems } = parseDagTheme(files);
    const description = /^description:\s*(.+)$/m.exec(files['theme.yaml'] ?? '')?.[1]?.trim() ?? '';
    const errors = problems.filter((p) => p.level === 'error').length;
    return [name, errors > 0 ? `(${errors} error${errors === 1 ? '' : 's'}) ${description}` : description, theme.name];
  });
  const width = Math.max(5, ...rows.map((r) => r[0].length));
  console.log(`${'theme'.padEnd(width)}  description`);
  for (const [name, description] of rows) console.log(`${name.padEnd(width)}  ${description}`);
}

function check(targets: string[]): number {
  let failed = 0;
  const cookbook = join(ETNA_ROOT, 'cookbook');
  const samples = existsSync(cookbook) ? findRecipes(cookbook).filter((r) => r.file !== null) : [];
  for (const target of targets) {
    let files: Record<string, string>;
    let dir: string;
    try {
      dir = dagThemeDir(target);
      files = readDagThemeFiles(dir);
    } catch (error) {
      failed++;
      console.log(`${target}: ${(error as Error).message}`);
      continue;
    }
    const report = checkDagTheme(files);
    const rendered: string[] = [];
    if (report.theme) {
      for (const sample of samples) {
        try {
          const recipe = readRecipe(sample.file!);
          if (recipe.form !== 'structured') continue;
          renderDag(recipe, { theme: report.theme });
          rendered.push(sample.slug);
        } catch (error) {
          report.errors.push(`renders ${sample.slug} with an error: ${(error as Error).message}`);
        }
      }
    }
    const label = /[\\/]/.test(target) || target.startsWith('.') ? `${target} (${basename(dir)})` : target;
    if (report.errors.length > 0) failed++;
    const verdict =
      report.errors.length > 0
        ? `${report.errors.length} error${report.errors.length === 1 ? '' : 's'}`
        : report.warnings.length > 0
          ? 'ok, with warnings'
          : 'ok';
    console.log(`${label}: ${verdict}${rendered.length > 0 ? ` (rendered ${rendered.length} example charts)` : ''}`);
    for (const e of report.errors) console.log(`  error    ${e}`);
    for (const w of report.warnings) console.log(`  warning  ${w}`);
  }
  return failed > 0 ? 1 : 0;
}
