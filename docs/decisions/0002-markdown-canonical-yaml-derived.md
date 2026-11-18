# 0002 — Markdown is canonical; the typed YAML is derived

Status: Accepted

> The typed file, `recipe.etna.yaml`, is not part of Etna 1.0; what stands is that the
> Markdown is the recipe, and anything derived from it can be thrown away and made again.

## Question

What is a recipe's source of truth — the human-authored Markdown, or a structured
representation?

## Decision

`recipe.md` (Markdown) is canonical and human-authored. The structured/typed layer
(`recipe.etna.yaml`) is **generated, derived, and disposable** — never the source of truth.

## Reasoning

- The project's founding goals are human-readability and clean git diffs. Markdown serves
  both; a structured data file serves neither as well for hand-editing.
- The recipe card and the coarse DAG are derivable from the Markdown structure alone, with
  no AI. Only the *typed* layer (canonical operations, parsed stop-conditions) needs
  enrichment, and it exists for analytics and the distance metric — things that can be
  regenerated at will.
- Keeping one canonical human file avoids drift and keeps authoring approachable (gradual
  typing: prose first, structure derived).
- Deleting the generated file loses analytics, never the recipe, card, or coarse DAG.

## Rejected alternatives

- A structured DAG/YAML as canonical: harder to hand-edit, noisier diffs, raises the bar to
  author a recipe.
- Dual canonical (both the Markdown and the structured form authoritative): two sources of
  truth drift apart — the exact failure mode the format is designed to avoid.
