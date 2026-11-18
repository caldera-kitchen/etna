# 0019 — Callout labels are open; only `Checkpoint` and `Choose` are keywords

Status: Accepted

> Decided 2026-11-11, against a proposal to keep one informational callout, `Note`, which
> would have dropped `Tip`, `Optional` and `Substitute`. Replaces the informational family of
> ADR 0009: there is no list of informational keywords.

## Question

ADR 0009 reserved four informational callout keywords (`Note`, `Tip`, `Optional`,
`Substitute`), to be defined "as recipes need them", and made any other one a warning. Which
informational labels should Etna know, and what should the linter say about the rest?

## Decision

1. **Any label is an informational aside.** `> **Tip** — …`, `> **Warning** — …`,
   `> **Make ahead** — …`, `> **Variation** — …`, `> **Storage** — …` and `> **Note** — …`
   are all valid. A card prints each under its step with the author's own label, as written.
   A chart leaves them out, as it leaves out prose. `Note` is only the conventional label the
   docs suggest when no better word comes to mind.
2. **Only `Checkpoint` and `Choose` are keywords**, because only they carry structure. They
   keep everything ADRs 0006 and 0009 give them (SPEC §5.1, §5.2).
3. **The linter is quiet about an unknown label.** It reports only when a label looks like a
   mistake for one of the two keywords: a near-miss in spelling, case or number
   (`Checkpoints`, `Check point`, `Chose`, `choose`).
4. **Optional things and substitutions do not belong in a callout.** This is guidance, not a
   lint rule. An optional or alternative ingredient says so in its remark (`— optional`,
   `— or pinto beans`; SPEC §6). A whole optional component or step says so in a qualifier on
   its heading (`## Glaze — optional`), the em-dash qualifier of ADR 0014; that is a stated
   convention with no tool behavior. An author who writes `> **Optional** — …` anyway
   gets a plain aside like any other label.
5. **A shopping list says "optional"** for an item that every line using it marks optional;
   it prints no other remark.

### Details settled with it (accepted 2026-11-12; the near-miss measure 2026-11-17)

- **Near-miss test** (amended 2026-11-12). With letter case and everything but
  letters ignored and one trailing `s` dropped, the label is at most one slip (a letter
  added, dropped or changed, or two neighbors swapped) from the keyword for every five of its
  letters. So
  `choose`, `CHOOSE:`, `Check point`, `Checkpoint 2`, `Chose`, `Hcoose`, `Checkpoints`,
  `Chekpoint` and `Chekpiont` are reported; `Close`, `Those`, `Cheese`, `Chosen`, `Check`,
  `Variation`, `Option` and `Choice` are not. `Choice` is another word, not a slip, and
  naming it would be a list of one inside open labels with no reason to stop at one
  (`Options`, `Either`, `Pick one`). A test of "starts with the keyword's first three letters
  and is at most two edits from it" was set aside: it missed every slip in the first three
  letters.
- **One rule, an error** (amended 2026-11-12): `callout-near-miss`. There is no other callout
  rule: none for an unknown label, and none for a misspelled keyword but this one. As a
  warning the rule let a file pass whose `Chose` drew two alternatives as one chain and whose
  `Checkpoints` lost its mark, with nothing on the chart or the card to show it, and no recipe
  in the collection tripped it. So a near-miss fails the file: the author writes the keyword,
  or another word for an aside. It still never reads the near-miss as the keyword.
- **On a card**, a keyword is `callout callout-checkpoint`, with the theme's label for it
  (`labels.callouts`). Every aside is `callout callout-aside`, whatever its label: no class
  per label, so a theme cannot style `Warning` apart from `Tip` and close the vocabulary again
  by the back door, and a label such as `Label` cannot collide with a class the card already
  uses (`callout-label`). A theme's `labels.callouts` maps keywords only; a key that is not a
  keyword is a theme-check warning.
- **Long labels.** A label of up to 32 characters prints as the label. A longer bold lead is a
  sentence, not a label: the card prints it in bold at the start of the aside, every word
  kept, and not in the theme's label style. The label may wrap anywhere, so a long unbroken
  word cannot run out of the card. It is escaped like all text.

## Reasoning

- **Etna is for many kinds of recipe.** A count over one cook's collection of home recipes
  (512 recipes, 139 structured and 373 traditional, about 5,170 ingredient lines, 2,620
  direction lines and 245 Notes lines, plus 390 structured conversions of them) found
  **none** of `Note`, `Tip`, `Optional` or `Substitute` written as a callout: the only
  callouts were `Choose` (5, and 3 in the conversions) and `Checkpoint` (2, in the
  conversions). Optional ingredients were all remarks (10 lines: 9 `— optional`, 1
  `— if using`); alternatives were remarks or part of the name (34 lines, 17 each); step tips
  were in the prose (about 15 lines) or the Notes (about 10 items).
- **The count could not decide it.** Zero uses of four words says that this collection, as
  converted so far, did not need them; it does not say which words other cooks, other
  cuisines or other kinds of writing (a bakery's make-ahead schedule, a preserving recipe's
  safety warnings) will reach for. A closed list chosen from one collection would be wrong
  for the next, and every reader who wanted `Warning` or `Storage` would get a lint warning
  for writing plainly.
- **An aside is pure vocabulary.** It never touches the graph: no edge, no marker, no
  ingredient. ADR 0004 says to be loose on vocabulary and strict on topology, so the label of
  an aside should be loose, and the only strictness left is where structure is at stake: a
  label that was probably meant to be `Checkpoint` or `Choose`.
- **What the count did settle stands.** Optional and alternative ingredients are remarks,
  which every output already handles (and the shopping list says "optional"); optional
  actions stay in the prose; whole-method choices are `Choose`.

## Rejected alternatives

- **One informational keyword, `Note`**: it fitted the one collection
  measured, and would have made `Tip` and `Warning` lint warnings for no gain in structure.
- **Four reserved keywords, undefined** (ADR 0009 as it stood): reserving words nobody had
  defined, and warning on every other word, is a closed vocabulary in all but name.
- **A theme class per label** (`callout-warning`): see the card detail above.
- **An `Optional` callout or step marker that the chart draws as skippable**: that changes the
  graph, so it is not an aside. The heading qualifier records the fact; no tool acts on it.

## See also

- SPEC §5.1 (callouts), §6 (remark; optional components and steps), §8 (shopping list), §9;
  ADRs 0004, 0006, 0009, 0011, 0014; `docs/callouts.md`; `themes/README.md` (Classes).
