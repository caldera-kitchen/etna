# 0005 — Provenance lives in the generated file; one bundled toolchain version

Status: Accepted

> The typed file, `recipe.etna.yaml`, and the provenance block it was to carry are not part of
> Etna 1.0; what stands is that the frontmatter carries only the format version and the
> standard ships one bundled toolchain version.

## Question

How do we version the standard and record which tooling produced a recipe's typed layer,
without polluting the human-authored file or its diffs?

## Decision

Three homes for version information:

1. **Human frontmatter** carries only `etna:` — the integer *format version* (how to
   interpret the file). It rarely changes.
2. **The generated `recipe.etna.yaml`** carries the full **provenance block**: toolchain
   version, model id, timestamp, registry snapshot, and a hash of the source Markdown body.
3. **The standard** (spec + registries + skill + docs) ships **one bundled toolchain
   semver** per release.

## Reasoning

- Putting tool versions in the human frontmatter would churn its diffs every time a tool
  re-runs — violating the clean-diff goal. The generated file is machine-owned, so churn
  there is invisible.
- One bundled version (rather than independent per-component versions) makes "is this
  recipe stale relative to current tooling?" a single comparison.
- `body-hash + toolchain version` gives a deterministic "needs re-enrichment" query across
  the whole collection (e.g. re-run every recipe generated under `< 0.5.0`).

## Rejected alternatives

- Per-recipe tool-version stamps in frontmatter (diff churn, clutter).
- Independently versioning each component (spec, each registry, skill): more numbers to
  track and reconcile for little practical gain.
