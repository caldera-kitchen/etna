# 0010 — Traditional form: a part is a heading, paired by name

Status: Accepted

> Decided 2026-11-05; reconfirmed 2026-11-07.

## Question

In the traditional form a labeled direction (`1. **Beans** — …`) was doing two jobs. In a
collection of about 500 home recipes, 33 label every step and the label names that step; in
55 the label heads a run of steps; in 23 the labels equal the ingredient group labels, so the
recipe is really made of parts. How should a part be written?

## Decision

- **A part is a real heading.** `### Beans` under `## Ingredients` holds that part's
  ingredients; `### Beans` under `## Directions` holds its steps. The two pair by name. The
  bold-line ingredient group (`**Beans**`) becomes a `###` heading too.
- **A step name stays a bold lead** (`1. **Soak** — …`): it names one step, never a run.
- **Numbering restarts at 1 in each part.**
- **The older spellings are still read**, and `etna fmt` rewrites them as parts when it can
  tell: a label is a part when it matches an ingredient group or is followed by unlabeled
  steps; otherwise it stays a step name; a recipe it cannot classify is listed for a decision.

## Reasoning

- One mark for one job: a heading heads a run, a bold lead names one step.
- It makes the traditional form exactly what the structured form flattens to — component ↔
  part heading, step heading ↔ step name — so a structured recipe can always produce a
  traditional card or `recipe.md`. The reverse still needs judgment: which ingredient enters
  at which step, and which parts run in parallel.
- Pairing by name lets a card print a part's ingredients beside its steps.

## Rejected alternatives

- **Keep the bold direction label for both jobs**: a reader, and the tools, cannot tell
  whether it names one step or heads several.
- **A bold line as the ingredient group, not a heading**: it pairs with nothing on the
  directions side.

## See also

- SPEC §4.1 (parts, pairing, numbering), §13 rule 13 (what `etna fmt` writes).
- ADR 0014 (a qualifier after an em dash on a part heading).
- `docs/structuring-playbook.md` (taking a recipe from the traditional form to the structured).
