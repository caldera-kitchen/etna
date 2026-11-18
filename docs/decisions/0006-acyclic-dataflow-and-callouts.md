# 0006 — Canonical graph is acyclic dataflow; control flow is callout annotations

Status: Accepted

## Question

Recipes contain conditionals, retries, and "to taste" loops (e.g. "tent if browning
early"). Should these become first-class nodes and edges in the
recipe graph?

## Decision

No. The **canonical** recipe graph is a **dataflow** DAG — nodes are operations, edges are
intermediate products — and it stays **acyclic**. Control-flow constructs are captured as
first-class **callout annotations** on the relevant node (the first being `Checkpoint`),
not as nodes or edges. The full control-flow graph (decision nodes, remediation branches,
loops) is an optional, derived **procedure view**, generated on demand.

## Reasoning

- The canonical graph has two jobs: render a clean recipe diagram, and make recipes
  **comparable** (the distance metric runs on combination structure). Both degrade if every
  "if it looks dry, add water" sprouts a decision diamond.
- Promoting a retry to nodes makes the graph **cyclic** ("blend until fixed" is a loop),
  breaking the DAG premise.
- It would also wreck comparability: a recipe and the same recipe *plus a contingency note*
  would look structurally distant, though they are the same dish. Conditionals are
  footnotes to the anatomy, not the anatomy.
- We already collapse the commonest loop in cooking — "cook until golden" — into a
  stop-condition annotation rather than a drawn cycle. Treating Checkpoints the same way is
  the consistent choice.
- Keeping the conditional explicit (as a `Checkpoint` callout) still honors "strict on
  topology" (ADR 0004): the branch is declared by the author, not inferred from prose.

## Rejected alternative

Model conditionals/retries as first-class control-flow nodes and edges in the canonical
graph. Rejected for breaking acyclicity and comparability; offered instead as an opt-in
procedure view.
