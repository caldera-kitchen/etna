# Ink — a flow chart for a black-and-white printer

The flow chart in black on white, made for a laser printer. Nothing is told apart by color or
by a gray fill, which a laser printer turns into a dither:

- **ingredient boxes** — the smallest rounded corner, a 1.5-unit outline, regular weight text;
- **operation nodes** — hexagons, as in `flow`, with a 2.25-unit outline and bold text;
- **edges** — thin black lines with small arrowheads;
- **components** — thin rounded containers, so they do not read as ingredient boxes;
- the **title** in a plain rectangle with the same slight corner, bold.

Text is Arimo, a free font with Arial's widths, embedded in the SVG and the PDF (Helvetica Neue, Helvetica and Arial are the fallbacks), measured by its own widths.

## Match the card

Ink's identity is black on white for a laser printer, not its typeface, so it says
`fonts: card`, like `flow` and `dense`: in the GUI its title is set in a card style's title
font and weight and everything else in its body font (the card style in use, or the one the
chart's Font menu names; "Style", or "Style's own" in Settings, keeps Arimo), ingredients regular and operations bold
as before, with Ink's strokes and black, and its sizes scaled so the card's lower case stands
as tall as Arimo's (14 becomes 16.44 in Folio's Spectral, 14.79 in Mise's Figtree, 13.31 in
Countertop's Merriweather). `etna dag` draws Arimo unless given
`--card <name>`. Its colors stay its own (`palette: own`) whatever the app's appearance. How
it works: [Match the card](../README.md#match-the-card).

```sh
etna dag cookbook/malted-chocolate --theme ink --out malted.svg
```

It states only the values it changes from `flow`. All values: [`../README.md`](../README.md#chart-themes).
