// Bundles the web GUI. Used by `etna serve` (in memory) and `etna build-web` (to a folder).

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cachedPdfFaces, familyFontCss, loadFontCss } from '../card/fonts.ts';
import { chartFontFamilies } from '../dag/index.ts';
import { cardType, pagingScript, parseTheme } from '../card/index.ts';
import { leadFamily } from '../dag/pdf-fonts.ts';
import { GENERIC_FAMILIES } from '../dag/schema.ts';
import { listThemes, readThemeFiles, THEMES_DIR } from '../card/node.ts';
import { dagThemeDir, listDagThemes, loadDagTheme, readDagThemeFiles } from '../dag/node.ts';
import { ETNA_ROOT } from '../node/files.ts';
import { parseSourceUrl, type AboutData, type PackageCredit } from './about.ts';
import { aboutData, buildStamp, packageCredits, type BuildStamp } from './about-data.ts';
import type { DefaultSource } from './site-source.ts';
import { SITE_SOURCE_DIR } from './sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export interface WebBundle {
  /**
   * File name → content, ready to be served or written: index.html, app.js, app.css, the chart's
   * worker (chart-worker.js), and the chunks they load (`chunk-*.js`: the code both share, the
   * chart PDF's code and fonts, About's credits).
   */
  files: Record<string, string>;
  /** Files written as bytes beside them: the default source's pictures, under `default-source/`. */
  pictures: Record<string, Uint8Array>;
  /** The GUI page's Content-Security-Policy, also written into index.html as a <meta>. */
  csp: string;
  /**
   * The chart worker's own policy (a worker is held to the policy its script is served with, not
   * the page's): its own code and chunks, nothing else. `etna serve` sends it; a static host
   * cannot, and there the worker runs under none.
   */
  workerCsp: string;
  /** The third-party packages whose code is in app.js and its chunks, as About credits them (its lazy `virtual:etna-credits` chunk). */
  credits: PackageCredit[];
}

/** The hosts a GitHub source is read from (sources.ts). */
const GITHUB_HOSTS = 'https://raw.githubusercontent.com https://api.github.com';

/**
 * The GUI page's own Content-Security-Policy. Scripts: app.js, the inline boot script and the
 * card's paging script, by their hashes (a card frame's `srcdoc` document is held to this policy
 * as well as its own, so a script the card's policy would admit by mistake still cannot run).
 * Workers: the chart's, chart-worker.js, from this origin (no blob: or data: workers).
 * Connections: this server and GitHub. Images: data: and blob: URLs (the favicon, the chart).
 * Google Fonts only in a bundle built with web fonts, whose built-in cards load them.
 */
export function guiCsp(bootHash: string, fonts: WebFontMode): string {
  const google = fonts === 'web';
  return [
    "default-src 'self'",
    `script-src 'self' '${bootHash}' '${pagingScript().hash}'`,
    "worker-src 'self'",
    `style-src 'self' 'unsafe-inline'${google ? ' https://fonts.googleapis.com' : ''}`,
    `font-src 'self' data:${google ? ' https://fonts.gstatic.com' : ''}`,
    "img-src 'self' data: blob:",
    `connect-src 'self' ${GITHUB_HOSTS}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** The chart worker's policy: its script and the chunks it imports (the shared code, the PDF's code and fonts), from this origin; nothing else. */
export const CHART_WORKER_CSP = "default-src 'none'; script-src 'self'";

/**
 * How the GUI delivers the bundled themes' fonts.
 * `embedded`: each theme's cached fonts (etna fonts) go into the bundle as @font-face rules with
 * data: URLs — for `etna serve`, which may run offline. A theme whose fonts are not all cached
 * gets none, and its cards use the installed fonts.
 * `web`: nothing is bundled; the browser loads each theme's fonts from Google Fonts when a card
 * is shown — for `etna build-web` (GitHub Pages).
 */
export type WebFontMode = 'embedded' | 'web';

export interface WebBuildOptions {
  minify?: boolean;
  /** Default `embedded`, the right thing for local serving. */
  fonts?: WebFontMode;
  /**
   * Default true: the bundle `etna serve` serves, which asks its server for this computer's
   * folders (`api/sources`). False for a static host (`etna build-web`), which has no such server:
   * the app does not ask, so a first visit makes no request that can only fail.
   */
  localServer?: boolean;
  /**
   * The project's public repository (https), which Settings › About links to (its source code,
   * and on GitHub its docs and the guide to contributing a recipe). Default none: no links.
   */
  sourceUrl?: string;
  /** The version and commit About shows. Default: tools/package.json and the checkout's Git HEAD (about-data.ts). */
  stamp?: BuildStamp;
  /**
   * The recipes a static build carries and lists for a first-time visitor (`etna build-web
   * --default-source`, read by site-source.ts): written under `default-source/` and read by the
   * app from the site itself. Default none: the bundle is exactly as it is without this option.
   */
  defaultSource?: DefaultSource;
}

/**
 * The data compiled into the app: the units registry, the density table, every card and chart
 * theme's files, how to deliver the card fonts, and what Settings › About says of the build.
 */
export function bundledData(fonts: WebFontMode = 'embedded', fontsDir?: string, localServer = true, about?: AboutData, defaultSource?: Pick<DefaultSource, 'id' | 'label' | 'welcome' | 'order'>): string {
  // Only card themes (`kind: card`); the core stylesheet comes with the renderer's code.
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(join(THEMES_DIR, name));
  const fontCss: Record<string, string> = {};
  if (fonts === 'embedded') {
    for (const [name, files] of Object.entries(themes)) {
      let css: string | null = null;
      try {
        css = loadFontCss(parseTheme(files), fontsDir);
      } catch {
        css = null; // a theme that does not load is the GUI's to report, not the build's
      }
      if (css !== null && css !== '') fontCss[name] = css;
    }
  }
  // Chart themes (`kind: chart`) are values only: just their files' text.
  const chartThemes: Record<string, Record<string, string>> = {};
  for (const name of listDagThemes()) chartThemes[name] = readDagThemeFiles(dagThemeDir(name));
  const unitsYaml = readFileSync(join(ETNA_ROOT, 'registries', 'units.yaml'), 'utf8');
  // The density table the shopping list totals a weight with a volume through, as `etna list` does.
  const densitiesMd = readFileSync(join(ETNA_ROOT, 'registries', 'densities.md'), 'utf8');
  return (
    `export const unitsYaml = ${JSON.stringify(unitsYaml)};\n` +
    `export const densitiesMd = ${JSON.stringify(densitiesMd)};\n` +
    `export const themes = ${JSON.stringify(themes)};\n` +
    `export const chartThemes = ${JSON.stringify(chartThemes)};\n` +
    `export const fontMode = ${JSON.stringify(fonts)};\n` +
    `export const fontCss = ${JSON.stringify(fontCss)};\n` +
    `export const localServer = ${JSON.stringify(localServer)};\n` +
    `export const about = ${JSON.stringify(about ?? aboutData({ stamp: buildStamp(), sourceUrl: null, fontsDir }))};\n` +
    // Only when there is one, so a build without a default carries the same data as before.
    (defaultSource ? `export const defaultSource = ${JSON.stringify({ id: defaultSource.id, label: defaultSource.label, welcome: defaultSource.welcome, order: defaultSource.order })};\n` : '')
  );
}

/**
 * The chart PDF fonts: every TrueType face in the font cache (`etna fonts`), each as a module of
 * its own that the bundle splits into a lazy chunk, so a PDF loads only the faces it embeds.
 * Bundled in both font modes: the PDF is the same everywhere only if its fonts are.
 */
export function pdfFontsModule(dir?: string): { index: string; files: Map<string, string> } {
  const faces = cachedPdfFaces(dir);
  const files = new Map(faces.map((f) => [basename(f.path), f.path]));
  const index =
    'export const faces = [\n' +
    faces
      .map((f) => `  { family: ${JSON.stringify(f.family)}, weight: ${f.weight}, load: () => import(${JSON.stringify(`virtual:etna-pdf-font/${basename(f.path)}`)}).then((m) => m.data) },\n`)
      .join('') +
    '];\n';
  return { index, files };
}

/**
 * The bundled chart themes' free fonts, and the bundled card styles' body and title fonts (a
 * chart that matches the card is set in them), as @font-face rules (data: URLs) for the chart SVG to
 * embed: an index module whose loaders import one module per family, each split into a lazy
 * chunk, so the GUI's first load carries none of it and a chart loads only its own families.
 * In both font modes: a chart is shown as an image, which cannot load a font from anywhere.
 */
export function chartFontsModule(dir?: string): { index: string; css: Map<string, string> } {
  const css = new Map<string, string>();
  const add = (family: string) => {
    if (!css.has(family) && !GENERIC_FAMILIES.has(family)) css.set(family, familyFontCss(family, dir));
  };
  for (const name of listDagThemes()) {
    try {
      chartFontFamilies(loadDagTheme(name)).forEach(add);
    } catch {
      // a theme that does not load is the GUI's to report, not the build's
    }
  }
  // "Match the card": a chart may be set in any bundled card style's body and title fonts.
  for (const name of listThemes()) {
    try {
      const type = cardType(parseTheme(readThemeFiles(join(THEMES_DIR, name))));
      [type.body.stack, type.title.stack].map(leadFamily).forEach(add);
    } catch {
      // as above
    }
  }
  const slug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const index =
    'export const families = {\n' +
    [...css.keys()]
      .filter((family) => css.get(family) !== '')
      .map((family) => `  ${JSON.stringify(family)}: () => import(${JSON.stringify(`virtual:etna-chart-font/${slug(family)}`)}).then((m) => m.css),\n`)
      .join('') +
    '};\n';
  return { index, css: new Map([...css].map(([family, text]) => [slug(family), text])) };
}

export async function buildWeb(options: WebBuildOptions = {}): Promise<WebBundle> {
  const fonts: WebFontMode = options.fonts ?? 'embedded';
  const localServer = options.localServer ?? true;
  let sourceUrl: string | null = null;
  if (options.sourceUrl !== undefined) {
    sourceUrl = parseSourceUrl(options.sourceUrl);
    if (sourceUrl === null) throw new Error(`the source URL must be an https address of a repository, not "${options.sourceUrl}"`);
  }
  const about = aboutData({ stamp: options.stamp ?? buildStamp(), sourceUrl });
  const pdfFonts = pdfFontsModule();
  const chartFonts = chartFontsModule();
  // Built twice: the first build's metafile says which packages went into app.js and its
  // chunks, and the second carries their credits, a lazy chunk About loads (virtual:etna-credits).
  // The credits module is data only, so it adds no package, which the check below confirms.
  const bundle = (credits: PackageCredit[]) =>
    build({
      // The chart's worker is an entry of its own (chart-lane.ts loads it beside app.js); the
      // code the two share (the chart's layout) is one chunk both import.
      entryPoints: { app: join(HERE, 'main.tsx'), 'chart-worker': join(HERE, 'chart-worker.ts') },
      bundle: true,
      write: false,
      // The chart's PDF (pdf-lib, fontkit and each font) is imported on first use: chunks of their own.
      splitting: true,
      outdir: 'out',
      chunkNames: 'chunk-[hash]',
      format: 'esm',
      target: 'es2022',
      platform: 'browser',
      minify: options.minify ?? false,
      jsx: 'automatic',
      jsxImportSource: 'preact',
      logLevel: 'silent',
      metafile: true,
      plugins: [
        {
          name: 'etna-data',
          setup(b) {
            b.onResolve({ filter: /^virtual:etna-credits$/ }, () => ({ path: 'etna-credits', namespace: 'etna-credits' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-credits' }, () => ({ contents: `export const packages = ${JSON.stringify(credits)};\n`, loader: 'js' }));
            b.onResolve({ filter: /^virtual:etna-data$/ }, () => ({ path: 'etna-data', namespace: 'etna-data' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-data' }, () => ({ contents: bundledData(fonts, undefined, localServer, about, options.defaultSource), loader: 'js' }));
            b.onResolve({ filter: /^virtual:etna-chart-fonts$/ }, () => ({ path: 'index', namespace: 'etna-chart-fonts' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-chart-fonts' }, () => ({ contents: chartFonts.index, loader: 'js' }));
            b.onResolve({ filter: /^virtual:etna-chart-font\// }, (args) => ({ path: args.path.slice('virtual:etna-chart-font/'.length), namespace: 'etna-chart-font' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-chart-font' }, (args) => {
              const text = chartFonts.css.get(args.path);
              if (text === undefined) return { errors: [{ text: `no chart font ${args.path}` }] };
              return { contents: `export const css = ${JSON.stringify(text)};\n`, loader: 'js' };
            });
            b.onResolve({ filter: /^virtual:etna-pdf-fonts$/ }, () => ({ path: 'index', namespace: 'etna-pdf-fonts' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-pdf-fonts' }, () => ({ contents: pdfFonts.index, loader: 'js' }));
            b.onResolve({ filter: /^virtual:etna-pdf-font\// }, (args) => ({ path: args.path.slice('virtual:etna-pdf-font/'.length), namespace: 'etna-pdf-font' }));
            b.onLoad({ filter: /.*/, namespace: 'etna-pdf-font' }, (args) => {
              const file = pdfFonts.files.get(args.path);
              if (file === undefined) return { errors: [{ text: `no cached PDF font ${args.path}` }] };
              return { contents: `export const data = ${JSON.stringify(readFileSync(file).toString('base64'))};\n`, loader: 'js' };
            });
            // The paging script as `etna card` writes it: its text, and so its hash, would otherwise
            // be whatever esbuild makes of the functions, and the page's policy (guiCsp) could not
            // name it in advance.
            b.onLoad({ filter: /[\\/]card[\\/]script\.ts$/ }, () => ({
              contents: `const PAGING = ${JSON.stringify(pagingScript())};\nexport function pagingScript() { return PAGING; }\n`,
              loader: 'js',
            }));
          },
        },
      ],
    });
  const credits = packageCredits((await bundle([])).metafile);
  const result = await bundle(credits);
  const shipped = packageCredits(result.metafile).map((p) => `${p.name}@${p.version}`);
  const credited = credits.map((p) => `${p.name}@${p.version}`);
  if (shipped.join('\n') !== credited.join('\n')) throw new Error(`the GUI bundle's packages (${shipped.join(', ')}) are not those About credits (${credited.join(', ')})`);
  // app.js and its chunks, by file name (esbuild names them under `outdir`).
  const scripts: Record<string, string> = {};
  for (const file of result.outputFiles) scripts[basename(file.path)] = file.text;
  if (!scripts['app.js']) throw new Error('the GUI bundle has no app.js');
  if (!scripts['chart-worker.js']) throw new Error('the GUI bundle has no chart-worker.js');
  const boot = await bootScript();
  const csp = guiCsp(`sha256-${createHash('sha256').update(boot).digest('base64')}`, fonts);
  return {
    csp,
    workerCsp: CHART_WORKER_CSP,
    credits,
    files: {
      // The policy comes first in <head>, before anything it governs.
      'index.html': readFileSync(join(HERE, 'index.html'), 'utf8')
        .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${csp}">`)
        .replace('<!--etna-boot-->', `<script>${boot}</script>`),
      // The palettes and corners follow app.css's own rules (palettes.css).
      'app.css': `${readFileSync(join(HERE, 'app.css'), 'utf8')}\n${readFileSync(join(HERE, 'palettes.css'), 'utf8')}`,
      ...scripts,
      // The default source's recipes, read by the app from the site itself (sources.ts SiteSource).
      ...Object.fromEntries(Object.entries(options.defaultSource?.files ?? {}).map(([path, text]) => [`${SITE_SOURCE_DIR}/${path}`, text])),
    },
    pictures: Object.fromEntries(Object.entries(options.defaultSource?.pictures ?? {}).map(([path, bytes]) => [`${SITE_SOURCE_DIR}/${path}`, bytes])),
  };
}

/** boot.ts as one small inline script: it sets the appearance on <html> before the first paint. */
async function bootScript(): Promise<string> {
  const result = await build({
    entryPoints: [join(HERE, 'boot.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text.trim();
  if (/<\/script|<!--/i.test(code)) throw new Error('boot.ts would end its own <script> element');
  return code;
}
