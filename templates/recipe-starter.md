<!--
  ETNA RECIPE STARTER (format v1)
  Paste this whole file into a chat as context, then ask it to draft your recipe
  in the Etna format described below. This file is self-contained.
-->

# How to write an Etna recipe

Etna is a plain-Markdown recipe format. One core idea drives it:

> **Ingredients are introduced at the step where they're used** — there is no separate
> master ingredient list. From that structure, both a traditional recipe card and a
> step-by-step graph can be derived.

## Rules (brief)

- **Frontmatter**: a YAML block at the top. `etna: 1` is the only required key. Optional:
  `source`, `yield` (free text like "12 rolls"), `license`, `version`. Do **not** put
  personal data (favorites, ratings, to-try) here — those aren't part of the recipe.
- **Title**: a single top-level `# H1`, plain text, right after the frontmatter.
- **A step** = a short heading saying what you're doing + the ingredients that enter at
  that step + at least one line of instruction prose. Every step needs an instruction
  (a bare ingredient list is not a step).
- **Ingredient lines**: `- <quantity> <unit> <item>`, with prep notes after a comma —
  e.g. `- 150 g russet potato, peeled and small-diced`. No amount is fine for a staple,
  with what it is for after an em dash: `- salt — to taste`, `- flour — for dusting`.
- **Components** — when a recipe has parts made separately that come together (a meatloaf
  and its sauce; a bread and its frosting), give each part its own `## Component` heading
  with its steps underneath, and a final `##` step (or a last component, as in the example
  below) that pulls them together by **linking** to each part's output. A link is an
  ingredient that points at another part: `- [sauce mixture](#sauce-mixture)`. (Simple linear recipes need no components — just list
  the steps as `##` headings.)
- **Another recipe as an ingredient**: link to its folder — `- 1 recipe [Boiled Eggs](../boiled-eggs/) — hard boiled, refrigerated`
  (`cookbook/deviled-eggs`).
- **Marks** — in a step's instruction, words written in `*asterisks*` show in that step's
  box on the flow chart, under the heading: `simmer on *medium-low* another *15-25 minutes*`.
  Optional; mark a few words that say how or when to stop, never more than fit five short
  lines. A card prints them plain; write `**bold**` for stress on the card.
- **Checkpoint** — a "check, and fix if needed" note. Put it as a callout right after the
  instruction, not buried in prose:
  `> **Checkpoint** — if an ingredient goes in at two steps, list it at both, each with the amount that step takes.`
- **Notes** — anything about the recipe as a whole (storage, variations, where it came
  from) goes in one `## Notes` section at the very end. It takes any Markdown; one `- ` list
  item per note is the usual shape. No ingredients, no steps. A note may open with a bold name: `- **Storage** — keeps three
  days.` It must be the last `##` heading; a `## Notes` anywhere else is an error. Cards
  print the notes only when asked. A note about one step stays in that step as a callout,
  with whatever label fits: `> **Note** — …`, `> **Tip** — …`, `> **Make ahead** — …`.

## Markdown formatting

Etna recipes are plain Markdown. The rules above are about *structure*; formatting is a
separate, cosmetic layer (`etna fmt --check` reports it, and `etna fmt` applies it
automatically). A formatting slip never makes a recipe invalid — it just wants a
tidy-up. Conventions:

- One blank line between blocks: around every heading, including a heading followed by its
  ingredients. No blank line between list items; `-` for bullets.
- Units as symbols where they have one (`g`, `tbsp`), fractions as `1 1/2`, ranges as `2-3`,
  temperatures as `350°F`.
- Keep heading text unique within a recipe — internal links resolve by the heading's anchor,
  so two identical headings would make `[name](#anchor)` ambiguous.
- Long instruction lines are fine; lines are never wrapped.

The full list is SPEC §13, "Canonical source style".

## Template (copy and fill in)

```markdown
---
etna: 1
source:            # optional — who it's from
yield:             # optional — e.g. "12 rolls", "1 quart"
license:           # optional — e.g. CC BY-SA 4.0
---

# Recipe Title

## First step

- 100 g some ingredient
- 1 tbsp another, with a prep note

What to do with them.

## Next step

- 50 g something else

What to do.

## Notes

- Optional — storage, variations, the story behind it.
- One item per note.
```

## Worked example (a multi-part recipe)

Nana Palumbo's Meatloaf, from the recipes that ship with Etna (`cookbook/nana-palumbos-meatloaf`):

```markdown
---
etna: 1
source: Vincent Lucarelli; from a family newspaper clipping of the 1960s
license: CC BY-SA 4.0
extra:
  servings: 8
---

# Nana Palumbo's Meatloaf

## Meatloaf

### Mix the meatloaf

- 1 1/2 lb meatloaf mix
- 1 large egg
- 1 cup bread crumbs
- 1 medium yellow onion, finely diced
- 4 oz fresh mushrooms, diced
- 1 1/4 tsp salt
- 1/4 tsp pepper
- 4 oz tomato sauce, from 8 oz can

*Preheat oven to 350°F* with the oven rack in the middle. Combine ground meat, egg, bread crumbs, onion, mushroom, salt, pepper and 4 ounces tomato sauce in large bowl. Using your hands, break up the ground meat and work the mixture to evenly distribute all the ingredients.

### Form the loaf

Form mixture into a loaf and *place in a 2qt baking dish* with sides, such as a Pyrex 8-inch square dish.

### Bake 45 minutes

Bake the meatloaf for 45 minutes.

## Sauce mixture

### Combine the sauce

- 4 oz tomato sauce, from 8 oz can
- 1 cup water
- 2 tbsp white vinegar
- 2 tbsp yellow mustard
- 2 tbsp brown sugar

While it is baking, combine remaining tomato sauce with water, vinegar, mustard, and brown sugar. Stir well. Note that the mustard will not fully break up and will leave little yellow dots in the sauce.

## Finish

### Pour sauce over meatloaf

- [meatloaf](#meatloaf)
- [sauce mixture](#sauce-mixture)

After the first 45 minutes, carefully pour the sauce mixture over the meatloaf and return to the oven for *another 45 minutes*.

## Notes

- Meatloaf mix is a combination of ground beef, ground veal, and ground pork.  If you cannot find meatloaf mix, combine one pound of 90/10 ground beef with half-a-pound ground pork.
```
