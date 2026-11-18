# 0003 — Heading meaning is by structural role, not level number

Status: Accepted (amended 2026-06-27 — the title is now the body H1; see Update)

## Question

How do headings encode steps vs. components without the meaning of a given heading level
(e.g. H2) shifting depending on the recipe?

## Decision

The body contains no H1 (the title is in frontmatter, the conceptual single H1). A
heading's meaning is read from its **structural role**, depth-agnostic:

- a **leaf** heading (no sub-headings beneath it) is a **step**;
- a heading **with** sub-headings is a **component** (a named branch / sub-recipe).

So a flat recipe is all H2 steps; a multi-component recipe is H2 components over H3 steps;
and a recipe can go deeper (H2 → H3 sub-component → H4 steps) when a group genuinely
bundles multiple multi-step sub-preparations. Siblings may mix leaf-steps and
parent-components.

## Reasoning

- An earlier draft made components H2 and steps H3, so H2 meant "step" in flat recipes but
  "component" in nested ones — the step level slid with context. That overloading is the
  problem this record fixes.
- Pinning steps to a fixed number instead (e.g. always H3) would force every simple recipe
  to carry a wrapping component heading it must name — ceremony on the common case.
- Putting components at H1 was rejected for violating Markdown's one-H1-per-document
  convention (the title is the H1).
- The leaf-vs-parent rule needs no special case for depth: it reads like any document
  outline, keeps simple recipes flat, and a single-step "group" naturally collapses to a
  step (a leaf is always a step), so it self-discourages pointless nesting.

## Rejected alternatives

- Components at H2 / steps always at H3 (uniform but taxes the simple case).
- Components at H1 (violates one-H1).
- Context-dependent level meaning (the original inconsistency).

## Update (2026-06-27)

The "no H1 in the body" corollary was reversed: the recipe **title is now the body's H1**
(SPEC §3–§4), removed from frontmatter. The core of this decision — the leaf-vs-parent rule
and avoiding an overloaded H2 — is unchanged. The single H1 is the title and is exempt from
leaf-vs-parent; structural headings still begin at H2. Motivation: frontmatter became thin,
and a real H1 renders as a proper title when browsing recipes on GitHub.
