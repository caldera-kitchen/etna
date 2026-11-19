# Galley

A dense two-column sheet in a condensed face: everything under the title runs in two
newspaper columns, so a recipe that takes three pages elsewhere takes one here. Each step is
a small block — its name, what goes in, what to do.

```sh
etna card path/to/recipe --theme galley --pdf --out card.pdf
```

Structured recipes use the `paired` layout. It prints no picture: it is made to fit a long
recipe on one page.

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** long recipes on one sheet. The cinnamon rolls — three components, fifteen steps —
  fit one page, and each component reads as a block. Nothing to turn with floury hands.
- **Good:** the short line (about 55 characters) suits the condensed face.
- **Bad:** arm's length. 10 pt condensed type is the smallest text of the set.
- **Bad:** short recipes. A soup is two small blocks at the top of an empty sheet; this theme
  does nothing to dress that up.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [IBM Plex Sans Condensed](https://fonts.google.com/specimen/IBM+Plex+Sans+Condensed) | 400, 500, 600, 700, italic 400 | 10 |

Plex Condensed is static: one file per weight and style, for each of the `latin` and
`latin-ext` subsets, so it is the largest set of files of the bundled themes (124 KB).

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default sans-serif.

Plex Condensed is a little wider than the Avenir Next Condensed and Barlow Condensed the theme
was fitted with: the cinnamon rolls spill a few lines onto a second page at 10pt, and fitting
shrinks them back onto one (9.6pt); wedding soup 1, malted chocolate 1.
