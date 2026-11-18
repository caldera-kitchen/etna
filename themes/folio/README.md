# Folio

A classic serif cookbook page: display matter on the center axis, text flush left on a
moderate measure, hanging figures on numbered steps. In a
structured recipe each step names itself in small capitals, lists what goes in, then says
what to do — ingredients set where they are used.

```sh
etna card path/to/recipe --theme folio --pdf --out card.pdf
```

Structured recipes use the `paired` layout, and a traditional recipe
made of parts prints them `paired` too (`options.parts`): each part a section under its
centered italic name, its ingredients then its numbered steps, as a component prints
(`--parts sections` for the classic list-then-method page).

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** the calmest page of the set, and the one that looks most like a book. Traditional
  recipes — a list, numbered paragraphs, notes — are what it was drawn for. Light on ink.
- **Good:** units spelled out in italic (`1 ½ tablespoons`), so the quantity, the unit and the
  item separate by style as well as by column.
- **Bad:** arm's length. Small capitals and italics are the labels, and they are small; this
  is a page to read at the table, not from across the counter.
- **Bad:** long structured recipes. Steps stack in one column, so the cinnamon rolls take
  two pages.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [Spectral](https://fonts.google.com/specimen/Spectral) | 400, 700, italic 400 | 6 |
| Small-capital labels | [Spectral SC](https://fonts.google.com/specimen/Spectral+SC) | 400 | 2 |

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default serif.

**Small capitals are real.** Google removes the small-cap features from its fonts, so
`font-variant-caps` would only shrink capitals. Folio sets its small-capital labels (step
names, ingredient groups, part and section titles, notes) in Spectral SC instead, a font whose
lower case is drawn as small capitals, and sets them lower case (`--folio-small-caps` in
`card.css`). Spectral SC is also named in the body stack so the theme declares it; it has
Spectral's glyphs, so it never stands in for Spectral. Without the cache those labels fall
back to Spectral or the default serif and print in lower case.

**No old-style figures.** The theme asks for them in the prose (`oldstyle-nums`), but
Google's build of Spectral does not have them, so the figures are lining throughout.

Page counts: cinnamon rolls 2, wedding soup 1, malted chocolate 1.
