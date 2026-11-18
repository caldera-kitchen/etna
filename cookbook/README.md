# Etna recipes

Real recipes in [Etna](../README.md)'s format, and one recipe that explains the format. Every
recipe here is a lesson. Open them in order and look at each one three ways: the `recipe.md`
file, the card (`etna card`) and the flow chart (`etna dag`). The rules are in
[SPEC.md](../SPEC.md); advice on writing a recipe is in
[docs/authoring-guide.md](../docs/authoring-guide.md). Each recipe's `source` line indicates
recipe origins, and every recipe passes `etna lint` with no finding.

## Start with these

Four of the dishes, to look at first:

- [Potato Soup](potato-soup/) — Potato soup with each ingredient listed under the step where it goes in.
- [Malted Chocolate](malted-chocolate/) — An ice cream made in seven steps, one after another, with no parts at all.
- [Easter Bread](easter-bread/) — A braided bread: a Choose between two mixers, a Checkpoint and an optional frosting.
- [Italian Wedding Soup](italian-wedding-soup/) — Four components, one of them optional, brought together in a fifth that serves the soup.

## The lessons

1. [Potato Soup (Traditional Form)](potato-soup-traditional-form/recipe.md) — A recipe as most cookbooks print it: one list of ingredients, then numbered directions.
2. [Potato Soup](potato-soup/recipe.md) — The same soup structured: each ingredient under the step where it goes in, and the white sauce a component linked into the soup.
3. [Malted Chocolate](malted-chocolate/recipe.md) — Seven steps one after another, with no components; its marks give the speed, the time and when to stop.
4. [Pistachio in the style of Van Leeuwen](pistachio-in-the-style-of-van-leeuwen/recipe.md) — Five steps in a row; the chart sets "in the style of Van Leeuwen" under the title.
5. [Frosty Chocolate](frosty-chocolate/recipe.md) — One small component, the cacao bloom, linked into the base, and steps named by what they wait for.
6. [Boiled Eggs](boiled-eggs/recipe.md) — Two choices in one recipe: how long to boil, then how to finish.
7. [Deviled Eggs](deviled-eggs/recipe.md) — Another recipe as an ingredient, the Boiled Eggs, and a labeled Storage note.
8. [Navy Bean Soup (Traditional Form)](navy-bean-soup-traditional-form/recipe.md) — Step names in the directions, the names the structured form gives its steps.
9. [Navy Bean Soup](navy-bean-soup/recipe.md) — Beans brined the night before, in a component whose heading says when, and an ingredient that names its alternatives.
10. [Nana Palumbo's Meatloaf (Traditional Form)](nana-palumbos-meatloaf-traditional-form/recipe.md) — A traditional recipe in parts, with the tomato sauce listed in two of them.
11. [Nana Palumbo's Meatloaf](nana-palumbos-meatloaf/recipe.md) — A sauce mixed while the loaf bakes: two components, and a third, *Finish*, that brings them together.
12. [Next-Day Soft Cinnamon Rolls](next-day-soft-cinnamon-rolls/recipe.md) — A dough with two components inside it, an amount on a link (104 g of the mashed potato), and steps after the components.
13. [Easter Bread (Traditional Form)](easter-bread-traditional-form/recipe.md) — Two ways to knead, written as two named directions, one after the other.
14. [Easter Bread](easter-bread/recipe.md) — A Choose between two mixers, a Checkpoint under *Bake*, an optional frosting and a labeled Storage note.
15. [Italian Wedding Soup (Traditional Form)](italian-wedding-soup-traditional-form/recipe.md) — The traditional example SPEC §4.1 quotes: four parts, and *Serve* with directions only.
16. [Italian Wedding Soup](italian-wedding-soup/recipe.md) — Four components, one of them optional, brought together in a fifth that serves the soup.
17. [Chili with Short Ribs](chili-with-short-ribs/recipe.md) — Beef and beans pressure cooked as two components in a group; the beef is linked twice, and a link takes 30 oz of the beans.
18. [An Etna Recipe](an-etna-recipe/recipe.md) — The format written as a recipe: its components are the parts of the file, its steps are how you write one.

## What to know first

- **Ingredients enter at the step that uses them.** Each step lists what goes in there, and
  the chart draws that list as the step's input. Potato Soup; SPEC §4 to §6.
- **Components, and links between them.** A heading with steps under it is a component,
  something made apart; a link line such as `- [white sauce](#white-sauce)` brings it in where
  it is used. Potato Soup and Nana Palumbo's Meatloaf; Deviled Eggs links another recipe.
  SPEC §4, §6, §7.
- **Two forms, and a check between them.** A recipe may stay traditional: it has a card and no
  chart. `etna restructure check` shows that a structured copy kept every ingredient line and
  every sentence of it. Five dishes come in both forms, and each pair passes. SPEC §4.1.
- **Marks.** Words of a step's instruction between single asterisks are what its chart box
  shows under the heading; the card prints them plain. Malted Chocolate. SPEC §5.3.
- **Choose.** `> **Choose**` under a component makes its headings alternatives: the cook makes
  one. Easter Bread; Boiled Eggs has two. SPEC §5.2.
- **Optional things.** An ingredient says so in its remark, `- Romano Cheese — optional, to
  taste`; a whole component says so on its heading, `## Frosting — optional`. Italian Wedding
  Soup, Easter Bread. SPEC §6.

## Where each feature is

| Feature | Recipe | SPEC |
|---------|--------|------|
| Traditional form: one list, numbered directions | Potato Soup (Traditional Form) | §4.1 |
| A traditional recipe in parts | the meatloaf, Easter Bread and wedding soup twins | §4.1 |
| Step names in traditional directions | Navy Bean Soup (Traditional Form) | §4.1 |
| Steps one after another, with no components | Malted Chocolate, Pistachio | §4 |
| Components; a link to a component | Potato Soup, Frosty Chocolate, Navy Bean Soup, the meatloaf, Cinnamon Rolls, Easter Bread, Italian Wedding Soup, Chili with Short Ribs | §4, §6, §7 |
| A component inside a component | Potato Soup, Cinnamon Rolls, Easter Bread | §4 |
| A group: a heading that holds only components | Chili with Short Ribs (`## Pressure Cooker`) | §7 |
| A component linked at two steps | Chili with Short Ribs (the beef) | §6, §7 |
| A step set apart before the components | An Etna Recipe | §4, §7 |
| Steps after the components | Cinnamon Rolls, An Etna Recipe | §7 |
| An amount on a link; the chart's "makes" caption | Cinnamon Rolls, Chili with Short Ribs; Cinnamon Rolls | §6 |
| A link to a single step | Italian Wedding Soup | §6 |
| A link to another recipe | Deviled Eggs | §6 |
| The same ingredient at two steps | Malted Chocolate, the meatloaf | §6 |
| A remark after an em dash; a use in place of an amount | Navy Bean Soup, Easter Bread, Cinnamon Rolls, Chili with Short Ribs | §6 |
| An alternative ingredient | Navy Bean Soup | §6 |
| An optional ingredient, to taste | Italian Wedding Soup (the Romano) | §6 |
| An optional component | Easter Bread, Italian Wedding Soup | §6 |
| A "when" on a component heading | Navy Bean Soup (`## Beans — the night before`), Chili with Short Ribs | §4.1 |
| `Choose`; two choices in one recipe | Easter Bread, An Etna Recipe; Boiled Eggs | §5.2 |
| `Checkpoint` in a dish | Easter Bread | §5.1 |
| Asides: Note, Warning, Variation | An Etna Recipe | §5.1 |
| Marks | every dish but Deviled Eggs | §5.3 |
| Notes; a labeled note | Navy Bean Soup, Boiled Eggs, Deviled Eggs, the meatloaf, Easter Bread, Italian Wedding Soup, An Etna Recipe; Easter Bread, Deviled Eggs | §4.2 |
| Frontmatter: `source`, `license`; `yield`; `extra` | all; Cinnamon Rolls, Italian Wedding Soup, An Etna Recipe; Potato Soup, Navy Bean Soup, the meatloaf, Easter Bread, An Etna Recipe | §3 |
| Weights in grams; US measures | Malted Chocolate, Navy Bean Soup, Cinnamon Rolls, Easter Bread; Potato Soup, the meatloaf, Italian Wedding Soup, Chili with Short Ribs | §6 |

## Using it

From the `tools` folder of this repository, serve the recipes and open the address it prints:

```bash
node bin/etna.js serve ../cookbook
```

Or look at one lesson from the command line:

```bash
node bin/etna.js card ../cookbook/potato-soup --out potato-soup.html
node bin/etna.js dag ../cookbook/potato-soup --out potato-soup.svg
```

The test suite checks every recipe here with the linter, the formatter, the cards and the
charts, so the lessons cannot fall behind the format.

## License

The recipes and this README are released under
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
(CC BY-SA 4.0). Each recipe also says so in its frontmatter.
