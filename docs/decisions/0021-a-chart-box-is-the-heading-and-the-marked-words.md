# 0021 — A chart box is the step's heading and the words its instruction marks

Status: Accepted

> Accepted 2026-11-15. It replaces the chart-text decision of 2026-11-07 ("node text is
> derived from the prose through the registries", ADR 0013) and the draft reader that filled
> a box's blanks from the prose.

## Question

A chart box shows the step's heading. The hand-drawn charts that Etna's charts follow say
more: the tool, the setting, when to stop. Where do those words come from?

One answer is a reader: rules that find the tool, setting and stop in the instruction prose
every time a chart is drawn. On Potato Soup such a reader misread six of seven steps. Prose
is open-ended, and no finite set of rules reads all of it; a misreading is then shown to
every reader of the chart, and fixing it means adding rules without end.

## Decision

1. **A mark.** In a step's instruction, words written with Markdown emphasis are **marked**:
   `simmer on *medium-low* another *15-25 minutes*`. Asterisks are the canonical spelling;
   underscores (`_medium-low_`) read the same, and `etna fmt` rewrites them.
2. **A box is the heading, then the marks.** Under the step's heading, the box shows each
   marked run of words, in the order written and exactly as written, each starting a line of
   its own. A step with no marks shows its heading alone.
3. **There is one way to fill a box.** The chart has no text modes: no choice between
   headings and details in the app, no option for it in `etna dag`, and no prose reader.
4. **Nothing is read, shortened or dropped.** The chart does not know what a marked word
   means and does not need to. It does not abbreviate ("minutes" stays "minutes"), reorder,
   or cut a long box. The writer controls the box by what is marked.
5. **Where a mark counts.** Only in the instruction paragraphs of a step in a structured
   recipe. Emphasis anywhere else is ordinary emphasis and means nothing to a chart: in a
   heading, an ingredient line, a callout, the Notes, the preamble, or a traditional recipe
   (which has no chart).
6. **Italic is for the chart; bold is for the card.** A card prints emphasis as plain text,
   so a mark is invisible on a card. Bold prints bold and is never a mark. A writer who wants
   words both in the box and bold on the card writes both (`***medium-low***`); the two may
   also nest (`**simmer on *medium-low***`). Bold still names things where it leads a line: a
   callout's label, a step name in a traditional direction, a note's name.
7. **A mark is its words only.** A link inside a mark gives its text. Line breaks and runs of
   spaces inside a mark count as one space. Punctuation inside the asterisks is shown, so the
   writer leaves a comma or full stop outside them.
8. **Marks add no words.** With the asterisks taken out, a marked recipe is the recipe it was.
   Marking is therefore never a change to what a recipe says, and a script can prove it.
9. **Unmarked recipes are complete.** A recipe needs no marks to be valid, to print, or to
   chart. Marks can be added to a collection over time, one recipe at a time.

## What each tool does

| Tool | With marks |
|---|---|
| `etna dag`, the app's Chart tab, the chart PDF | Draw heading and marks in each box. |
| `etna card`, the app's Card tab | Print the instruction whole. Emphasis prints as plain text; bold prints bold. |
| Shopping list, search | Unchanged. They read the instruction's plain text, which never had the asterisks. |
| `etna lint` | A warning, `chart-box-long`: a box of more than five lines. Five is the most any box on the hand-drawn charts has. It names the step and says to mark fewer words. A second warning, `stray-asterisk`, reports a lone `*` in an instruction: an unclosed mark prints as a literal asterisk. |
| `etna fmt` | Rewrites underscore emphasis in an instruction as asterisks. Leaves marks where they are, also around a temperature it rewrites. |
| The restructure checker | Compares with marks stripped: adding or removing marks is not a difference. |
| GitHub | Shows marked words in italic, which is the one place a writer sees the marks outside the chart. Nothing breaks. |

Nothing in the drawing path reads `registries/tools.yaml`.

## Why

- **The fallible step moves to writing time and to a person.** A writer marks once, sees the
  box, and corrects it. A reader of the chart never sees a guess.
- **One rule, no vocabulary.** "The box shows what you marked" needs no list of verbs, tools
  or phrases, and works the same for ice cream, soup and bread, in any language.
- **It keeps the recipe one text.** A separate chart line per step says the step twice, and
  the two drift. A mark is the prose itself.
- **Leaving things out is free.** A hand-drawn box says "Chill", not "Chill until cold".
  Nothing is marked, so nothing is added. A reader of prose could never know to do that.
- **It is gradual**, like the rest of the format: unmarked prose still draws.
- **Italic was free.** In a collection of about 500 home recipes, none uses emphasis in prose
  (only the `_none_` placeholder does); bold is used in 19 recipes, always as a label at the
  start of a line.

Tried on five recipes, 48 steps (37 marked, 11 left as headings), every box could be said
with words its instruction already had. "In order" cost one box its preferred line order.
"As written" cost line length: one box ran to eight lines because "minutes" is long. Marking
fewer words makes long boxes rarer still.

## What it costs

- **A card has no italic.** A writer who italicizes for stress ("do *not* open the oven")
  puts "not" in the box and prints it plain; stress is written in bold.
- **The box cannot reword.** "Over medium heat melt the butter" can mark "medium heat"; to
  say "melt over medium heat" the sentence itself must be rewritten.
- **A mark must stand alone.** An oven temperature written inside a step about something
  else, such as oiling the pans, must be marked with its oven words; the number alone would
  read as the temperature of the oiling. Nothing checks this. It is a writing habit, and the
  lessons have to teach it.
- **Marks carry no type.** The chart does not know that "medium-low" is a setting. Later
  analysis (the typed layer) has to classify the marked runs, which is a far smaller problem
  than reading whole prose, and a wrong class never changes a drawing.
- **Every recipe that wants rich boxes must be marked by someone.**

## Rejected

- **Keep fixing the reader.** Each fix is a general rule, and the list never ends.
- **A reader that shows only what it read cleanly.** On Potato Soup one step of seven would
  change; the richer box would look as if it did nothing.
- **A `> **Chart** —` line under each step.** Full control of the wording, but the step is
  said twice, the line prints on the card or must be hidden, and a check is needed to keep it
  true to the prose.
- **A generated file beside the recipe.** Two files to review and keep fresh. A generated
  file is the typed layer's (ADR 0002), where it can read the marks.
- **Reading prose with AI when the chart is drawn.** The hosted viewer never uses AI, and a
  chart must be the same every time.

## Settled with it

- **One weight in a box** (2026-11-14). The heading and the marked words are drawn alike, as
  on the hand-drawn charts. No new style value and no second font cut in the PDF. When a
  heading wraps, nothing shows where it ends and the marks begin.
- **A card does not print italic** (2026-11-15). Italic belongs to the chart and bold to the
  card, so the two never compete for one spelling, and a formatter that rewrites `*` as `_`
  or back changes nothing. Set aside: underscore for the chart with asterisk for the card
  (Markdown and its tools treat the two as one), and a hidden comment under the step listing
  the box's lines (a second text that can fall out of step).
- **A card drops italic everywhere** (2026-11-15), not only in a step's instruction: notes,
  callouts and the headnote too. "Italic is for the chart, bold is for the card" is the
  whole rule.
- **A long box is drawn as marked** (2026-11-15). `chart-box-long` warns; nothing is
  shortened and no box is widened.
- **There is no prose reader** (2026-11-15), not even one kept to suggest marks.
- **A chart of an unmarked recipe shows headings only**; it gains words when its recipe is
  marked.

The rule is stated in SPEC §5.3 (Marks).
