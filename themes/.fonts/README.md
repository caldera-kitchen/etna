# Font cache

The free fonts the bundled card themes use (their `webfonts:` in `theme.yaml`), as WOFF2
files, with `index.json` mapping each Google Fonts request to its files. `etna card` and
`etna serve` embed them in a card so it prints the same on any machine, offline.

The chart themes' fonts (the first family of each chart theme's font stacks) are here too:
as WOFF2 like the card fonts, which every chart SVG embeds, and as TrueType, one static file
per weight (`<family>-<weight>-<hash>.ttf`, under `ttf` in the index), which `etna dag --pdf`
and the GUI's PDF button embed. A PDF needs TrueType it can
subset; Google sends that, one whole file per weight, to a client that is not a browser.

The card themes' body and title fonts are here as TrueType too, at 400, 700 and the
weight of the card's title (no italics), so that a chart can be drawn and printed in a card
theme's fonts. `etna fonts metrics` reads every TrueType file's advance widths into
`tools/src/dag/font-metrics.ts`, which the chart layout measures text with; run it after a
TrueType file is added or replaced, and commit the two together.

`etna fonts` fills and refreshes this folder from Google Fonts (fonts.googleapis.com and
fonts.gstatic.com), keeping the `latin` and `latin-ext` subsets; `etna fonts --force`
downloads everything again. The files are committed so a fresh clone needs no network. A file
is named `<family>-<subset>-<hash>.woff2`, where the hash is the first 10 hex digits of the
SHA-256 of the gstatic URL it came from (not of its content): when Google publishes a new
build the URL, and so the name, changes. See [../README.md#web-fonts](../README.md#web-fonts).

The files are Google Fonts' builds, redistributed as Google serves them: subset by Google,
otherwise not modified.

| Family | Files | Weights and styles | Version | Copyright holder | License | Source |
|--------|-------|--------------------|---------|------------------|---------|--------|
| Figtree | `figtree-*` (4 WOFF2, 3 TTF) | 300–700 (WOFF2 variable), italic 400; TTF 300, 400, 700 | 2.002 (TTF name table) | The Figtree Project Authors (2022) | [OFL 1.1](LICENSES/Figtree.OFL.txt) | <https://fonts.google.com/specimen/Figtree> |
| Spectral | `spectral-latin*` (6), `spectral-400-*`, `spectral-700-*` (2 TTF) | 400, 700, italic 400; TTF 400, 700 | 2.005 (TTF name table) | The Spectral Project Authors (2017) | [OFL 1.1](LICENSES/Spectral.OFL.txt) | <https://fonts.google.com/specimen/Spectral> |
| Spectral SC | `spectral-sc-*` (2) | 400 | — | The Spectral Project Authors (2017) | [OFL 1.1](LICENSES/Spectral-SC.OFL.txt) | <https://fonts.google.com/specimen/Spectral+SC> |
| Inter | `inter-*` (4 WOFF2, 2 TTF) | 400–700 (WOFF2 variable), italic 400; TTF 400, 700 | 4.001 (TTF name table) | The Inter Project Authors (2020; 2016 in the TTF name table) | [OFL 1.1](LICENSES/Inter.OFL.txt) | <https://fonts.google.com/specimen/Inter> |
| IBM Plex Sans Condensed | `ibm-plex-sans-condensed-*` (10 WOFF2, 2 TTF) | 400, 500, 600, 700, italic 400; TTF 400, 700 | 1.3 (TTF name table) | IBM Corp. (2017; 2019 in the TTF name table); Reserved Font Name "Plex" | [OFL 1.1](LICENSES/IBM-Plex-Sans-Condensed.OFL.txt) | <https://fonts.google.com/specimen/IBM+Plex+Sans+Condensed> |
| Merriweather | `merriweather-*` (4 WOFF2, 3 TTF) | 400–700 and italic 400–700 (WOFF2 variable); TTF 400, 500, 700 | 2.100 (TTF name table) | The Merriweather Project Authors (2020; 2024 in the TTF name table); Reserved Font Name "Merriweather" | [OFL 1.1](LICENSES/Merriweather.OFL.txt) | <https://fonts.google.com/specimen/Merriweather> |
| Quicksand | `quicksand-*` (2 WOFF2, 3 TTF) | 300; TTF 300, 400, 700 | 3.006 (TTF name table) | The Quicksand Project Authors (2011; 2019 in the TTF name table); Reserved Font Name "Quicksand" | [OFL 1.1](LICENSES/Quicksand.OFL.txt) | <https://fonts.google.com/specimen/Quicksand> |
| Jost | `jost-*` (4 WOFF2, 2 TTF) | 400, 700, italic 400; TTF 400, 700 | 3.710 (TTF name table) | The Jost Project Authors (2020) | [OFL 1.1](LICENSES/Jost.OFL.txt) | <https://fonts.google.com/specimen/Jost> |
| JetBrains Mono (charts) | `jetbrains-mono-*` (2 WOFF2, 2 TTF) | 400, 700 (WOFF2 variable) | 2.211 (name table) | The JetBrains Mono Project Authors (2020) | [OFL 1.1](LICENSES/JetBrains-Mono.OFL.txt) | <https://fonts.google.com/specimen/JetBrains+Mono> |
| Arimo (charts) | `arimo-*` (2 WOFF2, 2 TTF) | 400, 700 (WOFF2 variable) | 1.341 (name table) | The Arimo Project Authors (2020) | [OFL 1.1](LICENSES/Arimo.OFL.txt) | <https://fonts.google.com/specimen/Arimo> |
| Nunito Sans (charts) | `nunito-sans-*` (2 WOFF2, 3 TTF) | 300, 500, 600 (WOFF2 variable) | 3.101 (name table) | The Nunito Sans Project Authors (2016) | [OFL 1.1](LICENSES/Nunito-Sans.OFL.txt) | <https://fonts.google.com/specimen/Nunito+Sans> |

42 WOFF2 files, about 1.1 MB, and 24 TrueType files, about 4.6 MB (the 17 for the card fonts
are 3.4 MB, half of it Merriweather's three). Google Fonts lists every
family under the SIL Open Font License 1.1; the copyright lines are those of each family's
`OFL.txt` in Google's catalog (<https://github.com/google/fonts/tree/main/ofl>), and for the
TrueType files those of the font files' own name tables (copyright, and a license URL that
names the OFL), where a year differs. Spectral SC's version is not stated.

The fonts are redistributed under the SIL Open Font License 1.1, with their license texts in
[`LICENSES/`](LICENSES/).

`etna fonts clean` deletes the downloaded font files (this file and `LICENSES/` stay); restore
them with `git checkout -- themes/.fonts`.
