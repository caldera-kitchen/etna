# Ingredient densities

The guide to [`registries/densities.md`](../registries/densities.md): the table Etna's tools
use to turn a volume of a named ingredient into a weight, or back.

## Why weight and volume differ

- **`8 oz` is a weight (227 g); `8 fl oz` is a volume (one cup, 240 ml).** They agree only for
  water, and only roughly: a fluid ounce of water weighs about 1.06 ounces. For syrup, honey,
  oil or flour, reading one as the other gives the wrong amount.
- **A cup of a dry ingredient is not one weight.** Scooped flour is heavier than spooned;
  packed brown sugar is heavier than loose. Each row says how it was measured.
- **Names must be specific.** Two brands of kosher salt differ widely per teaspoon, so a row
  for `salt` cannot stand in for both.

## A row

```markdown
| Ingredient | Fact | Source | Aliases | Liquid | Note |
|---|---|---|---|---|---|
| butter | 8 tbsp = 113 g | package | unsalted butter | | one US stick, 4 oz |
```

| Column | Meaning |
|--------|---------|
| Ingredient | Required. The name as recipes write it, lower case, specific (`unsalted butter`, not `butter`, when that is what was measured). |
| Fact | Required. One fact, as the source states it: a volume (`cup`, `tbsp`, `tsp`, `ml`…), `=`, and what it weighs (`g`, `oz`…). Not a derived number; the tools compute grams per milliliter. |
| Source | Required. One of the allowed sources below. |
| Aliases | Optional. Other names the row covers, separated by `;`. Names match exactly apart from case, spacing and singular/plural, so `unsalted butter` does not use a `butter` row unless listed here. |
| Liquid | Optional. `yes` for a liquid, so that a recipe measuring it in `oz` is flagged (by weight, or fluid ounces?). Empty or `no` otherwise. A line whose note says `by weight` (`4 oz whole milk, by weight`) is the author's answer and is not flagged. |
| Note | Optional. A short phrase: the measuring method (spooned and leveled, packed, sifted…), brand, temperature — anything that changes the number. |

Rules:

- One row per ingredient; no name or alias in two rows.
- Rows in alphabetical order (`etna density list` points out one that is not).
- If two sources disagree, keep the one you trust and say why in the Note; do not average.
- A `|` inside a cell is written `\|`.

## How to add a row

1. Run `etna density check <collection>`: its "Needed" list is what the recipes want most.
2. Find the figure in an allowed source, or measure it.
3. Add the row in alphabetical order, with its Source and, for a measurement, the method in
   the Note.
4. Run `etna density list` to see it as the tools read it.

## Sources

**The water test.** Before a chart is trusted, look up its entry for water. A cup of water
weighs **240 g** by the kitchen convention below (237 g by the exact US customary cup), about
8.4 oz. A chart that says a cup of water weighs 8 oz, or 227 g, has read *8 fluid ounces* as
*8 ounces of weight*, and its figures for every liquid are suspect.

| Source | Write | Verdict | Why |
|--------|-------|---------|-----|
| House value | `house` | Use | The figure this collection's cook works to. Method in the Note. |
| Your own measurement | `measured` and the date | Use | Method in the Note. |
| Package label | `package` | Use | What the wrapper or label states. |
| Definition | `definition` | Use | True by definition (water: 1 g per ml). |
| USDA FoodData Central | `USDA FoodData Central`, the food's name, the date consulted | Use | Measured portion weights, public domain. |
| King Arthur Baking ingredient weight chart | — | **Do not use** | Fails the water test. Consulted 2026-11-05: it lists water, fresh milk, buttermilk and cream each as 1 cup = 8 oz = 227 g. |

Add a row to this table whenever a new source is considered, passed or failed.

## Units

Etna uses the **kitchen convention** for volume — the round metric values of the US
food-labeling ("legal") cup — so the arithmetic is exact and easy to check: a teaspoon of
water is 5 g, a tablespoon 15 g, a cup 240 g.

| Unit | Kitchen convention | US customary, for reference |
|------|--------------------|-----------------------------|
| 1 teaspoon (tsp) | **5 ml** | 4.93 ml |
| 1 tablespoon (tbsp) | 3 tsp = **15 ml** | 14.79 ml |
| 1 fluid ounce (fl oz) | 2 tbsp = **30 ml** | 29.57 ml |
| 1 cup | 16 tbsp = 8 fl oz = **240 ml** | 236.59 ml |
| 1 pint | 2 cups = **480 ml** | 473.18 ml |
| 1 quart | 4 cups = **960 ml** | 946.35 ml |
| 1 gallon | 16 cups = **3840 ml** | 3785.41 ml |

The two differ by 1.4%, far less than one person's cup of flour differs from another's.
Weights are exact: 1 oz = 28.349523125 g, 1 lb = 16 oz = 453.59237 g.

## A collection's own file

A collection may keep a `densities.md` at its root with its own `## Reference densities`
table, in the same columns. Its rows replace default rows covering the same name (by
ingredient or alias); the rest of the default still applies. `etna density check --write`
keeps a generated "Wanted" section in that file, never in the registry.

## How the tools use it

- **`etna list`** (and the GUI's shopping list) — when one ingredient is listed by weight and
  by volume (`3 tbsp + 170 g butter`), it is totaled by weight through its row and marked as
  converted (`≈ 212 g butter (3 tbsp + 170 g)`). Without a row the amounts stay side by side
  and the list names the ingredient with no density.
- **`etna density check <collection>`** — what the table needs: ingredients with no row that a
  recipe lists both ways; names a row probably covers (candidates for its Aliases); lines that
  state an amount both ways and disagree with the row; `oz` lines for rows marked Liquid; and
  water stated at less than 233 g per cup.
- **`etna density list [<collection>]`** — the rows as the tools read them, with grams per cup
  and per tablespoon, and any row that cannot be used.

Not built yet: rewriting a recipe's volumes as weights.
