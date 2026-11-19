# Shopping list

What you need to have, for one recipe: every ingredient once, its amounts totaled across the
steps that use it, and an empty box in front of each to check off with a pen. No directions. It is
the card for the store, and for checking the pantry before you start (SPEC §8).

```sh
etna card path/to/recipe --theme shopping --out list.html
etna card path/to/recipe --theme shopping --pdf --out list.pdf
```

It uses the [`list` layout](../README.md#layouts). Letter page, 14 pt type,
roomy rows with a hairline under each, a generous box. `--shop-box` and `--shop-row` at the
top of `card.css` set the size of the box and the space above and below each item.
The hairlines under the rows are in the card's soft ink, quieter than the text; every other
line is in the ink (the color roles are under
[Custom properties](../README.md#custom-properties)).

How themes work — files, slots, labels, classes, what the renderer already does: see
[`../README.md`](../README.md).

## What it prints

- The recipe title and its yield (`Makes 12 rolls`) under a small "Shopping list" line.
- One row per ingredient, in the order the recipe first uses it. `105 g` of bread flour in one
  step and `595 g` in another print once, as `700 g bread flour`. Notes seen on any of the
  lines follow the name (`unsalted butter, soft; softened`).
- An ingredient written in two units (`1 pinch` and `1.5 g` of kosher salt) keeps both: the
  second under the first, led by `+`. Amounts are only added up in the same unit.
- An ingredient written without an amount (`flour, for dusting`) has empty amount columns.
- Other recipes used as ingredients (`1 recipe Homemade Chicken Stock`, or a link to another
  recipe) come last, in their own group headed "Other recipes". They are not expanded.
- Turn on `options.slots.uses` to print, under each item, the steps that use it.
- No picture: the list is for the store, not the recipe's page.

## Good at, bad at

- **Good:** readable at arm's length in a moving cart; every row the same height, so a long
  list is easy to keep your place in.
- **Bad:** a long recipe (the cinnamon rolls: 21 ingredients) is shrunk to 12.2pt, near its
  smallest size (12pt), to stay on one page on letter; a longer one takes a second page. Rows
  are kept whole.
- **Bad:** `etna card` makes a list for one recipe only. A list for several recipes at once is
  the GUI's Shopping list, printed in this style, or `etna list` (text and Markdown).

## Fonts

The same as [Mise](../mise/README.md#fonts).

| Role | Font | Loaded (`etna fonts`) | Files |
|------|------|-----------------------|-------|
| Text and title | [Figtree](https://fonts.google.com/specimen/Figtree) | 300–700 (one variable file), italic 400 | 4 |

The title is set at 300, the items at 500 and the amounts at 600; "some" is the italic.

Free fonts always: the theme contract's rule, with how fonts are cached, embedded and
licensed, is in [Web fonts](../README.md#web-fonts). Without the cache, or with
`--fonts none`, the card prints in the machine's default sans-serif.
