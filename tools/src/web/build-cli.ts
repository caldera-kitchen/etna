// `etna build-web` — write the static web GUI to a folder (e.g. for GitHub Pages).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parseSourceUrl } from './about.ts';
import { buildWeb, type WebFontMode } from './build.ts';
import { SITE_SOURCE_DIR } from './sources.ts';
import { defaultSourceFiles, type DefaultSource } from './site-source.ts';

const HELP = `Usage: etna build-web [--out <dir>] [--fonts web|embedded] [--source-url <url>]
                      [--default-source <folder>]

Builds the static web GUI: index.html, app.js, app.css, the chart's worker
(chart-worker.js), and the chunks they load (chunk-*.js: the code the two share, and on
first use the chart fonts, the PDF's code and its fonts, About's credits). The result can be hosted
anywhere, at the root of a host or under a sub-path (GitHub Pages: /<repo>/), since
every URL in it is relative; open it with ?repo=owner/name to point it at a public
recipe repository.

Options:
  --out <dir>         Output folder (default: dist/web)
  --fonts <mode>      How cards get the themes' free fonts (default: web):
                        web       the browser loads them from Google Fonts when a card is shown
                        embedded  bundled into app.js from the cache "etna fonts" fills
                                  (about 1.5 MB more; works offline)
  --source-url <url>  The project's public repository (https). Settings > About links to it,
                      and on GitHub to its docs/ and docs/contributing-a-recipe.md on main.
                      Default: none, and About shows no links.
  --default-source <folder>
                      A folder of recipes the site carries and lists for every visitor
                      until they remove it, such as ../cookbook: anything etna serve
                      takes (a collection root holding recipes/, or a folder of recipe
                      folders). It is copied into the site under default-source/ with
                      its catalog, and the app reads it from the site itself, not from
                      GitHub. Its name in the app is the folder's name. Default: none,
                      and a first visit shows no source until the visitor adds one.
                      Every build first removes default-source/ from the output
                      folder, so a recipe removed since the last build is gone too.

Settings > About also shows the version (tools/package.json) and the Git commit the build
was made from, marked when the files it reads differ from that commit. Nothing else varies:
two builds of one commit are the same bytes.`;

export async function run(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  let out = 'dist/web';
  let fonts: WebFontMode = 'web';
  let sourceUrl: string | undefined;
  let defaultSource: DefaultSource | undefined;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith('--') && argv[i].includes('=') ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)] : [argv[i], undefined];
    if (flag === '--out' || flag === '--fonts' || flag === '--source-url' || flag === '--default-source') {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '') return usage(`${flag} needs a value`);
      if (flag === '--out') out = value;
      else if (flag === '--default-source') {
        try {
          defaultSource = defaultSourceFiles(value);
        } catch (e) {
          return usage(`--default-source: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      else if (flag === '--source-url') {
        if (parseSourceUrl(value) === null) return usage(`--source-url must be an https address of a repository, such as https://github.com/owner/name, not "${value}"`);
        sourceUrl = value;
      }
      else if (value === 'web' || value === 'embedded') fonts = value;
      else return usage(`--fonts must be web or embedded, not "${value}"`);
    } else return usage(`unknown argument ${argv[i]}`);
  }
  const bundle = await buildWeb({ minify: true, fonts, localServer: false, sourceUrl, defaultSource });
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  // The build owns `default-source/` in the output: a recipe removed from the folder since the
  // last build must not stay behind. Nothing else in the output is removed.
  rmSync(join(dir, SITE_SOURCE_DIR), { recursive: true, force: true });
  for (const [name, content] of Object.entries(bundle.files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  const size = Buffer.byteLength(bundle.files['app.js']);
  const carried = defaultSource ? `; default source: ${defaultSource.id}, ${Object.keys(defaultSource.files).filter((f) => f.endsWith('/recipe.md')).length} recipes` : '';
  console.log(`Wrote ${Object.keys(bundle.files).length} files to ${dir} (app.js ${(size / 1024).toFixed(0)} KB; fonts: ${fonts}${carried})`);
  return 0;
}

function usage(message: string): number {
  console.error(`etna build-web: ${message}\n\n${HELP}`);
  return 2;
}
