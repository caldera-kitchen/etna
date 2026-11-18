# Countertop

Large type, to cook from where you are standing rather than from where the page is lying:
14 pt text, bold quantities, a large figure on every numbered step and a full line of air
between steps. It spends paper to do it.

```sh
etna card path/to/recipe --theme countertop --pdf --out card.pdf
```

Structured recipes use the `paired` layout. `font-size` is the whole
point of the theme; lower it to trade distance for paper.

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** legibility at a distance. Quantities are the
  boldest thing in an ingredient line; step figures can be found again after looking away.
- **Good:** short recipes. Large type fills the sheet, so a nine-ingredient soup looks like a
  page rather than a paragraph.
- **Bad:** paper. The cinnamon rolls take four pages.
- **Bad:** the heaviest ink of the set (bold quantities and headings), though still only type
  and three rules.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [Merriweather](https://fonts.google.com/specimen/Merriweather) | 400–700 and italic 400–700 (one variable file each) | 4 |

The title is set at 500 and labels in bold; a component inside a component is bold italic,
which is why the italic range runs to 700 too. Merriweather's files carry its width and
optical-size axes as well, so they are the heaviest of the bundled themes' (343 KB).

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default serif.

Merriweather was drawn for screens at small sizes: open, with a large x-height, which reads
well at arm's length. Page counts: cinnamon rolls 4, wedding soup 1, malted chocolate 1.
