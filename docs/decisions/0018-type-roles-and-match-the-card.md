# 0018 — Type roles; charts measure from the fonts and can match a card

Status: Accepted

> Decided 2026-11-10. The roles are stated in
> [`docs/type-roles.md`](../type-roles.md). Follows [ADR 0017](0017-one-color-vocabulary.md),
> which did the same for color.

## Question

Color had one vocabulary; type had none. A card style named a body and a title font, a chart
style named its own two, and nothing related them: a Folio card was set in Spectral and a Flow
chart of the same recipe in JetBrains Mono. A chart could not simply borrow a card's font,
because chart text was not measured from fonts at all: the layout is pure and identical in
Node and the browser, and took its widths from one approximate table for sans and one for
serif. One card title weight was even found by reading it out of the stylesheet.

## Decision

- **Two type roles, `title` and `body`.** A card style states a font stack for each and the
  title's weight in its manifest; the renderer writes them as custom properties and the
  stylesheet reads them. Nothing reads type out of a stylesheet.
- **Charts measure from the fonts themselves.** A generated module holds the advance of every
  character for each bundled font, made from the cached TrueType files (`etna fonts metrics`)
  and checked against them by a test. When the first family of a stack has metrics the layout
  uses them; `text-measure` is the fallback for a font without. The layout stays pure: no font
  is read at render time.
- **Match the card.** A chart style that says `fonts: card` may be drawn with a card style's
  title font and weight for its title and that card's body font for everything else. Shapes,
  spacing and colors stay the chart style's. The nominal character used for wrapping
  comes from the font's own widths.
- **The choice is the reader's, and has three values.** Follow the active card style (the
  default), keep the chart style's own, or name a card style, which pins the chart to that
  style's fonts. A Font menu beside Style on the chart, and the same entries in Settings.
- **A chart style decides whether its fonts may change, in its theme.** `fonts: own` keeps
  them and disables the menu; no style is named in code. Flow, Dense and Ink say `card`;
  Station, whose typeface is its look, says `own`.
- **On the command line a chart keeps its own fonts** unless `--card` names a card style, as
  with colors.

## Consequences

- With no card named, every chart style draws exactly as before; Flow is byte-identical, and
  Ink, Dense and Station set a few percent narrower than under the old widest-of-five tables.
- The card fonts are cached as static TrueType beside the chart fonts (about 3.4 MB), so a PDF
  embeds whichever fonts the chart is drawn in. In the app they load only when a chart needs
  them.
- Limits, stated in the type roles page: weights only as cached, no italics, a few fraction
  glyphs that fall back on screen, and a card style from a source repository is matched only
  if its fonts are cached.
- A matched chart sets its ingredients in the body font's regular weight, as cards do, and
  scales its text so the card font's lower-case height equals the chart style's own font at
  its own size. Operations keep the
  chart style's weight; shapes, spacing and colors stay the chart style's.
