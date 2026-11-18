# Authoring an Etna recipe

> Starter outline. This guide teaches by example and links to `../SPEC.md` for the
> normative details — it never restates the rules.

A motivated, technically-minded recipe writer should be able to produce an Etna recipe by
hand. This guide walks from the simplest recipe to a multi-component one, using the recipes
that ship with Etna, in `../cookbook/`. For the format one piece at a time, with a recipe for
each, start with the lessons in [`../cookbook/`](../cookbook/README.md).

## 1. The smallest recipe

A frontmatter block (`etna: 1`), the title as a top-level `# H1`, then steps. Ingredients go **under the step where they enter**.
See [`cookbook/malted-chocolate`](../cookbook/malted-chocolate/recipe.md).

## 2. Steps

Each step is a short descriptive heading, the ingredients entering there, then a line
telling the cook what to do. A step always has an instruction — a bare ingredient list is
not a recipe. (Spec §5.)

## 2a. Marks: what a step's box on the chart says

The chart draws each step as a box with its heading. To put more in the box (the tool, the
setting, when to stop), mark those words in the instruction with asterisks:

```markdown
### Add the white sauce

- [white sauce](#white-sauce)

After the potatoes have boiled 15 minutes, add the white sauce and simmer on *medium-low*
another *15-25 minutes* *until potatoes are tender*.
```

The box then reads "Add the white sauce", "medium-low", "15-25 minutes", "until potatoes are
tender", one mark to a line, in the order written. Marks are optional; a step with none shows its heading alone.

- Mark few words: a box of more than five lines is drawn as marked, and `etna lint` warns.
- A mark is read alone, so mark enough to stand alone: in a step that oils the pans, mark
  *Preheat the oven to 465°F* whole, not *465°F*.
- Keep a comma or full stop outside the asterisks; inside, it shows in the box.
- Italic is for the chart, bold is for the card: a card prints marked words plain. For stress
  on the card, write bold (`do **not** open the oven`); for words both in the box and bold,
  write `***medium-low***`.

To see each box without drawing it, with the kind of thing each mark says (a time, a
temperature, a setting, a tool, when to stop, an action), run `etna marks <recipe>`. Before
structuring a recipe for its chart, read
[Preparing a recipe for its chart](preparing-a-recipe-for-charts.md).

(Spec §5.3, §8.)

## 3. Ingredients

`- 240 g heavy cream`, or just `- salt` when there's no amount. Notes go after a comma:
`- 150 g russet potato, peeled and small-diced`. (Spec §6.)

## 4. Multi-component recipes

When a recipe has parallel preparations that come together (a meatloaf and its sauce; a
bread and its frosting), give each its own component heading and let a step after them join
them with links. See [`cookbook/nana-palumbos-meatloaf`](../cookbook/nana-palumbos-meatloaf/recipe.md).
(Spec §4, §7.)

## 4a. Preparation steps

A step that touches no ingredient and feeds no other step (preheating the oven, lining a
pan) is yours to place. Written as the first step of the chain, it is an ordinary step and
the chart draws it in the chain. Written as its own `##` before the components, it joins
nothing, and the chart draws it apart, first, under "Before you start". In a recipe with no
components, wrap the chain in one component when you want that separation. (Spec §4
Naming, §7, §8.)

## 5. Using another recipe as an ingredient

Reference it by link: `- [mango chutney](../mango-chutney/)`. (Spec §6, §7.)

## 6. Notes

What the cook should know about the whole recipe — storage, variations, where it came from —
goes in one `## Notes` section at the very end, after the last step: any Markdown, usually
one `- ` item per note, no ingredients, no instruction required. It is not a step and not part of the graph.
A note about one step belongs in that step, as a callout with whatever label fits
(`> **Note** — …`, `> **Tip** — …`, `> **Make ahead** — …`; Spec §5.1). Because
`## Notes` is reserved, a step needs another name. Cards leave the notes out unless you ask
for them (`etna card --notes`). (Spec §4.2, §8.)

## 7. Tidying up

Run `etna fmt` on the recipe: it writes the canonical source style (unit symbols, `1 1/2`,
`2-3`, `350°F`, one blank line between blocks). Then `etna lint` for the rules. (Spec §13,
§9.)
