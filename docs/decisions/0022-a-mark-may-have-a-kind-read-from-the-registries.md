# 0022 — A mark may have a kind, read from the registries

Status: Accepted

> Proposed 2026-11-15; accepted as built 2026-11-17. It can be tried with
> `etna marks <recipe>`. It builds on
> [ADR 0021](0021-a-chart-box-is-the-heading-and-the-marked-words.md), which says a chart box
> is the step's heading and the words its instruction marks, and that "marks carry no type".

## Question

A mark says what a step's box shows: `*medium-low*`, `*15-25 minutes*`,
`*until potatoes are tender*`. The chart does not need to know what those words are. A
writer checking a recipe, and later features (a total time, an equipment list), do: is this
mark a time, a temperature, a setting, a tool? Should Etna say, and how, without going back
to reading whole sentences?

## Decision

1. **A mark may have a kind**: `duration`, `temperature`, `setting`, `tool`, `cue` or
   `action`. A mark may hold more than one (`Speed 2 for 4 minutes`: a setting, then a
   duration) or none (untyped).
2. **A kind is read from the mark's own words only.** Never from the sentence around it,
   the heading, another mark or another step.
3. **Shapes before words.** A number with a time unit, or a time word (`overnight`), is a
   duration; a number with °F, °C or degrees is a temperature. Their words are never read as
   anything else.
4. **Every word comes from the registries** (SPEC §11): time and temperature units, words
   for a number (`a few`), levels, dials and modes (`medium-low`, `speed`, `fan`), tools,
   operations, the words a cue opens with, and the words that give a temperature its role.
   The code holds the shape of a number and how those words combine, and no vocabulary. A
   word that is missing is fixed by a registry entry.
5. **A temperature has a role only when its own words say**: set (`at`, an oven word,
   `preheat`) or reach (`until`, `reaches`, `registers`, `internal`, `stop at`; failing
   those, `to`). Otherwise its role is unknown.
6. **No guess.** A mark nothing matches is untyped. Untyped is not an error and not a lint
   finding.
7. **A kind never changes an output.** The chart draws the mark as written; the card prints
   it plain. Kinds are shown by `etna marks`, which lists each step's box, each mark's
   kinds, the lines the box takes, and a summary.
8. **Pure and the same everywhere**: `kindsOf(mark, registries)` in `tools/src/core/kinds.ts`
   reads no file; the registries are passed in (`loadKindRegistries()` in Node).
9. **A change of setting is an action.** `Reduce heat`, `Reduce the speed`, `heat to high`
   are an action, plus the level when there is one. Turned down: a change verb before a dial
   (`reduce`, `lower`, `increase` + `heat`/`speed`) as a setting; `Reduce heat` has no level.
10. **Handling verbs are operations.** `place`, `remove`, `pour`, `transfer`, `brush`,
    `sprinkle` and others are in `operations.yaml`, so `action` covers them. Turned down:
    keeping `operations.yaml` to cooking operations and giving handling verbs a file or a
    `kind` of their own.
11. **A bare `to` means reach.** `to` with no other word before a temperature means one to
    reach; after an oven word it means one to set. Turned down: `to` alone giving no role,
    which has no wrong ones but leaves more temperatures unknown.
12. **Kinds add no lint rule.** Turned down: a temperature whose role is unknown as an
    `info` hint, the one kind a writer can always settle by marking one more word; a kind
    stays out of every output but `etna marks` (7).

## Why

- **The kinds are few and stable.** In one cook's collection of home recipes, ten kinds hold
  89% of what a box would say, in three hand-labeled samples including the hand-drawn boxes.
  On 19 recipes by other writers they hold 87.5%, and no new kind was needed. The research
  corpora settled on the same few: tool, duration, temperature, condition.
- **Typing a marked run is the easy part.** People agree on where a span is at 90.5 F1, and
  machines class a marked span into a few types at 87.6 F1. A small grammar over the marked
  words alone typed 85% of held-out pieces right, 5% wrong, and 85.3% of the outside
  writers' pieces.
- **As built, on that collection's pieces** (the earlier kinds mapped to these six):

  | Set | Pieces | Right | Wrong | Untyped |
  |---|--:|--:|--:|--:|
  | A hand-labeled sample | 501 | 89.0% | 0.8% | 10.2% |
  | The hand-drawn boxes | 26 | 96.2% | 3.8% | 0% |
  | Marks on five sample recipes | 75 | 96.0% | 2.7% | 1.3% |
  | Held-out pieces | 121 | 76.9% | 2.5% | 20.7% |

  Wrong is rare; most misses are untyped, which costs nothing.
- **Words are data.** The earlier prose reader was stopped because it became a pile of
  rules. Here the rules are few and fixed (a number and a unit; a level after `on`; a word
  that opens the mark), and everything that grows is a registry line anyone can read.
- **A wrong kind never shows.** It does not reach a chart or a card; at worst `etna marks`
  shows it to the writer, who can fix the registry or the mark.

## Set aside

- **A catalog of verb templates** (`Mix [in _] [until _]`). The verb tail is long: 52
  heading verbs cover 80% of steps, 141 cover 95%, and 92 occur once. Per-verb
  templates add no new kinds; they only record which slots are usual.
- **A templated first sentence.** Only 42% of sampled steps fit one as written (23% read
  strictly); 71 steps in the corpus open with a preheat under another heading, so the first
  sentence is often not the step.
- **Fully templated instructions.** 63% fit as written at best, 12% strictly; 15% of the
  collection's steps (35% of other writers') hold a condition, a check or advice that no
  template can say.
- **Typing by the glue word alone** (`for`, `until`, `on`). It typed 31% of the hand-labeled
  pieces right and 16% wrong: half the pieces have no glue word, and `to` opens a temperature
  to set 216 times and one to reach 63 times.
- **Reading the sentence around a mark** to settle a bare temperature. That is the prose
  reader again. The writer marks the word with the number instead (`*at 78°F*`).

## What it costs

- **A bare temperature has no role.** `*85°F*` is a temperature whose role is unknown. The
  writer who wants it typed marks `*reaches 85°F*`. Of the nine temperatures in the marks on
  the five sample recipes, six have a role and three do not.
- **Words that are both verb and noun** are read by their place: an operation that opens the
  mark is an action, a tool anywhere else (`whisk` opening a mark, `the whisk` later in one).
  `paddle` as a verb reads as the tool.
- **Cues need their opening word.** `light and foamy`, and a cue that opens with `to`, are
  untyped: `to` opens cues, temperatures and settings alike.
- **Only base forms.** `rotating` is not `rotate`; a mark is read as written.
- **Places, covers, sizes, amounts and manner have no kind yet.** A tool named inside one is
  still a tool (a rack position in the oven gives the tool `oven`).
- **The registries must be kept.** Every missing tool or verb is a line to add. This build
  adds 137 words to them (operations 44, tools 24, modifiers 18, stop-conditions 51).
- **`Reduce heat` is an action**, not a setting: it has no level. A hand-drawn box that says
  to reduce the speed was meant as a setting.
