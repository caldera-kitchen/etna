# 0007 — Drop authored tags from the format

Status: Accepted

## Question

Should a recipe carry hand-authored `tags` in its frontmatter?

## Decision

No. The `tags` key is removed from the format. Recipes do not carry authored tags.

## Reasoning

- Full-text search covers the historical job of tags (finding recipes by a word), so
  tags-as-search-aid adds little.
- The remaining candidates split cleanly, and neither belongs in an authored frontmatter
  list:
  - *Objective* facets (course, cuisine, dietary) are largely **derivable** by the typed
    layer (e.g. infer "vegetarian" from the ingredients) rather than hand-maintained.
  - *Personal/subjective* facets (favorite, rating, to-try) must not live in the shareable
    recipe at all — they belong in a per-user personal overlay, outside the recipe (ADR 0002
    keeps the recipe canonical and objective for everyone).
- Removing the field keeps frontmatter minimal and avoids stale, inconsistent hand-tagging.

## Rejected alternative

Keep `tags` as a recognized optional key. Rejected: it duplicates search, invites drift,
and mixes derivable/objective facets with personal/subjective data in one authored list.
