# 0004 — Loose on vocabulary, strict on topology

Status: Accepted

> **Superseded in part (2026-11-07).** The example in the Reasoning, "a `Checkpoint` callout
> declares a branch", no longer holds: a `Checkpoint` is a marker on its step's node, not a
> branch (SPEC §5.1, ADR 0006). The explicit construct for alternatives is `Choose`, drawn as
> a marked group with exclusive edges (SPEC §5.2, ADR 0009). The decision itself stands.

## Question

How strict should validation be about the *words* a recipe uses versus how its *parts
connect*?

## Decision

**Loose on vocabulary, strict on topology.**

- *Vocabulary* — what an operation, ingredient, unit, tool, or modifier *is*. Unknown terms
  are allowed; they stay untyped prose and produce at most a warning.
- *Topology* — how things connect: steps, the implicit spine, references and merges, the
  requirement that a step has an instruction. These are errors and must be explicit and
  resolvable.

## Reasoning

- Vocabulary degrades gracefully: gradual typing means prose always renders, and AI fuzzy
  matching can map a term to a canonical one later. Rejecting a draft over an unknown word
  would kill approachability and block the registry-growth loop.
- Topology is the DAG skeleton and **cannot be safely guessed**. A hallucinated edge
  silently corrupts the graph and the distance metric, so the author must make connections
  explicit (e.g. a `Checkpoint` callout declares a branch rather than leaving it to be
  inferred — see ADR 0006).
- This split is what lets the deterministic linter own topology (errors), while the AI
  review coaches on vocabulary (warnings, could-type) without ever being the gate.

## Rejected alternatives

- Strict vocabulary (reject drafts that use unregistered terms): hostile to authoring,
  kills bottom-up registry growth.
- Loose topology (let AI infer structure): unreliable graphs, untrustworthy distances.
