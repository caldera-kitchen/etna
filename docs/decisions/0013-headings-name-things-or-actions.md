# 0013 — Headings name things or actions, in the author's words

Status: Accepted

> Decided 2026-11-07 (SPEC §4 Naming and §8 hoisted ingredients); "headings keep the author's
> wording" decided 2026-11-06.
>
> **Superseded in part (2026-11-15).** "The chart's node text is derived from the prose and
> the registries" no longer holds: a box shows the step's heading and the words its
> instruction marks, which the author chooses ([ADR 0021](0021-a-chart-box-is-the-heading-and-the-marked-words.md)).
> The decision on headings stands.

## Question

The step and component headings are free text. The flow chart draws a step heading on its
node, and a card that hoists ingredients needs names to group them under. Should headings
follow a form, be regularized against a vocabulary, or carry text written for the chart?

## Decision

- **A component heading names what is made**, a noun (`Dough`, `Filling`).
- **A step heading names what is done**, a short verb phrase built from the direction's own
  words (`Cream butter and sugar`).
- This is a **convention**: the linter does not check it.
- **Headings keep the author's wording**, timing words included, when a recipe is converted.
- **Nothing chart-specific is written in a recipe.** The chart's node text is derived from
  the prose and the registries.
- A card that hoists the ingredients into one list groups them **by component, never by
  step**.

## Reasoning

- The tools rely on it: the chart draws the step heading on the node, and the hoisted card
  groups under component names.
- The written recipe is for people; the chart follows from it rather than the reverse.

## Rejected alternatives

- **Regularize step headings against the operations registry**: it would replace the
  author's words.
- **A `> **Chart** —` line per step** holding the node text: nothing chart-specific is
  written in a recipe.
- **Hoisted ingredients grouped by step**: the wording of ADR 0001's reasoning, replaced by
  grouping under component names.

## See also

- SPEC §4 (Naming), §8 (hoisted ingredients); ADR 0008; ADR 0021 (what a chart box shows).
