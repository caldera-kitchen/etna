# 0009 — `Choose` for exclusive alternatives; callout strictness follows topology

Status: Accepted

## Question

How does a recipe represent "pick one" — two interchangeable methods (bake in a cold oven
*or* a Dutch oven) or a family of variations on a shared base (one pudding base → vanilla,
chocolate, pistachio…)? And how strict should the callout-keyword vocabulary be?

## Decision

1. **`Choose` callout.** A component heading may carry a `> **Choose** — …` callout, which
   declares that the component's **direct child headings are mutually exclusive branches**
   (XOR — the cook picks one). At least **two** branches are required. Scope is the usual
   markdown section: the branches are the child headings, ending at the next heading of
   equal-or-shallower level, or EOF — no explicit terminator.
   - A **branch** may be a single leaf step or a multi-step subtree.
   - **Shared setup** and **shared finish** need no new machinery: a sibling step *before* the
     `Choose` node (e.g. `### Base`) is carried into every branch by the implicit spine (§7),
     and a sibling step *after* it consumes "the chosen branch's output."
   - Large variation families may instead be modeled as **separate recipes sharing a base via
     §7 includes** (`pudding-base/` + `pudding-vanilla/` …). In-document `Choose` is for the
     small/inline case; cross-recipe includes for big DRY families. Author's judgment.

2. **Strictness follows [0004](0004-loose-vocabulary-strict-topology.md).** Callout labels
   split by role:
   - **Keywords** (`Checkpoint`, `Choose`) carry topology and are a **closed** set, written
     exactly. Nothing else is read as one: silently degrading a keyword to prose would drop
     graph meaning, so a label that looks like a mistake for one is reported.
   - **Informational** asides are **loose**. *Amended by [0019](0019-open-callout-labels.md)
     (2026-11-11):* there is no list of informational keywords; any other label is an aside,
     printed as written, and the linter is quiet about it. A near-miss of a keyword in
     spelling, case or number (`choose`, `Chose`, `Checkpoints`) is an error; another word
     (`Choice`, `Option`) is an aside.

3. **Canonical keyword vs display label.** The source carries **one canonical token** per
   construct (strict input); a render/theme layer maps that token to a **display label**
   (`Choose` → "Pick one", an icon, another language). The map is **one-way and output-only**
   — we never accept input aliases. A label that is a near-miss of a keyword gets a **"did you
   mean" lint** — a hint, never a silent reinterpretation. *(Amended by 0019: the near-miss is
   one in spelling, case or number, and it is an error, so the file fails until the author
   writes the keyword or another word; synonyms such as `Variation`, `Option` or `Check` are
   ordinary asides.)*

Full design intent, examples, and rendering in [`../callouts.md`](../callouts.md).

## Reasoning

- **XOR is not inferable from structure.** A parent with two children already means "parallel
  branches that merge later" (§7); "pick one" is a *different* relationship. Per 0004 the graph
  skeleton must be explicit, so the choice must be marked.
- **Markdown has no native "pick one" primitive.** Co-opting task lists (they mean AND-todo),
  thematic breaks (a divider), or `<details>` (disclosure) *overloads* a symbol whose
  conventional meaning is something else — the opposite of explicit topology. A callout is
  Etna's existing out-of-band mechanism (0006).
- **One construct covers both cases.** Alternatives and variations are the same XOR topology;
  the base is just a prior sibling. The alternative-vs-variation nuance (same product two ways
  vs. distinct products) is derivable later in the typed layer, so it need not burden the
  source vocabulary.
- **Strictness by role is exactly 0004.** A dropped `Choose`/`Checkpoint` loses structure; a
  dropped aside loses nothing. So be strict where meaning is load-bearing, loose elsewhere.
- **Token↔label** keeps the source unambiguous and machine-parseable while letting renders
  read naturally and localize. Keeping it output-only is what prevents the synonym slope from
  reopening.

## Rejected alternatives

- **Multiple synonymous keywords** (`Alternative` + `Variation` + `Option` …) — reopens the
  vocabulary slope; one canonical token + render labels gives the readability without it.
- **A structural co-opt** (radio-button semantics via task lists, `---`, `<details>`) —
  overloads a native meaning; readers/tools would have to reinterpret a familiar symbol.
- **A new heading sigil** for branches (`### | Cold oven`) — invents syntax the format
  otherwise avoids and pollutes heading anchors/slugs.
