# Dense — a long recipe on one page

`flow`'s colors and shapes at a smaller size, with tighter spacing everywhere, so a long
recipe still prints on one letter page at a size you can read.

- **Text** 11 units, Arimo (embedded; Helvetica Neue, Helvetica, Arial as fallbacks), measured by
  its own widths, which are narrower than monospace (`text-measure: sans` is only for a machine
  without it); ingredients in regular weight, operations bold.
- **Boxes** lower and narrower: smaller minimum sizes, less padding, a shorter hexagon point.
- **Spacing** about half of `flow`'s between rows, columns and containers.
- **Title** smaller and bold.

Printed on a letter page (`etna dag --pdf`: fitted to the sheet whichever way up, inside
half-inch margins and an eighth of an inch more), the text of `next-day-soft-cinnamon-rolls`
comes out at about 6.9 pt, against 5.5 pt with `flow`; that of `italian-wedding-soup` at
7.4 pt, against 5.8 pt.

```sh
etna dag cookbook/next-day-soft-cinnamon-rolls --theme dense --out rolls.svg
```

## Match the app

Like `flow`, `dense` says `palette: app`: in the GUI, with Settings > Cards and printing >
Flow chart > Colors on "match the app" (the default), its colors are made from the app's
appearance, light or dark: operations solid in its accent, ingredients in its soft accent, so
the two still differ at a glance without flow's amber and blue. A saved SVG keeps the colors
on screen; a PDF is drawn in the light scheme of the same palette, on a white page, even when
the screen is dark. `etna dag` draws `flow`'s amber and blue. `palette` is the one
value it states that `flow` also has: a theme keeps its own colors unless it says `app`.
How each color is made: [Match the app](../README.md#match-the-app).

## Match the card

Like `flow`, `dense` says `fonts: card`: in the GUI its title is set in a card style's title
font and weight and everything else in its body font (the card style in use, or the one the
chart's Font menu names), ingredients regular and operations bold as before, at Dense's own
spacing, and at its sizes scaled so the card's lower case stands as tall as Arimo's (11 becomes
12.91 in Folio's Spectral, 11.62 in Mise's Figtree, 10.46 in Countertop's Merriweather).
`char-width` becomes the body
font's nominal character at Dense's ingredient weight, so a condensed card face (Galley's IBM
Plex Sans Condensed) gives narrower boxes and a wide one (Countertop's Merriweather) wider
ones. `etna dag` draws Arimo unless given `--card <name>`. `fonts`, like `palette`, is never
taken from `flow`: a theme keeps its own fonts unless it says `card`. How it works:
[Match the card](../README.md#match-the-card).

It states only the values it changes from `flow`, and `palette` and `fonts`. All values: [`../README.md`](../README.md#chart-themes).
