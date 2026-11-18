# 0008 — Single-step sub-preparations nest as sub-components

Status: Accepted

> Decided 2026-06-27; refined 2026-11-07 by the guidance in SPEC §4.

## Question

A component sometimes needs a small preparation made apart and merged in later: the yudane
and the mashed potato that go into a cinnamon-roll dough. Each is one step. Should such a
preparation be a plain step in the component's sequence, or a named sub-component of its
own, even though it holds a single step?

## Decision

**A single-step sub-preparation nests as a sub-component** under the component it feeds:
H2 component → H3 sub-component → H4 step. The step that uses it merges it by reference
(`- [yudane](#yudane)`, SPEC §7), exactly as it would a multi-step sub-component.

First used in `cookbook/next-day-soft-cinnamon-rolls`: under `## Dough`, `### Yudane` and
`### Mashed potato` each hold one H4 step (`#### Stir`, `#### Cook and mash`), and
`### Mix` merges both by reference.

**Refinement (2026-11-07, SPEC §4 guidance).** A component earns its name when the recipe
makes **more than one thing**; a recipe that is one chain of steps stays without components,
however nameable its result. A single-step component is allowed under the same test: it is
named because it is a separate thing made apart and joined later, not because it is long.

## Reasoning

- **Topology must be explicit** (ADR 0004). A yudane made apart is a parallel branch; as a
  plain step it would sit on the dough's implicit spine (SPEC §7) and the next step would
  consume it silently, so the graph would say "stir, then mix" instead of "stir apart, then
  merge". Nesting gives the branch its own spine and a named output to link to.
- **One rule, not two.** A sub-preparation is a sub-component whether it takes one step or
  five; the author does not restructure the recipe when a step is split or joined.
- **The leaf-vs-parent rule already allows it** (ADR 0003): a heading with one sub-heading is
  a component, and depth is read by role, not level.
- **The more-than-one-thing test keeps it honest.** Without it, every step could be wrapped
  in a component of its own; with it, a name appears only where something is made apart and
  later joined.

## Rejected alternatives

- **Keep the preparation as a plain step in the component's sequence**: it sits on the
  spine, so the branch is hidden, and its ingredients have no component name to group under
  on a hoisted card (SPEC §8).
- **Allow nesting only for multi-step sub-preparations**: forces an arbitrary threshold and
  a restructure whenever a preparation grows or shrinks by one step.
- **Hoist the sub-preparation to its own recipe**: right for a preparation reused across
  recipes (SPEC §4), heavy for one used once.

## See also

- SPEC §4 (the leaf-vs-parent rule and the component guidance) and §7 (references, merges
  and the implicit spine).
