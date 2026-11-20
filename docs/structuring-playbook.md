# Structuring playbook: traditional to structured, one recipe at a time

This is the procedure for converting one recipe from the **traditional** form (SPEC §4.1:
`## Ingredients`, `## Directions`, `## Notes`) to the **structured** form (SPEC §4–§7: every
step lists the ingredients that enter at it). Only the structured form can be drawn as a
flow chart.

It is written for an agent working alone with three things: this file, `SPEC.md`, and the
recipe. A person can follow it too.

## The one rule

**Restructure the author's words. Never add to them.**

You may move sentences under step headings, move ingredient lines under the steps where they
enter, and write the few new words the structured form needs: step headings, component
headings and link bullets. You may not add, drop or reword an amount, a step, an ingredient
or a sentence. When you are not sure, do not guess: write a flag (see "Flags") and leave the
recipe as close to the original as the form allows.

The checker (`etna restructure check`) proves the conversion kept everything. A conversion
is not done until it passes.

## Settled rules

The sections below apply them.

- **Notes go in `## Notes`, verbatim, one `- ` item each.** The original's notes become the
  structured recipe's Notes section (SPEC §4.2): the last `##` heading, every note word for
  word and in order, each as one list item. Nowhere else: not before the first step, not
  in a step's prose. One exception: a note that belongs to one step may move to that step
  as a callout, word for word. (Sections 7 and 8.)
- **Cut directions at natural stops.** Inside a direction, cut where a new set of
  ingredients enters, the vessel or heat changes, or a wait ends. Never merge two
  directions. (Section 2.)
- **A computed remainder may be written, and is always flagged.** When the recipe states
  the total and the first use (a line `100 g sugar, divided`; "add 40 grams of the sugar"),
  the remainder (60 g) MAY be written at the later step. Whenever it is, flag it as
  computed. (Section 4.)
- **A near-match to another recipe is never linked, only flagged.** A link is made only to a
  recipe whose title matches exactly. (Section 5.)
- **A part's heading keeps the author's wording, timing words included.** `### Day 1 - Dough`
  becomes the component `## Day 1 - Dough`, not `## Dough`. (Section 1.)
- **A suspected mistake in the original is converted as written and flagged.** Never correct
  a quantity, a word or a step, however likely the slip. (What must never change; Flags.)
- **A recipe with no directions stays traditional.** With `_none_` or no `## Directions` there
  are no steps to put ingredients under: do not convert it.
- **Marking is not part of restructuring.** The words a step's instruction marks with
  emphasis are what its chart box shows (SPEC §5.3), and marks are the author's to choose.
  Never add or remove a mark, or turn emphasis into bold or back, unless the author asks;
  emphasis the original has stays as written. The checker compares the directions as plain
  text, so a mark is never a difference it reports (ADR 0021).

## What must never change

- **Every sentence of the directions**, word for word, in the same order within its part.
  Typos, odd spelling and inconsistencies stay. (Potato Soup's "clean and slice the celery"
  stays, even though its list says `4 medium celery stalks, diced`. Flag it.)
- **Every ingredient line**: amount, unit, item and note. `2 tsp Kosher Salt` (Italian
  Wedding Soup) stays capitalized as written. Only `etna fmt` may respell a unit or a fraction.
- **The title** (the `# H1`), every **frontmatter** key (`source`, `yield`, `extra:` and
  everything under it), and every **note**, word for word.
- The only frontmatter change: delete the line `form: traditional`.

## The order of work

1. Read the whole recipe, ingredients, directions and notes, before writing anything. A
   recipe with no directions stays traditional: stop here.
2. Decide the components (below).
3. Cut each part's directions into steps, and name the steps.
4. Put each ingredient line under the step where it enters.
5. Add link bullets where one component's output enters a step of another.
6. Add callouts only where the directions already contain the sentence (rare).
7. Copy the frontmatter (minus `form:`), and the notes into `## Notes` at the end.
8. Run the checks, `etna fmt` first (section 10). Fix what fails.
9. Write the conversion report with its flags, **after** the last `etna fmt`: fmt can move
   lines, and every `recipe.md:N` in the flags must point at the final file.

Keep the original next to you the whole time. In the collection the conversion replaces
`recipe.md` in place; git keeps the original.

## 1. Components

A **component** is a heading with steps under it: a preparation made on its own whose
result is used later (a dough, a sauce, a frosting). A heading with no sub-headings is a
**step**. SPEC §4.

- **Each `###` part becomes a component.** Its heading is the part's name. Its steps are the
  part's directions.
- **When the two sections name a part differently**, use the name from `## Directions` and
  flag it (*Part name differs*). The directions' part is the one whose steps the component
  holds, so its name says what the component makes; this holds whichever name covers more:
  - the ingredient part's name **covers more than the directions' part makes**
    (`### Part A and Part B` beside `### Make Part A`, which makes only Part A; Part B's
    lines go into a step of another part): `## Make Part A`, and the other lines go where
    they enter;
  - the directions' part **covers more** (`### Part A` beside `### Day 1`, which makes
    Part A and then Part B): `## Day 1`; a thing the ingredient part names that the
    directions make apart and bring back by name may be a sub-component inside it (below);
  - the names differ only in small words (`### Part A` beside `### The Part A`): either
    reads the same; still use the directions' wording.
  The checker lists the unused name ("part name … is not used as a heading"); that is
  expected.
- **An ingredient part named "Ingredients"** (`### Ingredients`), or named with a label
  rather than a thing (`### To make the …`, `### For the …`): head the component
  with the noun the directions use for what is made (`## Cake`, `## Filling`), and flag it
  (*Part name differs*).
- **One part that produces two things used separately later** (a *Filling* part whose
  directions make a filling and a glaze): make a sub-component for each only when the
  directions bring each back by name, the filling where it is spread and the glaze where it
  is brushed on.
  Otherwise keep the part's steps flat in one component, and flag.
- **A part named for a time, not a thing** (`### Day 1 - Dough`, `### Day 2`): the
  component heading keeps the author's wording, timing words included (`## Day 1 - Dough`;
  Navy Bean Soup's component is `## Beans — the night before`). Do not shorten it to the thing it
  makes. If it only puts things
  together (`### Day 2`), it is the assembly, under the same rule.
- **A part of one direction** is still a component, with one step. A top-level step would
  join the main chain (SPEC §7, the spine) and the chart would show it feeding the next
  step, which is wrong for a separate preparation.
- **Parts only under `## Ingredients`** (the directions have no `###` parts): name
  components from the ingredient part names only when the directions clearly make those
  parts separately ("Whisk the dry mix… In another bowl…"). Otherwise keep the recipe flat
  and put each line at the step that uses it. Flag the choice either way.
- **A part with ingredients and no directions of its own** (`### Part B` lists two lines,
  but its method sits inside the `### Part A` directions): do not make a component. Put its
  lines under the steps that use them, and flag. When **no direction anywhere** uses its
  lines (a part whose only direction is its own name written as a label, or a part that no
  step brings in), there is nowhere true to put them: do not convert; leave the recipe for
  the author (section 9).
- **A mixture made apart and set aside inside one part** ("Combine yeast, water, and 8
  grams of sugar in a bowl. … Set aside for 15 minutes…", later "Next whisk in the yeast
  mixture.") is a **sub-component** of that part, named with the prose's own noun (Easter
  Bread's `### Yeast mixture`, with its step under it as `####`). Link it where the prose
  brings it back. Do this only when
  the prose names the mixture when it comes back; otherwise leave the steps on the chain.
- **A mixture made apart in a recipe with no parts**, named when it comes back: where it
  is made decides its place. Made in the **middle** of the main chain (Potato Soup's white
  sauce, stirred up between two soup steps), it is a **sub-component** of the component the
  chain sits in, so the chain is not cut in two. Made **before** the chain starts (the dry mix
  whisked first, then the batter), it is a **top-level component**. Either way it is named
  with the directions' noun, and the main chain's component takes the noun of what is
  made (`## Dough`, `## Cake`), not *Assembly*, unless the recipe's own word is assembly.
- **A recipe with no parts usually needs no components.** Write its steps as `##` headings.
  Add components only when the directions themselves make two things separately and join
  them ("While it is baking, combine remaining tomato sauce…", then "carefully pour the
  sauce mixture over the meatloaf"). Name them with the directions' own nouns (Nana
  Palumbo's Meatloaf: `Meatloaf`, `Sauce mixture`) and flag.
  When in doubt, stay flat. A flat recipe still charts; it just shows one chain.
- **A component only when the recipe makes more than one thing** (one exception below,
  *Equipment steps*).
  A recipe that is one chain of steps stays without components, however nameable the thing
  at the end of the chain: Malted Chocolate ("Blend on high in a Vitamix for 5 minutes." …
  "Combine into the base." … "Churn in an ice cream maker until thick.") is one chain, and
  wrapping its first three steps in `## Base` would add a label that says nothing the title
  did not. Frosty Chocolate, which makes a cacao bloom apart and adds it to the base, has
  two components. Components come in when two
  or more things are made (a dough and a filling; a base and a glaze): then each is named
  with the noun from the recipe's own words, the hoisted card groups the ingredients under
  those names, and the chart frames each. Components are nouns (what is made), steps are
  verb phrases (what is done): SPEC §4, Naming.
- **Steps after the last component may stay top-level** when they are the recipe's own
  final steps (bake, serve). The card prints such a step under its own heading, apart from
  the component before it. Wrap them in a component (the assembly, see section 5) only
  when the assembly itself is a thing worth naming.
- **The first directions of the recipe, when they only prepare equipment** (a first
  direction that only preheats the oven), may each
  stand as a top-level step before the components, one step per direction. They
  then join nothing in the chart, which is true: the oven is not an ingredient; the chart
  draws them first, in a dashed outline under the caption "Before you start". Flag once
  (*Equipment steps*). **When such a step takes an ingredient** (grease or flour for a
  pan) it is not preparation: a step with an ingredient
  makes something, here a prepared pan, and the chart would draw it leading nowhere. The
  step that uses the pan takes it as an input, as a link to the equipment step in its
  ingredient list, worded from that step's own prose where it has words for it
  (`- [prepared pan](#prepare-the-pan)` under *Bake*, when its prose speaks of "the
  prepared pan"). Leave the grease listed at the step that uses it; do not move its line
  to the baking step, and do not move the step into a component.
  Anywhere else, a preheat sentence stays in its part. In a **flat**
  recipe (no components) they sit on the main chain as ordinary steps, which is also right.
  **This is the author's choice, not a rule of the chart**: a preheat
  written as a chain's first step is a step; one written before the components stands
  apart. Either shape can be flipped by moving the heading. A converter follows the
  original's shape; an author who wants preparation set apart in a flat recipe may wrap the
  chain in one component for that purpose (`## Preheat`, then one component named for what
  the chain makes), the one case where wrapping a single chain earns its name.
- **Variants sharing one set of directions** (several flavors made on one base): when
  every variant's lines enter at **one** point (the step that adds the flavor), the recipe
  may be converted, with each variant's lines at that step; the
  chart then draws the variants as if all were used, so flag it as a question (*Variants*).
  When a variant's lines could enter at more than one point, or the directions say "if
  applicable", do not convert: leave the recipe for the author (section 9).

The labels on directions (`1. **Bake** — …`) are **step names**: each becomes the heading of
the step that holds that direction (or of the component, when the label names the part the
direction makes: `**Part A** —`). When `etna fmt` could not decide whether labels
are step names or parts ("parts undecided"), treat them as step names, and let the
ingredient parts decide the components as usual. Flag the decision.

## 2. Cutting the directions into steps

A **step** is one or more whole sentences. Cut between sentences, never inside one: a
conversion never cuts inside a sentence. When the author wants a separate step for part of a
sentence, that is an edit to the recipe itself, made in both forms. (Malted Chocolate's last
sentence was edited so: the freezing is a sentence of its own and a step of its own,
*Freeze*, after *Fold in the Whoppers*.)

- **Every direction boundary is a step boundary.** Never merge two directions into one
  step: the numbering is the author's decision. Ten one-line directions stay ten steps. Frosty Chocolate's base is written that way: "Cool to 110°F.",
  "Wait 10 minutes." and "Blend for 15 seconds." are three steps.
- **Inside a direction, cut at natural stops**: where a new set of ingredients enters after
  the previous ones have been worked, where the vessel or heat changes, or after a wait
  ("let rest 30 minutes", "set aside"). Potato Soup's first direction, "Heat a heavy
  bottom soup pan over medium heat. Add the olive oil and onion. While the onion cooks,
  clean and dice the leeks… While the onions and leeks cook, clean and slice the celery.
  Add celery to the pan…", becomes *Cook the onion and leeks* and *Add the celery*: the
  celery is a new set of ingredients.
- **Keep a direction whole** when its sentences are one action ("Strain to separate stock
  from solids. Return stock to the pot and discard solids."), or when cutting would leave a
  step with no ingredients and nothing
  distinct to do. Being short is no reason to keep it whole: where a new set of
  ingredients enters, cut, even in a direction of two or three sentences.
- **Do not chase detail.** A step per sentence makes an unreadable chart. Aim for steps of
  one to four sentences; the Potato Soup conversion has 7 steps from 6 directions.
- **A preheat or pan-prep sentence** stays in the step it opens. If a whole direction is
  only that ("Preheat oven to 350°F with the oven rack in the middle."), it is its own
  step.
- **A `•` between instructions** inside one direction acts as a sentence end. You may cut
  there. Where you cut, drop the `•`; inside a step, keep it as written. The checker
  ignores it either way.
- **To make a Checkpoint** of a test sentence (section 7), the step must end with it: cut
  right before the sentence that follows it.
- **A sentence repeated in the original** (two directions ending the same way) is kept
  twice, each in its own place. Flag it: it may be an editing slip.
- **A direction that begins with its own number** (`1. 1) Do the first thing…`,
  `2. 2) Do the next thing…`): Markdown reads the inner `1)` as a second list, so drop it:
  write `Do the first thing…`. The
  checker accepts this and lists each one ("inner number dropped: \"1)\""); flag it once
  (*Inner number dropped*).
- **A number inside a direction** (`1. Do the first thing. 2. Do the next thing…`) is the
  author's text and stays. You may cut before it; where it then begins a step, escape it,
  `2\. Do the next thing…`, or Markdown makes it a list. The checker fails a dropped one.
  You may cut there only when a full stop ends the text before the number: with none
  ("…for 2 minutes 2. Do the next thing…"), the checker reads both as one
  sentence, so keep them in one step, and flag the missing full stop (*Inconsistency in
  the original*).
- **A plain-text label inside a direction** (`Part A (at 350°F): — Do the first thing…`)
  stays in the prose as written. Only a bold step name (`**Bake** —`) becomes a heading.
- **A direction that is only a yield, a remark or a label** ("Makes 12.", "Part A:"): it
  is still a direction, so it stands alone as its own step, like an equipment step, named
  from its words (*Yield*, *Begin Part A*). Never merge it into the next step, and never
  move it to the frontmatter or the
  notes. Flag it (*Remark as a step*); if it is a label that should have been a `###` part,
  ask. A yield sentence **inside** a longer direction ("…until done. Serves 4.") is not
  cut out: it stays where it is, in its step.
- **Sub-bullets inside a direction** (a direction ending with two mixer methods written as
  an indented list, `- Spiral Mixer - …` / `- KitchenAid - …`): in the structured form a
  bullet inside a step is an ingredient line, so write each item as a paragraph of prose,
  word for word and in order, in the step that holds the direction (drop only the `- `).
  The checker reads the original's list item by item, after the direction it follows.
  If the items are alternatives, flag them (*Alternatives left in the prose*); they are a
  `Choose` only with a separating sentence of their own (section 7).

## 3. Naming steps

The step heading is new text, so keep it plain and take it from the step's own words.
A step heading says what is **done** (a verb phrase: *Cream butter and sugar*); a component
heading says what is **made** (a noun: *Dough*, *Filling*). The card groups hoisted
ingredients under component names only, and the chart prints step headings on its nodes,
so a noun on a step or a verb on a component reads wrong in both (SPEC §4, Naming).

- Use the author's step name when the direction has one (`**Soak** —` gives `### Soak`).
- Otherwise use the main verb of the step's first sentence and its object: *Season and
  cover*, *Add the celery*, *Bake*. One to four words. Sentence case. No
  new facts: no times, temperatures or amounts in a heading that the step does not state.
- Headings must be unique in the whole recipe (links resolve by heading). When two steps
  would share a name, add the object from the sentence: *Bake the crust*, *Bake the
  filling*.
- A heading must not equal its component's heading (`## Pasta` / `### Boil`, not
  `### Pasta`).
- **A heading is not the instruction.** Name the step, do not copy its sentence: *Add the
  water and potatoes*, not "Add the water and increase heat to high." A step whose whole
  instruction is the
  heading word for word (Frosty Chocolate's "Chill" / "Chill.") is printed once by paired
  card themes;
  otherwise the card prints both.

## 4. Placing each ingredient where it enters

Each ingredient line goes under the step whose sentences first **act on it**: add,
combine, stir in, pour, sprinkle, toss, but also grate, cube or melt it. That is where it
enters the recipe; from there the chain carries it on.

- Keep lines in the order of the original list within a step.
- An ingredient used for the bowl or the pan (Easter Bread's `oil — for greasing dough bowl`,
  in "move to lightly oiled bowl") enters at that step.
- The same line listed twice in the original (`4 oz tomato sauce, from 8 oz can` in Nana
  Palumbo's Meatloaf, for the loaf and for the sauce; its traditional form lists it under
  both parts) is two lines: each goes where it enters.
- A line whose item the prose calls by another name (`1 1/2 lb meatloaf mix`, "ground meat")
  is the same ingredient. Leave both words as they are.
- **An ingredient the directions never name**: put it under the step where a word plainly
  covers it ("the dry ingredients", "all ingredients"). Otherwise put it where its kind
  clearly enters, when it has one obvious place: a dry ingredient with the dry mix, a
  topping at the bake, a garnish or anything "to serve" at the last step. Never at a
  preheat or equipment-only step. Flag it either way (*Ingredient not named in the
  directions*). When no step is a true place for it (it would be drawn going into a
  thing it plainly does not go into), do not convert:
  leave the recipe for the author.
- **A bullet under Ingredients that is not an ingredient** (a hint written as a bullet, a
  sub-heading written as a bullet, `- Part A`): it is a mistake in the original. The
  checker counts every bullet as an ingredient line, so keep it as written at the step
  where it belongs best (a hint beside the lines it is about), say so, and flag it
  (*Inconsistency in the original*), asking whether to move it in the original.
- **A bare name listed again** (`flour`, with no amount, at a second step, where the
  original lists `100 g flour` in Part A and `50 g flour` in Part B): the
  checker pairs it with the line of its own part (the original's `###` part against the
  component it became), else with the line listed nearest before it, and says which in
  `check.txt` ("paired by its part"). Read that line and check it is the one meant; when
  neither decides, it is listed for review as *ingredient-ambiguous*. Flag it either way
  (*Bare repeated names*), and say if the pairing is wrong.
- **An ingredient the directions use but the list lacks** (water to cover, oil for frying,
  flour for the board): add no line. Flag it (*Ingredient used but not listed*).
- **Collective words** ("the remaining spices", "all dry ingredients", "the rest of the
  ingredients"): resolve them only when exactly one set of lines fits, that is the lines
  of the part not yet placed that the word describes. Pistachio's "Add the remaining
  ingredients" is the four lines not used before it: sugar, milk, cream and egg yolk. List
  the lines you assigned in a flag. If two readings are possible (is a line used for dusting
  a "dry ingredient", or only for dusting?), choose
  the reading that keeps the line where the directions name it, and flag the question.
- **A part's only step, or a step that takes everything** (Frosty Chocolate's "Combine and
  rest."): every line of that part not placed elsewhere enters at it, and no line needs to
  be named. A part heading may be added over the lines a collective word names when the
  list has none (a heading named with that word, over the lines it names).

### An ingredient used at two or more steps

Split a line only when its portions enter at **different steps**. When both portions are
handled in one step, keep the line whole there, `divided` and all; so the Next-Day Soft
Cinnamon Rolls keep `[cream cheese frosting](#cream-cheese-frosting)` whole at *Frost*,
whose prose says "spread half the frosting to melt it; … then apply the remaining
frosting."

1. **The recipe states every portion**: split the line. "Add 40 grams of the sugar… Add
   the remaining 60 grams…" with `100 g sugar, divided` gives `40 g sugar, divided` and
   `60 g sugar, divided`. Each portion keeps the original
   note exactly as written, the word "divided" included (the checker expects it). The
   portions must sum exactly to the original amount; the checker adds them with exact
   fractions.
2. **The recipe states the total and the first use, not the rest**: the remainder is the
   exact difference, and you MAY write it at the later step. "Add 40 grams of the sugar"
   and "the remaining sugar" from `100 g sugar, divided` gives `40 g` and `60 g`. (Easter
   Bread's prose has this shape, "8 grams of sugar" at *Proof the yeast* and "the remaining
   sugar" at *Whisk the liquids*; its lines state both amounts.) Whenever you write a
   computed remainder, flag it as *Computed portion*. If you
   do not write it, treat the line as in case 3.
3. **No portions stated**, and the line **has an amount**: keep the whole line, with its
   amount, at **one** step, and list the item alone (no amount, same note) at each other
   step it enters. The amount goes at the step that uses the measured quantity: usually
   the first, but `100 g butter, plus extra for the dish` keeps its amount at the step
   that melts or creams the 100 g, and the greasing step lists `butter` alone. Flag it
   (*Ingredient at two steps*): the author may want to state the split. **"Plus more for
   the pans" is a split the line itself states**: the measured line
   keeps its amount and loses the phrase (`- 100 g butter`), and the greasing step lists
   the item with the use as its remark (`- butter — for the pans`). Do not leave
   the phrase on both lines. (Never list such a line without its amount at every step:
   the amount would be lost, and the checker fails it.)
4. **No portions stated**, and the line **has no amount**: list it, as written, at every
   step it enters. Flag it. (Easter Bread's oil is written as two lines, each with its own
   use, `oil — for greasing dough bowl` at *Place dough in bowl* and `oil — for plastic
   wrap` at *Cover the loaf*.)

Never put an amount on a line that had none, and never split an amount the recipe does not
split.

**An amount that mixes units** ("1 cup plus 1 tbsp flour, divided") is not split, even
when the prose states both portions: keep the whole line, with its amount and note, at the
step that uses it first, list the item alone at the later step, and flag it (*Not split*).
*Not split* is also the flag for a line kept whole because all its portions are handled in
one step.

### Amounts that live only in the prose

"Add 2 cups of water" with `water` in the list: the amount stays in the sentence, the line
stays without one. Do not promote it to the line, and do not add a `2 cups water` line.
Flag every amount that appears in the prose but not in the list, and every prose amount
that disagrees with the list ("1 cup flour" in the prose, `150 g flour` in the list).

## 5. Links, groups and the assembly

A **link bullet** says another component's output enters this step:

```markdown
### Pour sauce over meatloaf

- [meatloaf](#meatloaf)
- [sauce mixture](#sauce-mixture)

After the first 45 minutes, carefully pour the sauce mixture over the meatloaf and return to the oven for *another 45 minutes*.
```

(Nana Palumbo's Meatloaf.)

- The link text is the component heading, lower-cased, when the heading names a thing
  (`[sauce mixture](#sauce-mixture)`). When it names a time (`## Day 1`), keep the
  heading's own capitals, `[Day 1](#day-1)`: the card prints the link text as an
  ingredient, and "Day 1 (above)" reads as a section, "day 1 (above)" does not. The anchor
  is the heading's GitHub anchor: lower case, each space to `-`, punctuation other than `-`
  dropped, accents kept. `## Purée` → `#purée`; `## Day 1 - Dough` → `#day-1---dough`
  (three hyphens: space, hyphen, space); `## Frosting — optional` → `#frosting--optional`
  (the em dash dropped, the spaces around it kept: Easter Bread). A component whose heading
  repeats the recipe's title (`# Part A`, `## Part A`) gets `-1`: `[part a](#part-a-1)`.
  `etna lint`
  reports an anchor that does not resolve.
- **A line that names something the recipe itself makes** (`104 g mashed potato`, where
  the recipe's *Mashed potato* component makes it): write that line as the link, with its
  amount and its words, `- 104 g [mashed potato](#mashed-potato)`, as the Next-Day Soft
  Cinnamon Rolls do. Do not keep the text line and add a link beside it (the card would
  list the mashed potato twice). The checker accepts it when amount, unit and
  words are the same, and lists it ("now a link to this recipe's own component"). Flag it
  (*Link made*). Only the recipe's own components can be linked: when the thing is made in
  a step of the chain (`50 g part A`, made in the first step of *Day 1*) and the prose
  brings it back by name, make that step a sub-component named as the ingredient part
  (`### Part A`) and link it; when the recipe does not make it
  at all, keep the text line.
- Put the link at the step whose sentences bring that output in ("carefully pour the
  sauce mixture over the meatloaf"; "Spread the cooled cinnamon goo evenly over the
  dough"). Within a component the steps chain on their own; never
  link a step to the step just before it.
- A **group** (a component whose children are all components) can be linked as a whole:
  the link means the outputs of all its sub-components.
- **The assembly** is where branches meet. Use the original's own part for it when it has
  one (`### Assembly`, `### Day 2`, `### Finish`), keeping its name. When the merge
  happens inside another part's steps (the cinnamon rolls' *Mix* takes the yudane and the
  mashed potato), link there. Only when the joining steps belong to no part (a recipe without
  parts, or labels that are not parts) write them as top-level steps after the components
  (section 1, *Steps after the last component*), and flag.
- **When the original never joins two branches** (a frosting that is made and never
  spread), leave
  them apart: the chart shows two separate graphs. Do not write a joining step. Flag it
  (*No join in the original*).
- **Another recipe as an ingredient** (`1 recipe Another Recipe`): make it a link to that
  recipe's folder, keeping the amount, unit and the text exactly:
  `- 1 recipe [Another Recipe](../another-recipe/)`. Do it only when a recipe with exactly
  that title exists in the collection. Otherwise leave the line as text and flag it.
- A part of another recipe (`100 g Another Recipe, ⅓ of a recipe`) stays as written; flag
  that it could be a link. So does a name that is close but not exact (`1 recipe Another
  Recipe, Revised`, where the collection has *Another Recipe*): a near-match is **never
  linked**, only flagged (*Link possible*).
- A part that copies another recipe of the collection line for line (a crust written out
  in full that is also a recipe of its own) stays as written. Replacing it with a link would
  change the recipe's text; flag it for the author.

## 6. Parallel work

"Meanwhile…", "While the potatoes boil…", "While it is baking…" are the recipe telling you
two things run at once.

- If the parallel work is another part, it is already its own component: nothing to do.
  The chart shows the two branches side by side.
- If it is a side job inside one part ("Sauté 5 minutes while cleaning and dicing
  potato.", Navy Bean Soup), leave the sentence where it is, in its step.
- Never move a sentence to make parallel work explicit. Sentence order within a part is
  checked.

## 7. Checkpoint and Choose

Callouts are optional. Add one only when the recipe already contains the sentence, and use
the sentence word for word.

- **Checkpoint** (check, and act if needed): a sentence that says what to look for and
  what to do if it is so, such as "Monitor the bread through baking and lightly tent with
  foil if it starts to brown too early." (Easter Bread's *Bake*). It goes after the step's
  instruction, so the sentence must be the last of its step: cut there, or leave it in
  the prose.
- **Choose** (pick one of several branches): only when the recipe gives two complete
  alternative methods, each with its own directions, **separated by a sentence of its own**
  (`6. - OR -`). Then:
  1. make one component for the choice, headed with the directions' own word for what
     both do (Easter Bread's `### Knead`);
  2. put the separator sentence, word for word, as its callout: `> **Choose** — OR -`
     (Markdown reads `- OR -` as a bullet, so its text is `OR -`);
  3. make each method a sub-component under it (one level below the choice, with its
     steps a level below that), headed with the method's own words (*Spiral Mixer*,
     *KitchenAid*); its steps are named as usual (*Knead in a spiral mixer*, *Knead in a
     KitchenAid*). A branch heading is new text: flag it with the step names.
  Branches are alternatives for their ingredients too: an ingredient every branch takes is
  listed in each branch, with the amount that branch takes, and amounts in different
  branches are never added together (SPEC §5.2). The checker lists it
  (*ingredient-each-branch*).
  The callout stands before both branches although the separator stood between them; the
  checker accepts exactly this one move and lists it (*choose-separator*). Flag it
  (*Callout added*). Steps before the choice stay before it, and steps after it go in a
  component after it (section 1).
  Easter Bread's `> **Choose**` has no text of its own, so its traditional form has no
  separator to write: there the two methods are two directions, each with its step name
  (`3. **Knead in a spiral mixer** — …`, `4. **Knead in a KitchenAid** — …`).
  **Where the choice goes**: when the recipe has other components, the
  `Choose` component goes **inside** the component that uses what it makes (Easter Bread's
  `## Bread`, then `### Knead` with its two mixers), not at the top level beside them, where
  the chart
  would draw the whole recipe without frames. Under a component the choice sits on that
  component's spine (SPEC §7), so the step after it takes the chosen branch: put it directly
  before the step that uses it, and move an equipment step that stood between them (a
  preheat) to the top of the recipe (section 1, *Equipment steps*).
  Alternatives **inside** sentences (Navy Bean Soup's "Slow boil for 135 minutes or bring
  to full pressure for 15 minutes."; Easter Bread's "3, 4, or 6 pieces depending on
  the braid style") are not a Choose: leave them in the prose and flag
  (*Alternatives left in the prose*).
  Two methods labeled inside one direction ("By hand: … In a mixer: …") are not a Choose
  by themselves either: keep the direction as one step, flag it, and offer to split it. On
  the person's yes, cut it between the methods' sentences into two branches in `recipe.md`,
  keeping the labels in the prose. The traditional file keeps the direction as the source
  has it; the checker compares sentences, not numbering, and passes.
- **A note moved to its step.** A note of the original that is about
  one step only (a note "Part A keeps one day." that belongs to *Make Part A*) may leave
  `## Notes` and become a callout under that step, after its instruction:
  `> **Tip** — Part A keeps one day.`
  - **When.** Only a note that one step needs at the moment of doing it. A note about the
    whole recipe (storage, yield, where it came from, calories, a question the author asks)
    stays in `## Notes`. Move a note only when the author has asked for it or approved it;
    when in
    doubt, leave it in Notes and flag it.
  - **The words do not change.** The callout's text is the whole note, word for word: no
    word added, dropped or changed, not cut in two, not joined to another note. The note is
    no longer in `## Notes` (if it was the only one, the section goes too). A note's bold
    lead (`**Storage** — …`) is part of its words and does not become the label.
  - **The label** is yours to choose: any aside (`Tip`, `Note`, `Make ahead`…). `Checkpoint`
    only when the note is a check-and-act sentence this section would accept as one; never
    `Choose`.
  - **Never into the prose.** A note written into a step's instruction would read as a
    direction, and the directions are the author's sentences in the author's order. Only a callout
    keeps it an aside.
  - **It is flagged** (*Note moved*), and the checker lists it (*note-moved*). A note both
    in `## Notes` and in a callout, or in two callouts, fails (*note-repeated*); so does a
    moved note with any word changed.
- A callout's text that is not the recipe's own words (a direction sentence, or a note
  moved as above) fails the check.

## 8. Frontmatter, title and notes

- Copy the frontmatter exactly. Delete `form: traditional`. Keep `extra:` when it has keys.
- Copy the `# Title` exactly.
- **Notes**: put every note of the original, in order, in a `## Notes` section **after the
  last step** (SPEC §4.2). It must be the last `##` heading. Copy each note word for word as
  one `- ` item; a paragraph note in the original becomes an item (the checker lists that as
  *note listed*, and nothing else may change). A note already written as an item is copied
  as it is, its nested list or second paragraph included; a note's bold lead
  (`- **Storage** — …`) stays. Do not merge two notes into one item or split one note into
  two. Anything else in the section (a table, a sub-heading such as `### Variations`) is
  copied as it is. Add nothing, and put nothing of the directions in it.
- A note never goes before the first step or into a step's prose: the checker reports it
  as misplaced. The one move allowed is a note that belongs to one step, to that step as a
  callout, word for word (section 7, *A note moved to its step*). Text the original has before its first section (between the title and
  `## Ingredients`) stays where it is, between the title and the first step.
- Without notes in the original, write no `## Notes` heading.
- A step may not be called `Notes`: give it another name from its own words.

## 9. Flags

A flag is anything the author should decide or know. Flags go in the conversion report
(`flags.md`), **never inside the recipe**. Write one line each, numbered, with the line in
`recipe.md` it is about:

```markdown
1. **Direction cut** — direction 1 is cut before "While the onions and leeks cook"
   (recipe.md:28): the celery enters there.
2. **Inconsistency in the original** — "clean and slice the celery" (recipe.md:28) beside
   `4 medium celery stalks, diced` (recipe.md:26); left as written.
3. **Step names invented** — Cook the onion and leeks, Add the celery, Season and cover, …
```

(The flags of the Potato Soup conversion at the end of this page.)

Kinds of flag to use, with these names exactly: *Ingredient
at two steps*, *Computed portion*, *Amount only in prose*, *Prose and list disagree* (also
for a different name for the same thing: "milk" for `Heavy Cream`), *Ingredient not named
in the directions*, *Ingredient used but not listed*, *Collective word resolved*, *Part
name differs*, *Component added*, *Link made*, *Link possible*, *Direction cut*, *Step
names invented*, *Inner number dropped*, *Equipment steps*, *Alternatives left in the
prose*, *Variants*, *Inconsistency in the original* (a suspected mistake: always converted
as written; quote it), *Callout added*, *Note moved* (a note of the original now a callout under its step,
section 7), *Chart limit* (the chart cannot show something
truthfully: a "meanwhile" that cannot be drawn in parallel, a thing made in one step and
used inside a sub-component), *No join in the original* (parts the original never brings
together, left as separate graphs), *Not split* (a line kept whole: its portions handled in
one step, or an amount that mixes units), *Bare repeated names* (a name listed again
without an amount, with the original line it was paired with), *Remark as a step* (a
direction that is only a yield, a remark or a label, standing as its own step). A recipe
left for the author gets a `flags.md` that says why, with its questions. Begin the report with the judgments you made (components, how coarse),
then the numbered flags.

## 10. Checks before calling it done

Run each (`etna` is `node bin/etna.js`, run from `tools/`; give the recipe's own paths for
`recipe.md`, `original.md` and the output files):

1. `etna fmt recipe.md`, then `etna fmt --check recipe.md`: canonical layout.
2. `etna lint recipe.md`: 0 errors. Warnings for lines without an amount are expected.
3. `etna restructure check original.md recipe.md`: must end `Result: PASS`. Read the
   *Accepted changes* list too: each item should have a flag.
4. `etna dag recipe.md --out chart.svg`, then **look at the chart**. Each component should
   be a branch that joins where the directions bring it in. Every ingredient should feed
   the step that uses it. A branch that ends nowhere means a link is missing; a step fed
   by the wrong thing means a link or an ingredient is under the wrong step.
5. `etna card recipe.md --pdf --out card.pdf` and look at it beside the original's card:
   the same ingredients, the same words.

If the checker fails, fix the conversion; never "fix" the original.

A recipe that links another recipe (`../another-recipe/`) only lints where that recipe
exists: in the collection itself, or in a full copy of it. Lint it there.

What the checker accepts without failing, and lists for review: a line split into
portions that sum exactly to it; a line without an amount listed at several steps; a line
kept with its amount at one step and listed without it at others; a line listed in full in
each of two or more branches of one `Choose` (*ingredient-each-branch*); a `1 recipe X` line
turned into a link to X; a line naming one of the recipe's own components turned into a
link with the same amount; a step name turned into a heading; a part name not used as a
heading; a direction's own leading number left out ("inner number dropped"); the
separator sentence between two alternatives moved into the `Choose` callout; a bullet list
under a direction written as prose after that direction; a bare name listed again, paired
with the line of its own part (and, when nothing decides, listed as *ingredient-ambiguous*);
a paragraph note written as one `- ` item with the same words (*note listed*); a note
moved, word for word, to a callout under a step and out of `## Notes` (*note-moved*).
What it lists as new: step and component headings, link bullets, callout
keywords. Everything else that differs fails, and so does a note that is not in the
`## Notes` section or a callout of its step (*misplaced*), not word for word, or in two
places (*note-repeated*).

## A complete example

The cookbook's two Potato Soups, `cookbook/potato-soup-traditional-form` and
`cookbook/potato-soup`, are the same recipe in the two forms. The traditional one
(`form: traditional`):

```markdown
---
etna: 1
form: traditional
source: Vincent Lucarelli
license: CC BY-SA 4.0
extra:
  servings: 1
  course: Main
  categories: [Soups]
  keywords: soup
---

# Potato Soup (Traditional Form)

## Ingredients

- 1 tbsp olive oil
- 2 medium onions, diced
- 1 large leek, diced
- 4 medium celery stalks, diced
- 2 tsp kosher salt
- 1/4 tsp black pepper
- 4 cups water
- 3 lb russet potatoes, diced
- 2 tbsp unsalted butter
- 2 tbsp unbleached white flour
- 2 cups whole milk

## Directions

1. Heat a heavy bottom soup pan over medium heat. Add the olive oil and onion. While the onion cooks, clean and dice the leeks and then add them to the pan. While the onions and leeks cook, clean and slice the celery. Add celery to the pan and cook for a few minutes. The onions should be starting to brown at this point.
2. Add the salt and pepper, cover, and cook for 5 minutes. Stir two or three times during this time.
3. Add the water and increase heat to high. While the water heats, clean and dice the potatoes. Once the water is boiling, carefully add the potatoes.
4. Reduce heat and simmer for 15 minutes.
5. While the potatoes boil, prepare the white sauce. Over medium heat melt the butter, add the flour, then slowly incorporate the milk.
6. After the potatoes have boiled 15 minutes, add the white sauce and simmer on medium-low another 15-25 minutes until potatoes are tender.
```

The conversion. No parts, but the directions make a white sauce apart, in the middle of the
soup's chain, and bring it back by name ("add the white sauce"): so the soup is one component,
`## Soup`, and the sauce a sub-component inside it, linked where it comes back (section 1).
Direction 1 is cut where the celery enters; the other five directions are one step each. The
words between asterisks are the author's marks (SPEC §5.3), which a conversion does not add
(*Marking is not part of restructuring*, above):

```markdown
---
etna: 1
source: Vincent Lucarelli
license: CC BY-SA 4.0
extra:
  servings: 1
  course: Main
  categories: [Soups]
  keywords: soup
---

# Potato Soup

## Soup

### Cook the onion and leeks

- 1 tbsp olive oil
- 2 medium onions, diced
- 1 large leek, diced

Heat a heavy bottom soup pan over *medium heat*. Add the olive oil and onion. While the onion cooks, clean and dice the leeks and then add them to the pan.

### Add the celery

- 4 medium celery stalks, diced

While the onions and leeks cook, clean and slice the celery. Add celery to the pan and cook for a few minutes. The onions should be starting to brown at this point.

### Season and cover

- 2 tsp kosher salt
- 1/4 tsp black pepper

Add the salt and pepper, cover, and cook for *5 minutes*. Stir two or three times during this time.

### Add the water and potatoes

- 4 cups water
- 3 lb russet potatoes, diced

Add the water and *increase heat to high*. While the water heats, clean and dice the potatoes. Once the water is boiling, carefully add the potatoes.

### Simmer the potatoes

Reduce heat and simmer for *15 minutes*.

### White sauce

#### Prepare the white sauce

- 2 tbsp unsalted butter
- 2 tbsp unbleached white flour
- 2 cups whole milk

While the potatoes boil, prepare the white sauce. Over *medium heat* melt the butter, add the flour, then slowly incorporate the milk.

### Add the white sauce

- [white sauce](#white-sauce)

After the potatoes have boiled 15 minutes, add the white sauce and simmer on *medium-low* another *15-25 minutes* until potatoes are tender.
```

The two titles differ: in the cookbook the twin's title says "(Traditional Form)" so the two
can sit side by side. The checker accepts exactly that suffix on the original's title and
nothing else (another suffix or capitalization, or the suffix on the structured side, is
`title-changed`); in a real conversion the title is copied as it is. Its flags: direction 1
cut before "While the onions and leeks cook"; the two component headings, the seven step headings and the link are new; "clean and slice the
celery" beside `4 medium celery stalks, diced` (left as written).
