# 0012 — A link to a group means all of its sub-components

Status: Accepted

> Decided 2026-11-06; the step before a `Choose` over a group decided 2026-11-07.

## Question

A component whose children are all components (a **group**, such as `## Fillings` holding
`### Custard` and `### Jam`) has no single output. One could require a reference to name its
leaf sub-components directly, or read it as the group's last sub-component. What does a link
to a group mean?

## Decision

- **A link to a group stands for a link to each of its children**, in order; a child that is
  itself a group expands the same way, all the way down. The chart draws one edge from each
  sub-component's output into the step that links it.
- **A quantity on such a link** cannot say how much of which, so it is a warning
  (`quantity-on-group-reference`): link the sub-component the amount applies to.
- **A link to a `Choose` component means one branch**, the one the cook picks.
- **The step before a `Choose` whose branch is a group** feeds every sub-component of that
  group, nested groups expanded, one edge into each.
- A link to the step that makes it, or to a component that holds that step, is an
  `unresolved-reference` error and draws no edge.

## Reasoning

- A group bundles things that come together; a cook who reads `- [fillings](#fillings)`
  takes both fillings, not the last one.
- Reading it as the "last sub-component" is a silent guess, against ADR 0004 (strict on
  topology).
- A link to its own step would draw a cycle silently; the canonical graph is acyclic
  (ADR 0006).

## Rejected alternatives

- **The last sub-component**: wrong for `Fillings`, and silent.
- **Warn on a link to a group** and have the author link the leaves.
- **The step before a `Choose` feeds only the group's first sub-component**: decided the
  other way, the same rule as a link to a group.

## See also

- SPEC §7 (Groups; Group vs. Choose), §9.
