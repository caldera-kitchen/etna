# Type roles

The color counterpart is [color-roles.md](color-roles.md).

Etna names its type by role, as it names its colors. A card style states its type once, and a
flow chart can take it from there, so a card and its chart can be set in the same fonts.

## The roles

| Role | What it is | Where a card style states it |
|------|------------|------------------------------|
| `body` | Everything but the title: ingredients, steps, notes, labels. | `options.fonts.body`, a font stack |
| `title` | The recipe's title. | `options.fonts.title`, a font stack, and `options.fonts.title-weight`, its weight (100 to 900 in hundreds; 700 when not stated) |

A font stack is a free font, then a generic family: `Figtree, sans-serif`. The first family is
the font; the generic family is the last resort, and it also tells a chart how to measure a font
it has no widths for (`serif`, `sans-serif`, `monospace`).

The card renderer writes the roles as custom properties, `--card-font-body`,
`--card-font-title` and `--card-font-title-weight`, and each bundled stylesheet sets
`.card-title` from the last two. Other weights in a card (bold quantities, step titles) are
the stylesheet's own; they are not roles.

| Card style | Body | Title |
|------------|------|-------|
| Binder | Jost | Quicksand 300 |
| Countertop | Merriweather | Merriweather 500 |
| Folio | Spectral | Spectral 400 |
| Galley | IBM Plex Sans Condensed | IBM Plex Sans Condensed 700 |
| Grid | Inter | Inter 700 |
| Mise, Shopping list | Figtree | Figtree 300 |

## Charts

A chart style names its own fonts (`font-family`, and `title-font-family` with
`title-font-weight`). Its text is measured, not read from a font at drawing time: the layout
uses each bundled font's own advance widths, generated ahead of time from the cached TrueType
files (`etna fonts metrics`), so a chart comes out the same in Node and in the browser, and
the SVG and the PDF draw exactly what was measured. A font without widths is measured with a
built-in `sans` or `serif` table, or as a monospace. The SVG embeds the first family of each
stack as WOFF2, and the PDF embeds it as TrueType. Details:
[Text widths](../themes/README.md#text-widths) and [Fonts](../themes/README.md#fonts).

## Match the card

A chart style that says `fonts: card` (Flow, Dense, Ink) can take a card style's roles: its
title in the card's title font at the card's title weight, all other text in the card's body
font, with its ingredients in the body font's regular weight as on a card, and every text size
scaled so the card's fonts stand as tall in lower case as the chart style's own (below). Its
shapes, padding, spacing and colors stay its own. A chart style that says
`fonts: own` (Station) keeps its fonts whatever is chosen: whether a chart's fonts may change
is its theme's to say, so a new chart style restricts it by writing `fonts: own`.

- **In the app**, Settings > Cards and printing > Flow chart > Fonts chooses the fonts
  (`chart.fonts` in the settings):
  - "Match active card (Mise)" (`card`, the default): the card style in use (Settings >
    Card > Style), named in parentheses; changing the card style redraws the chart.
  - "Style's own" (`own`): the chart style's own fonts. The toolbar, short of room, says
    "Style".
  - a card style by name (its id, `builtin:folio`): pinned to that card style's fonts,
    whichever card style is in use. A stored id that no longer names a card style the chart
    can take fonts from follows the card style in use.

  The card styles listed are those of the card's Style menu whose fonts a chart can draw;
  the shopping list, which shares Mise's fonts, is not one. The Font menu on the Flow chart
  tab shows what the chart is set in: "Style", then every card style by name, with no entry
  for following; when the chart follows the card style in use, that card style is selected.
  Each entry's tooltip says it in full. Choosing there changes the same setting: the card
  style in use follows it, another card style is pinned (pinning the one in use is done in
  Settings). For a chart style that keeps its own fonts the menu shows
  "Style", disabled. A saved SVG and a PDF use the fonts on screen.
- **On the command line**, `etna dag` uses the chart style's own fonts unless given
  `--card <name|dir>`, for SVG and PDF.

A chart's `*-wrap` values count characters, and `char-width` turns them into widths. Flow's
0.6 em is a monospace cell; a proportional font's average character is narrower, so with Match
the card `char-width` becomes the body font's **nominal character**: its mean advance over the
lowercase alphabet, at the ingredient weight. The title's wrap is scaled by the title font's
nominal character in the same way. Both come from the font's widths, so the same card always
gives the same chart.

Sizes follow the x-height, the height of the lower case. Fonts at one size differ in how big
they look: Spectral's x-height is 0.450 em, JetBrains Mono's 0.550. So each text size of a
matched chart is the chart style's own times its own font's x-height over the card's: the
body sizes (text, captions, container names) by the body fonts at the ingredient weights, the
title and subtitle by the title fonts at the title weights, to two places. Flow in Folio sets
its 14 as 17.11, in Mise as 15.4, in Countertop as 13.86. The x-heights are read from the
cached TrueType files with the widths (`etna fonts metrics`). A font without metrics, or the
chart style's own family, leaves the sizes as they are. The values: [Match the
card](../themes/README.md#match-the-card); the mapping is `tools/src/dag/card-type.ts`.

## Limits

- **Weights.** The cache holds each font as TrueType at a few weights only (the card fonts at
  400, 700 and the title's weight). A chart weight in between is measured and printed at the
  nearest one there is, the heavier on a tie; with Match the card the chart's text weights are
  moved to those weights, so the screen draws the same face as the PDF. Quicksand is cached as
  WOFF2 at 300 only (Binder's title): drawn on screen at 400 or 700 it would be a synthetic
  face. No bundled card asks for that.
- **No italics** in a chart.
- **Missing characters.** Some fonts lack ⅓, ⅔ or ⅛ (JetBrains Mono, Nunito Sans; Figtree and
  Quicksand lack ⅓ and ⅔). The PDF sets them in Arimo, held to the measured width; on screen
  the browser falls back to whatever font it finds.
- **New fonts.** After fetching a font (`etna fonts`), run `etna fonts metrics` and commit the
  generated `tools/src/dag/font-metrics.ts` (widths and x-heights); a test keeps it in step with the cache.
- **Sizes.** The x-height sets the size, not the width: a chart in Galley's condensed face is
  narrower than Flow, one in Countertop's Merriweather wider. A PDF scales the chart to fit
  the sheet, so a matched chart that grows is scaled down a little; its text still prints
  larger than the chart style's own (Flow's beef stew: 8.0 pt in JetBrains Mono, 9.9 pt in
  Folio's Spectral).