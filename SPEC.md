# Etna Recipe Format — Specification

> Status: Etna 0.1 is working and ready to explore. The format and tools are still evolving,
> so things may change on the way to 1.0.
> This spec, the `registries/`, the `skill/`, and `docs/` are released together under that
> one version. The format version is a different number, **1**: the value of the `etna:`
> frontmatter key, which changes only when the way a file is read changes (§10).

This is the **normative** description of the Etna format. The authoring guide
(`docs/authoring-guide.md`) teaches it gently; the rationale lives in `docs/decisions/`.
Where they disagree, this document wins.

---

## 1. Philosophy

1. **Markdown is canonical; structure is derived.** A recipe is human-authored Markdown.
   The recipe card, the directed graph (DAG) and the shopping list are *derived* from it,
   never the source of truth: anything derived can be thrown away and made again.
2. **Ingredients enter at the step where they are used.** There is no separate master
   ingredient list to drift out of sync. A step declares the ingredients that enter at it.
   (See `docs/decisions/0001-ingredients-enter-at-their-step.md`.)
3. **Structure alone, no AI.** Everything needed for the *card* and the *coarse DAG* is
   derivable from the Markdown structure alone.
4. **Gradual typing.** Prose is the untyped default; it always renders and degrades
   gracefully. Canonical vocabulary (from `registries/`) is added where a tool reads it
   (the unit of an ingredient line, the kind of a mark). Unknown terms are never rejected —
   they stay prose.
5. **Loose on vocabulary, strict on topology.** Be forgiving about *what* an operation or
   ingredient is. Be strict about *how things connect* — the graph skeleton must be
   explicit and resolvable, because it cannot be safely guessed. (See `0004`.)

---

## 2. Files and directories

- **One directory per recipe**, named by a slug derived from the title.
  - Slug: lowercase; accents folded to ASCII; `&` → `and`; apostrophes dropped
    (`Nana Palumbo's` → `nana-palumbos`); every other run of spaces or punctuation becomes one `-`
    (`A/B` → `a-b`, `Pizza :: Brooklyn Style` → `pizza-brooklyn-style`); no leading or
    trailing `-`. Set once at creation; not auto-renamed when the title changes. On
    collision, append `-2`, `-3`, … A directory name that is not a valid slug is a warning
    (`invalid-slug`, §9).
- Inside the directory:
  - `recipe.md` — the human-authored canonical file. **Source of truth.**
  - image assets (hero photo, per-step photos) as needed.

---

## 3. Frontmatter

YAML frontmatter delimited by `---`.

```yaml
---
etna: 1                     # REQUIRED. Integer format version (how to interpret this file).
form: structured            # optional, recognized. structured (default) | traditional. See §4.1.
source: Vincent Lucarelli   # optional, recognized
yield: 8 servings           # optional, recognized. Free text ("12 rolls", "1 quart").
license: CC BY-SA 4.0       # optional, recognized
extra:                      # optional. Arbitrary author keys live here, quarantined,
  calories: 2517            # so the core stays clean and validators never reject them.
---
```

- The only **required** frontmatter key is `etna`. The **title is not in frontmatter** — it
  is the body's H1 (see §4).
- **Recognized optional** keys the tooling understands: `form`, `source`, `yield`, `license`,
  `version` (an author's own recipe version, distinct from the format version).
- `form` selects how the body is read: `structured` (the default when the key is absent) is
  the format §4–§7 describe (with the Notes section of §4.2); `traditional` is the flat card form of §4.1. Any other value is
  an error (§9).
- **Arbitrary** keys are permitted only under `extra:`. Anything there is preserved and
  ignored by the linter.

---

## 4. Body structure — the leaf-vs-parent rule

The body **opens with exactly one H1 — the recipe title** (Markdown's one-H1 convention;
the slug in §2 is derived from it). The H1 must be plain text (inline formatting is a
warning, `title-not-plain-text`, §9). It is the title, not a
component or step, and is **exempt** from the leaf-vs-parent rule below; structural headings
begin at H2.

A heading's meaning is read from its **structural role**, not its level number
(depth-agnostic):

- A **leaf** heading (no sub-headings beneath it) is a **step**.
- A heading **with** sub-headings is a **component** (a named branch / sub-recipe).

Consequences:

- A flat recipe is a sequence of H2 steps (e.g. `cookbook/malted-chocolate`).
- A multi-component recipe nests: H2 component → H3 steps (e.g.
  `cookbook/italian-wedding-soup`).
- Deeper nesting is allowed when a group genuinely bundles multiple multi-step
  sub-preparations: H2 component → H3 sub-component → H4 steps.
- Sibling headings at the same level may mix freely: some leaf-steps, some
  parent-components.

**Naming**. A component heading names **what is made**,
a noun (`Dough`, `Filling`). A step heading names **what is done**, a short verb phrase built
from the direction's own words (`Cream butter and sugar`). The tools rely on this: the flow
chart draws the step heading on the step's node, and a card that hoists its ingredients into
one list groups them under component names only (§8). No hint checks it. (ADR 0013.)

Guidance, not enforced but recommended:

- A component earns its name when the recipe makes **more than one thing** (a dough and a
  filling; a base and a glaze): the names then group the ingredients on a hoisted card (§8)
  and frame the steps on the chart. A recipe that is one chain of steps stays without
  components, however nameable the thing at the end of the chain. A single-step component
  is allowed, for the same reason and under the same test. One further reason to wrap a
  single chain: to set **preparation apart**. A step placed before the components joins
  nothing (§7: the spine does not carry a step past the first component), so an author who
  writes `## Preheat the oven` and then `## Biscuits` over the chain has said that the oven
  is not part of the work; the same sentence written as the chain's first step is an
  ordinary step. Both are right; the heading's place is the author's choice.
- A sub-preparation that is **reused** across recipes should be extracted to its own
  recipe and referenced by link (§6, Reference link), not nested inline.

### 4.1 Traditional form

A recipe with `form: traditional` is a classic recipe card: the ingredients are listed once,
apart from the directions. It is what an import from another application produces, and the
starting point for migrating a recipe to the structured form
([`docs/structuring-playbook.md`](docs/structuring-playbook.md)).
A structured recipe can always be read as a traditional one: collect each component's
ingredients under its part and number its steps, as the card does. The other direction needs
judgment, which is what the structuring playbook is for. The
leaf-vs-parent rule does **not** apply; instead the body has up to three H2 sections,
recognized by their heading text. The cookbook's Italian Wedding Soup in the traditional form,
shortened (each `…` stands for lines left out):

```markdown
# Italian Wedding Soup (Traditional Form)

## Ingredients

### Chicken Stock

- 1 large Rotisserie Chicken, separate meat from bones; reserve meat for soup
- 4 stalks Celery, cut into 2-inch chunks
…

### Meatballs

- 6 oz Ground beef — 80/20
…

### Breads for Soup

…

### Wedding Soup

- 1 1/2 tbsp Better Than Bouillon Chicken
…
- Romano Cheese — optional, to taste

## Directions

### Chicken Stock

1. Break down chicken and reserve meat for the finished soup. Place bones, skin, and all juices in large stock pot with all other ingredients. Bring to boil and then reduce heat to simmer for 2 hours. Replenish water as needed. Strain to separate stock from solids. Return stock to the pot and discard solids.

…

### Serve

1. Ladle soup into bowls making sure each bowl has a good balance of broth and ingredients. Add a few breads for soup on top and sprinkle with Romano cheese.

## Notes

- All ounce measurements refer to weight, as measured with a kitchen scale.
```

- `## Ingredients` — ingredient bullets (§6).
- `## Directions` — numbered lists; each item is one direction. The placeholder `_none_`
  means the recipe has no directions.
- `## Notes` — the recipe's notes: the same section as the structured form's Notes
  (§4.2). A second `## Notes` is not read as notes (§9).

**Parts.** A recipe made of parts writes each one as an H3 heading, in both sections:
`### Meatballs` under `## Ingredients` holds that part's ingredients, and `### Meatballs` under
`## Directions` holds its steps. The two **pair by name** — compared after removing a
qualifier, trimming, collapsing white space and ignoring case — so a part's ingredients and
its steps can be shown together (a near miss that does not pair is a hint, `unpaired-part`,
§9). A **qualifier** *(ADR 0014)* is introduced
by an em dash with a space on each side (` — `): everything after the first one is a note
about the part, not part of its name. `### Breads for Soup — optional` pairs with
`### Breads for Soup`, `### Dough — Day 1` with `### Dough`, and `### Biga — 50% hydration`
with `### Biga`; two qualified headings pair when their names match. The full heading still
prints (a renderer may set the qualifier apart) and its anchor is still built from the whole
text. Only the spaced em dash counts: a hyphen or an en dash (`### Day 1 - Dough`), an
unspaced dash, and parentheses are part of the name, and the formatter does not rewrite
them as a qualifier. The same mark introduces a remark on an ingredient line (§6), so one
convention covers both. A part may appear in one section only (`### Serve` above has no
ingredients of its own). Anything before the first `###` in a section belongs to an
**unnamed leading part**. Deeper headings (`####`) inside a part carry no meaning of their
own and are kept as written; a `###` under `## Notes` is just a heading. Repeating a part's
name in both sections is the point, not a duplicate heading (a traditional recipe has no
internal references for it to make ambiguous).

**Numbering restarts at 1 in each direction part.** A recipe with no direction parts numbers
its directions 1…n, and a recipe with no parts at all is just a list of ingredients and a
numbered list of directions.

**Step names.** A direction may open with a bold **step name** followed by an em dash
(`1. **Soak** — text`). It names that one step, never a run of steps. The cookbook's Navy Bean
Soup in the traditional form names every direction this way
(`2. **Drain the beans** — Drain and rinse beans well.`), and its structured form has those
names as its step headings.

The bold-line ingredient group (`**Meatballs**` alone on a line) and a bold direction label used
to head a run of steps are **older spellings** of a part; tools still read them, and the
formatter (`etna fmt`) rewrites them as part headings when it can tell which is meant (§13).
(ADR 0010.)

A traditional recipe has no per-step ingredients, so it yields a recipe card but **no DAG**
(§8). At least one of `Ingredients` or `Directions` must be present (§9).

### 4.2 Notes

A structured recipe may end with **one** Notes section: what the cook
should know about the recipe as a whole — storage, variations, where it came from — rather
than about one step.

```markdown
## Serve

Ladle into bowls.

## Notes

- Keeps three days refrigerated.
- Freezes well, without the cream.
```

- **How it is recognized.** The Notes section is the **last H2 of the body, when its text is
  `Notes`** (case ignored). It runs from that heading to the end of the file.
- **What it holds.** `## Notes` is the last H2 of the body and runs to the end of the file.
  It holds any Markdown: paragraphs, lists, a table, a lower heading.
  One list item per note is the usual shape:

  ```markdown
  ## Notes
  - **Storage** — keeps three days refrigerated.
  - 906 calories
  ```

  A bold lead followed by an em dash names the note, as in a callout (§5.1).
- **What it is not.** It is not a step or a component: the leaf-vs-parent rule (§4) does not
  apply to it or to the headings inside it. It has no ingredients (a bullet there is a list,
  never an ingredient line), no required instruction, no callouts with a meaning, and it is
  not part of the graph (§7): it cannot be linked to, and it adds nothing to a shopping list.
  A callout inside a step (`> **Note** — …`, §5.1) is part of that step, not of the notes.
- **A step called "Notes".** `## Notes` is reserved for the notes. An H2 named `Notes` that
  is not the last H2 is read as an ordinary step or component, and is an **error**
  (`notes-misplaced`, §9): move the notes to the end, or, if it really is a step, give it
  another name. The same error covers a second Notes section: only the last one is the
  notes. A deeper heading named `Notes` (an H3 under a component) is an ordinary step, though
  a clearer name is better.
- **Same as the traditional form.** It is the same thing as a traditional recipe's
  `## Notes` (§4.1): tools read, format, search and print the two alike, and converting a
  traditional recipe to the structured form moves its notes, word for word, into this
  section (`docs/structuring-playbook.md`), except a note about one step, which may instead
  become a callout under that step (§5.1), its words unchanged.
- **Printing.** A card prints the notes only when asked (§8).

(ADR 0011.)

---

## 5. Steps

A **step** is a leaf heading with:

1. a short **descriptive label** as its heading text (free text);
2. zero or more **ingredient bullets** (§6), listed first;
3. at least one line of **instruction prose** — REQUIRED;
4. zero or more **callouts** (§5.1) after the instruction.

```markdown
## Add the chocolate

- 115 g dark chocolate

Reduce the speed, drop in the chunks, then blend until the mixture reaches 170°F.
```

A step with no instruction prose is an **error** (§9), whether or not it lists ingredients —
this is the "modern steps required" rule that rejects bare legacy ingredient lists.

A **component** (parent heading) carries no ingredients or instructions of its own; its
content is its child headings.

### 5.1 Callouts

A **callout** is an aside attached to a step, written as a blockquote led by a bold label and
an em dash:

> **Label** — text

Callouts hold what sits outside the main instruction flow. *(ADR 0019.)* The
label is **open**: two labels are **keywords**, because they carry structure, and every other
label is an **informational aside**. This is §1.5 and ADR 0004 applied to callouts — strict
where the graph is concerned, loose on words (design intent: `docs/callouts.md`):

| Label | Kind | Meaning |
|-------|------|---------|
| `Checkpoint` | keyword | An assess-and-(maybe-)act decision point — check a condition, act if needed. |
| `Choose` | keyword | Marks a component whose direct child headings are mutually exclusive branches (pick one). See §5.2. |
| anything else | aside | Whatever the author names it: `Note`, `Tip`, `Warning`, `Make ahead`, `Variation`, `Storage`… |

- **Keywords** are written exactly: `Checkpoint`, `Choose`. Nothing else is read as one, so a
  label that looks like a mistake for a keyword — in case, spacing, spelling or number
  (`choose`, `Check point`, `Chose`, `Checkpoints`) — is an **error**
  (`callout-near-miss`, §9): it is never reinterpreted, so the choice or the checkpoint would
  silently be missing from the chart and the card. An author who means an aside uses another
  word. The test: with letter case and everything but letters ignored
  and one trailing `s` dropped, the label is at most one slip from the keyword
  for every five of its letters (one for `Choose`, two for `Checkpoint`), where a slip is a
  letter added, dropped or changed, or two neighboring letters swapped. So `Hcoose`,
  `Chooes` and `Chekpiont` are near-misses; `Close`, `Those`, `Cheese`, `Chosen` and `Check`
  are asides.
- **An aside** is any other label. The linter says nothing about it. It is not an
  instruction: a step with only an aside still has no instruction (§9). It changes nothing in
  the graph (§7): no edge, no marker, no ingredient. A card prints it under its step with the
  author's own label, as written (a bold lead over 32 characters is a sentence, not a label,
  and prints as bold text); a chart leaves it out, as it leaves out the instruction prose.
  `Note` is the conventional label when no better word comes to mind:

  > **Note** — this page has one of each: a Tip, a Checkpoint, a Choose, and this Note.

  (From `cookbook/an-etna-recipe`.)

- A note about the recipe as a whole goes in the Notes section (§4.2), not in a step.
- **Optional things and substitutions do not belong in a callout.** An optional or
  alternative ingredient says so in its remark (§6: `— optional`, `— or pinto beans`); a whole
  optional component or step says so in a qualifier on its heading (§6, "Optional
  components and steps"); an optional or alternative action stays in the step's prose; a
  choice between whole methods is a `Choose` (§5.2). This is guidance, not a lint rule: a
  `> **Optional** — …` is a plain aside like any other label.

The source carries the keyword as written; a renderer/theme may map a **keyword** to a
display label (one-way, output only — never an input alias). An aside's label is printed as
the author wrote it.

#### Checkpoint

A `Checkpoint` is a discrete verify-and-(maybe-)act moment: the cook assesses state and
acts only if needed.

> **Checkpoint** — if an ingredient goes in at two steps, list it at both, each with the amount that step takes.

(From `cookbook/an-etna-recipe`.) Among the dishes, Easter Bread has one, under its *Bake* step:

> **Checkpoint** — Monitor the bread through baking and lightly tent with foil if it starts to brown too early.

- In the coarse dataflow DAG it renders as a marker on the step's node — **not** a branch —
  so the canonical graph stays acyclic (ADR 0006).

**Checkpoint vs. stop-condition.** A stop-condition is an operation's *terminating* "until"
(`blend until 170°F`) and ends the step. A Checkpoint is a separate assess-and-branch
moment, usually after or between steps. Rule of thumb: if it ends a step, it's a
stop-condition; if it's a verify-and-act, it's a Checkpoint.

### 5.2 Choose — exclusive branches

A `Choose` callout attaches to a **component** heading and declares that the component's
**direct child headings are mutually exclusive branches** — the cook picks one (XOR):

> **Choose** — one method.

- The branches are the component's child headings; the choice's scope ends at the next
  heading of equal-or-shallower level, or EOF (ordinary markdown sectioning — no terminator).
- **At least two branches** are required (a one-branch choice is an error, §9).
- A branch may be a single leaf step or a multi-step subtree.
- **Shared setup / finish compose via the spine (§7):** a sibling step *before* the `Choose`
  component is carried into every branch; a sibling step *after* it consumes the chosen
  branch's output. So `base → choose → common finish` needs no special construct.
- In the coarse DAG the branches are drawn as **alternatives inside one marked group** (an
  XOR group): the step before fans out to each branch and each branch leads on to the step
  after. The graph records those edges as *exclusive* — one is taken — so it is still acyclic
  dataflow, not control flow (ADR 0006). `Checkpoint`, by contrast, stays an annotation on its
  node.

Large variation families may instead be modeled as separate recipes sharing a base via §7
includes (`pudding-base/` + `pudding-vanilla/` …); in-document `Choose` is for the inline case.
See `docs/callouts.md` and ADR 0009.

### 5.3 Marks

*(ADR 0021)* In a step's instruction, words written with Markdown
**emphasis** are **marked**. A mark says what the step's box on the chart shows under its
heading (§8): the tool, the setting, when to stop, in the step's own words.

```markdown
### Add the white sauce

- [white sauce](#white-sauce)

After the potatoes have boiled 15 minutes, add the white sauce and simmer on *medium-low* another *15-25 minutes* until potatoes are tender.
```

- **Spelling.** Asterisks are the canonical spelling (`*medium-low*`, §13); underscores
  (`_medium-low_`) read the same. **Bold is never a mark**: it is for the card, emphasis is
  for the chart. Words wanted in the box and bold on the card are written both ways
  (`***medium-low***`); the two may also nest (`**simmer on *medium-low***`).
- **What a mark is.** Each emphasized run of words, in the order written and exactly as
  written: a link inside a mark gives its text, a line break or a run of spaces inside it is
  one space, and punctuation inside the asterisks is part of it (leave a comma or full stop
  outside them). Emphasis inside a mark is part of that mark, not a second one.
- **Where a mark counts.** Only in the instruction paragraphs of a step of a structured
  recipe. Emphasis anywhere else is ordinary emphasis and means nothing to a chart: in a
  heading, an ingredient line, a callout, the Notes, the preamble, or a traditional recipe
  (which has no chart).
- **Marks add no words.** With the asterisks taken out, a marked recipe is the recipe it
  was. Adding or removing marks never changes what a recipe says.
- **Marks are optional.** A recipe needs no marks to be valid, to print or to chart: a step
  with none shows its heading alone. Marks can be added one recipe at a time.
- **A mark stands alone.** It is read without the sentence around it, so it says enough on
  its own: in a step that oils the pans, "Preheat the oven to 465°F" is marked whole, since
  "465°F" alone would read as the heat of the oiling. Nothing checks this.

**Kinds.** *(ADR 0022)* A tool may give a mark a **kind**:
what it says, read from the mark's own words and the registries (§11), never from the
sentence around it. A kind **never changes an output**: the chart draws the mark as written
and the card prints it plain, whatever its kind. It is there for the writer to check a
recipe (`etna marks`).

| Kind | Read from | Example marks |
|---|---|---|
| `duration` | a number or range with a time unit, or a time word (`stop-conditions.yaml`) | `15-25 minutes`, `a few minutes`, `overnight` |
| `temperature` | a number with °F, °C or degrees (`stop-conditions.yaml`) | `at 78°F`, `to 190°F internal` |
| `setting` | a level, a speed with its number, or a mode (`modifiers.yaml`) | `medium-low`, `on high`, `speed 6`, `fan` |
| `tool` | a name or alias in `tools.yaml`, with that entry's kind | `in a Vitamix`, `dough hook` |
| `cue` | opens with until, till or when | `until potatoes are tender` |
| `action` | opens with an operation or alias in `operations.yaml` | `Reduce heat`, `rotate the tray` |

A number with a unit is read first and is never read as anything else. A mark may hold more
than one kind (`Speed 2 for 4 minutes` is a setting and a duration). A mark nothing matches
is **untyped**: that is not an error, and a word missing from a registry is fixed by adding
it there.

A temperature is one **to set** (the oven's) or one **to reach** (the food's) only when the
mark's own words say so: `at`, `oven` or `preheat` before it means set; `until`,
`reaches`, `registers`, `internal` or `stop at` means reach (the nearest decides; one right
after the number counts too, as in `190°F internal`); failing those, `to` means reach. A
bare temperature has no role. So mark the word with the number: `*at 78°F*`, not
`at *78°F*`; `*reaches 85°F*`, not `reaches *85°F*`.

---

## 6. Ingredient bullets — the unified rule

Each bullet under a step is **either** a raw ingredient **or** a reference link.

### Raw ingredient

```
- <quantity> <unit> <item>[, <prep>][ — <remark>]
```

- `quantity`: a number, fraction (`2 1/4`), or range (`2-3`). Optional. Its canonical
  spelling is in §13; a renderer may display it differently (`1 ½`, `2 to 3`).
- `unit`: resolved against `registries/units.yaml`. Optional. A unit is not only a weight or
  a volume: in `2 large eggs` the quantity is `2`, the unit is `large`, and the item is
  `eggs`. The registry therefore also holds sizes (`large`), pieces (`clove`), containers
  (`can`), approximations (`pinch`) and `recipe`; each entry has a `kind`.
  - **The unit is whatever follows the quantity and matches the registry, longest match
    first** (`small bag` before `small`). If nothing matches, the line has no unit and
    everything after the quantity is the item (`2 eggs`).
  - There is one order only — `quantity unit item`. In `2 eggs, large` the word after the
    comma is a note, not a unit.
  - Any registered alias is accepted on input; the formatter writes the canonical spelling
    (§13).
- `item`: the ingredient name; the remainder after an optional comma is prep/notes
  (`finely grated`, `boiling`, `room temperature`).
- `remark` *(ADR 0014)*: an em dash with a space on each side (` — `)
  introduces a **remark** that is not preparation — a baker's percentage, a count for a
  weight, a weight for a volume, a brand: `150 g eggs — 3 large`, `8 g instant yeast — SAF Gold`,
  `1 cup flour — about 120 g`. The first ` — ` outside parentheses is looked for before the
  comma, so the remark may itself hold commas and dashes (`1 cup flour — about 120 g, sifted`
  has the remark `about 120 g, sifted` and no prep). A comma still introduces how the
  ingredient is prepared (`butter, melted`). A card prints the remark after the prep; so
  does a shopping list, except that "optional" is said its own way (§8); a
  chart that shows names only drops it with the prep. A hyphen, an en dash or an unspaced dash is part of the
  text. A reference link takes a remark the same way (`[biga](../biga/) — 30%`).
- A bullet with **no** quantity (e.g. `- salt`, `- peas`) is allowed: the quantity is
  *untyped*, the line still renders. A bare one is a warning (`missing-quantity`, §9), since
  the amount is usually a gap. One whose remark says its use — `- salt — to taste`,
  `- flour — for dusting`, `- oil — for frying`, `- 00 flour — 25 g per 100 g of flesh` —
  is complete as written and the linter is silent. A card prints such a remark where the
  amount would be when it is 12 characters or fewer (`to taste`); a longer one stays after
  the item.
- **Optional and alternative ingredients** *(ADR 0019)*: the remark says so —
  `- 6 leaves fresh basil — optional`,
  `- 500 g navy beans — or Great Northern, Cannellini, Flageolet, or 17 bean mix`. An `or`
  inside the item (`- 3 oz pastina, orzo, stars, or acini di pepe`) is part of the name.
  The remarks that make an ingredient optional are `optional`, `if desired` and `if using`,
  alone or before a comma (`— optional, for topping`); so does a preparation note that is
  only `optional` (`- rainbow sprinkles, optional`). A shopping list says "optional" for
  them (§8). Not a callout (§5.1).
- **Optional components and steps** *(ADR 0019)*: a whole component
  or step that may be left out says so in a qualifier on its heading, the em-dash qualifier of
  ADR 0014: `## Glaze — optional`, `### Toast the nuts — optional`. The words are those of an
  optional ingredient: `optional`, `if desired` or `if using`, alone or before a comma
  (`— optional, for crunch`). The qualifier **designates** the component or step optional, a
  fact the tools read; everything under an optional component goes with it. The graph does
  not change (what a step after a skipped one takes is the cook's business). The heading
  prints whole on a card, and its anchor is built from the whole text (a link to it reads
  `[glaze](#glaze--optional)`). A shopping list gives its ingredients as one set, to buy all
  or none (§8). A heading whose qualifier is written wrongly (`Glaze (optional)`, `Glaze -
  optional`, `— optinal`) is a warning (§9).

### Reference link

```
- [name](#anchor)        # internal: another component/step's output in THIS recipe
- [name](../slug/)       # external: another recipe's final output
```

A reference declares that an upstream output enters at this step. Internal anchors are the
GitHub heading anchors of the target component/step; external links point at another
recipe directory. The linter must resolve every reference (§9).

A **quantity on a reference** (`- 104 g [mashed potato](#mashed-potato)`) means that amount of
the component's output enters here; the rest is what the recipe says to do with it ("discard
the rest"). The chart writes the amount beside the edge: halfway along an edge that joins
neighboring boxes, near the start of a longer one (inside the frame it starts in, when there
is room), and farther along when that place is crowded. When the component's own lines
resolve to one unit, the chart also captions the component with what it makes
(`Mashed potato — makes 165 g`; "about" when small spoon or pinch amounts are left out of the
sum; nothing when the units do not resolve). A component that holds a reference of its own is
not summed. Nothing is written in the recipe for this.

---

## 7. Topology — the implicit spine and explicit branches

- **Implicit spine.** Within a flat recipe or within a single component, consecutive steps
  chain: step *N* consumes step *N−1*'s output. Linear recipes need no link bullets at all.
- **Branches.** Each component is an independent branch. Its steps chain internally; the
  branch does **not** implicitly consume a sibling branch.
- **Steps and components as siblings.** The spine runs through the *steps* of a container. A
  step consumes the nearest preceding sibling **step**; a component sitting between them is a
  side branch, and its output enters only where a reference link names it. The one exception
  is a `Choose` component (§5.2), which sits *on* the spine: the step before it feeds every
  branch, and the step after it consumes the chosen branch.
- **Steps before the components.** At the top level, the steps
  before the first component (other than a `Choose`) chain only among themselves: the spine
  does not carry them past that component, so the first step after it starts a chain of its
  own and takes the components only through its links. After the first component, and under
  any component at every depth, the rule above holds unchanged.
- **Merge.** A step (commonly a top-level step after the components) joins branches by
  listing their outputs as reference-link bullets.
- **Output.** A component with at least one step among its children outputs its **last
  child's** output: the result of that step, or, when the last child is a component, that
  component's output.
- **Groups.** A component whose children are **all** components (no
  step of its own) is a **group**. It has no single output: a link to a group stands for a
  link to **each** of its children, in order. A child that is itself a group expands the
  same way, all the way down. The same holds on the spine: the step before a `Choose`
  whose branch is a group feeds every sub-component of that group, nested groups expanded
  all the way down, and the chart draws one edge into each.

  ```markdown
  ## Fillings
  ### Custard
  #### Cook the custard
  …
  ### Jam
  #### Simmer the jam
  …
  ## Fill
  - [fillings](#fillings)
  ```

  Here `[fillings](#fillings)` brings in the custard **and** the jam. A quantity on such a
  link (`- 1/2 [fillings](#fillings)`) cannot say how much of which, so it is a warning
  (§9): link the sub-component the amount applies to.
- **Group vs. Choose.** A link to a `Choose` component (§5.2) means **one** of its branches,
  the one the cook picks; a link to a group means **all** of its sub-components. The chart
  draws a `Choose` as a marked group with exclusive edges, labeled Choose, and a group link as one edge from each
  sub-component's output into the step that links it. (ADR 0012.)
- A recipe's final product is the output of its last step / terminal component, named by
  the title (the H1).

---

## 8. Derived artifacts

All three are produced *from* `recipe.md`:

- **Recipe card** (deterministic). A card shows the title, the ingredients and the
  directions; everything else (notes, yield, source…) is optional. The
  recipe's Notes section (§4.1, §4.2) is **opt-in** on every card: it prints only when the
  reader asks for it, and a card printed without it says nothing about it. Callouts inside
  steps are part of the method and always print. In the structured form an
  ingredient belongs to the step that uses it, so one entering at two steps appears twice
  where a card prints each step's own ingredients — this is faithful to method. How a card
  arranges all this is a **theme's** choice, not the format's (`themes/README.md`,
  "Layouts"), with two rules for every theme:
  - **Emphasis prints plain; bold prints bold** *(ADR 0021)*. A card
    prints emphasis as plain text everywhere on it (instructions, callouts, notes, the
    headnote, ingredient notes), since in an instruction emphasis marks words for the chart
    (§5.3). Bold prints bold, and bold with emphasis prints bold. The shopping list prints
    them alike.
  - **Hoisted ingredients**. A card that hoists a structured
    recipe's ingredients into one list groups them **by component, never by step** (§4,
    Naming). A recipe with no components prints one list, in step order. A recipe that
    mixes the two prints the ingredients of its top-level steps ungrouped, where those
    steps fall among the component groups (document order). Within a list or a group, an ingredient that
    enters at two steps is merged into one line marked *divided*, its amounts summed, only
    when both amounts are stated (in one unit) and both lines agree on the preparation
    note, which the merged line keeps: `1/2 tsp` + `1 tsp` kosher salt prints
    `1 1/2 tsp kosher salt, divided`. Otherwise the lines print as written, in order.
- **Shopping list** (deterministic). The ingredients of one or more recipes as a single
  list, with amounts **totaled** where the item and the unit are the same. It answers "what
  do I need to have", where the card answers "what do I do". It
  prints every remark (§6) after the item and its prep, led by ` — ` as written:
  `500 g carrots, peeled — or parsnips`. A remark that every line of a total carries prints
  once; any other is led by the amounts of the lines that carry it, so that it is not read
  as applying to the total: `1 kg carrots, peeled — 500 g: or parsnips`. The preparation
  note after the comma follows the same rule: one that every line of a total carries prints
  once, and any other is led by the amounts of the lines that carry it,
  `560 g whole milk, 45 g: room temperature`. Optional is said
  only as "(optional)", and only for an item that **every** line using it marks optional
  (§6: `— optional`, `— if desired`, `— if using`, or the bare note `, optional`); one recipe
  or one line that needs it makes it needed, and the list says nothing. The optional word
  that leads a remark is never printed as a remark (`— optional, for topping` prints
  `— for topping`). Another recipe used as an ingredient prints its own line's remark.
  The ingredients of a component or step designated optional (§6)
  are **one set**, bought all together or not at all. Each set prints after everything that is
  needed, other recipes included, under its own name and the words "optional, all or none"
  (`Glaze — optional, all or none`; with several recipes on the list,
  `Glaze, for Roasted Root Vegetables — …`). A set's lines are totaled among
  themselves only: an item it shares with a needed line (butter in the glaze and in the
  dough) is listed twice, the needed total without the set's amount and the set with its own,
  and two sets are never added together, in one recipe or across several. One item is not a
  set: an optional component or step with a single ingredient gives an optional item among
  what is needed, by the rule above. Inside a set, a line that is optional by itself
  (`— optional`), or that
  stands under an optional heading nested in the set's, says "(optional)"; the set is the
  outermost optional heading. Another recipe used inside a set is listed in the set, said to
  be another recipe. A list's remarks print in a set as anywhere else.
- **Coarse DAG** (deterministic). Steps → operation nodes; ingredient bullets → source
  nodes feeding their step; spine + references → edges. This reproduces a hand-drawn
  recipe graph with no AI. Control-flow constructs (callouts such as `Checkpoint`) are
  annotations on nodes, not edges, so the canonical graph stays acyclic (see ADR 0006).
  A step with no edge in or out and no ingredient (a preheat, a pan to line, placed before
  the components; §4 Naming) is drawn as **preparation**: first, in a row of its own, apart
  from the work. A component or step designated optional (§6) is
  drawn as any other, its edges as they are, and marked with a small `(optional)` after its
  name (a frame's or a branch's) or under its text (a step).
  *(ADR 0021)* **What a step's box says.** Its heading, wrapped, then each mark of its
  instruction (§5.3) on a line of its own, wrapped by the same width, in the order written
  and exactly as written, in the same weight as the heading. A step with no marks shows its
  heading alone. Nothing is read from the prose, shortened, reordered or dropped, and a box
  has no cap on its lines: a box of more than five is drawn as marked, and linted
  (`chart-box-long`, §9). There is one way to fill a box: the chart has no text modes.

---

## 9. Validation

The deterministic **linter** is the authority for pass/fail.

Each rule below carries its id from `rules.yaml`; a test checks
that the two list the same ids.

**Errors (reject the file):**

- missing `etna` or malformed frontmatter (`missing-frontmatter-field`);
- a `form` value other than `structured` or `traditional` (`unknown-form`);
- missing the H1 title: the body must open with a single H1 — none, more than one, or one
  that is not the first thing in the body is an error (`missing-title`);
- a recipe directory with no `recipe.md` (`missing-recipe-file`);
- *(structured)* no steps (`no-steps`);
- *(structured)* a step with no instruction prose (§5), with or without ingredients
  (`step-missing-instruction`);
- *(structured)* a component with ingredients or instructions of its own (§5)
  (`component-has-content`);
- *(structured)* an unresolved reference: an internal anchor or external recipe path points
  at nothing, or at a heading with no step to take an output from (`unresolved-reference`);
- *(structured)* a reference to a heading whose text is not unique (`ambiguous-reference`);
- *(structured)* a reference to the step that makes it, or to a component (a group
  included) that holds that step at any depth: the step would take in its own output
  (`unresolved-reference`);
- *(structured)* a `Choose` component with fewer than two branches (§5.2)
  (`choose-too-few-branches`);
- *(traditional)* neither an `Ingredients` nor a `Directions` section (§4.1)
  (`missing-sections`);
- a `## Notes` that is not read as the recipe's notes: *(structured)* one that is not the
  last H2, which is read as a step; or a second Notes section in either form (§4.2)
  (`notes-misplaced`);
- a callout label that looks like a mistake for a keyword — `choose`, `Check point`, `Chose`,
  `Checkpoints` — by the test of §5.1. It is not read as the keyword. Any other label is an
  aside and is not reported (`callout-near-miss`).

**Warnings (pass, but inform):**

- a title (H1) with inline formatting; it should be plain text (§4) (`title-not-plain-text`);
- a recipe directory name that is not a valid slug: lowercase letters, digits and hyphens
  (§2) (`invalid-slug`);
- an ingredient line that does not parse as `quantity unit item` (`ingredient-unparsed`);
- a quantity-less ingredient with no remark (`missing-quantity`); one with a remark is complete (§6);
- an ingredient whose unit is `recipe` — a cross-recipe include written as text; write it as
  an external link (§6, Reference link)
  (`include-as-text`);
- *(structured)* a quantity on a reference to a group, which stands for several
  sub-components (§7) (`quantity-on-group-reference`);
- *(structured)* a heading whose optional qualifier is written wrongly, so it is not read —
  `Glaze (optional)`, `Glaze - optional`, `Glaze — optinal`; the designation is the qualifier
  `## Glaze — optional` (§6). The author's own words are not reported: a heading that begins
  `Optionally…`, or a callout labeled `Optional`, which is an aside (`optional-near-miss`);
- *(traditional)* no ingredients (`no-ingredients`);
- *(traditional)* no directions (`no-directions`);
- duplicate heading text (see the note on formatting below) (`duplicate-heading`);
- *(structured)* a step whose chart box (§8) runs to more than five lines, counted with the
  chart's own wrap at one character a cell; five is the most any box has in the hand-drawn
  charts that Etna's charts follow. It names the step and says to mark fewer words (§5.3)
  (`chart-box-long`);
- *(structured)* an asterisk left as text in a step's instruction: an unclosed mark prints
  as an asterisk and marks nothing. An escaped asterisk (`\*`) is meant and is not reported
  (§5.3) (`stray-asterisk`).

**Hints (pass; a hint for review, never a problem):**

- *(traditional)* both sections name parts, and a part in one has no partner of the same
  name in the other but a near miss there (`### Sauce` under Directions, `### Sauces` under
  Ingredients), so the two do not pair (§4.1) (`unpaired-part`). A direction phase with no
  ingredients of its own is normal in this form, so this is a hint, not a problem.

Be strict on topology (errors), loose on vocabulary (warnings).

Because the unit is recognized *by* the registry (§6), an unregistered unit cannot be told
apart from the first word of an item, so there is no per-line "unknown unit" diagnostic.
Instead the linter can produce a collection-wide **unit candidates** report — the most
common first words of unit-less items — to show what the registry is missing.

Every diagnostic has a stable id. The full catalog — id, severity and description — lives
in `rules.yaml`; the test suite checks the linter's own table and this section against it.

Source **formatting** (blank lines, list markers, canonical unit, quantity and temperature
spellings) is a separate concern from these semantic rules: §13 states it, the formatter
(`etna fmt`) applies it, and a formatting difference never makes a recipe invalid. One rule
straddles the two: **heading text must be unique within a recipe**, because internal
references resolve by heading anchor (`[name](#anchor)`), so duplicate headings would create
ambiguous anchors.

---

## 10. Versioning

- **Format version**: the `etna:` frontmatter integer. Changes only when the *interpretation*
  of the file changes. Lives in the human file; rarely changes.
- **Toolchain version**: the standard (this spec + registries + skill + docs) ships one
  bundled semver per release.

---

## 11. Registries

`registries/` holds the canonical vocabulary — the "standard library". It grows
**bottom-up**: a term is added when a recipe needs it (the linter's unit candidates report,
§9, lists the units that are missing; `etna marks` shows a mark nothing matches as untyped).
Recipes may always use terms not yet in a registry; those stay untyped. The registries exist
so that the tools can read a recipe's words, not to gate authoring.

Each file's header says what an entry holds; that header is the normative description.
What each file feeds:

- `units.yaml` — units, the unit of an ingredient line (§6), each with its `kind` and
  canonical spelling (§13). Feeds the parser, the formatter, cards and the shopping list.
- `densities.md` — what a stated volume of a named ingredient weighs, one sourced row per
  ingredient; the guide is `docs/densities.md`. Feeds the shopping list and `etna density`.
- `operations.yaml` — the canonical verbs of a step (`mix`, `fold`). Feeds the `action`
  kind of a mark (§5.3): a mark that opens with one, or with `let` and one.
- `tools.yaml` — equipment an operation may use, each with a `kind` (machine, appliance,
  cookware, vessel, utensil). Feeds the `tool` kind of a mark.
- `modifiers.yaml` — how an operation is performed: levels, dials (heat, speed) and modes.
  They feed the `setting` kind of a mark.
- `stop-conditions.yaml` — when an operation is done: the units and words of a duration,
  the units of a temperature and the words that give it a role, the words a cue opens with.
  Feeds the `duration`, `temperature` and `cue` kinds of a mark.

None of the four registries that feed the kinds changes a chart or a card: the kinds are read
for `etna marks` only.

---

## 12. Naming conventions

For all identifiers, keys, registry names, slugs, and file names, prefer names in this
order:

1. **Hyphen** (kebab-case) for multi-word names wherever the syntax permits hyphens —
   e.g. slugs (`potato-soup`), registry values (`high-speed-blender`), file names.
2. **Single word** when collapsing stays clear and loses little meaning — e.g. `cue`
   rather than `visual-cue`.
3. **Quoted string with a space** where the format allows it (most YAML values, quotable
   keys) — prefer this over jamming words together.
4. **Underscore** only when absolutely necessary (e.g. a target language or tool forbids
   the alternatives).

---

## 13. Canonical source style

This is the one style `etna fmt` writes. It works by small edits in place and checks its own
work: an edit that would change how the recipe reads, or the shape of the Markdown, is
dropped and that part is left as written. Instructions are never reworded. A formatting
difference never makes a recipe invalid (§9), and unique heading text is a lint rule, not a
style (`duplicate-heading`, §9). The style is for the source only; a theme decides how it is
displayed (`1 ½`, `grams`, `2 to 3`).

**Layout**

1. **One blank line between blocks.** Headings, paragraphs, lists, block quotes and the
   frontmatter are separated by exactly one blank line; a run of blank lines becomes one.

   ```markdown
   ## Mix

   - 100 g flour
   ```

2. **Tight lists.** No blank line between the items of a list: `- 100 g flour` is followed
   directly by `- 2 g salt`.
3. **`-` for bullets.** `* 1 cup flour` becomes `- 1 cup flour`. Two lists side by side that
   only their markers tell apart keep their markers.
4. **Clean line ends.** No trailing white space, LF line endings, one newline at the end of
   the file: a last line `Stir.` followed by spaces and three blank lines ends as `Stir.` and
   one newline. Two or more trailing spaces that make a hard line break are kept, and
   reported.
5. **Lines are never wrapped or joined.** Line length is free: a long instruction stays on
   one line. Code, HTML and the frontmatter's text pass through untouched.

**Frontmatter**

6. **Fixed key order:** `etna`, `form`, `source`, `yield`, `license`, `version`, then any
   other key in its existing order, `extra` last. `yield: 2` above `etna: 1` moves below it.
   A key moves with its indented lines and the comments above it; values and quoting are
   never rewritten. Frontmatter too irregular to move safely is left, and reported; a file
   with broken or missing frontmatter is not formatted at all.

**Ingredient lines** (§6)

7. **Quantities:** ASCII fractions, a hyphen for a range, no thousands separator; a decimal
   stays as written. `1½ cups` becomes `1 1/2 cups`, `2 to 3 cloves` becomes `2-3 cloves`,
   `1,000 g` becomes `1000 g`.
8. **Units:** the unit's symbol when it has one (`g`, `ml`, `tsp`, `tbsp`, `oz`, `lb`), never
   pluralized; otherwise its name, agreeing in number with the quantity: singular up to and
   including 1, plural above 1 and for any range, plural for a decimal other than 1. `cup`,
   `pint`, `quart`, `gallon` and size, piece and container words have no symbol.
   `2 Tablespoons sugar` becomes `2 tbsp sugar`; `2 clove garlic` becomes `2 cloves garlic`.
9. **Spacing:** one space after the list marker, one between quantity, unit and item, and
   one after the comma before the preparation. `-  2 tbsp  sugar,  sifted` becomes
   `- 2 tbsp sugar, sifted`. A remark after ` — ` is only respaced. A reference link has only
   its leading amount rewritten.

**Temperatures**

10. **`350°F`, `180°C`:** the number, the degree sign and a capital letter, with no space.
    `bake at 180 ° C` becomes `bake at 180°C`. It applies in preparation notes, step and
    direction prose, callouts and notes; not inside a remark or code. The number is
    never rewritten, so a range keeps its own dash (`78–80 °F` becomes `78–80°F`).
    Temperatures are the only thing rewritten inside prose: `60–75 minutes` stays.
11. **A temperature without its scale** (`350 degrees`, `350°`) takes the scale the recipe
    states everywhere else, or °F when the value is 300 or more (nothing is cooked that hot in
    Celsius); otherwise it is left, and reported. `Heat to 350 degrees.` becomes
    `Heat to 350°F.` A number with no degree sign (`350 F`), an angle (`turn 90 degrees`) and
    a difference (`lower the oven by 25 degrees`) are left as written.

**Leads**

12. **A bold lead takes an em dash:** `**Label** — text`, asterisks for the bold and one
    space on each side of the em dash. It applies to a callout (`> **Keyword** — text`, one
    space after `>`), a traditional step name, and the lead of a note, paragraph or list
    item. `> __Note__: cover and chill.` becomes `> **Note** — cover and chill.` On input,
    `__` for the bold and `–`, `--`, `-` or `:` after it are read as the same lead.

**Traditional parts** (§4.1)

13. **Parts are `###` headings.** A bold-line ingredient group becomes a `###` heading:
    `**Dough**` alone on a line becomes `### Dough`. Direction labels become part headings
    when one of them names an ingredient group or is followed by unlabeled steps (then all
    of them do), and the numbering restarts at 1 in each part; otherwise they stay step names.
    When it cannot tell, the directions are left as written and the note says why
    (`parts undecided: …`). A hyphen or en dash in a heading is never rewritten as a
    qualifier.

**Marks** (§5.3)

14. **Asterisks for a mark.** In a structured step's instruction, emphasis written with
    underscores is written with asterisks: `_medium-low_` becomes `*medium-low*`, and bold
    with emphasis `___stir___` becomes `***stir***`. Nothing else about a mark changes: it is
    never added, removed or moved, also where a temperature inside or beside it is rewritten
    (`*350 degrees*` becomes `*350°F*`). The `_none_` placeholder (§4.1) is not touched.
