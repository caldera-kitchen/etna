# 0011 — Notes are one section, the last H2, printed only when asked

Status: Accepted

> Decided 2026-11-06 (a `## Notes` section for the structured form; off by default on every
> card); refined 2026-11-07 (any Markdown, no hint; `notes-misplaced` an error).

## Question

Where does what the cook should know about the recipe as a whole — storage, variations,
where it came from — go in the structured form, where every leaf heading is a step? And
does every card print it?

## Decision

- A recipe may end with **one** `## Notes` section: the **last H2 of the body**, running to
  the end of the file. It is the same section in both forms.
- It holds **any Markdown**. One list item per note is the usual shape, a convention with no
  hint.
- It is not a step or a component: no ingredients, no required instruction, no callouts with
  a meaning, not part of the graph.
- An H2 named `Notes` that is not the last H2, or a second Notes section, is an **error**
  (`notes-misplaced`).
- A note about one step stays in that step, as a callout (`> **Note** — …`).
- **Every card leaves the notes out unless asked**, and says nothing in their place.

## Reasoning

- Notes are about the recipe as a whole, not about one step, so they cannot be a step; the
  last H2 is the one place a section can stand apart from the steps.
- An H2 called `Notes` anywhere else would be read as a step, so it is an error rather than a
  silent misreading.
- Converting a traditional recipe moves its notes word for word (`etna restructure check`
  proves it), so the section must take whatever Markdown the notes were written in.

## Rejected alternatives

- **A hint on a note that is not a list item** (`notes-paragraph`): the section takes any
  Markdown the notes were written in, so there is nothing to hint at.
- **Notes anywhere in the body**: a `## Notes` among the steps cannot be told from a step.

## See also

- SPEC §4.1, §4.2, §8 (printing), §9 (`notes-misplaced`).
