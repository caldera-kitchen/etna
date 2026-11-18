# 0016 — Preparation steps are the author's choice; the chart draws an edgeless step apart

Status: Accepted

> Decided 2026-11-08 (SPEC §4 Naming, §8 Coarse DAG; playbook *Equipment steps*). Follows a
> comparison of two recipes whose preheat steps drew differently.

## Question

A step that touches no ingredient and feeds no other step, a preheat or a pan to line, has no
place in a dataflow. Written as the first step of a flat recipe it chains into the next step
and draws as an ordinary node; written as a top-level step before the components it chains to
nothing (SPEC §7: the spine does not carry a step past the first component) and drew as a
node with no arrows, which looked broken. Should the chart drop such steps, link them to the
step that needs the oven, or treat them by a rule of its own?

## Decision

- **No chart rule decides what a step is.** Where the author places the heading decides it,
  and the chart follows SPEC §7 deterministically.
- A step written **in a chain** (the first step of a flat recipe, or the first step inside a
  component) is an ordinary step and chains to the next.
- A step written **before the components**, joining nothing, is **preparation**. The chart
  draws it first, in a row of its own, in a dashed outline under the caption "Before you
  start" (theme values `prep-label`, `prep-fill`, `prep-dash`).
- An author of a flat recipe who wants preparation set apart may wrap the chain in one
  component for that purpose (`## Preheat the oven`, then `## Biscuits`). This is the one
  stated exception to the guidance that a component earns its name only when the recipe
  makes more than one thing (SPEC §4, ADR 0008).
- A converter follows the original's shape and does not choose for the author: a first
  equipment-only direction stands top-level when the recipe has components, and sits in the
  chain when it does not (playbook *Equipment steps*).

## Consequences

- A recipe of either shape stays as written; either can be flipped by moving one heading.
- In a collection of about 500 home recipes, 39 charts draw a preparation row and 47 flat
  charts begin with an equipment step in their chain. Both pictures are correct by this
  decision.
- The chart does not drop preparation steps, and draws no dashed edge from a preheat to the
  step that uses the oven: neither is needed for consistency, and the second would need the
  chart to know which step uses the oven.
