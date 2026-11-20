# Callouts — design intent

> The working reference for Etna's callout system: the two keywords, the open labels of
> asides, the `Choose` construct, and how a keyword relates to what a renderer shows.
> Normative rules live in [`../SPEC.md`](../SPEC.md) §5.1 and the decisions in
> [`decisions/0009`](decisions/0009-choose-and-callout-strictness.md) and
> [`decisions/0019`](decisions/0019-open-callout-labels.md); this file is the fuller design
> intent.

A callout is an aside attached to a step or component, written as a blockquote led by a bold
label and an em dash:

> **Label** — text

## Two keywords, and every other label

Callouts split by whether they change the recipe's **topology** (the graph the card and DAG
derive from) or are purely **informational**. Strictness follows that split
([ADR 0004](decisions/0004-loose-vocabulary-strict-topology.md)): only the two labels that carry
structure are keywords; the rest is vocabulary, and vocabulary is loose
([ADR 0019](decisions/0019-open-callout-labels.md)).

| Label | Kind | What the linter says |
|-------|------|----------------------|
| `Checkpoint` | keyword — assess-and-(maybe-)act on a step | written exactly; a near-miss is an error |
| `Choose` | keyword — mark a component's children as XOR branches | written exactly; a near-miss is an error |
| anything else | an informational aside | nothing |

Rationale: a keyword that silently degrades to prose loses graph meaning, so a likely mistake
for one must not pass unnoticed; an aside never touches the graph, so its label is the author's
own word.

## Asides — any label

*(ADR 0019.)* An aside is an informational
callout with whatever label fits it: a tip, a warning, how to make it ahead, a variation, how
to store it.

```markdown
## Make the caramel

- 200 g sugar
- 60 g water

Boil without stirring until deep amber.

> **Warning** — the sugar is very hot.

> **Make ahead** — it keeps a week in a jar.
```

- **Label**: any text in bold before the em dash. `Note` is the conventional one when no
  better word comes to mind; nothing else is preferred, and nothing is reserved apart from the
  two keywords.
- **Graph**: none. It adds no edge, marker or ingredient.
- **Card**: printed under its step, the label as written: `<aside class="callout
  callout-aside">`, the same class for every label (`themes/README.md`, Classes). A theme does
  not style one label apart from another. A bold lead over 32 characters is a sentence rather
  than a label: it prints in bold at the start of the aside instead.
- **Chart**: left out, like the instruction prose. Only a `Checkpoint` is drawn on a node.
- **Notes section**: a note about the recipe as a whole goes in `## Notes` (ADR 0011); an aside
  about one step stays in that step.

### Optional things and substitutions are not callouts

Guidance, not a lint rule. Each already has a place where it is said once, next to what it is
about:

- **An optional or alternative ingredient** says so in its remark: `- 6 leaves fresh basil —
  optional`, `- 500 g navy beans — or Great Northern, Cannellini, Flageolet, or 17 bean mix`
  (SPEC §6). An `or` in the name (`- 3 oz pastina, orzo, stars, or acini di pepe`) is part of
  the name. A shopping list prints the remark (`— or Great Northern, Cannellini, Flageolet, or
  17 bean mix`), and says "(optional)" for an item every line of which is optional.
- **A whole optional component or step** says so in a qualifier on its heading: `## Glaze —
  optional` (SPEC §6, the em-dash qualifier of ADR 0014). Tools do nothing with it yet.
- **An optional or alternative action** is half a sentence of the step ("sprinkle with sugar,
  if desired") and stays there.
- **A choice between whole methods** is a `Choose`.

An author who writes `> **Optional** — …` or `> **Substitute** — …` anyway gets a plain aside
like any other label.

## `Choose` — exclusive alternatives and variations

`Choose` marks a **component** whose **direct child headings are mutually exclusive branches**:
the cook picks one. In the DAG its branches are drawn as alternatives inside one marked group:
the step before fans out to each branch and each branch leads on to the step after, and the
graph records those edges as *exclusive* (one is taken), so the dataflow DAG stays acyclic
([ADR 0006](decisions/0006-acyclic-dataflow-and-callouts.md); SPEC §5.2). `Checkpoint`, by
contrast, is a marker on its step's node, not a branch (SPEC §5.1).

Grammar:

- The callout sits directly under the component heading (a component carries no instructions of
  its own, so the callout is its only direct content).
- The **branches** are that heading's child headings; scope ends at the next heading of
  equal-or-shallower level, or EOF. No explicit terminator — heading levels self-delimit.
- **At least two branches** (a one-branch choice is meaningless — linter error).
- A branch may be a single leaf step or a multi-step subtree.
- Branches are alternatives for their ingredients too: an ingredient every branch takes is
  listed in each branch, with the amount that branch takes, and amounts in different branches
  are never added together (SPEC §5.2).

### Pure alternative (self-contained methods)

```markdown
## Bake

> **Choose** — one method.

### Cold-oven start
- 400 g dough
Shape, rise 40 min. Cold oven with a bowl of water; 450 °F, 20–30 min to 210 °F.

### Dutch oven
Preheat pot + lid to 450 °F. Drop in 800 g shaped dough, cover; 30 min, then uncover 15 min to 210 °F.
```

### Base + variations (shared setup, then a delta per branch)

The shared base is just a sibling step *before* the `Choose` node; the spine carries it into
every branch. A shared finish would be a sibling step *after* it.

```markdown
## Pudding

### Base
- 500 g whole milk
- 100 g sugar
- 3 egg yolks
Cook to nappe, 82 °C.

### Flavor
> **Choose** — make one.

#### Vanilla
- 1 vanilla bean, seeds
Steep into the base off heat.

#### Chocolate
- 60 g cocoa
Whisk into the hot base until smooth.

#### Pistachio
- 80 g pistachio paste
Blend into the base.
```

### In-document vs. separate recipes

Big variation families can instead be **separate recipes sharing a base via §7 includes**
(`pudding-base/` + `pudding-vanilla/` …) — the DRY, community-friendly route (someone
contributes `pudding-matcha` without touching yours). Use in-document `Choose` for the
small/inline case; includes for large families. Author's judgment.

### Rendering

- **Card** (deterministic, role-driven): the `Choose` node renders as a *"Choose one"* block;
  each branch shows its label and its own hoisted ingredients (a shared `Base` hoists once,
  above). The §8 hoist, with a choice header.
- **DAG**: a marked group holding the branches as alternatives, joined by exclusive edges;
  branches share the upstream input; the group's output is "the chosen branch" (SPEC §5.2). A
  procedure view may expand it into a decision node later.

## Keyword vs. display label

The source carries a keyword exactly (`Choose`, `Checkpoint`); a render/theme layer maps it to
a **display label** — "Pick one", "OR", an icon, a localized word. Properties:

- **Output-only and one-way.** We map keyword → label at render; we never parse a label back
  as a keyword. The source stays singular and unambiguous.
- **Theme/global scope**, never per-recipe.
- **Keywords only.** `Checkpoint` can show as "Check"; an aside's label is the author's own word
  and prints as written, so a theme's `labels.callouts` maps keywords only (a theme check warns
  about any other key).

### "Did you mean" — the safety net for staying loose

Because asides take any label, a mistake for a keyword would otherwise slip through as a
harmless aside and silently lose meaning. The linter flags a label that looks like a mistake
for one, in case, spacing, spelling or number:

- → `Choose`: `choose`, `CHOOSE:`, `Chose`, `Chooses`, `Chooes`, `Hcoose`
- → `Checkpoint`: `checkpoint`, `Check point`, `Checkpoint 2`, `Checkpoints`, `Chekpoint`, `Chekpiont`

The test, kept simple enough to say in one sentence: with letter case and everything but letters
ignored and one trailing `s` dropped, the label is at most one slip from the
keyword for every five of its letters (one for `Choose`, two for `Checkpoint`), where a slip is
a letter added, dropped or changed, or two neighboring letters swapped. Every one-keystroke
slip of a keyword is caught, wherever in the word it falls; `Close`, `Those`, `Cheese`, `Chore`
and `Chosen` are two slips from `Choose` and stay asides, and so do synonyms such as
`Variation`, `Option`, `Check` or `Choice`: another word is not a slip of typing, and the rule
keeps no list of words.

This is an **error (`callout-near-miss`, SPEC §9), not an input alias** — we never reinterpret
the word as the keyword, so left alone the card would print it as an aside and the chart would
draw no marker or no choice for it. The file fails until the label is the keyword or another word.

## Open / deferred

- A **"recommended/default" branch** flag (e.g. mark the Dutch-oven method as preferred)? Out
  of scope for now.
- What tools do with an **optional heading** (`## Glaze — optional`): a chart could draw the
  step as skippable, a shopping list could mark its ingredients optional. Decided later.
