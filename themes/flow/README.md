# Flow — the flow-chart theme

The default theme of `etna dag`. It reproduces the visual language of the hand-made reference
charts (Malted Chocolate, Frosty Chocolate, Pistachio):

- the **title** in a pill with a heavy dark outline, top center, with a smaller subtitle line
  when the title has one (`Pistachio` / `in the style of Van Leeuwen`);
- **ingredient boxes** — amber, blue outline, all one width, stacked in one left column, the
  text a small table (quantity right-aligned, unit, item with its note);
- **operation nodes** — light-blue elongated hexagons, text centered;
- **edges** — horizontal and vertical segments with rounded corners and arrowheads;
- **components** of a multi-component recipe as boxed, titled containers;
- a **Checkpoint** as a small check mark on its node, a **Choose** as a dashed group labeled `Choose`
  around the alternatives.

## Match the app

`flow` says `palette: app`: in the GUI, with Settings > Cards and printing > Flow chart >
Colors on "match the app" (the default), its amber and blue give way to colors made from the
app's appearance (Plain, Slate, Catppuccin…, light or dark), and to no other hue: operations
solid in the accent with on-accent text, like the app's primary buttons; ingredient boxes in the
soft accent with ink text; edges, arrowheads and the title outline in the ink; outlines and
container frames in the rule color; title and container boxes on the paper. The shapes, fonts
and spacing stay `flow`'s. A saved SVG keeps the colors on screen; a PDF is ink on paper,
drawn in the light scheme of the same palette on a white page, even when the screen is dark. `etna dag` always
draws the amber and blue. How each color is made: [Match the app](../README.md#match-the-app).

## Match the card

`flow` says `fonts: card`: in the GUI it is set in a card style's fonts, the title in the
card's title font at the card's title weight, everything else in the card's body font. Which
card style is the chart's Font menu (also Settings > Cards and printing > Flow chart > Fonts):
"Match active card", the default, follows the card style in use (the toolbar shows that card
style selected); a card style by name pins the chart to it; "Style" ("Style's own" in Settings) keeps JetBrains Mono. Folio gives a chart in Spectral, Mise one in Figtree with a light title.
Ingredients are set in the body font's regular weight, as on a card, operations stay bold,
and every text size is scaled so the card's lower case stands as tall as JetBrains Mono's at
`flow`'s sizes (14 becomes 17.11 in Folio's Spectral, 15.4 in Mise's Figtree, 13.86 in
Countertop's Merriweather). The shapes, padding, spacing and colors stay `flow`'s, and the
ingredient boxes keep their table (quantity right-aligned, unit, item). JetBrains Mono's
character is 0.6 em; a
proportional font's is narrower, so `char-width` becomes the card's body font's own nominal
character and the `*-wrap` counts keep meaning characters. A saved SVG and a PDF carry the
card's fonts. `etna dag` draws JetBrains Mono unless given `--card <name>`. How it works:
[Match the card](../README.md#match-the-card).

## Files

| File         | What it holds                                                    |
| ------------ | ---------------------------------------------------------------- |
| `theme.yaml` | `name` and `values`: every themeable value, at its default       |

`flow` is the default, and the reference: its `theme.yaml` lists every value there is.
`tools/src/dag/schema.ts` carries the same values as the defaults, so a chart renders the same
in a browser, where this file is not read. A test keeps the two equal: change both.

## Making your own

Make a folder with a `theme.yaml` that names the values you change; anything left out falls
back to `flow`, except `palette` and `fonts` (left out, the theme keeps its own colors and
its own fonts in the GUI). The other bundled chart themes — [`ink`](../ink/), [`dense`](../dense/),
[`station`](../station/) — are short examples.

```sh
etna dag cookbook/malted-chocolate --theme flow --out malted.svg
etna dag cookbook/malted-chocolate --theme ./my-theme --out malted.svg
etna dag --check-theme ./my-theme
```

Every value, its type, default and effect, and what cannot be themed:
[Chart themes](../README.md#chart-themes) in `themes/README.md`.

Lengths are in SVG user units (the chart scales to whatever size it is shown or printed at).
Text is measured with the widths of the stack's first family, read from its font files ahead
of time: JetBrains Mono's are all 0.6 em, so at `char-width: 0.6` the width is
*characters × `char-width` × `font-size`*, the same as `text-measure: mono`, which is what a
monospace font without metrics gets. See [Text widths](../README.md#text-widths).

The text is JetBrains Mono, a free monospace whose every character is exactly 0.6 em: the SVG
and the PDF carry it from the font cache (`etna fonts`), so the chart looks the same on every
machine. SF Mono, Menlo, Consolas and Courier New follow it in the stack for `font-embedding:
none`.
