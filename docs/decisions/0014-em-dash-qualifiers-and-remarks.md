# 0014 — An em dash introduces a qualifier or a remark

Status: Accepted

> Decided 2026-11-07; replaces a rule that read a trailing parenthesis as
> a qualifier.

## Question

A part heading often carries words that are not its name (`Dough — Day 1`), and an
ingredient line often carries words that are not preparation (a baker's percentage, a weight
for a volume). How does the source mark them, so that parts still pair and the preparation
stays the preparation?

## Decision

- **On a part heading**, everything after the first em dash with a space on each side
  (` — `) is a **qualifier**, not part of the name: `### Breads for Soup — optional`
  pairs with `### Breads for Soup`. The full heading prints, and its anchor is built from the
  whole text.
- **On an ingredient line**, the first ` — ` outside parentheses, looked for before the comma,
  starts a **remark** that is not preparation: `100 g water, warm — 70%`,
  `1 cup flour — about 120 g`. It may hold commas. A comma still introduces the preparation.
- **Only the spaced em dash counts.** A hyphen, an en dash, an unspaced dash and parentheses
  are part of the text, and the formatter does not rewrite them into an em dash.
- The same mark separates a bold lead from its text in a callout, a step name and a note.

## Reasoning

- One convention covers both places, and it is the mark the format already uses after a
  bold lead.
- A spaced hyphen is not a qualifier because, in a collection of about 500 home recipes, such
  headings name the part after the hyphen as often as before it: `Day 1 - Dough` and
  `Day 1 - Filling` would both become `Day 1`.
- A remark is not preparation, and the outputs treat it differently: a card prints it after
  the preparation, a shopping list leaves it out, a chart that shows names only drops it.

## Rejected alternatives

- **A trailing parenthesis as the qualifier**: the earlier rule, replaced so that one mark,
  the spaced em dash, serves every place.
- **A spaced hyphen as well as the em dash**: it would merge parts named after the hyphen.

## See also

- SPEC §4.1 (Parts), §6 (remark), §13 rule 12 (leads); ADR 0010.
