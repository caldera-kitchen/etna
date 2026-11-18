# Preparing a recipe for its chart

One page to read before you structure a recipe for a flow chart. It goes in the order you
work. Every example is from the recipes in `cookbook/`, quoted as they are marked: every dish
there but Deviled Eggs carries marks. The rules behind this page are SPEC §5 and §8; the
authoring guide (`authoring-guide.md`) covers the rest of the format.

## 1. One main action per step, and a heading that names it

The chart draws each step as a box, and the box starts with the step's heading. So a heading
is the step's action in a few words, and a step holds one main action. Malted Chocolate's
steps:

```markdown
## Blend the base
## Add the chocolate
## Add the cream
## Chill
## Churn
## Fold in the Whoppers
## Freeze
```

Small actions that belong to the main one stay in it ("drop in the chunks", "then return to
high"). When a step turns into two things the cook does at different times, it is two steps.

## 2. Ingredients at the step where they enter

List each ingredient under the step that first uses it, not in one list at the top. The chart
draws them as the step's input.

```markdown
## Add the chocolate

- 115 g dark chocolate

*Reduce the speed*, drop in the chunks of dark chocolate, then *return to high* and blend *until the mixture reaches 170°F*.
```

## 3. Mark the few words the box should add

Words in the instruction written between asterisks are **marks**. The box shows the heading,
then each mark on a line of its own, as written. Mark what the cook needs at a glance (each
of these is a run of words from a recipe in `cookbook/`):

- the **tool**: `*in a Vitamix*`, `*dough hook*`, `*place in a 2qt baking dish*`
- the **setting**: `*on high*`, `*medium-low*`, `*speed 4 for 4 minutes*`
- the **time**: `*for 5 minutes*`, `*15-25 minutes*`, `*about 90 minutes*`
- the **temperature, with its word**: `*at 78°F*` (a temperature to set),
  `*to 190°F internal*` (one the bread reaches)
- **when to stop**: `*until the mixture reaches 170°F*`

Malted Chocolate's first instruction, as it is marked:

```markdown
## Blend the base

Blend *on high* *in a Vitamix* *for 5 minutes*.
```

The box reads: Blend the base / on high / in a Vitamix / for 5 minutes.

Do not mark:

- **what the heading already says.** Under "Blend the base", "Blend" is not marked.
- **whole sentences.** A mark is a few words. "Chill until cold." under "Chill" is marked
  not at all: the box says "Chill".

Keep a comma or a full stop outside the asterisks; inside, it shows in the box.

## 4. A mark must stand alone

A mark is read without the sentence around it, on the chart and by `etna marks`. Mark enough
words for it to make sense alone.

- In Easter Bread's *Final rise*, the oven is preheated in passing: "While the loaf rises,
  *preheat oven to 275°F* with a rack one level up from the bottom." Marked whole, as it is,
  `*preheat oven to 275°F*` reads right; `*275°F*` alone would read as the heat of the rise.
- A temperature needs the word that says what it is. `Let dough rise *at 78°F*` is a
  temperature to set. In "blend until the mixture reaches *170°F*" the mark is a bare
  number: the box shows "170°F" and nothing says it is the end point.
  `blend *until the mixture reaches 170°F*`, as Malted Chocolate is marked, says it.

## 5. Conditions, checks and advice stay in the prose, or go in a callout

A box says what to do. What to watch for, what to do if something goes wrong, and why, stay
in the instruction unmarked, or go in a callout under the step, as in Easter Bread:

```markdown
### Bake

Bake *at 275°F* for *50-70 minutes* *to 190°F internal* temperature. Rotate after 25 minutes.

> **Checkpoint** — Monitor the bread through baking and lightly tent with foil if it starts to brown too early.
```

## 6. Keep a box to five lines

Five lines is the most any box has in the hand-drawn charts Etna's chart follows. A longer box is drawn as
marked, and `etna lint` warns (`chart-box-long`). The heading wraps
at about 24 characters, and so does each mark. Easter Bread's "Knead in a spiral mixer"
is a place to choose: marked `*Speed 2 for 4 minutes*`, `*30 minute rest*` and
`*Speed 6 for 6-8 minutes*`, as it is, its box takes four lines; marking
`*when the dough reaches 85°F*` as well would make it six. Marking fewer words is the fix.

## 7. Check it

`etna marks <recipe>` shows each step's box without drawing it: the heading, each mark with
the kind of thing it says, the lines the box takes, and a summary. For Malted Chocolate, the
first lines read:

```text
  Blend the base  (line 9; 4 lines)
    on high                          setting "high"
    in a Vitamix                     tool "Vitamix" (machine)
    for 5 minutes                    duration "5 minutes"
  Add the chocolate  (line 21; 5 lines)
    Reduce the speed                 action "Reduce"
    return to high                   action "return", setting "high"
    until the mixture reaches 170°F  temperature "170°F" (to reach)
```

A mark shown as "untyped" is fine; it is drawn as always. A temperature whose "role is
unknown" is one to look at: add the word that says set or reach to the mark. A tool or a word
the tools do not know is added to `registries/` (SPEC §11), never worked around in the recipe.

Then `etna lint <recipe>` checks the rest: long boxes, a stray asterisk, and the format.
