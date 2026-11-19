# Grid

A Swiss sheet: one heavy rule at the head of every page and one vertical axis. Names live in
a label column to the left of the axis — *Ingredients*, *Method*, a step's name — and
everything you read or measure hangs from the axis.

```sh
etna card path/to/recipe --theme grid --pdf --out card.pdf
```

Structured recipes use the `paired` layout. Its section labels are
*Ingredients*, *Method* and *Notes* (`labels:` in `theme.yaml`). `--grid-label` at the top
of `card.css` sets the width of the label column. The recipe's picture is a third column of the
heading's row, 1.5 in square (`--grid-picture`), its right edge on the text's; 1.1 in on half
letter, none on an index card.

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## Good at, bad at

- **Good:** finding your place. The label column is an index of the page: run a finger down
  it to "Add butter" and read across. Numbered steps put their number in the quantity column,
  so figures share one edge down the whole sheet.
- **Good:** metadata. Yield, source and version stack in the label column beside the title
  and cost no vertical space.
- **Bad:** the label column takes a fifth of the width from every line, used or not.
- **Bad:** it is the coolest, most "document" looking of the set; and a grotesque's `1`, `l`
  and `I` are close cousins.

## Fonts

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [Inter](https://fonts.google.com/specimen/Inter) | 400–700 (one variable file), italic 400 | 4 |

Grid uses 400, 500 and bold; the italic is for emphasis in a recipe's text.

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default sans-serif.

Tabular figures are only turned on in the quantity and step-number columns: with them on
everywhere, Inter also spaces out its hyphens ("Next - Day"). Page counts: cinnamon rolls 2,
wedding soup 1, malted chocolate 1.
