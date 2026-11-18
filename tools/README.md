# Etna tools

The Etna toolchain: one TypeScript package that reads `recipe.md` files and checks, formats,
renders, indexes and serves them. The rules they apply are in [`../SPEC.md`](../SPEC.md) (§9 lint,
§13 source style); what is settled, and why, is in [`../docs/decisions/`](../docs/decisions/).

## Setup

Needs Node 24 or newer (it runs the TypeScript sources directly — there is no build step).

```bash
cd tools
npm ci
```

`npm ci` installs exactly what `package-lock.json` records and never rewrites it; use `npm
install` only to add or move a dependency on purpose, and commit the lockfile it changes.

Two packages in `package.json` are pinned to an exact version where the others take any minor
release: `@cantoo/pdf-lib` and `@cantoo/fontkit`, which write the chart PDF and subset its fonts.
A new release of either can change the PDF's bytes (how a font is subset, how a stream is
compressed), and the same chart should give the same PDF on every install. Move them on
purpose: update both versions, run the tests, and compare the PDFs before and after (rasters,
`pdffonts`, `pdftotext`).

## Commands

Run from `tools/` as `node bin/etna.js <command>`. For a plain `etna` anywhere, make an alias
(`alias etna="node $PWD/bin/etna.js"`, run from `tools/`; in a shell startup file, write the
path out) or run `npm link` once, which installs a global `etna` pointing at this checkout.

| Command | What it does |
|---------|--------------|
| `etna lint <path...>` | Check recipes against `rules.yaml`. Exit code 1 on any error. `--json`, `--quiet`, `--unit-candidates`. |
| `etna fmt <path...>` | Rewrite recipes into the canonical source style (SPEC §13). `--check` and `--diff` write nothing. |
| `etna card <recipe>` | Render a printable card as HTML from a theme: opened in a browser it shows as pages of the paper, exactly as they print. `--theme`, `--out`, `--out-dir`, `--pdf` (one headless Chrome-family browser for the batch; each file reported with its pages and size), `--paper letter\|a4\|half-letter\|index-4x6\|index-5x7` (default: the theme's; a paper the theme does not support is an error), `--notes` (print the recipe's Notes section, either form, where the theme has a place for it; default: left out, with nothing printed in its place; callouts inside steps always print), `--fit off` (default auto: the theme's size, made smaller within the theme's `fit.min` only to save a nearly empty last page or to keep a block from being cut off; fitting never enlarges), `--size 12pt` (a fixed size, larger or smaller than the theme's; implies `--fit off`), `--no-paging` (the plain flow, without the paging script), `--fonts embedded\|web\|none` (default: embedded when the theme's fonts are cached). `--theme shopping` prints a shopping list. |
| `etna theme list\|check` | List the card and chart themes, or check a theme of either kind against its contract. |
| `etna fonts [fetch\|list\|clean\|metrics]` | Download the free fonts the themes declare (from Google Fonts) into `themes/.fonts/` (card themes' web fonts as WOFF2; chart themes' fonts as WOFF2 for the SVG and TrueType, one file per weight, for the PDF; card themes' body and title fonts as TrueType too, at 400, 700 and the title's weight), which is committed with its license texts (`themes/.fonts/README.md`), so a fresh clone needs no network; cards embed them and print the same offline. `--force` downloads again. `metrics` writes the advance widths of every cached TrueType face to `tools/src/dag/font-metrics.ts` (committed; a test checks it), which the chart layout measures text with; run it after fetching a new font. |
| `etna list <recipe...>` | A shopping list for one or more recipes: amounts totaled per ingredient, a weight and a volume totaled through the density table when the ingredient has an entry; each line's remark printed after the item (`— or parsnips`), led by its amount when not every line of a total carries it. `--format text\|markdown\|json`, `--uses`, `--sort`, `--no-convert`, `--out`. |
| `etna density check\|list` | `check <collection>`: what the density table needs for this collection (ingredients with no entry, lines that disagree with it, liquids measured in oz); `--write` records it in the collection's own `densities.md`. `list`: the reference entries as the tools read them. |
| `etna dag <recipe>` | Render a structured recipe's flow chart as SVG. `--theme flow\|ink\|dense\|station` or a theme folder, `--out`, `--out-dir`, `--no-title`. `--card <name\|dir>` sets a chart theme that says `fonts: card` (`flow`, `dense`, `ink`) in a card style's fonts, "Match the card": the title in the card's title font and weight, the rest in its body font, for SVG and PDF; without it every chart uses its own fonts, and `station` always does. The SVG embeds the theme's free font as data: URLs (`--fonts embedded`, the default; `--fonts none` for a small file that uses the machine's fonts). `--pdf` writes a one-page PDF instead: vector paths, real text, the theme's free PDF fonts embedded from the font cache; the same bytes on every machine and as the GUI's PDF button. `--list-themes`, `--check-theme <name\|dir>` and `--list-values` describe and check chart themes. Each step's box shows its heading, then each run of words its instruction marks with emphasis, one to a line (SPEC §5.3). A quantified reference's amount is written beside its arrow, with room around it (SPEC §6; the theme's `edge-label-at`, `edge-label-short` and `edge-label-within`). `--join-edges separate\|bus` overrides the theme's `join-edges` (with `separate`, every edge its own lane and its own points of exit and entry; with `bus`, edges joining one node share a lane and edges leaving one node share a point of exit). `--shape screen\|auto\|portrait\|landscape` says what the chart is fitted to: the screen (one column, the narrowest; the default for an SVG) or a sheet, `auto` turning it whichever way up prints the chart larger (the default for a PDF, which is always a sheet); `--paper letter\|a4` and `--margin 0.5in\|0.75in\|1in` give the sheet. On a sheet, a chart whose body text prints under 7 pt gets one note on standard error when the Dense style prints it more than 2% larger, giving both sizes and `--theme dense` (the app's rule, `src/dag/small-print.ts`); nothing on standard output, in the file or in the exit code changes. |
| `etna marks <recipe...>` | What each step's chart box will say, without drawing it: the heading, each mark with its kinds (duration, temperature with its role, setting, tool with its kind, cue, action; or untyped), read from the mark's own words and the registries (SPEC §5.3, ADR 0022), the lines the box takes and a flag over five; then a summary per recipe and for the run (steps with and without marks, marks by kind, untyped marks, temperatures whose role is unknown). `--format text\|json`. A kind never changes a chart or a card. |
| `etna restructure check <original> <structured>` | Prove that a conversion from the traditional to the structured form kept the recipe: every ingredient line and every sentence of the directions accounted for, and the notes word for word in the structured recipe's `## Notes` section (a note placed anywhere else is reported as misplaced; a note moved word for word to a callout under a step is accepted and listed as `note-moved`). The titles must be the same, except a twin's: an original titled as the structured recipe followed by exactly ` (Traditional Form)` (the cookbook's two-form pairs) passes; any other suffix or capitalization, or the suffix on the structured side, is `title-changed`. Exit code 1 when anything was lost or altered. `--json`. |
| `etna catalog <collection>` | Build `catalog.json` for browsing and search. |
| `etna search <collection...> <query>` | Try the search from a terminal. |
| `etna serve <collection...>` | Local, read-only web GUI over folders on this computer: browse, search, cards with paper and size controls, flow charts (Style, Font, joined edges and what the chart is fitted to, Screen or a page (either way up, portrait or landscape), in the chart's toolbar and in Settings; on a page where the text prints under 7 pt, a line under the page offers the Dense style when it prints larger; Save SVG, and PDF: built in the browser from the chart's own layout with `@cantoo/pdf-lib`, loaded on first use, and opened in a new tab; the chart and its PDF are made in a Web Worker, so a large chart does not freeze the page), a shopping list for several recipes. Works offline. |
| `etna build-web --out <dir>` | Build the static web GUI for hosting (GitHub Pages), at the root of a host or under a sub-path (see below). `--fonts web` (default: browsers load the themes' fonts from Google Fonts) or `embedded` (bundled from the font cache). `--source-url <https address>`: the project's repository, which Settings › About links to (see below). `--default-source <folder>`: recipes the site carries and lists for every visitor (see below). |

A `<path>` can be a `recipe.md`, a recipe directory, or a collection root (a folder with
`recipes/` in it), or a folder of recipe folders such as Etna's own `cookbook/`. `archive/` is
never scanned.

## The hosted viewer

`etna build-web` writes the web GUI as plain files: `index.html`, `app.js`, `app.css`, the
chart's worker `chart-worker.js`, and the `chunk-*.js` files they load (the code the two share,
and on first use the chart fonts, the PDF's code and its fonts). Any static host serves them;
nothing runs on the server.

```bash
node bin/etna.js build-web --out ../dist/viewer --default-source ../cookbook --source-url https://github.com/caldera-kitchen/etna
```

`--default-source` and `--source-url` are optional (below). Leave out the default source and a
first visit shows "No recipe source yet" until the visitor adds one in Settings › Sources; a
link can carry one: `…/?repo=owner/name`. To host a viewer over your own recipes, give your own
folder and your repository's address.

- **Under a sub-path.** Every URL in the build is relative to `index.html`, so the folder can be
  served at the root of a host or under a path, as GitHub Pages serves a project:
  `https://<owner>.github.io/<repo>/`. Nothing is set for the path. The address must end in `/`
  (`…/<repo>/`, not `…/<repo>`); GitHub Pages and most static servers redirect to it. To try a
  sub-path on your own computer:

  ```bash
  node bin/etna.js build-web --out ../dist/site/etna --default-source ../cookbook
  python3 -m http.server 8000 --directory ../dist/site
  # open http://localhost:8000/etna/
  ```
- **Content Security Policy.** In `index.html` as a `<meta>`: scripts only from the site itself
  and by hash (the inline boot script, the card's paging script); workers only from the site
  (`worker-src 'self'`: the chart's, a module worker; no `blob:`); connections to the site and
  to GitHub (`raw.githubusercontent.com`, `api.github.com`); with `--fonts web`, stylesheets from
  `fonts.googleapis.com` and fonts from `fonts.gstatic.com`. A `<meta>` policy cannot forbid
  framing (`frame-ancestors`); `etna serve` sends that as a header, a static host does not.
  A worker is held to the policy its own script is served with, not the page's: `etna serve`
  sends `chart-worker.js` with `default-src 'none'; script-src 'self'`; a static host sends
  none, and there the worker runs Etna's own code under no policy.
- **Sources.** A static build has no `etna serve` behind it and does not ask for this computer's
  folders. A visitor's sources are the site's default, if it was built with one, the GitHub
  repositories kept in their browser (Settings › Sources) and any a link carries:
  `…/<repo>/?repo=owner/name`.
- **The landing page.** Before a recipe is picked, the recipe view shows a welcome: the mark, what
  Etna is (the paragraph Settings › About opens with), a recipe of the default source shown as a
  file, a card and a flow chart, a few of its recipes (under "Example recipes bundled with
  Etna", then "Plus N more in the recipe list."), how to add your own, and, with
  `--source-url`, a link to the project's README for hosting a viewer. The full welcome is shown
  while the reader has kept no repository of their own, has not hidden it, and the app is not
  `etna serve`; otherwise the short form (the mark, one line, and "Show the welcome", which
  opens the full one for the visit). "Hide this welcome", at its end, is kept in this browser's
  settings as `"welcome": "short"`. On a narrow screen the
  full welcome comes before the recipe list. The Etna mark and name in the header link back to
  it from any view. The welcome names up to four dishes. A default source's `README.md` names
  them in a section headed `## Start with these` (the heading's case does not matter): a list
  of links to recipe folders, `- [Potato Soup](potato-soup/) — one line on it.`, in the order to
  show them; `cookbook/README.md` has one. Without that section, the welcome names the first four
  structured recipes in the order of the README (the recipes it links from a list item or a
  table row), or in the list's order without one. Either way a recipe in the traditional form
  is skipped, so a dish written in both forms is named once. Each keeps the first sentence the
  README says of it (the rest of its item in the section; else the rest of the item, or the
  row's next cell, elsewhere in the README); without a README, its name alone. Read at build
  time. The first of them is the welcome's example. The section names the samples only: the
  recipe list's order (below) does not read it.
- **The recipe list's order.** When nothing is searched and the list shows one source alone
  (the only one listed, or the list narrowed to it), a source whose `README.md` links its
  recipes from a list item or a table row lists them in that order, the ones it leaves out after
  them alphabetically. One rule changes that order: a recipe in the traditional form whose title
  is a structured recipe's title plus ` (Traditional Form)` (the convention
  `etna restructure check` accepts) is listed directly after that recipe, wherever the README
  put it, so the dish comes first and its traditional twin right under it; a twin whose dish
  the README does not list stays where it is. The README itself keeps its own order (the
  cookbook's lessons put each twin first, to teach). Otherwise, and for a GitHub repository,
  the list is alphabetical. A default source's order is read at build time; `etna serve` reads a folder's when the app asks
  (`/api/sources/<id>/order`). Search results keep their ranking.
- **A default source.** `--default-source <folder>` (for example `../cookbook`) takes any folder
  `etna serve` takes, a collection root holding `recipes/` or a folder of recipe folders, and
  copies it into the site under `default-source/`: its `catalog.json` (as `etna catalog` makes
  it), each recipe at its catalog path, its `densities.md` and its themes (one
  `themes/<name>.json` each). Every build first removes `default-source/` from the output
  folder, and nothing else there, so a recipe removed from the folder since the last build does
  not stay in the site. The app reads them from the site itself, by relative URLs, so the
  default works under a sub-path, asks no host but the site, makes no GitHub request and needs
  nothing added to the Content Security Policy. Its name in the app is the folder's name, as
  `etna serve` names a folder (`cookbook`), and it is marked "This site" in Settings › Sources;
  About says the site comes with it. Every visitor sees it, listed first after this computer's
  folders, until they hide or remove it. It is never written into the visitor's settings: hiding
  and moving it are kept by its id, like any source's (`hide`, `order`), and removing it is kept
  in `removed`, so it does not come back; Sources then offers "Put back". A settings file saved
  on one site and loaded on another keeps these ids: they name nothing on a site whose default
  has another name, or none. Without the option the build is as before: no `default-source/`
  folder and no default in the bundle's data.
- **About.** Settings › About shows the version (`tools/package.json`) and the Git commit the
  build was made from, with that commit's date, marked "with changes not yet committed" when
  anything the build reads (`tools/src`, `themes`, `registries`, the licenses) differs from it;
  no clock time and no path, so two builds of one commit are the same bytes. Its font credits
  come from the font cache (`themes/.fonts/index.json` and `LICENSES/`): a cached family with
  no license file stops the build. Its "Third-party code" list is every package whose code
  esbuild's metafile says went into `app.js` or a chunk, each with the version, `license` and
  license and notice files (`LICENSE*`, `NOTICE*`) of the installed package; the build is run
  twice so the list can be a chunk of its own, loaded when About is opened. `--source-url https://github.com/<owner>/<repo>` adds links to
  the source, its `docs/` and `docs/contributing-a-recipe.md` (on `main`); without it About
  shows no links.
- **Print and PDF.** A card prints from a tab of its own, through the browser's print dialog;
  the chart PDF is made in the browser (in the chart's worker). No PDF is made at build time.
- **Publishing.** `../.github/workflows/viewer.yml` builds and publishes it with GitHub Pages,
  with the recipes that ship as its default source and the repository it runs in as `--source-url`, and
  only after `tests.yml` (the type check and the suite) has passed in the same run, at
  `https://caldera-kitchen.github.io/etna/`. In a repository of your own, set Settings › Pages ›
  Source to "GitHub Actions" first.
- **Checking it.** `tests/web/build.test.ts` serves a build under `/some/sub/path/` and loads the
  page, its stylesheet, `app.js`, the chart's worker and every chunk from there. To look at one yourself:

  ```bash
  node bin/etna.js build-web --out /tmp/site/some/sub/path
  python3 -m http.server 8000 --directory /tmp/site
  # open http://localhost:8000/some/sub/path/?repo=owner/name
  ```

## Layout

```text
tools/
  bin/etna.js        launcher
  src/core/          recipe model, parser, quantities, units, graph — pure, runs in a browser
  src/node/          file-system helpers: registries, rule catalog, finding recipes
  src/lint/          the linter
  src/fmt/           the source formatter
  src/card/          card rendering from a theme          (themes live in ../themes/)
  src/list/          the shopping list: totals, plurals, unit and density conversion
  src/density/       the density table (../registries/densities.md) and its check
  src/dag/           flow-chart layout, chart themes and SVG rendering
  src/marks/         etna marks: each step's box and the kinds of its marks (src/core/kinds.ts)
  src/restructure/   restructure check: a traditional → structured conversion kept the recipe
  src/catalog/       catalog.json and search
  src/serve/         the local server
  src/web/           the web GUI (Preact), bundled with esbuild
  src/cli/           command dispatch
  tests/             vitest suites, one folder per module
  scripts/           readme-pictures.mjs: redraws the front README's two pictures
```

The front README shows Potato Soup's card and flow chart as two PNGs in `../docs/images/`,
each about 800 pixels wide on its own white background. When Potato Soup, the default card
style (`mise`) or the default chart style (`flow`) changes, redraw them from `tools/` with

```bash
node scripts/readme-pictures.mjs
```

It runs `etna card` and `etna dag` on `../cookbook/potato-soup` and photographs both in a
headless Chrome (or the browser `ETNA_BROWSER` names), off the network, which it closes when it
is done.

Each tool's main logic is pure and browser-safe (`index.ts`); file access is kept in
`node.ts` / `cli.ts`. The web GUI runs the same parser, linter, formatter and renderers in
the browser that the command line runs in Node.

## Tests

```bash
npm test            # all suites (npx vitest run)
npm run typecheck   # tsc --noEmit
```

Both must pass.

Linter fixtures live in `../tests/linter/<case>/{input.md,expected.yaml}`. Corpus tests also
run over `../cookbook/` and, when it is present next to the `etna` checkout, a
`recipe-collection/` folder. `tests/cookbook/` checks every recipe in `../cookbook/` (lint,
format, cards, charts, the lessons in its README). The suite needs no network.

The summary counts skipped tests. They are skipped, not failed, when what they need is missing:
the `recipe-collection/` folder (the author's own, not published, so a clone of this
repository skips them; about twenty tests), a Chrome-family browser for the card paging tests
(found in its usual place, or named by `ETNA_BROWSER`), and `pdftotext` (Poppler) for one group
of them. Two theme tests never apply to the list-only `shopping` style and are always skipped
for it. `../.github/workflows/tests.yml` runs
both checks on every push and pull request, on Node 24 with Chrome and `pdftotext` installed (a
push to `main` through `viewer.yml`, which calls it and publishes the viewer only when they pass).
