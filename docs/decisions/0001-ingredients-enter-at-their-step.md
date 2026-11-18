# 0001 — Ingredients are introduced at the step where they enter

Status: Accepted

> **Superseded in part (2026-11-07).** "Grouped by step" in the Reasoning no longer holds: a
> card that hoists the ingredients into one list groups them by component, never by step, and
> how a card arranges them is a theme's choice (SPEC §8, ADR 0013). The decision itself stands.

## Question

How should a recipe associate ingredients with the steps that use them, given that we want
both a traditional card (one ingredient list) and a directed graph (ingredients flowing
into operations)?

## Decision

A recipe is an ordered list of steps; **each step declares the ingredients that enter at
that step**. There is no separate, top-level master ingredient list in the source file.

## Reasoning

- A DAG needs to know which ingredients feed which operation. Declaring them locally makes
  that binding explicit and trivial — the graph falls out of the structure with no NLP.
- It eliminates an entire class of drift: an ingredient cannot be orphaned (listed but
  never used) or missing (used but never listed), because it is born attached to its step.
  This was observed concretely in recipes exported from MacGourmet, where an ingredient
  appeared in a recipe's directions but not its ingredient list.
- Both deliverables are still cheap: the card's ingredient list is the union of all steps'
  ingredients (grouped by step); the directions are the ordered step prose.
- It matches how the author already reasons about recipes by hand (the ice-cream DAGs that
  inspired the project introduce ingredient groups at each operation).

## Rejected alternative

A single master ingredient list plus steps that reference it by name or id. Rejected
because the references must be kept in sync (diff churn, dangling pointers) and because the
"used but unlisted" failure mode is exactly what broke imported legacy recipes.
