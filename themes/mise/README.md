# Mise

A two-column kitchen sheet: what you need on the left, what you do on the right. In a
structured recipe every step is one row — its ingredients in the side column, its instruction
beside them — so the side column, read top to bottom, is the whole list in order of use.

```sh
etna card path/to/recipe --theme mise --out card.html
etna card path/to/recipe --theme mise --pdf --out card.pdf
```

Structured recipes use the `paired` layout, and a traditional recipe
made of parts prints them `paired` too (`options.parts`): each part's name across the sheet,
its ingredients in the side column beside its steps (`--parts sections` for one list beside
the whole method). `--mise-side` and `--mise-gap` at the top of `card.css` set the width of
the ingredient column and the gutter. The recipe's picture stands at the top right of the
card, 1.5 in square (`--mise-picture`). The heading keeps to its left: the title, then the
yield and the source as a small table (the words in one column, what they introduce wrapping
in the next), then the heading's rule, which stops short of the picture. What follows comes up
beside the picture and its lines go around it; for that, on a card with a picture, the side
column is floated instead of set on a grid (see "Picture" in [`../README.md`](../README.md)).
On half letter the picture is 1.1 in and the heading's rule runs under both;
none on an index card.

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** structured recipes — the eye goes straight across from "70 g unsalted butter" to
  "Add the butter in 3–4 additions". A short line (about 60 characters) that is easy to find
  again from arm's length. The cinnamon rolls take two pages.
- **Good:** traditional recipes get the same split, ingredients beside the method, and stay
  on one page.
- **Bad:** a long ingredient ("Rotisserie Chicken, separate meat from bones; reserve meat for soup") wraps
  to two or three lines in the side column. Units are printed as symbols (`g`, `tbsp`) to
  keep that column narrow.
- **Bad:** a very short recipe leaves the lower two-thirds of the sheet white. The hairline at
  the foot of every page is there so the white reads as margin, not as a missing part.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [Figtree](https://fonts.google.com/specimen/Figtree) | 300–700 (one variable file), italic 400 | 4 |

The title is set at 300 and the labels at 500 and 600; the 300–700 range covers all of them,
so no weight is synthesized. Files: one per style for each of the `latin` and `latin-ext`
subsets.

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default sans-serif.

Figtree is geometric but warm, with plain terminals: the free face closest to the Avenir Next
the theme was drawn with. Page counts: cinnamon rolls 2, wedding soup 1, malted chocolate 1.
It has no small capitals as Google serves it, so the callout label's `all-small-caps` is made
by the browser from capitals.
