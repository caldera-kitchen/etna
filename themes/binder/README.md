# Binder

A letter-size recipe binder page: one ruled frame, a Futura-like body (Jost), a light
display face for the title with a rule beneath, ingredients in three aligned columns, directions as
paragraphs, notes at the foot of the page. Modeled on the MacGourmet *Binder* theme.

```sh
etna card path/to/recipe --theme binder --pdf --out card.pdf
```

Spaced paragraphs, no step numbers, no rules between steps, step
labels run in, bold small caps. Structured recipes use the `hoisted` layout — one
ingredient table, grouped by component, then the directions.

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** traditional recipes, which are what it was drawn for: a list, paragraphs,
  notes. The frame makes every page, short or long, look like a page from the same binder.
- **Good:** notes sit at the bottom of a one-page card, out of the way.
- **Bad:** structured recipes with many steps: the hoisted table puts every step's
  ingredients before the directions, so the eye travels.
- **Bad:** the frame and the generous ingredient columns cost width on every line.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Title | [Quicksand](https://fonts.google.com/specimen/Quicksand) | 300 | 2 |
| Text | [Jost](https://fonts.google.com/specimen/Jost), a Futura revival | 400, 700, italic 400 | 4 |

Stacks: text `Jost, sans-serif`; title `Quicksand, sans-serif`.

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default sans-serif.

Quicksand Light is a soft, rounded display face for the title. Jost has no small capitals as
Google serves it, so the bold small-cap labels are made by the browser from capitals. Page
counts: cinnamon rolls 2, wedding soup 1, malted chocolate 1.

The frame is the border of each page's `.sheet-box`, so it is drawn on every printed page in
every browser (the `@page` border is only for a card printed without the paging script).
