---
name: etna-recipe
description: Put a recipe into Etna's plain-Markdown format, or check one. Use when someone says "put my recipe in Etna format", "turn this into an Etna recipe.md", "make a flow chart of this recipe", "structure this recipe" or "check my recipe.md", or hands over a recipe (typed notes, a pasted page, the text of a photo) to be written as an Etna recipe.
---

# Writing a recipe in Etna's format

Etna is a plain-Markdown recipe format: one recipe is one `recipe.md` in a folder named for
the dish. This file is the procedure. The rules are in `SPEC.md` and the guides in `docs/`;
read the section named at each step when you reach it. Paths are from the top of an Etna
checkout.

## The rule above all others

The person's words are the recipe. You change its shape, never its content.

- Every amount, unit, ingredient, time, temperature and sentence comes from what the person
  gave you. Never supply one from cooking knowledge; never correct, round or convert one,
  however likely a slip looks.
- Something missing (an amount, a time, an oven temperature, a skipped step): ask. If you
  cannot ask, leave it as written and list it in your reply. `- salt` with no amount stays
  `- salt`, and the linter's `missing-quantity` warning is the flag. Write a remark such as
  `— to taste` only when the source says it.
- Restructuring is yours: headings, moving an ingredient line to the step that uses it, the
  frontmatter. Rewording is offered, not done: show the new text and wait for a yes. Point
  out spelling slips in the source; do not fix them.
- A recipe from a book, a site or another cook keeps its origin in `source:`; ask if you do
  not know it, never guess. Sharing it is the person's decision, and you do not reword it to
  make it pass as theirs. Add a `license:` only when the person names one.
- To show what something looks like, point at a recipe in `cookbook/` (its `README.md` says
  which lesson shows what) or use a placeholder nobody could cook (`- 1 cup item`).

## Before you start

Ask, in as few questions as you can: what they have (one recipe or several; typed text, a
page, a photo, which you first transcribe faithfully, amounts and abbreviations as written:
`docs/contributing-a-recipe.md`, section 1); what they want (a tidy file, for which the
traditional form is enough, or also a flow chart, which needs the structured form); and
where it goes (a folder named by the title's slug, SPEC §2, holding `recipe.md`).

## Reaching the tools

The tools need Node.js 24 or newer and a checkout of Etna, set up once with `npm ci` in
`tools/` (`README.md`, "Getting started"). They run from `tools/` as
`node bin/etna.js <command>`; below, `etna` stands for that, or for the alias or `npm link`
that `tools/README.md` describes. `etna <command> --help` lists a command's options.

If you cannot run them, say so at the start, follow `SPEC.md` by hand, and end by listing
what was not verified: lint, format and, for the structured form, the restructure check.

## Step 1: the traditional form first

When the source is an ordinary recipe (ingredients, then directions), write it in the
traditional form first: the smallest change from what they have, valid Etna, and it prints
a card. Read SPEC §3 (frontmatter), §4.1 (traditional form) and §6 (ingredient lines), and
follow `cookbook/potato-soup-traditional-form/recipe.md`, or, for a recipe in parts,
`cookbook/italian-wedding-soup-traditional-form/recipe.md`.

- The frontmatter says `etna: 1` and `form: traditional`. Without `form: traditional` the
  file is read as structured, and `## Ingredients` and `## Directions` fail as two steps with
  no instruction (`step-missing-instruction`).
- One line per ingredient, as the source has it: `quantity unit item, preparation — remark`.
  The directions keep the source's numbering and sentences, one numbered item each.
- Notes about the whole recipe go in a final `## Notes`, one `- ` item each (SPEC §4.2).
- An introduction the author wrote stays, word for word, as the paragraph under the title.
  A line that says what the recipe makes ("Makes 12", "Serves 4") and stands apart from the
  directions goes in `yield:` (SPEC §3). Leftovers of the page (a review count, links to
  other pages) are left out; list them in your reply.

When the source has no ingredient list (a paragraph, a recipe told from memory), ask before
making one, and list only what the text names, in its words, with the amounts it gives.

## Step 2: format and lint until clean

```
etna fmt --diff <recipe>
etna fmt <recipe>
etna lint <recipe>
```

`<recipe>` is a `recipe.md`, its folder, or a folder of recipes. `fmt` rewrites the file in
the canonical style (SPEC §13): it shortens the units of ingredient lines, and it writes a
temperature the canonical way wherever it stands, also in a direction (`325 degrees F`
becomes `325°F`). It changes no other word of an instruction; tell the person what it
changed. `--diff` shows the change and writes nothing. `lint` exits with 1 on any error. The
linter is the authority on what is valid (SPEC §9): fix every error; report every warning,
and fix one only when the fix adds nothing to the recipe.

## Step 3: the structured form, when they want a chart

Only the structured form draws a flow chart: each step lists the ingredients that enter at
it (SPEC §4 to §7). Converting takes judgment, and `docs/structuring-playbook.md` is the
procedure: follow it in its order, flags included. Keep the traditional file beside the new
one (`traditional.md` in the same folder), then prove nothing was lost:

```
etna restructure check <traditional.md> <recipe.md>
```

It must end `Result: PASS — nothing was lost or altered.` (exit 0). Fix the conversion, never
the original; give each "Accepted changes" item a flag. Run Step 2 again on the new file.
Flags go to the person, never into the recipe (playbook section 9).

## Step 4: marks, only with the person

Words written with `*emphasis*` in a step's instruction are marks: the chart's box shows them
under the step's heading (SPEC §5.3; `docs/preparing-a-recipe-for-charts.md`). Marks are the
author's choice. Propose which words to mark, show the boxes with `etna marks <recipe>`, and
add marks only when the person agrees. Never add, move or remove a mark silently, also while
restructuring, and never turn emphasis into bold or back. A box over five lines is a warning
(`chart-box-long`); which words to unmark is the person's call.

## Step 5: show the result

```
etna card <recipe> --out card.html
etna dag <recipe> --out chart.svg
etna serve <folder>
```

`card` works for both forms, `dag` only for the structured form. Write both files into the
recipe's folder. Look at the chart as the playbook's section 10 says: each component joins
where the directions bring it in, each ingredient feeds the step that uses it. `serve`
starts a read-only viewer and prints its address (`http://localhost:4173`; if that port is
taken it stops with `EADDRINUSE`, and `--port <n>` picks another). Stop it when you are
done.

## A picture, only when it is theirs

A recipe may have one picture (SPEC §4.3; `docs/contributing-a-recipe.md`, "A picture, if
you have one"). Add one only when the person hands you a photograph of the dish and says
they took it.

- Never fetch a picture from a web page, and never take one from the source: a book's or a
  site's photograph belongs to whoever took it, credit or not. A photo handed over to be
  transcribed is the recipe's text, not its picture.
- The location comes out first, and the person takes it out: every copy keeps it. When
  `etna lint` reports `picture-location`, stop and ask them to save the photograph again
  without it, as the guide says. Never repeat the place the file names.
- Make the two copies as the guide does: a square cut from the middle, then
  `image/etna.jpg` at 1200 pixels and `image/markdown.jpg` at 320.
- The picture line's words are the person's. Propose words for what the picture shows and
  wait for a yes, as with any rewording; the line goes first under the title, in either
  form.
- Then run Step 2 again: `etna lint` checks the files, their sizes, the location and the
  picture line.

## Mistakes to prevent

1. **An ingredient list at the top of a structured recipe.** Each line goes under the step
   that first acts on it (SPEC §1, point 2; playbook section 4); an `## Ingredients` heading
   there is a step with no instruction (`step-missing-instruction`). An ingredient used at
   two steps is listed at both, split only into amounts the recipe states.
2. **A made-up amount.** No lint rule sees one: check every number against the source. In a
   conversion a changed amount fails the restructure check (`ingredient-changed`), and an
   amount only in the prose stays there (playbook section 4).
3. **A misspelled callout keyword.** `Checkpoint` and `Choose` are written exactly; `Check
   point`, `choose`, `Chose` or `Checkpoints` is an error (`callout-near-miss`, SPEC §5.1).
   Any other label (`Tip`, `Note`) is an aside. A callout is `> **Label** — text`.
4. **A hyphen where the format reads a spaced em dash.** A heading's qualifier
   (`## Frosting — optional`) and an ingredient's remark (`- 150 g eggs — 3 large`), both from
   Easter Bread, follow ` — ` (SPEC §4.1, "Parts"; §6). A heading ending `- optional` is a
   warning (`optional-near-miss`); on an ingredient line a hyphen silently becomes part of
   the item, and no tool says so.
5. **A heading that is neither a thing nor an action.** A step heading is a short verb phrase
   from the step's words (`Add the celery`); a component heading is a noun for what is made
   (`White sauce`). Not "Step 2", not the whole sentence, no time or amount the step does
   not state (SPEC §4, "Naming"; playbook section 3). No lint rule checks this.
6. **A link that points at no heading.** The anchor is the heading's GitHub anchor
   (`## Frosting — optional` gives `#frosting--optional`; playbook section 5). A wrong one is
   an error (`unresolved-reference`); keep headings unique (`duplicate-heading`).
7. **A step cut in the middle of a sentence.** Cut directions only between sentences, never
   merge two (playbook section 2). A cut sentence fails the restructure check
   (`sentence-altered`).
8. **Notes that are not last.** `## Notes` is the last `##` heading, or it is an error
   (`notes-misplaced`, SPEC §4.2).

## At the end, tell the person

The files you wrote and where; the commands you ran and their results; every open question
and flag (missing amounts, things left as written, suspected slips in the source, where you
cut and what you named); and what you could not verify. Say it in your reply, not in a
file in the recipe's folder.
