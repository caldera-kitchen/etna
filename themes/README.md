# Card themes

A card theme decides how a recipe looks on paper. The recipe format says *what* a card
shows — the title, the ingredients, the directions, and optionally the notes, yield,
source and picture (SPEC §8) — and the theme decides *how it is arranged*. This page is the theme
contract: everything a theme can rely on from the renderer, and everything the renderer
expects from a theme. It is versioned; this is **theme contract 2**
(paged cards: [Pages](#pages)).

```sh
etna theme list                                   # the bundled card themes
etna card path/to/recipe --theme folio --pdf --out card.pdf
etna card path/to/recipe --theme ./my-theme --out card.html
etna card path/to/recipe --theme binder --paper index-5x7 --pdf --out card.pdf
etna theme check ./my-theme                       # does it keep the contract?
```

The bundled card themes are `binder`, `mise` (the default), `folio`, `grid`, `countertop`
and `galley`, and `shopping`, a shopping list for one recipe; each folder's README says what
the theme is good and bad at, and its fonts.
`flow/`, `ink/`, `dense/` and `station/` are a different kind of theme — flow-chart themes for
`etna dag` (`kind: chart`). Only the last part of this page, [Chart themes](#chart-themes), applies
to them.

## Contents

- [What a theme is](#what-a-theme-is)
- [Make your own theme in five steps](#make-your-own-theme-in-five-steps)
- [theme.yaml](#themeyaml)
- [Notes](#notes): opt-in on every card
- [Picture](#picture): the recipe's picture, where a theme has a place for it
- [card.html: slots](#cardhtml-slots)
- [Labels](#labels)
- [Classes](#classes)
- [Custom properties](#custom-properties)
- [What the renderer gives every theme](#what-the-renderer-gives-every-theme)
- [Pages](#pages): page boxes, papers, fitting, narrow paper
- [Web fonts](#web-fonts)
- [What a theme may not contain](#what-a-theme-may-not-contain)
- [Printing](#printing)
- [Contract versions](#contract-versions)
- [Chart themes](#chart-themes): themes for `etna dag`

## What a theme is

A folder of plain files, all meant to be edited by hand:

| File | What it is |
|------|------------|
| `theme.yaml` | The manifest: name, contract version, page size and margins, options, labels. |
| `card.html` | The skeleton: an HTML **fragment** — the `<article class="card">` and what is inside it — with named slots. |
| `card.css` | The stylesheet: what makes the theme look like itself. Always this name, beside `card.html`; `theme.yaml` does not name it. |
| `README.md` | The idea, what it is good and bad at, its fonts. |

The renderer does the rest. It fills the slots with the recipe, writes the repeated parts
(ingredient tables, direction lists, steps, components) with the [classes](#classes) below,
and wraps the card in a complete page: the document, its head, a strict
Content-Security-Policy, and one `<style>` holding the renderer's settings, the
[core stylesheet](#what-the-renderer-gives-every-theme) and then the theme's stylesheet.

A theme is only data: markup and styling. It cannot run code or load anything (see
[What a theme may not contain](#what-a-theme-may-not-contain)), so a theme written by
someone you do not know is as safe to print with as one of the bundled ones.

## Make your own theme in five steps

1. **Copy** the bundled theme closest to what you want: `cp -r etna/themes/folio ~/my-theme`.
2. **Rename** it: set `name:` and `description:` in `theme.yaml`.
3. **Edit** `theme.yaml` (fonts, page, layout, labels), `card.css`, and if need be
   `card.html`. Delete what you do not change from `card.css`: the core stylesheet
   already does the mechanics.
4. **Check** it: `etna theme check ~/my-theme`. It lists errors (the theme is refused or
   prints wrongly) and warnings (worth fixing), and renders two sample recipes with it.
5. **Use** it: `etna card path/to/recipe --theme ~/my-theme --pdf --out card.pdf`. A theme
   is found by name among the bundled themes, or by path when the argument contains a `/`
   or starts with `.`.

## theme.yaml

Every key, with the value used when the key is left out.

| Key | Default | Meaning |
|-----|---------|---------|
| `etna-theme` | `1`, with a warning from the checker; the bundled themes say `2` | The theme-contract version the theme was written for. A theme that names a newer version than the renderer knows is refused. |
| `kind` | `card`, with a warning | `card` for a card theme. (`chart` marks a flow-chart theme, which the card renderer refuses.) |
| `name` | — (required) | The theme's display name. Lower-cased and hyphenated it is the `{{theme}}` slot. Keep it to a word or two: the toolbars' Style menus show 13 characters and cut a longer name, its last character an ellipsis (Settings, and the menu entry's tooltip, show it whole), and `etna theme check` warns. A source's style is shown without its source unless two styles would read the same. |
| `description` | — | One line, shown by `etna theme list`. |
| `lang` | `en` | The page's language (`<html lang>`). Set it when your labels are in another language. |
| `page.size` | `letter` | The default paper: `letter`, `a4`, `half-letter`, `index-4x6`, `index-5x7` (one of `page.papers` when that is given), or `legal` or `a5` — or give `page.width` and `page.height` (`8.5in`, `210mm`; both or neither). |
| `page.orientation` | `portrait` | `landscape` turns the page (index cards are always landscape). |
| `page.margin` | `0.5in` | One to four lengths, as for CSS `margin` (`0.6in 0.65in 0.8in`): the page margins. They are the padding of every page box, and the `@page` margins of a card printed without the paging script. |
| `page.papers` | the `page.size` paper only | The papers the theme supports: a list (`[letter, a4]`), or a map from paper to what changes on it — `margin`, `font-size`, `fit` (`half-letter: { margin: 0.4in, font-size: 9.5pt }`). See [Papers](#papers). |
| `fit.min` `fit.max` | the size −15 %, +10 % | `min`: the smallest size fitting may shrink to. `max`: the largest size the GUI's Size control offers (`etna card --size` takes any size); fitting itself never grows past the theme's size. See [Fit](#fit). |
| `fit.nearly-empty` | `0.3` | A last page filled less than this fraction of the content height is nearly empty: fitting shrinks to save it. See [Fit](#fit). |
| `fit.grow` | `false` | Opt in to the older rule that also grows a card, up to `fit.max`, to fill its pages; `fit.short` and `fit.full` (`0.5`, `0.9`) then say when. No bundled theme does. See [Fit](#fit). |
| `skeleton` | `card.html` | The skeleton file. |
| `options.fonts.body` | `Futura, "Jost", "Avenir Next", "Century Gothic", sans-serif` | Font stack for the text. It must end in a generic family (`serif`, `sans-serif`, `monospace`…). |
| `options.fonts.title` | `"Yuppy SC", "Jost", Futura, "Avenir Next", sans-serif` | Font stack for the title. Same rule. |
| `options.fonts.title-weight` | `700` | The title's weight, 100 to 900 in hundreds. The renderer writes it as `--card-font-title-weight`, and the stylesheet sets `.card-title { font-weight: var(--card-font-title-weight); }`. Stated here, beside the title's font, so a chart that matches the card draws its title at the same weight ([Match the card](#match-the-card)). Load that weight in `webfonts:`. |
| `options.font-size` | `11pt` | Size of the text, in `pt` or `px`: the size a card prints at, unless fitting shrinks it or the reader picks another. Size the rest in `rem` (the card's text size) or `em` and it all scales. |
| `options.layout` | `hoisted` | How a recipe is laid out: `hoisted` or `paired` (a structured recipe's steps), or `list` (a shopping list) — [below](#layouts). Any other value is refused. |
| `options.parts` | `sections` | How a traditional recipe's parts are arranged: `sections` (the classic card) or `paired` (each part's ingredients with its steps) — see [Parts](#parts). Any other value is refused. |
| `options.slots.intro` | `true` | Print the text between the title and the first section. |
| `options.slots.notes` | `true` | The theme has a place for the recipe's Notes section (either form). The notes print only when the reader asks (`--notes`, `CardOptions.notes`); `false` means never, even when asked. See [Notes](#notes). |
| `options.slots.picture` | `false` | The theme has a place for the recipe's picture (a `{{picture}}` slot). It prints when the recipe has one, unless the reader leaves it out. See [Picture](#picture). |
| `options.slots.yield` `source` `version` `license` | `false` | Print that frontmatter value. |
| `options.slots.uses` | `false` | Layout `list`: under each item, the steps that use it (`list-uses`). |
| `options.display.units` | `long` | `long` (`grams`, `1 clove`, `2 cloves`) or `symbol` (`g`, `tbsp`). |
| `options.display.fractions` | `unicode` | `unicode` (`1 ½`) or `ascii` (`1 1/2`). |
| `options.display.range` | `to` | `to` (`2 to 3`) or `dash` (`2–3`). |
| `labels.*` | English | The printed words: see [Labels](#labels). |
| `webfonts` | — | The free fonts the theme uses, by Google Fonts name: a list of `family` + `google`. The renderer delivers them: see [Web fonts](#web-fonts). |

A theme carries no font files and loads none itself. The first font of each stack that the
machine has — or that the renderer delivers from `webfonts:` — is used.

### Layouts

A traditional recipe is an ingredient list and a direction list, arranged by
`options.parts` ([Parts](#parts)). A structured recipe, whose ingredients enter at the step
that uses them, can be printed two ways:

- **`hoisted`** — printed as a traditional card is. The ingredients are grouped **by
  component, never by step** (SPEC §8): a step heading names what is done, not what is made.
  A recipe without components: one ingredient table, one unlabeled group in step order,
  then the directions, each labeled with its step heading. A recipe with components: each
  top-level component is a [part](#parts) — a labeled group of the one ingredient table,
  and a titled run of steps numbered from 1 — and each step heading is that step's name (a
  component inside a part names its steps: its title for its only step, `Filling — Cook`
  for several). The ingredients of top-level steps outside any component print in an
  unlabeled group where those steps fall, in document order (before, between or after the
  component groups). Their directions keep their place too: steps before the first
  component are an unnamed part; a step after a component is a part of its own,
  `part part-step`, titled with its step heading as a step label (`<h3 class="part-title
  part-step-title"><span class="direction-label">`; the core sets it at text size, without
  the label's run-in punctuation) and its direction unlabeled, so it does not read as part
  of the component before it. In a group, an
  ingredient that enters at several steps prints once, marked `labels.divided`, when every
  line states an amount in one unit and the lines agree on their note and remark
  (`1/2 tsp` and `1 tsp` kosher salt → `1 ½ tsp kosher salt, divided`); the row is `ingr ingr-divided`
  with `data-lines` = the number of lines merged, in the place of the first. Otherwise each
  line prints as written, in order. Fills `ingredients` and `directions`. A recipe with a
  `Choose` keeps its titled component sections, each with its own ingredients (grouped
  under its step headings, as before) and directions, in `components`.
- **`paired`** — each step is one block: its heading, its own ingredients, its direction.
  Always fills `components` only, also for a recipe without components; `ingredients` and
  `directions` are then empty.

A third layout is for any recipe, traditional or structured:

- **`list`** — a shopping list: what you need to have (SPEC §8). The `ingredients` slot holds
  one table with every ingredient once, its amounts totaled across the steps that use it
  (`105 g` + `595 g` bread flour print as `700 g`); `directions` and `components` are empty, so
  a `list` skeleton need not have a `{{directions}}` slot. Items keep the order in which the
  recipe first uses them. The table has the ingredient table's columns (`ingr-qty`,
  `ingr-unit`, `ingr-item`, `ingr-note`) after a checkbox column, and:
  - an item written in two units keeps both, each on its own line in the quantity and unit
    cells, the second led by `+` (`1 pinch` / `+ 1.5 g` kosher salt) — amounts are only added
    in the same unit; an amount that was written without a quantity reads `some`;
  - the item is named in the number its amounts call for (`1 egg`, `3 eggs`), when the recipe
    wrote both forms;
  - other recipes used as ingredients (`[stock](../stock/)`, or the unit `recipe`) come last
    in their own group, labeled `labels.other-recipes`; they are not expanded;
  - the ingredients of a component or step designated optional (`## Glaze — optional`, SPEC
    §6) come after all that, one group per such part (`list-set`), headed by its name and
    `labels.optional-set` (`Glaze — optional, all or none`; with several
    recipes, `Glaze, for Roasted Root Vegetables — …`). They are totaled within their group
    only, never with what is needed or with another group;
  - so are the ingredients of each branch of a `Choose` (SPEC §8): one group per branch
    (`list-set list-branch`), among the optional ones in recipe order, headed by the
    `Choose` component's name, `labels.choose-set` and the branch's name
    (`Dough — choose one: Butter dough`), and by `labels.optional-set` after that when the
    branch is optional as well. Two branches are never added together;
  - `options.slots.uses` adds, under each item, the steps that use it.

  Units, fractions and ranges follow `options.display`. The `intro` slot works as in the
  other layouts; turn it off for a list that is only the list. A list theme should set
  `options.slots.notes: false`: a recipe's notes are not shopping. Its `{{notes}}` slot still
  carries the list's own footer (no density for an item; ounces of a liquid), which is not
  a recipe note and always prints.

More layouts may be added; a theme names the one it was designed for, and a caller may ask
for another (`CardOptions.layout`).

### Parts

A traditional recipe may be made of parts (SPEC §4.1): `### Beans` under `## Ingredients`
and `### Beans` under `## Directions`, paired by name. `options.parts` (or
`CardOptions.parts`, `etna card --parts`) says how a card arranges them:

- **`sections`** (the default) — the classic card. `ingredients` holds one table, each part
  a group under its name (`ingr-group-label`); `directions` holds the parts in order, each a
  `part` with its `part-title` over its own `direction-list`, numbered from 1.
- **`paired`** — part after part, each part's ingredients with its steps: in `directions`, a
  `part part-paired` per part, its `part-title`, then a `part-body` holding
  `part-ingredients` (an `ingr-table` with one unlabeled group) and `part-directions` (a
  `direction-list`). `ingredients` is then empty, and the notes follow as usual. A part
  with no ingredients has no `part-ingredients`, one with no steps no `part-directions`;
  the unnamed leading part has no title. Used only when at least one named part has both
  ingredients and steps, and parts do not go unpartnered on both sides at once (ingredients
  with no steps and steps with no ingredients, the unnamed leading part included, are
  usually one part under two names, or a timeline against components); otherwise the card
  falls back to `sections`.

Either way, a recipe without named direction parts — no parts at all, ingredient groups
only, or the older spelling (bold group lines, bold labels heading runs of steps) — prints
as it always did: one ingredient table, one direction list numbered 1…n, each bold label
as its step's name. The renderer does not guess parts; `etna fmt` migrates the spelling.

**Numbers.** Every step of a run (a `direction-list`) carries its number, and a step name
follows its number. The only step of a run is marked `direction-alone`, and the core
stylesheet hides its number (a lone "1" under a part title reads oddly); a theme may show
it. A theme shows the numbers of a run or hides them all: it never hides the number of
some steps of a run (by their label, say).

### Notes

A recipe's Notes section — `## Notes` in a traditional recipe, or the last H2 of a
structured one (SPEC §4.2) — is **opt-in on every card, in every theme and both forms**.
The renderer fills `{{notes}}` only when the reader asks for the notes (`etna card --notes`,
`CardOptions.notes: true`, the GUI's Notes checkbox) and the theme has a place for them:

- `options.slots.notes: true` (the default) says the theme has one; it does not print the
  notes by itself. `false` means the theme never prints them, even when asked, and so does a
  skeleton without `{{notes}}`. A caller's `slots.notes: false` also leaves them out;
  `slots.notes: true` alone does not ask for them.
- When the notes are left out, the card says nothing about them: `{{notes}}` is empty, so a
  `{{#notes}}…{{/notes}}` block (a "Notes" heading, a rule above) disappears whole. No
  placeholder, no "notes hidden" line.
- Each note is a `<div class="note">` in `{{notes}}`, the same markup whether the recipe
  writes it as a paragraph or, by the convention (SPEC §4.2), as one `- ` list item: the
  bullet is not printed, and the bold lead becomes a `note-label` (see the classes below).
- Callouts inside a step (`> **Checkpoint** — …`, and asides with any label: `Note`, `Tip`,
  `Make ahead`) are part of the method, not the Notes section: they always print.
- On a shopping list, `{{notes}}` carries the list's footer (an item with no density; ounces
  of a liquid). That is not a recipe note, and it always prints.

### Picture

A recipe may have a picture, `image/etna.jpg` (or `.png`) in its folder (SPEC §4.3). A card
prints it **where the theme has a place for one**, unless the reader leaves it out
(`etna card --no-picture`, `CardOptions.slots.picture: false`). A recipe without a picture,
and a theme without a place for one, give the card they gave before pictures.

- `options.slots.picture: true` says the theme has a place, and `{{picture}}` in the skeleton
  is that place. Both are needed: the switch is `false` unless a theme says otherwise, so a
  theme written before pictures is untouched.
- The renderer fills `{{picture}}` with the whole element, `<figure class="card-picture"><img
  src="data:…" alt="…"></figure>`. The image is the file itself as a `data:` URL, which the
  caller reads (`etna card` reads the recipe folder; `CardOptions.picture`); the description a
  screen reader gives is the picture line's words, or the recipe's title. The core stylesheet
  makes it a square that is never split across pages, the image cut to its middle
  ([What the renderer gives every theme](#what-the-renderer-gives-every-theme)).
- **Place it without touching a card that has none.** Without a picture `{{picture}}` is
  empty, so a `{{#picture}}…{{/picture}}` block disappears whole, and the card is the one the
  theme printed before. Style the figure through `.card-picture`, and anything around it
  through a class that only a card with a picture carries: `<article class="card{{#picture}}
  has-picture{{/picture}}">`, then `.has-picture > .card-header { … }`. A rule that changes
  the layout of every card is a rule for the cards without a picture too.
- Set its width (the core's is 1.5 in), smaller on narrow paper by the means of
  [Adapting to narrow paper](#papers): `@container card-page (max-width: 5in) { .card {
  --mise-picture: 1.1in; } }`. An index card has little room for one; the bundled themes hide
  it there (`[data-paper^="index-"] .card-picture { display: none; }`).
- A theme that should not show one (Galley, made to fit a long recipe on one page) says
  `picture: false` and has no slot. A shopping list never shows one.

| Theme | Where | Width |
|-------|-------|-------|
| `mise` | Top right of the card. The heading keeps to its left, its rule stopping short of the picture, and what follows comes up beside the picture and goes around it. On half letter the heading's rule runs under both | 1.5 in; 1.1 in on half letter; none on index cards |
| `folio` | Centered under the title and its line of source, above the short rule that closes the heading | 2.25 in; 1.6 in on half letter |
| `binder` | Top right corner of the frame, in a thin frame of ink, the title to its left and the title's rule stopping short of it. What follows comes up under the title, beside the picture; on half letter the heading is as tall as the picture | 1.6 in; 1.1 in on half letter; none on index cards |
| `countertop` | Top right of the heading | 1.75 in; 1.1 in on half letter |
| `grid` | A third column of the heading's row, its right edge on the text's | 1.5 in; 1.1 in on half letter; none on index cards |
| `galley`, `shopping` | None | — |

Two ways to keep a heading beside a picture, and what each costs:

- **A grid of the heading and the picture**: the title and its line in one column, the picture
  in the next, across both rows. Nothing after the heading is touched, and the heading is as
  tall as the picture, which leaves a band of white under a short heading. Binder does this on
  narrow paper.
- **A picture floated beside the heading**: the heading (or its title) takes a right margin as
  wide as the picture, and what follows comes up beside the picture when the heading is the
  shorter. Mise does this, and Binder on a wide page.

What comes up beside a floated picture meets it in one of two ways. Running text that shares
the picture's flow goes around it line by line. A grid, a flex box, a table and anything else
that keeps its own flow (`display: flow-root`) does not: it is narrowed as a whole for as long
as it is beside the picture, when it fits there, and starts under it when it does not.

- Binder's ingredient list is a table: it is narrowed as a whole, and given its own flow so
  that its rule stops short of the picture too, as is a section's name, for the rule over it.
  The directions are running text and go around what is left of the picture. A run of steps
  that opens with a rule starts under the picture (`clear: right`). On narrow paper the table
  would be squeezed, so there the heading stays a grid.
- Mise's two columns are grids, and the method in them would be narrowed step by step. So on
  a card with a picture Mise sets the side column by hand instead: the ingredients floated to
  the left, the method a block with a left margin, its lines free to go around the picture.
  Each such container closes under its own floated column (`::after { clear: left; }`) and
  tells the paging script that its children stand side by side, which the script sees for
  itself only in a grid or a flex row: `--card-side-by-side: yes` ([Pages](#pages)). A step's
  name comes before its ingredients in the markup, and a float starts no higher than what
  comes before it, so the ingredients are raised by the height of the name, one line; under a
  name long enough to take two lines they start beside the second.
- On narrow paper, where Mise's list is a full-width table under each step's name, the heading
  is made as tall as the picture (`min-height`), so that nothing meets it.

## card.html: slots

`card.html` is a fragment: the card element and what is inside it, nothing around it. The
renderer writes the document, so a skeleton contains no `<!doctype>`, `<html>`, `<head>`,
`<body>`, `<title>`, `<meta>` or `<style>`. The outermost element should carry the class
`card`, which the core stylesheet styles.

Two constructs, nothing else — no loops, no logic:

- `{{name}}` is replaced by the slot's content.
- `{{#name}} … {{/name}}` is kept when the slot has content, and removed, markers and all,
  when the slot is empty or turned off. Blocks of different names may nest.

| Slot | Content | Printed |
|------|---------|---------|
| `title` | The recipe title (`Untitled recipe` when it has none). | always |
| `ingredients` | The ingredient table (`<table class="ingr-table">`) of a traditional recipe, or of a hoisted structured recipe. Empty when a traditional recipe's parts print `paired`. | always |
| `directions` | The direction list (`<ol class="direction-list">`) — or the [parts](#parts), each with its own list — and any sections the form gives no meaning to. | always |
| `components` | Every step when the layout is `paired`, or the titled component sections of a hoisted structured recipe with a `Choose`. | always |
| `intro` | Text between the title and the first section. | `slots.intro` |
| `notes` | The recipe's Notes section (SPEC §4.1, §4.2), in either form. On a shopping list: the list's footer. | when asked (`CardOptions.notes`) and `slots.notes`; a list's footer always |
| `picture` | The recipe's picture, the whole element: `<figure class="card-picture"><img src="data:…" alt="…"></figure>` ([Picture](#picture)). | when the recipe has one, `slots.picture` is true and the reader has not left it out; never on a shopping list |
| `yield` `source` `version` `license` | The frontmatter value, escaped. | `slots.<name>` |
| `meta` | When any of the four above is shown: a ready-made line of `meta-item`s. Use `{{#meta}}` to wrap your own, or `{{meta}}` for the line. | — |
| `theme` | The theme name (lower case, hyphenated), for class names. | — |
| `label.<name>` | A printed word: see [Labels](#labels). | — |

`title`, `ingredients` and `directions` are required: without them some recipe would print
without its core. A theme with `layout: list` needs only `title` and `ingredients`. `components` is optional; a skeleton without it gets the components (and
paired steps) inside `directions`. An unknown slot is empty — and an error for the checker.

Ids written by the renderer are prefixed `card-` (`id="card-cheese-sauce"`), so an embedded
card cannot collide with its host page.

## Labels

A skeleton contains no words of its own: every printed word is a label, so a theme can be
translated in `theme.yaml` without touching its HTML. `{{label.<name>}}` prints one.

| Label | Default | Where |
|-------|---------|-------|
| `ingredients` | Ingredients | For a skeleton that heads the ingredients (Grid). |
| `directions` | Directions | For a skeleton that heads the directions (Grid says `Method`). |
| `notes` | Notes | For a skeleton that heads the notes (Grid, Folio). |
| `yield` `source` `version` `license` | Yield, Source, Version, License | The `meta-label` of each metadata item, in `{{meta}}` and for `{{label.yield}}` etc. |
| `choose` | Choose one | Before the branches of a `Choose`. |
| `option` | Option | `Option 1`, `Option 2` on each branch. |
| `see` | see | Before a reference to another recipe. |
| `other-recipes` | Other recipes | Layout `list`: the label of the group of other recipes used as ingredients. |
| `from` `above` `below` | from, above, below | The pointer after a reference to another part of the recipe: `(from Cheese sauce, above)`. |
| `divided` | divided | Layout `hoisted`: after an ingredient merged from several steps (`1 ½ tsp kosher salt, divided`), in its `ingr-note`. |
| `optional` | optional | Layout `list`: in parentheses after an item every line of which is optional (`fresh basil (optional)`), in its `list-optional`. |
| `optional-set` | optional, all or none | Layout `list`: after the name of an optional component's or step's group of ingredients, in its `list-set-note`. |
| `choose-set` | choose one | Layout `list`: between a `Choose` component's name and a branch's name, heading the branch's group of ingredients, in its `list-set-note` (`Dough — choose one: Butter dough`). |
| `shopping-list` | Shopping list | A list for several recipes (`renderListCard`, the GUI's Shopping list): its title. There `{{label.shopping-list}}` prints the number of recipes (`3 recipes`). |
| `for` | For | A list for several recipes: before the names of the recipes it is for. |
| `callouts` | the keyword itself | A map: keyword → label printed (`Checkpoint: Check`). Keywords only: an aside prints the author's own label, and a theme check warns about any other key. Not a slot. |

A theme may define labels of its own (`labels: { serves: Serves }`) and print them with
`{{label.serves}}`. Labels are text: they are escaped, so they cannot carry markup.

## Classes

The renderer writes the repeated parts with these classes. Style them by role; they do not
change with the Markdown heading depth. They are part of the contract: a class documented
here keeps its name.

**Ingredients**

| Class | Element |
|-------|---------|
| `ingr-table` | The table: three columns. |
| `ingr-group` | A `<tbody>`: one group of ingredients. |
| `ingr-group-label` | The group's label (`<th>`) — a traditional part name, or the part (component) name in a hoisted structured recipe; never a step heading there (a recipe without components has one unlabeled group). Only inside the component sections of a recipe with a `Choose` does a group carry its step heading. A traditional part name's qualifier is in a `part-qualifier`. |
| `ingr` | An ingredient row; `ingr-reference` is added for a reference, `ingr-divided` (with `data-lines`, the number of lines merged) for one merged from several steps ([Layouts](#layouts)). |
| `ingr-qty` `ingr-unit` `ingr-item` | The three cells. |
| `ingr-use` `ingr-use-text` | Added to the quantity cell of a staple with no amount whose use remark is 12 characters or fewer (`salt — to taste`): the remark prints there, in an `ingr-use-text`, instead of after the item. |
| `ingr-note` | The note after the comma (how the ingredient is prepared), inside the item cell, comma included. |
| `ingr-remark` | A remark after an em dash (`611 g Water, 115°F — 52%`; SPEC §6), inside the item cell after any `ingr-note`, dash included. Not preparation: a baker's percentage, a weight for a volume. |
| `ingr-ref` | A reference: `ingr-ref-internal` (a link to another part of the recipe) or `ingr-ref-external` (another recipe, its target in `data-target`). |
| `ingr-ref-pointer` | The pointer words: `(above)`, `(from Cheese sauce, above)`, `see`. |
| `ingr-extra` | Something under the Ingredients heading that is not a list item. |

**Directions**

| Class | Element |
|-------|---------|
| `direction-list` | The `<ol>`. |
| `direction` | One step (`<li>`). |
| `direction-number` | The step number: 1, 2, 3 within the run (a part). Every step of a run has one. |
| `direction-alone` | Added to the only step of its run. The core hides its number. |
| `direction-body` | Everything in the step but the number. |
| `direction-text` | A paragraph of the step. |
| `direction-label` | The step name, run in after the number: a traditional step's bold lead, or the step heading. The stylesheet adds any colon. |
| `direction-extra` | An unnumbered block between two directions. |
| `callout` | A callout under its step. With it, `callout-checkpoint` for the keyword `Checkpoint`, or `callout-aside` for an informational aside. |
| `callout-aside` | Every informational aside, whatever its label (`Note`, `Tip`, `Warning`, `Make ahead`…; SPEC §5.1). The label is the only thing that tells one aside from another: there is no class per label, so style asides alike. |
| `callout-label` | The callout's label: the theme's word for a keyword, or the aside's label as the author wrote it (escaped; it may wrap anywhere). A bold lead over 32 characters is not a label: it prints as `<strong>` text at the start of the aside, without `callout-label`. |

**Parts** (a traditional recipe with named direction parts, or a hoisted structured recipe with components; see [Parts](#parts))

| Class | Element |
|-------|---------|
| `part` | One part (`<section>`): its title, then its steps. A hoisted component's part carries the component's id. |
| `part-unnamed` | Added to the unnamed leading part (steps before the first part heading), which has no title. |
| `part-step` `part-step-title` | Hoisted structured recipe: a top-level step after a component, as a part of its own; its title holds the step heading in a `direction-label` ([Layouts](#layouts)). |
| `part-title` | The part's name (`<h3>`). Kept with the part's first step. |
| `part-qualifier` | Inside a traditional `part-title` or `ingr-group-label`: the qualifier after an em dash, dash included (`### Biga — 50% hydration` prints `Biga<span class="part-qualifier"> — 50% hydration</span>`; SPEC §4.1). The bundled themes set it lighter and smaller than the name. |
| `part-paired` | Added to every part when `options.parts` is `paired`. |
| `part-with-ingredients` `part-with-directions` | Paired: added when the part has ingredients, and steps. |
| `part-body` | Paired: what follows the title — `part-ingredients`, then `part-directions`. |
| `part-ingredients` | Paired: the part's `ingr-table` (one group, no label), and any `ingr-extra`. Its rows may run on to the next page. |
| `part-directions` | Paired: the part's `direction-list`. |

**Components and steps** (structured recipes)

| Class | Element |
|-------|---------|
| `component` | A titled section (`<section>`, with the component's id). A component inside a component is the same class, nested. |
| `component-title` | Its title. |
| `steps` | A run of steps inside a section. Hoisted: an `ingredients` block, then a `directions` block. A run directly after a top-level component (`.component + .steps`) holds the recipe's closing steps: every bundled style sets it apart from that component with a rule, as the first component is set apart from steps before it. |
| `steps-paired` | Added to `steps` in the paired layout. |
| `step` | Paired: one step (`<section>`, with the step's id). |
| `step-with-ingredients` | Added when the step has ingredients. |
| `step-echo` | Added when the step's text is its heading word for word ("Chill" / "Chill."). A text that merely resembles the heading ("Combine the dry ingredients" under "Combine dry ingredients") is not an echo and prints. |
| `step-head` | The heading: `step-number` (1, 2, 3 within the run) and `step-title`. Left out for a `Choose` branch, which its `branch-label` names. |
| `step-ingredients` | An `ingr-table` with one group and no group label. Left out when the step has none. |
| `step-body` | The step's paragraphs (`direction-text`) and callouts. |
| `choose` | Added to a component whose children are alternatives. |
| `choose-label` `choose-text` | "Choose one", and the text of the `Choose` callout. |
| `component-resumed` | Added to a component's own steps that follow one of its sub-components: printed as a section of their own, titled with the component's heading, so they do not read as part of the sub-component. |
| `choose-branch` | One alternative. |
| `branch-label` `branch-marker` | Its heading, and the "Option 1" part of it. |

**Shopping list** (layout `list`; the table is also an `ingr-table`, its rows also `ingr`)

| Class | Element |
|-------|---------|
| `list-table` | The table: a checkbox column, then quantity, unit and item. |
| `list-items` `list-recipes` | Its two `ingr-group`s: the ingredients, and the other recipes used as ingredients (with an `ingr-group-label`). |
| `list-item` | A row. |
| `list-check` `list-box` | The checkbox cell, and the empty box in it: drawn with a border, not a form control. |
| `list-amount` | One amount of an item written in several units, inside `ingr-qty` and `ingr-unit`. |
| `list-plus` `list-some` | The `+ ` before a second amount, and `some` for an amount without a quantity. |
| `list-uses` | The steps that use the item (`options.slots.uses`), inside `ingr-item`. |
| `list-set` | The `tbody` of one optional component's or step's ingredients (SPEC §8), after the needed items and the other recipes; `data-set` is the part's anchor. Its label row's `th` has `ingr-group-label list-set-label`. |
| `list-set-note` | ` — optional, all or none` (`labels.optional-set`) after the set's name, inside its label; for a branch, ` — choose one: ` (`labels.choose-set`) before the branch's name, and the optional words after it when the branch is optional as well. |
| `list-branch` | With `list-set`: the `tbody` of one branch of a `Choose` (SPEC §8); `data-set` is the branch's anchor. |
| `list-optional` | ` (optional)` after an item (or another recipe) every line of which is optional (`labels.optional`), inside `ingr-item`, with `ingr-note`. |
| `list-from` | What a converted total was made from, `(181 g + 2 tbsp)`, after the item; the amount itself is led by `≈`. |
| `list-remark` | The remarks (SPEC §8), ` — or parsnips`, after the item, `list-optional` and `list-from`, inside `ingr-item`, with `ingr-remark`. A remark that not every line of a total carries is led by those lines' amounts: ` — 500 g: or parsnips`. |
| `list-footer` | A line under the list saying which amounts were left side by side and why (no density; a liquid measured in oz). |

A list for several recipes (`renderListCard`, the GUI's Shopping list) uses the same markup:
its title is "Shopping list", the header names the recipes it is for, and `list-uses` names
the recipe as well as the step.

**Picture**

| Class | Element |
|-------|---------|
| `card-picture` | The recipe's picture (`<figure>`), in the `{{picture}}` slot; its one child is the `<img>`. See [Picture](#picture). |

**Notes and other prose**

| Class | Element |
|-------|---------|
| `note` `note-label` | One note of the Notes section (either form): a top-level paragraph, or one item of a top-level `- ` list, without its bullet. `note-label` is its bold lead (`**Storage** — …`), run in. A list item's nested list or second paragraph stays inside its `.note`; anything else written there (a numbered list, a table, a quote) is a `.note` of its own. |
| `extra-section` `section-title` | A section the form gives no meaning to, printed after the directions. |
| `md-list` `md-quote` `md-code` `md-rule` | A list, quote, code block or rule written in Markdown inside prose. |

**Page furniture** — classes the bundled skeletons use, yours to rename in your own:
`card`, `card-<theme>`, `card-header`, `card-title`, `card-meta`, `has-picture`,
`meta-item`, `meta-label` (these two are also written by `{{meta}}`), `intro`,
`ingredients`, `directions`, `components`, `notes`. The renderer's own page gives the
`<body>` the class `card-page`.

All recipe text is escaped. Inline Markdown in prose — strong, code, links to web addresses —
is rendered; raw HTML in a recipe is shown as text. Emphasis (`*x*`, `_x_`) prints as plain
text everywhere on a card and on the shopping list: in a step's instruction it marks words for
the chart's box (SPEC §5.3, §8), so a card has no `<em>` to style. Bold prints as `<strong>`,
also with emphasis inside or around it.

## Custom properties

The renderer writes these ahead of the core stylesheet, from `theme.yaml` and the options:

```css
@page { size: letter; margin: 0.6in 0.65in 0.8in; }     /* for the flow without the paging script */
:root {
  --card-font-body: …;            /* options.fonts.body */
  --card-font-title: …;           /* options.fonts.title */
  --card-font-title-weight: 300;  /* options.fonts.title-weight (700 when not stated): .card-title reads it */
  --card-font-size: 11pt;         /* options.font-size, or the paper's; the paging script sets the fitted size here */
  --card-page-width: 8.5in;       /* the paper */
  --card-page-height: 11in;
  --card-sheet-margin: 0.6in 0.65in 0.8in;               /* page.margin, or the paper's */
  --card-margin-top: 0.6in;       /* …and each side alone */
  --card-margin-right: 0.65in;
  --card-margin-bottom: 0.8in;
  --card-margin-left: 0.65in;
  --card-paper: #fff;             /* the color roles: see below */
  --card-desk: #e8e8e4;
  --card-ink: #000;
  --card-ink-soft: #444;
  --ingr-qty-width: 4.4ch;        /* the widest quantity on this card, estimated; absent when none */
  --ingr-unit-width: 5.1ch;       /* the widest unit on this card, estimated; absent when none */
}
```

A card has several ingredient tables (one per step or part), and a table sizes its own
columns, so one long unit (`pinch`, `large`) would push its table's items out of line with
the others. `--ingr-qty-width` and `--ingr-unit-width` are the renderer's estimate (generous
by about 10 %) of the widest quantity and unit printed anywhere on the card. Size the two
cells from them, with a fallback, so every table on the card has the same columns:
`.ingr-table .ingr-unit { width: max(2.3rem, var(--ingr-unit-width, 0px)); min-width: max(2.3rem, var(--ingr-unit-width, 0px)); }`.

A theme may set one more, which the core stylesheet reads:

| Property | Default | Meaning |
|----------|---------|---------|
| `--card-paragraph-gap` | `0.5em` | Space between the paragraphs and blocks of one step. Set it on `:root` rather than overriding the rule, so the core's spacing of lists and quotes inside a step stays in order. |

**Color roles.** A card's colors are four roles, four of the app's
(`--paper`, `--ink`, …) with the card's prefix. The metaphor is a sheet of paper on a desk;
each role names a color, never a line or a width:

| Property | Default | Meaning |
|----------|---------|---------|
| `--card-paper` | `#fff` | The sheet. |
| `--card-desk` | `#e8e8e4` | Behind the sheet, on screen only. |
| `--card-ink` | `#000` | Text, and every line. |
| `--card-ink-soft` | `#444` | Secondary text. |

The core stylesheet reads them (the desk behind the page, the sheet's paper, the text of
`.card` and of each `.sheet`), and every bundled theme writes its
colors through them: `border-top: 1.25pt solid var(--card-ink)`, `color: var(--card-ink-soft)`.
On paper a card's lines are ink: a thin line and a heavy one differ by weight, not color, so
every line the core and the bundled themes draw takes `--card-ink`. A line's width stays the
theme's, so a theme that names its lines keeps doing so: `--folio-hair: 0.5pt solid
var(--card-ink)`. A quieter line takes the soft ink: Shopping's row lines are `0.5pt solid
var(--card-ink-soft)`. A theme may also set a role for itself on `:root`. A custom property
holding a whole line (`0.5pt solid var(--card-ink)`) takes the role's value where it is
declared, so declare such properties on `:root`, as the bundled themes do, or set the role on
the same element.

**On screen and on paper.** On screen the app may draw a card in its own palette:
with Settings > Cards and printing > Card > Colors on "Match the app" (the default), it sets
the four roles from the app's roles of the same name (`paper`, `ink`, `ink-soft`, `desk`) in a
screen-only style that outranks the theme's `:root`, so a card's lines take the app's `ink`; the
desk is always the app's. On paper a card is always
its own: printing, a saved PDF and `etna card` use the roles as the theme leaves them.

The root element's font size is `--card-font-size`, so `1rem` is the card's text size wherever you are in the card.

## What the renderer gives every theme

The core stylesheet ships with the renderer (in Node and in the browser alike) and comes
before the theme's own, so a custom theme in another repository gets it for free and can
override any of it with a rule of the same selector. It holds mechanics, not looks:

- **Page boxes** ([Pages](#pages)): on screen each `.sheet` the paper's size, its padding the
  margins, shown one under another on the desk (`--card-desk`); in print one per sheet of
  paper, the area inside the page margins; `.sheet-box` inside the margins; `.sheet-content` a
  size container named `card-page`. Nothing is printed in the margins.
- **The flow.** Without the paging script the card is one flow (`.card-flow`): on screen one
  sheet of paper, `--card-page-width` wide and at least `--card-page-height` tall, its
  padding the margins; in print the browser's own pages. In print the body has no margin.
- **The card.** `.card` sets `font-family: var(--card-font-body)`, `font-size:
  var(--card-font-size)` and the text in `--card-ink`; each `.sheet` is `--card-paper`
  with its text in `--card-ink`, and the desk behind the pages on screen `--card-desk`. Its
  one line, the border of `list-box`, is `currentColor`, the ink. Those four roles are all
  the color the core uses. Set `line-height` and anything else yourself. A phone shows the
  text at the sizes set and does not enlarge any of it by itself (`text-size-adjust: 100%`).
- **The ingredient table.** Collapsed borders; cells aligned left on the baseline at normal
  weight; the quantity right-aligned and the quantity and unit unbroken, so the three
  columns line up. Widths and padding are the theme's.
- **Lists and spacing.** The direction list has no bullets, margin or padding; step
  paragraphs have no margin, with `--card-paragraph-gap` between them; callout and note
  paragraphs have no margin, 0.4em between them; intro paragraphs 0.5em below; Markdown
  lists and quotes a small indent; code keeps its line breaks; links inherit the color.
- **References.** `ingr-ref` is not underlined; `ingr-ref-pointer` is italic.
- **Breaks.** An ingredient group, a direction, a paired step, a callout and a note are each
  kept on one page; a component title, a part title, a choose label, a branch label and a
  section title stay with what follows. A paired part's ingredients are kept row by row, not
  as a group, so they can run on beside the part's steps.
- **The picture.** `card-picture` is a square, 1.5 in wide until the theme sets a width,
  with no margin; it is kept on one page, and the image fills it, cut to its middle
  (`object-fit: cover`). Its size never waits for the image, so the paging script measures
  the box the card will print.
- **Numbers.** The number of a `direction-alone` step is hidden.
- **Paired steps.** `step-number` is hidden, and the body of a `step-echo` step (its text
  only repeats its heading) is hidden.
- **Shopping lists.** Rows are kept whole, not the whole list; `list-box` is a 0.8em square
  with a 1px border; each `list-amount` is on its own line; `list-uses` is a small line under
  the item.

Everything else — type, weights, rules, color, spacing between sections, whether direction
numbers show, how notes and metadata look — is the theme's.

## Pages

A card is shown as real pages of its paper, exactly as they print — in the GUI's preview, in
any browser's print, and in `etna card --pdf`, which all run the same paged document.

**What the renderer writes.** The card document holds the card as one flow,
`<div class="card-flow"><article class="card">…</article></div>`, and, at the end of the body,
one small script — the *paging script* — that the page's Content-Security-Policy admits by its
SHA-256 hash and nothing else. The script's settings are data on the root element:
`data-paper`, `data-fit`, `data-size`, `data-fit-rule`.

**What the script does.** It waits for the card's fonts, then cuts the flow into page boxes:

```html
<div class="card-sheets">
  <div class="sheet" data-page="1">                       <!-- the paper, padded by the margins -->
    <div class="sheet-box">                                <!-- inside the margins: frame, rules -->
      <div class="sheet-content"><article class="card …">…this page's part…</article></div>
    </div>
  </div>
  …
</div>
```

It fills each `.sheet-content` element by element: an element that fits is copied whole; one
that does not is split — the container re-created on the next page with its remaining
children, and a block of text cut between two lines (at least two lines stay on each side
when it has four or more). Nothing is ever lost, doubled or cut off.

A block marked `break-inside: avoid` (the core marks ingredient groups, directions, steps,
callouts and notes) is kept whole, and moved to the next page, only when that does no harm:
it must fit on a fresh page, the page it leaves must not be empty otherwise, and leaving
must not empty more than half of that page (a quarter, when the block is itself over half a
page tall). Otherwise it is split like any other block.

A heading is never the last thing on a page: a title, part title, group label or step name
moves on with what follows it, also when the two sit in different containers or in
side-by-side columns. A small block marked `break-after: avoid` (up to a quarter of the page)
counts as a heading.

A container split across pages carries `card-split` on the page it leaves and `card-continued`
(without its `id`) on the page it continues on. Containers whose children stand side by side
— a grid with two or more columns, a flex row — fill each column on its own, and a column
that is finished leaves an empty copy of itself on later pages so the others keep their
place. A block that sets its children side by side another way (a column floated beside the
rest) says so, since the script cannot tell: `--card-side-by-side: yes` on that container. The
property is not inherited, so it marks only the container it is set on; such a container must
also close under its floated column (a clearing `::after`), so that its box is as tall as its
tallest column. A multi-column container (`columns: 2`) is given the height left on its page, so its
columns fill one after the other; on the last page it is balanced. Only something that cannot
be split at all and is taller than a whole page (an image, say) is printed cut off
(`data-overflow` on the root; `etna card --pdf` says so). If the script fails for any reason,
the card is left as the plain flow, printable as before, with `data-paged="failed"`.

Then it marks the pages (`sheet-last`, `sheet-only` for a one-page card, `data-page`),
removes the flow, switches the print rules to one page per sheet (`@page { size: <paper>;
margin: <the card's margins> }`, no `@page` border, every margin box empty; the sheet the
area inside the margins, with no padding), and sets `data-paged="done"`, `data-pages` and `data-size` on the root element and fires an
`etna-paged` event on the document.

**The fallback.** Without the script — scripts off, or a host that blocks them — the card is
the flow, printed by the browser's own pages with the `@page` rules a theme writes. Keep them:
a theme should look right both ways, but it need not look identical. If the script fails it
removes its pages, sets `data-paged="failed"`, and leaves the flow.

**What replaced `@page` borders.** On a paged card, style the page boxes: a frame on every
page is `.sheet-box { border: …; padding: … }`, where the flow has `@page { border: …;
padding: … }` (Chrome only). Nothing goes in the page margins: a card prints no running title
and no page number, paged or not.

### Papers

`letter` (8.5 × 11 in), `a4`, `half-letter` (5.5 × 8.5 in), and the index cards
`index-4x6` and `index-5x7`, used landscape (6 × 4 and 7 × 5 in). A theme lists those it
supports under `page.papers`, and may change the margins, the text size and the fit limits
for each:

```yaml
page:
  size: letter                 # the default paper
  margin: 0.6in 0.65in 0.8in
  papers:
    letter: {}
    a4: {}
    half-letter: { margin: 0.45in 0.4in 0.6in, font-size: 9.5pt, fit: { min: 8.5pt, max: 10.5pt } }
```

A theme without `page.papers` supports only the paper of its `page.size` (or its
`page.width` and `page.height`). Asking `etna card --paper` for a paper a theme does not list is
an error; the card toolbar's paper picker offers only the theme's papers (Settings lists every paper,
and a style that does not offer the one chosen uses its own). Every bundled theme does letter
and A4; leave out a paper the theme cannot do well.

**Adapting to narrow paper.** Adapt by the width of the page, not with a second stylesheet:

- `.sheet-content` (and the flow) is a size container named `card-page`, so
  `@container card-page (max-width: 5in) { … }` applies on half letter (and, in the flow, on
  any page that narrow). Mise folds its side column under its steps this way.
- The root element carries `data-paper`, for what a container query cannot reach — the page
  box itself: `[data-paper="half-letter"] { --binder-frame-padding: 0.15in 0.25in; }`.

Content widths for orientation: letter about 7.2 in, A4 about 7 in, half letter about 4.6 in,
index 5×7 about 6.4 in, index 4×6 about 5.5 in (less the theme's margins).

### Fit

Fitting does by itself what a per-recipe font size used to do by hand: it chooses the text size
so a card fills whole pages. It changes only `--card-font-size`; everything sized in `rem` or
`em` follows. So size the spacing that belongs to the text (gaps between steps, padding around
headings, ingredient columns) in `rem`, and keep in absolute units only what belongs to the
paper (frames, hairlines).

The script lays the card out at the theme's size, then:

1. More than one page and the last filled less than `fit.nearly-empty` (default 0.3): the
   largest size between `fit.min` and the theme's size that needs one page fewer (`shrunk`).
2. Otherwise it prints at the theme's size (`kept`).

**Fitting never enlarges.** Every card prints at the theme's size for its paper unless a
smaller size saves a nearly empty last page, so cards of one theme look alike. A larger size
is the reader's choice: `etna card --size 12pt`, or the GUI's Size control, which offers the
sizes from `fit.min` to `fit.max` (`max` is above the theme's size in every bundled theme).

A theme that wants the older behavior opts in with `fit.grow: true` (per paper too). Then,
after step 1: a single page filled less than `fit.short` (default 0.5) stays at the theme's
size (`short`), and otherwise the card grows to the largest size up to `fit.max` that keeps
the page count and fills the last page no more than `fit.full` (default 0.9) (`grown`).

Sizes are tried in 0.1pt steps by binary search; the same recipe, theme, paper and fonts give
the same result. `etna card --fit off` (`CardOptions.fit: 'off'`) prints at the theme's size,
and `--size 10.5pt` at that size. The result is on the root element (`data-size`,
`data-pages`, `data-fit-result`: `shrunk`, `kept`, `unclipped` when the theme's own size
would have cut something off and a smaller one was taken, and with `fit.grow` also `grown`
or `short`), in the GUI's toolbar, and on standard error from `etna card --pdf`. Fitting
never chooses a size at which anything is cut off while a size without exists.

**What a theme must not rely on.** The page boxes and their classes are written by the
script, so a rule for `.sheet…` styles nothing in the flow, and the flow's `@page` rules style
nothing on a paged card. Do not size anything in `vh` or by the page (`100vh` is the screen,
not the paper); stretch with `.sheet-only .sheet-content > .card { min-height: 100% }`
instead. Do not use `position: fixed`, `:nth-child` counts across a whole list (a list split
over two pages is two lists), `counter()` across pages, ids for styling (a continued container
has none), or `@page :left`/`:right` — they are switched off on a paged card. A highlight or
anything else added to the card after paging is not paged.

## Web fonts

A theme names its fonts in its font stacks, and lists under `webfonts:` the freely licensed
ones that the renderer may deliver. Each entry is a family available from
[Google Fonts](https://fonts.google.com) and exactly what to load of it:

```yaml
webfonts:
  - family: Quicksand                              # as it appears in options.fonts
    google: 'Quicksand:wght@300'                   # the css2 API's family= value
  - family: Figtree
    google: 'Figtree:ital,wght@0,300..700;1,400'
```

`family` is letters, digits and spaces, and must appear in a font stack (the checker warns
otherwise). `google` is the family name with `+` for spaces, then optionally `:`, the axes
(`ital`, `wght`, `wdth`, `opsz` …) and `@` their values — tuples separated by `;`, a range
written `400..700`. Nothing else is accepted: no `&`, `=`, `/`, `%` or quotes, so the value
cannot carry a URL or another query parameter; `parseTheme` refuses the theme otherwise, as
it refuses a family listed twice, a `google` value that names another family, and more than
eight families. Load only the weights and styles the stylesheet uses — `wght@300`, not the
whole family.

The font stacks are not changed by `webfonts:`. A font in a stack wins over a later one
whether it is installed or delivered, so a system font put first would print instead of the
free font on a machine that has it. **The bundled card themes use free fonts always**: each
stack is the delivered font, then only a generic family (`Figtree, sans-serif`), so a card
prints the same on every machine. A theme of your own may still put a system font first.

**The bundled card themes' fonts.** All are from Google Fonts under the SIL Open Font
License 1.1 (as Google's catalog lists them; the served files carry no license string).
Files counts the WOFF2 files `etna fonts` caches: one per weight and style, or one for a
whole variable range, for each of the `latin` and `latin-ext` subsets.

| Theme | Font | Loaded | Files |
|-------|------|--------|-------|
| `mise`, `shopping` | Figtree | 300–700 (variable), italic 400 | 4 |
| `folio` | Spectral, and Spectral SC for the small-capital labels | 400, 700, italic 400; SC 400 | 6 + 2 |
| `grid` | Inter | 400–700 (variable), italic 400 | 4 |
| `galley` | IBM Plex Sans Condensed | 400, 500, 600, 700, italic 400 | 10 |
| `countertop` | Merriweather | 400–700 and italic 400–700 (variable) | 4 |
| `binder` | Quicksand (title), Jost (text) | 300; 400, 700, italic 400 | 2 + 4 |

The cache for all of them is 36 files, 930 KB. Each theme loads every weight and style its
stylesheet uses, so the browser never synthesizes a bold or an italic; Google's builds have
no small capitals (`smcp`) or old-style figures (`onum`), so Folio takes its small capitals
from Spectral SC and prints lining figures, and Mise's and Binder's small-cap labels are made
by the browser from capitals.

**Three ways the renderer delivers them** (`CardOptions.webfonts`, chosen by the caller):

| Mode | What the card gets | Needs |
|------|--------------------|-------|
| `none` (the default) | Nothing: the stacks fall back to what the machine has. | — |
| `web` | One `<link rel="stylesheet">` to Google Fonts in the page head, loading all of the theme's families with `display=swap` (text shows in the fallback font until they arrive), after two `preconnect` hints. `renderCardParts` returns the stylesheet URL in `links`, for a host page to add. | The network, whenever the card is shown or printed. |
| `embedded` | The caller's `@font-face` rules, their `src` `data:` URLs, first in the card's `<style>`. The card is self-contained. | Nothing: prints and makes PDFs offline. |

Who uses which: `etna card` embeds the fonts when the local cache has all of the theme's
(`--fonts embedded|web|none` to choose; without the cache it prints with the installed fonts
and says `run "etna fonts" …`). `etna serve` embeds them from the cache too. `etna build-web`
(GitHub Pages) uses `web`, so nothing is bundled and each browser fetches a theme's fonts from
Google when it shows a card. A theme the GUI reads from a collection or a GitHub repository
(not a bundled one) prints with the installed fonts (`none`), so showing someone else's theme
never makes the browser contact Google.

**The cache.** `etna fonts` fetches what the bundled themes declare into `themes/.fonts/`,
which is committed (so a fresh clone prints without network; credits and licenses in
[`.fonts/README.md`](.fonts/README.md)) and which is never read as a theme: for each `google:` value it asks Google
for the stylesheet as a desktop browser would, keeps the `latin` and `latin-ext` subsets,
downloads those WOFF2 files and writes `index.json`. `etna fonts list` shows what is cached,
`etna fonts clean` removes it (`git checkout -- themes/.fonts` brings it back). `etna fonts ./my-theme` fetches a theme of your own.

**Why a theme cannot load its own fonts.** A theme may not contain `<link>`, `@import` or a
`url()` other than `data:` ([below](#what-a-theme-may-not-contain)): a theme from someone you do
not know must not be able to make the card fetch anything, or tell a server who printed what.
`webfonts:` is data, not a URL: the renderer builds the one request from it, to the one host the
page's Content-Security-Policy allows, and only when the caller asks for `web`. Nor does a theme
carry the font files: as `data:` URLs they would add hundreds of kilobytes to every theme;
the cache holds them once, committed with their licenses (`themes/.fonts/README.md`).

A Google Fonts subset covers the Latin alphabet but not every character: the vulgar fractions
other than ½ ¼ ¾ (`⅓`, `⅔`, `⅛`) are in neither `latin` nor `latin-ext`, so they print in a
system font.

## What a theme may not contain

A card is printed from a page that can run nothing and load nothing. `parseTheme` refuses a
theme, naming the file and the reason, when

- **`card.html`** contains `<script>`, `<iframe>`, `<frame>`, `<object>`, `<embed>`,
  `<applet>`, `<portal>`, `<link>`, `<meta>`, `<base>`, `<style>`, `<form>`, `<a>` or
  `<area>`; an element that loads an image or media — `<img>`, `<picture>`, `<source>`,
  `<track>`, `<video>`, `<audio>`, SVG `<image>` or `<feImage>`, `<input type="image">`; an
  event-handler attribute (`onclick=`, `onerror=`…) or a `name=` attribute, anywhere in the
  file; an attribute that names something to load or go to (`src`, `srcset`, `href`,
  `xlink:href`, `poster`, `data`, `action`, `formaction`, `background`, `ping`, `cite`,
  `longdesc`, `manifest`…) whose value is not a `data:` URL — `href` and `xlink:href` may also
  be a `#fragment`, as for an SVG `<use href="#mark">`; a `style="…"` attribute that breaks
  any of the stylesheet rules below (`url(…)` other than `data:`, `image-set()`, `@import`…);
  a `javascript:` or `vbscript:` URL (all of these also when written with character
  references); or the page shell (`<!doctype>`, `<html>`, `<head>`, `<body>`, `<title>`).
  `data-…` attributes and plain inline styles are fine. The recipe's picture is the one image
  a card shows, and it comes from the renderer, in the `{{picture}}` slot, never from the
  theme: a theme's files may not hold an `<img>` for it or anything else.
- **a stylesheet** contains `@import`, `expression(`, a `behavior:` or `-moz-binding:`
  property, `image-set()` or `src()`, or a `url(…)` that is not a `data:` URL (also when
  written with CSS escapes). **Comments are checked like the rest**: telling a comment from
  a string takes a real CSS parser, so `/* url(https://…) */` is refused too. Write about
  such things in the theme's README instead.

Why: scripts and event handlers would run code on the reader's machine; frames, objects,
links, imports and remote URLs would load things from the network (and tell a server who
printed what); a link of the theme's own could send the reader's card frame elsewhere; a
named element (`<img name="createElement">`) shadows part of the page that the paging
script relies on; `<meta>` and `<base>` could redirect or re-target the page; and the shell is
the renderer's so that the policy below always applies. This is a plain deny list over the
text, not a sanitizer: a theme that trips it is not cleaned up, it is not used.

Behind the list stands the page's Content-Security-Policy:

```
default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline'; font-src data:; img-src data:
```

and, only for a card rendered in the `web` font mode, the two Google Fonts hosts as well:

```
default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline' https://fonts.googleapis.com;
font-src data: https://fonts.gstatic.com; img-src data:
```

Inline styles, and fonts and images as `data:` URLs, are allowed (and Google Fonts in `web`
mode); nothing else may load. The checker and the policy are two walls: markup the checker
lets through would still load nothing under the policy, and a page that embeds a card's parts
without the policy (`renderCardParts`) still gets nothing a theme could load from. One script runs: the renderer's [paging script](#pages), admitted by the hash
of its exact text — no other inline script, script file, event handler or `eval`. The
script treats the card as data: it copies elements and sets text, and loads nothing. A card
rendered without paging (`--no-paging`, `CardOptions.paging: false`) has no `script-src` and
runs nothing. Links that come from a recipe open in a new window, never in the card's own
frame. Google Fonts is reached only by the renderer, from a
theme's [`webfonts:`](#web-fonts) and only in the `web` mode.

## Printing

- Cards are made to be printed from a browser, or to PDF with `etna card --pdf`, which uses
  an installed Chrome-family browser. Turn the browser's own headers and footers off.
- A paged card prints the same in every browser: each page box is one sheet, its frame and
  rules ordinary elements. The card's margins are the page's own margins and the sheet is the
  area inside them, because Safari's print preview draws a sheet that has padding of its own
  in the wrong place (shifted up, its top cut off), though it prints it right. Checked in
  Safari 26.6, Chrome 157 and Firefox 160 on macOS.
- **Flow only, Chromium only:** borders and padding on the `@page` box — what a card printed
  without the paging script uses for its frame. Elsewhere that flow prints without them.
- `break-inside: avoid` keeps blocks whole where that leaves the page reasonably full (see
  [Pages](#pages)); in the plain flow the browser applies it strictly, so a page can end
  early when the next block is tall. Multi-column layout (Galley) fills columns page by page and balances the last one —
  on a paged card the paging script does this, in the flow the browser.
- `text-wrap: balance` and `pretty` are progressive: without them headings wrap as usual.

## Contract versions

`etna-theme: 2` is this contract: contract 1 and [page boxes](#pages), `page.papers`,
`fit:`, `rem` as the card's text size, and [parts](#parts) (`options.parts`, the `part-*`
classes, `direction-alone`). A theme written for contract 1 is still read and
paged; its `@page` border and padding show only on the flow, and `etna theme
check` says so. A future renderer that changes it will raise the number,
keep reading themes written for older versions where it can, and refuse a theme that asks
for a version it does not know rather than print it wrongly. `etna theme check` warns about
a theme that does not say which version it was written for.

# Chart themes

A chart theme decides how `etna dag` draws a recipe's flow chart: colors, line weights,
fonts, the shapes of the boxes, the edge style, spacing, and a few position switches. The
layout itself — which step goes where, how edges are routed — is the renderer's. Charts exist
only for structured recipes.

```sh
etna dag --list-themes                            # the bundled chart themes
etna dag path/to/recipe --theme ink --out chart.svg
etna dag path/to/recipe --theme ./my-chart-theme --out chart.svg
etna dag path/to/recipe --pdf --paper a4 --out chart.pdf   # one page, fonts embedded
etna dag path/to/recipe --pdf --shape landscape --out chart.pdf   # the sheet on its side
etna dag path/to/recipe --shape auto --out chart.svg   # the SVG of the chart as it prints
etna dag --check-theme ./my-chart-theme           # is every value valid?
etna dag --list-values                            # the table below
```

The bundled chart themes:

| Theme | Idea |
|-------|------|
| [`flow`](flow/) | The default. The hand-made reference charts: amber ingredient boxes, blue hexagons, monospace text. Its `theme.yaml` lists every value. |
| [`ink`](ink/) | Black on white for a laser printer. Thin square ingredient boxes, heavy hexagonal operations; no color, no gray. |
| [`dense`](dense/) | Flow, smaller and tighter, so a long recipe fits one letter page at a readable size. |
| [`station`](station/) | Goes with the Mise card: Nunito Sans, black hairlines, a light title over a rule, edges with wide rounded corners. |

## What a chart theme is

A folder with two files:

| File | What it is |
|------|------------|
| `theme.yaml` | `etna-theme: 1`, `kind: chart`, `name`, `description` (one line), and `values`: the values the theme changes. Keep `name` to a word or two: it may be up to 40 characters, but the chart toolbar's Style menu shows 13 and cuts a longer one, its last character an ellipsis (Settings, and the entry's tooltip, show it whole), and the check warns. |
| `README.md` | The idea, and what it changes. |

A chart theme is only data. There is no stylesheet and no markup: every value has a type (a
color, a number in a range, one of a few words, a font stack, a dash pattern, a short label),
and the renderer writes the SVG from them. So a chart theme from someone you do not know is as
safe to use as a bundled one.

## Make your own

1. **Make a folder** with a `theme.yaml`:

   ```yaml
   etna-theme: 1
   kind: chart
   name: harbor
   description: Navy outlines on white, pill-shaped steps.
   values:
     operation-shape: pill
     operation-fill: '#ffffff'
     operation-stroke: '#1d3557'
     ingredient-fill: '#f1faee'
   ```

2. **Name only what you change.** Everything else is `flow`'s, except `palette`: a theme that
   does not say `palette: app` keeps its own colors in the GUI (see [Match the app](#match-the-app)).
3. **Check it:** `etna dag --check-theme ./harbor`. It lists errors (a value is refused, and
   the default is used instead) and warnings (an unknown key, fonts the width table does not
   cover), then renders the bundled example recipes with the theme.
4. **Use it:** `etna dag path/to/recipe --theme ./harbor`. A theme is found by name among the
   bundled themes, or by path when the argument contains a `/` or starts with `.`.

## Text widths

No font is read when a chart is drawn, so a chart comes out the same in Node and in
a browser. The widths come from tables made ahead of time:

- **The font's own widths**, when the first family of `font-family` (of `title-font-family`
  for the title) is a cached font: every bundled chart and card font (below). `etna fonts
  metrics` reads them from the TrueType files in the font cache into
  `tools/src/dag/font-metrics.ts`, which is committed; a test keeps it in step with the files.
  A weight the family has no file for is measured at the nearest one it has (the heavier on a
  tie), as the PDF picks its face. These are the widths the SVG and the PDF draw, less kerning,
  which only ever brings a line in: on real ingredient lines and step headings Chrome draws
  within 2% narrower and at most 0.33% wider. No value to set: a theme gets them by naming the
  font first.
- **Otherwise `text-measure`** (and `title-text-measure` for the title):
  - **`mono`** — one character is `char-width` em. Right for any monospace font.
  - **`sans`** — each character's advance from a built-in table: the widest of Avenir Next,
    Nunito Sans, Helvetica Neue, Helvetica and Arial (so also Arimo and Liberation Sans).
  - **`serif`** — the same for Charter, Iowan Old Style, Georgia, Source Serif 4 and Times
    New Roman (so also Tinos and Liberation Serif).

  Weights up to 400 use the regular table, heavier weights the bold one. Since each character
  counts as wide as the widest of those fonts, text fits in any of them, with a little room to
  spare in the narrower ones. Name only those fonts in the stack, then the generic family; the
  checker warns about any other.

A character a table lacks counts as the widest one it has. `char-width` is the average
character: it turns the `*-wrap` values, which count characters, into widths (with `mono` and
no metrics it is also every character's advance). The bundled themes keep `0.55` (sans) and
`0.6` (`flow`). Real chart text averages 0.46 em in Arimo 400 (0.49 bold) and 0.47 em in Nunito
Sans 500, so a wrap of 26 holds about 30 characters there.

A font with metrics is measured exactly, and its fallbacks are not: with `font-embedding: none`
a machine without the first family draws the text in the next one, which may be a few percent
wider (Avenir Next is up to about 6% wider than Nunito Sans).

## Fonts

A chart theme's font is the **first family** of its `font-family` (and of `title-font-family`
for the title): a free font (decision 0015) that is the screen's font, the PDF's font, the font
the layout is measured in, and is embedded in the SVG. The rest of the stack is the fallback,
used only with `font-embedding: none`. One value names it, so the screen, the PDF and the
layout cannot disagree.

- **SVG.** With `font-embedding: embedded` (the default) the SVG carries the font as
  @font-face rules with data: URLs, from the WOFF2 files `etna fonts` caches in
  `themes/.fonts/` (latin and latin-ext, as for the cards). An SVG shown as an image, saved,
  or opened on another machine then shows the same font with no request. `none` (the theme
  value, `etna dag --fonts none`, or a caller's `fonts: { mode: 'none' }`) gives a small file
  that uses the machine's fonts. A family that is not cached is not embedded.
- **PDF.** `etna dag --pdf` and the GUI's PDF button always embed the font, from TrueType
  files the cache also holds, one static file per weight the theme uses: a PDF embeds
  TrueType, and the WOFF2 files (variable fonts in unicode-range pieces) are not something the
  PDF library can subset.

Fonts with metrics and TrueType files in the cache:

| Font | Weights | Used by |
|------|---------|---------|
| JetBrains Mono | 400, 700 | `flow`: every advance is exactly 0.6 em, so it lays out as `mono` at `char-width: 0.6` |
| Arimo | 400, 700 | `ink`, `dense`; and the stand-in for a character another font lacks |
| Nunito Sans | 300, 500, 600 | `station` |
| Merriweather | 400, 500, 700 | card theme Countertop |
| Quicksand | 300, 400, 700 | card theme Binder (title) |
| Jost | 400, 700 | card theme Binder |
| Spectral | 400, 700 | card theme Folio |
| IBM Plex Sans Condensed | 400, 700 | card theme Galley |
| Inter | 400, 700 | card theme Grid |
| Figtree | 300, 400, 700 | card themes Mise and Shopping list |

The card fonts are cached at 400, 700 and the card's title weight (`options.fonts.title-weight`),
so that a chart can be drawn in a card style's fonts ([Match the card](#match-the-card)); a
chart theme may also name any of them itself. `etna fonts` fetches
what a theme needs; after a new font, run `etna fonts metrics` and commit both.

In the PDF, a face whose family has metrics draws at its own widths; any other run is held to
the width the layout gave it: a character the font lacks (JetBrains Mono and Nunito Sans have
no ⅓, ⅔ or ⅛; Figtree and Quicksand no ⅓ or ⅔) is set in Arimo, squeezed to the font's widest
advance, which the layout counted. With `mono` and a font without metrics the PDF keeps every
character to its cell of `char-width` em. On screen a missing character comes from whatever
fallback the browser finds (the embedded WOFF2 files hold no ⅓ in any font). In a PDF, a
theme whose first family is not cached gets the bundled font for its measure (JetBrains Mono
for `mono`, Arimo otherwise), held to the measured widths; run `etna fonts` to cache it. The
GUI bundles the bundled chart themes' fonts, and the bundled card styles' body and title fonts,
as chunks loaded on first use: the WOFF2 CSS of a
family when a chart in it is first shown (drawn with the fallbacks until it arrives, at the
same layout; a chart is shown as an image, which cannot load a font itself), the TrueType files
when a PDF needs them.

## Values

Every value, with its type, its default (`flow`'s) and what it does. Colors are `#rgb`,
`#rrggbb` (with optional alpha), `rgb(…)`, `hsl(…)` or a CSS color name. Lengths are SVG
units: the chart scales to whatever size it is shown or printed at. This table is generated
from the renderer's schema (`etna dag --list-values`); a test keeps it in step.

<!-- chart-values:start -->
**Page**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `background` | a color | `#ffffff` | Color of the whole chart. |
| `margin` | 0–200 | `32` | Empty space around the chart. |
| `palette` | own \\| app | `own` | `own`: the chart is drawn in this theme's colors, always. `app`: in the GUI, with Settings > Cards and printing > Flow chart > Colors on "match the app", every color value is replaced by one made from the app's appearance (operations solid in its accent with its on-accent text, ingredient boxes its soft accent with its ink, edges and outlines its ink and rule color; no hue the appearance does not carry; a PDF takes the light scheme of the same palette); `etna dag` has no app and uses the theme's own. |

**Text**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `fonts` | own \\| card | `own` | `own`: the chart is set in this theme's fonts, always. `card`: given a card style (in the GUI the one in use, or one pinned in the chart's Font menu or Settings > Cards and printing > Flow chart > Fonts; `etna dag --card`), the title is set in the card's title font at its title weight and all other text in its body font, ingredients in its regular weight; every text size is scaled so the card's fonts have the x-height this theme's own have; `char-width` becomes the body font's nominal character and `title-wrap` is scaled to the title font, so the `*-wrap` counts keep their meaning; shapes, padding, spacing and colors stay this theme's. Without a card it uses its own. |
| `font-family` | a font stack | `"JetBrains Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace` | Font stack for all text but the title. End it with a generic family. Its first family is the free font the SVG and the PDF embed (`etna fonts` caches it). |
| `font-embedding` | embedded \\| none | `embedded` | `embedded`: the SVG carries the free font that heads `font-family` and `title-font-family` (from the font cache, as data: URLs), so it looks the same on every machine; a PDF embeds it too. `none`: a smaller SVG that uses the fonts the machine has. |
| `text-measure` | mono \\| sans \\| serif | `mono` | How text width is worked out when the first family of `font-family` has no metrics: `mono` (characters × `char-width`), or the built-in `sans` or `serif` width table. Must match the font stack. A cached font (every bundled one) is measured by its own widths instead. |
| `font-size` | 6–48 | `14` | Size of ingredient and operation text. |
| `font-weight` | 100–900 | `700` | Weight of captions and container names. |
| `line-height` | 1–3 | `1.2` | Line spacing, as a multiple of `font-size`. |
| `char-width` | 0.3–1.2 | `0.6` | The average character, in em, which turns the `*-wrap` counts into widths. With `mono` and a font without metrics, also the advance of every character. |
| `text-color` | a color | `#333333` | Color of captions and container names. |

**Title**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `title-position` | center \\| left \\| none | `center` | Where the title goes: top center, top left, or no title. |
| `title-shape` | pill \\| rectangle \\| plain \\| underline | `pill` | What surrounds the title: a pill, a rectangle, nothing, or a rule under it across the chart. |
| `title-font-family` | a font stack | `"JetBrains Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace` | Font stack for the title and subtitle. |
| `title-text-measure` | mono \\| sans \\| serif | `mono` | As `text-measure`, for the title font. |
| `title-font-size` | 8–96 | `30` | Size of the title. |
| `title-font-weight` | 100–900 | `400` | Weight of the title and subtitle. |
| `subtitle-font-size` | 6–64 | `15` | Size of the subtitle (`in the style of …`, or after a dash). |
| `title-wrap` | 8–80 | `22` | Characters per title line. |
| `title-fill` | a color | `#ffffff` | Inside of the pill or rectangle. |
| `title-stroke` | a color | `#333333` | Outline of the pill or rectangle, or the rule. |
| `title-stroke-width` | 0–12 | `5` | Width of that outline or rule. |
| `title-radius` | 0–60 | `0` | Corner radius of the `rectangle` shape. |
| `title-padding-x` | 0–120 | `44` | Space left and right of the title text. |
| `title-padding-y` | 0–120 | `20` | Space above and below the title text. |
| `title-gap` | 0–200 | `40` | Space between the title and the chart. |

**Ingredient boxes**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `ingredient-shape` | rectangle \\| pill \\| hexagon | `rectangle` | Shape of an ingredient box. |
| `ingredient-fill` | a color | `#ffeca9` | Inside of the box. |
| `ingredient-stroke` | a color | `#0c7cba` | Outline. |
| `ingredient-stroke-width` | 0–12 | `2` | Outline width. |
| `ingredient-stroke-dash` | `none` or dash lengths | `none` | Outline dashes: `none`, or dash and gap lengths (`4 3`). |
| `ingredient-radius` | 0–60 | `6` | Corner radius (`rectangle`, `hexagon`). |
| `ingredient-point` | 0–100 | `16` | How far the ends of a `hexagon` box reach out. |
| `ingredient-text-color` | a color | `#333333` | Color of the ingredient text. |
| `ingredient-font-weight` | 100–900 | `700` | Weight of the ingredient text. |
| `ingredient-padding-x` | 0–100 | `10` | Space left and right of the text. |
| `ingredient-padding-y` | 0–100 | `12` | Space above and below the text. |
| `ingredient-min-height` | 16–300 | `52` | Smallest box height. |
| `ingredient-min-width` | 40–800 | `200` | Smallest box width. All boxes share one width. |
| `ingredient-wrap` | 8–80 | `26` | Characters per item line; a longer item wraps under the item column. |
| `ingredient-unit-width` | 0–12 | `7` | A unit longer than this (`teaspoon`, `tablespoons`) runs on into the item instead of widening the unit column. |
| `ingredient-text` | full \\| name | `full` | `full`: each line as written, notes and all (`611 g Water, 115°F, 52%`). `name`: quantity, unit and the ingredient's name only; everything from the first comma on is dropped (`611 g Water`). |
| `ingredient-align` | chart \\| box | `chart` | `chart`: quantities share one right edge down the whole chart. `box`: each box aligns its own. |

**Operation nodes**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `operation-shape` | hexagon \\| rectangle \\| pill | `hexagon` | Shape of an operation node. |
| `operation-fill` | a color | `#c1e4f7` | Inside of the node. |
| `operation-stroke` | a color | `#3aa6dd` | Outline. |
| `operation-stroke-width` | 0–12 | `2` | Outline width. |
| `operation-stroke-dash` | `none` or dash lengths | `none` | Outline dashes: `none`, or dash and gap lengths. |
| `operation-radius` | 0–60 | `5` | Corner radius (`hexagon`, `rectangle`). |
| `operation-point` | 0–100 | `36` | How far the ends of a `hexagon` reach out. |
| `operation-text-color` | a color | `#333333` | Color of the node text. |
| `prep-fill` | a color | `#ffffff` | Inside of a preparation step. |
| `prep-text-color` | a color | `#333333` | Color of a preparation step's text. |
| `prep-dash` | `none` or dash lengths | `5 4` | Dashes of a preparation step's outline. |
| `operation-font-weight` | 100–900 | `700` | Weight of the node text. |
| `operation-padding-x` | 0–100 | `24` | Space left and right of the text (beyond the shape's ends). |
| `operation-padding-y` | 0–100 | `14` | Space above and below the text. |
| `operation-min-height` | 16–300 | `64` | Smallest node height. |
| `operation-min-width` | 40–800 | `200` | Smallest node width. All nodes share one width. |

**Edges**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `edge-style` | orthogonal \\| curved | `orthogonal` | `orthogonal`: straight runs with rounded corners. `curved`: the same routes, each bend a wide curve. |
| `edge-stroke` | a color | `#333333` | Color of edges and arrowheads. |
| `edge-stroke-width` | 0.25–12 | `2.25` | Edge width. |
| `edge-radius` | 0–60 | `8` | Corner rounding of `orthogonal` edges; `0` gives square corners. |
| `join-edges` | bus \\| separate | `separate` | Edges joining one node, and edges leaving one node for different nodes: `bus` runs edges that join one node down one shared lane, merging before the node, and lets edges that leave one node share its point of exit (the alternatives of a Choose also share one lane out of the step before it). `separate` gives every edge its own lane, each joining edge its own point of entry on the node, and each leaving edge its own point of exit, running out at its own height. |
| `arrow-length` | 0–40 | `11` | Arrowhead length. |
| `arrow-width` | 0–40 | `9` | Arrowhead width. |
| `edge-label-at` | 0–1 | `0.5` | Where along a quantified reference's edge its amount is written, on an edge that joins neighboring boxes (see `edge-label-short`): `0` at the source, `1` at the arrowhead. The amount needs 5 units of room from every line, box, frame and text but its own edge: without it, it is tried on the other side of the line, then moves to the nearest place along the edge with room. |
| `edge-label-short` | 0–2000 | `300` | An edge up to this long joins neighboring boxes, and its amount is written where `edge-label-at` says. `0`: no edge does. |
| `edge-label-within` | 0–2000 | `72` | On a longer edge, the amount is written no farther than this from where the edge starts (or where `edge-label-at` says, if nearer), and before the edge leaves the frame it starts in when the amount fits there. `0`: no limit. |

**Layout**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `ingredient-side` | left \\| right | `left` | Which side the ingredient column is on. `right` mirrors the whole chart. |
| `row-gap` | 8–200 | `44` | Space between rows. |
| `column-gap` | 16–300 | `64` | Space between the ingredient column and the operations. |
| `channel-gap` | 16–300 | `56` | Space between the two operation columns, where joining edges run. |
| `lane-gap` | 4–60 | `14` | Space between edges running side by side. |
| `port-offset` | 0–200 | `36` | How far from the center an edge leaves or enters a node's top or bottom when the end is taken. |
| `turn-depth` | 8–100 | `24` | How far below the last row the spine turns into the third column. |
| `third-column` | auto \\| always \\| never | `auto` | Whether steps that take no new ingredients may sit in a third column beside the spine. `auto`: whichever prints larger on the screen or sheet the chart is fitted to. `always`: the third column, as the hand-made charts have it. `never`: every step on the spine. |
| `columns` | auto \\| 1 \\| 2 \\| 3 \\| 4 \\| 5 \\| 6 | `auto` | How many columns the chart is folded into, each read down, one after another across the page. `auto`: as many as print largest on the sheet; on the screen, one. A number: that many, or as many as the chart can be cut into. |
| `trailing-down-max` | 0–20 | `2` | Up to this many closing steps without ingredients run *down* the third column; more run back *up* it. |
| `branch-max-steps` | 0–20 | `1` | In a recipe made only of components, a side component with at most this many steps is drawn inline as a branch; a larger one gets a container. Beside top-level steps every component gets one. |
| `branch-gap` | 0–100 | `14` | Extra space around an inline branch. |
| `branch-caption` | 0–1 | `1` | `1` names an inline branch over its first row; `0` leaves it unnamed. |
| `caption-font-size` | 6–36 | `11` | Size of branch captions and Choose labels. |
| `caption-color` | a color | `#555555` | Color of branch captions. |
| `prep-label` | text, up to 32 characters | `Before you start` | Caption over the steps that join nothing (a preheat, a pan to line), drawn first in a row of their own. |

**Components**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `component-fill` | a color | `#fbfbfb` | Inside of a component container. |
| `component-stroke` | a color | `#333333` | Its outline, and its name pill's. |
| `component-stroke-width` | 0–12 | `2` | Outline width. |
| `component-radius` | 0–60 | `14` | Corner radius. |
| `component-padding-x` | 0–200 | `24` | Space inside, left and right. |
| `component-padding-top` | 20–200 | `44` | Space inside, above (the name sits on the top border). |
| `component-padding-bottom` | 0–200 | `30` | Space inside, below. |
| `component-gap` | 0–200 | `34` | Space between containers. |
| `component-title-font-size` | 6–48 | `15` | Size of a container's name. |
| `component-title-fill` | a color | `#ffffff` | Inside of the name pill. |
| `component-title-stroke-width` | 0–12 | `3` | Outline width of the name pill. |

**Choose and Checkpoint marks**

| Value | Type | Default | Effect |
|-------|------|---------|--------|
| `choose-label` | text, up to 24 characters | `Choose` | Word before a Choose group's name (the callout's own name by default). |
| `choose-stroke` | a color | `#333333` | Dashed outline and rules of a Choose group. |
| `choose-stroke-width` | 0–12 | `1.5` | Their width. |
| `choose-dash` | `none` or dash lengths | `6 5` | Their dashes. |
| `checkpoint-fill` | a color | `#ffffff` | Inside of the Checkpoint check mark. |
| `checkpoint-stroke` | a color | `#333333` | Circle and check mark. |
| `checkpoint-stroke-width` | 0–12 | `2` | Their width. |
| `checkpoint-radius` | 3–30 | `9` | Size of the mark. |
| `optional-label` | text, up to 24 characters | `optional` | Word that marks a component or step the recipe says may be left out, in parentheses and at the caption size: after a frame's or a branch's name, and under a step's text. |
<!-- chart-values:end -->

### Position options

- **`ingredient-side: right`** turns the whole chart over, left to right: ingredients on the
  right, the steps flowing right to left. Text is not mirrored, and the title stays put.
- **`title-position`** puts the title top center, top left, or leaves it out
  (`etna dag --no-title` leaves it out whatever the theme says).
- **The chart is fitted to a screen or a sheet.** The layout engine makes every layout the
  theme allows, with and without the third column (`third-column`) and, on a sheet, in one
  column or folded into up to six (`columns`), and takes the one that prints largest. A screen
  scrolls, so there the largest is the narrowest: one column, and every step on the spine when
  that is narrower. A sheet is letter with a half-inch margin unless the caller names another,
  turned whichever way up prints the chart larger (`auto`) or fixed; there print size counts up
  to body text of 12 pt and no further. Layouts within 2% of the largest are tied, and a tie
  goes to fewer columns, then to the third column. A value of `third-column` or `columns` other
  than `auto` pins the layout whatever the chart is fitted to. A folded chart reads like a
  newspaper: down each column, then across to the next. A fold never cuts a Choose group, a run in the third column
  or the row of preparation steps; a container cut by a fold takes whole columns and keeps one
  frame over them. `third-column: always` with `columns: 1` is the chart as it was before it was
  laid out for a sheet. A chart with `ingredient-side: right` folds only into two stacks of
  whole containers; `third-column: auto` may still put every step on the spine.

- **What the chart is fitted to** is not a theme value but the reader's: `screen` (the
  default), or a sheet, `auto` (whichever way up prints the chart larger), `portrait` or
  `landscape`. A PDF is always a sheet: a chart fitted to the screen prints on `auto`. In the
  GUI it is the chart toolbar's four Fit buttons (Screen, Page either way up, Portrait page,
  Landscape page) and Settings > Cards and printing > Flow chart > Fit to, both setting
  `chart.shape`; with a page chosen the chart on screen, and the saved SVG, are the chart that
  prints, and the GUI shows it on its sheet: the page in its own shape, whole in the window, the
  chart where the PDF puts it. When the chart's body text prints under 7 pt on that page
  (`SMALL_PRINT`, next to `FULL_SIZE` in `layout/fit.ts`) and the built-in `dense` prints the same
  chart more than 2% larger, a line under the page's caption says both sizes ("Text prints at
  5.8 pt on this page. The Dense style prints it at 8.3 pt.") with a Use Dense button, which
  sets the chart style as the Style menu does; any style but `dense` itself, a source's
  included, gets the line. `etna dag --shape screen|auto|portrait|landscape` is the same choice on the command
  line: without it an SVG is fitted to the screen and a PDF to `auto`; `--paper` and `--margin`
  give the rest of the sheet.

### Match the app

A theme with `palette: app` (`flow`, `dense`) follows the GUI's appearance: with Settings >
Cards and printing > Flow chart > Colors on "match the app" (the default), every color value
of the theme is replaced by one of the appearance's own color roles (palettes.css), light or
dark. Nothing brings in a hue the appearance does not show on its own surfaces: operations look
like the app's primary buttons, ingredients like its selected rows. The roles and their names
are described once in [docs/color-roles.md](../docs/color-roles.md).

| Chart values | App color |
|--------------|------------|
| `background` | `--ground` (white in a PDF) |
| `operation-fill`, `operation-stroke` | `--accent` |
| `operation-text-color` | `--on-accent` |
| `ingredient-fill` | `--accent-soft` |
| `ingredient-text-color`, `text-color`, `edge-stroke` (edges, arrowheads), `title-stroke`, `choose-stroke`, `checkpoint-stroke` | `--ink` |
| `ingredient-stroke`, `component-stroke` | `--rule` |
| `title-fill`, `component-fill`, `component-title-fill`, `checkpoint-fill` | `--paper` |
| `prep-fill`, `prep-text-color` | `--paper` and `--ink`: a preparation step sits on the paper in the ink, inside its dashed accent outline |
| `caption-color` | `--ink-soft` |

Where `--on-accent` does not reach 4.5:1 on `--accent` (no bundled appearance), operations
take `--accent-soft` with `--ink` text, still outlined in `--accent`, and ingredients the paper.
A missing `--accent-soft` is the paper blended 12% toward the accent; a missing `--rule` is
the hairline (`--hairline`) blended 40% toward the ink. Blends are straight sRGB mixes.

**A PDF is ink on paper.** Saving the SVG keeps the colors on screen. Saving the PDF draws the
chart in the light scheme of the same palette, whatever the screen shows, on a white page: the
background is `#ffffff`, not `--ground`. Slate dark on screen gives a Slate light PDF on white.
With a light appearance only the background differs from the screen.
`etna dag` has no app and always draws the theme's own colors, and a theme with
`palette: own` (`ink`, `station`, and any theme that does not say), or Colors on "Style's
own", ignores both. The mapping is `tools/src/dag/palette.ts`.

### Match the card

A card style states two **type roles**: the body font and the title font with the title's
weight (`options.fonts.body`, `options.fonts.title`, `options.fonts.title-weight`). A chart
theme with `fonts: card` (`flow`, `dense`, `ink`) takes them from a card style. Which one is
the Fonts choice (Settings > Cards and printing > Flow chart > Fonts, and the chart's Font
menu), stored as `chart.fonts`:

| Choice | `chart.fonts` | The chart's fonts |
|--------|---------------|-------------------|
| Match active card | `card` (the default) | the card style in use (Settings > Card > Style); changing the card style redraws the chart |
| Style's own (in the toolbar, Style) | `own` | the chart theme's own |
| A card style by name | its id, as `cards.theme` holds it (`builtin:folio`) | that card style's, whichever card style is in use |

Settings offers every recipe card style whose fonts a chart can draw (both stacks plain family
names, each first family cached with its widths); not the shopping list, which shares Mise's
fonts. The chart toolbar's Font menu shows what the chart is set in: "Style", then each card
style by name, the card style in use selected while the chart follows it. A stored id that names no such card style follows the card style in
use. A theme with `fonts: own` (`station`, and any theme that does not say) keeps its own fonts
whatever the choice, and the menu shows "Style", disabled: a theme limits font changes by saying
`fonts: own`, nothing else. `etna dag --card <name|dir>` names the card style on the command
line. The roles are described once in [docs/type-roles.md](../docs/type-roles.md).

| Chart values | From the card |
|--------------|---------------|
| `title-font-family`, `title-font-weight` | the title font and the title weight |
| `font-family` (ingredients, operations, captions, container names) | the body font |
| `text-measure`, `title-text-measure` | the generic family that ends each stack: `serif`, `mono` for `monospace`, otherwise `sans` (used only for a first family without metrics) |
| `ingredient-font-weight` | 400, regular, as a card sets its ingredients, moved to the nearest weight the body font is cached at |
| `font-weight`, `operation-font-weight` | the theme's own, each moved to the nearest weight the body font is cached at (400 or 700 for every bundled card) |
| `font-size`, `caption-font-size`, `component-title-font-size` | the theme's, times the **body factor**: the x-height of the theme's own `font-family` at its own `ingredient-font-weight`, over that of the card's body font at the ingredient weight; to two places |
| `title-font-size`, `subtitle-font-size` | the theme's, times the **title factor**: the same over the title fonts at the title weights; to two places |
| `char-width` | the body font's **nominal character**: its mean advance over the lowercase alphabet `a`–`z`, at the ingredient weight, to 0.001 em; for a family without metrics, the same over the `sans` or `serif` table, or 0.6 for a monospace |
| `title-wrap` | the theme's, times the title font's nominal character (at the title weight) over `char-width`, rounded, so a title line holds as many of the title font's characters as before |

Everything else — shapes, padding, minimum sizes, strokes, spacing, colors — stays the chart
theme's; a box grows or shrinks with the text measured in it. The sizes are scaled so the
card's lower-case letters stand as tall as the theme's own at the theme's sizes: Spectral's
x-height is 0.450 em and JetBrains Mono's 0.550, so `flow` in Folio sets 14 as 17.11. The
x-heights come from the fonts (OS/2 `sxHeight`, else the top of `x`), generated with the
widths by `etna fonts metrics`. A factor is 1 when either font has no metrics, or when the
theme's own font and the card's are the same family. The `*-wrap` values count characters;
`char-width` turns them into widths, and JetBrains Mono's 0.6 em is a monospace cell, too
wide for a proportional font. The nominal character keeps a count a count of that font's
characters. The bundled cards give (ingredients 400 and operations 700 in every case; `dense`
and `ink` are both Arimo, so they share their factors):

| Card | Body font | `char-width` | Title | Body factor: `flow` | `dense`, `ink` | Title factor: `flow` | `dense`, `ink` |
|------|-----------|--------------|-------|------|------|------|------|
| Binder | Jost | 0.466 | Quicksand 300 | 1.196 | 1.148 | 1.093 | 1.050 |
| Countertop | Merriweather | 0.559 | Merriweather 500 | 0.990 | 0.951 | 0.990 | 0.951 |
| Folio | Spectral | 0.502 | Spectral 400 | 1.222 | 1.174 | 1.222 | 1.174 |
| Galley | IBM Plex Sans Condensed | 0.457 | IBM Plex Sans Condensed 700 | 1.066 | 1.024 | 1.048 | 1.006 |
| Grid | Inter | 0.536 | Inter 700 | 1.008 | 0.968 | 1.008 | 0.968 |
| Mise, Shopping list | Figtree | 0.507 | Figtree 300 | 1.100 | 1.057 | 1.100 | 1.057 |

The SVG embeds the card's fonts (WOFF2) and the PDF embeds them (TrueType), as for a chart
theme's own; every face a matched `flow`, `dense` or `ink` draws is in the cache in both forms (a test
checks it). A saved SVG and a PDF use the fonts on screen. A card stack a chart theme could not
hold (anything but plain family names) leaves the chart in its own fonts. A theme with
`fonts: own`, Fonts on "Style's own", and `etna dag` without `--card` keep the theme's own
fonts. The mapping is
`tools/src/dag/card-type.ts`; the card side is `cardType` in `tools/src/card/render.ts`.

## What a chart theme cannot do, and why

- **Change what a node says.** Node text is the recipe's: the step heading, then the words
  its instruction marks (SPEC §5.3, §8; ADR 0021). A theme cannot reword, abbreviate,
  re-case or shorten it.
- **Move steps or reroute edges.** The layout is computed from the recipe so that every chart
  reads the same way. A theme sets spacing and a few switches (`trailing-down-max`,
  `branch-max-steps`, `third-column`, `columns`, `ingredient-side`), not positions.
- **Style one step or one ingredient differently.** Every operation looks alike, and every
  ingredient box. Highlighting belongs to the recipe, not the theme.
- **Write CSS or SVG.** No stylesheet, no markup, no gradients, filters or images: a theme
  loaded from anywhere must not be able to run anything, load anything, or break the drawing.
- **Bring font files.** A theme names its free font first in its stack; the files come from
  the font cache (`etna fonts`, Google Fonts), never from the theme, and the SVG and PDF embed
  them. No web-font links: the chart must render the same offline and in the browser.
- **Change arrowheads, edge labels or the Checkpoint check mark's shape.** They are fixed drawings;
  only their color and size are themeable.

## What a chart theme may not contain

Every value ends up in the SVG, inside a `<style>` block or an attribute. A value is refused —
reported as an error, and the default used instead — when it is not of its type, or when it
holds `<`, `>`, `&`, `\`, `{`, `}`, `;`, a backtick, a control character, a CSS comment,
`url(`, `expression(`, `@import`, or a `javascript:`, `vbscript:` or `data:` scheme. Quotes
are allowed only around a font name. The theme's `name` is letters, digits, spaces and
hyphens. The renderer checks every value again when it draws (`renderDag` throws on a bad
value given to it directly), strips those characters from anything it writes into the style
block, and escapes all text, the recipe's included.

## Chart themes in code

`tools/src/dag` is pure and browser-safe. A caller holding a theme folder's files — file name
to text, as the web build bundles them — uses:

```ts
parseDagTheme(files): { theme: DagTheme; problems: DagThemeProblem[] }   // never throws
checkDagTheme(files): { errors: string[]; warnings: string[]; theme: DagTheme | null }
renderDag(recipe, { theme, title?, fonts?, sheet? }): string             // the SVG; fonts: { mode, css }; sheet: { paper?, margin?, shape? }
chartFontFamilies(theme): string[]                                        // the families to embed
applyCardType(theme, cardType(cardTheme)): DagTheme                       // Match the card (card-type.ts)
renderDagPdf(recipe, { theme, title?, sheet?, fonts }): Promise<Uint8Array>   // dag/pdf.ts
dagThemeValues                                                           // the schema
```

The theme from `parseDagTheme` is always safe to render; a theme with errors does not look as
its author meant, and a caller showing third-party themes should refuse it, as the card side
does.

Chart-theme contract `etna-theme: 1` is this section. It is versioned apart from the card
contract.
