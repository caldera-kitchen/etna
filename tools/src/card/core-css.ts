// The core stylesheet: what every card theme needs and none of the look.
//
// The renderer emits it on every card, after its own custom properties and before the
// theme's stylesheet, so a theme overrides any of it with a rule of the same selector. It is a
// TypeScript string rather than a .css file so that it reaches the browser bundle and Node by
// the same import, with no build step and no file to fetch.
//
// Rules of thumb for what goes here: mechanics (table columns, page breaks, list resets, the
// on-screen sheet), never a choice of weight, size, rule or spacing that a theme would want
// to make. Every bundled theme printed exactly these values before they moved here. The
// selectors are deliberately low-specificity so a theme's own rule always wins.

/**
 * The card's color roles and their defaults, which the renderer writes on `:root` with its other
 * custom properties. Four of the app's roles (`--paper`, `--ink`, …), with the card's prefix:
 * a role names a color, never a line or a width. The core stylesheet and every bundled theme
 * read these instead of writing colors of their own, so a card prints black on white unless a
 * theme (or a page that embeds the card) sets them.
 */
export const CARD_COLOR_ROLES = {
  /** The sheet. */
  '--card-paper': '#fff',
  /** Behind the sheet, on screen only. */
  '--card-desk': '#e8e8e4',
  /** Text and every line: on paper a card's lines are ink, and differ by weight, not color. */
  '--card-ink': '#000',
  /** Secondary text. */
  '--card-ink-soft': '#444',
} as const;

export const CORE_CSS = `/* ---- etna card core (renderer-owned; a theme's stylesheet follows) ---- */

/* The card's text size is also the root size, so a theme sizes its spacing in rem (and em) and
   all of it follows the size the paging script chooses. */
:root { font-size: var(--card-font-size); }

.card {
  font-family: var(--card-font-body);
  font-size: var(--card-font-size);
  color: var(--card-ink);
}

@media print {
  body.card-page { margin: 0; }
}

/* The card as one flow: what a reader without scripts gets, and what the paging script cuts into
   pages. On screen it is drawn as one sheet of paper, its padding the page margins. */
.card-flow { container: card-page / inline-size; }
@media screen {
  body.card-page { margin: 0; padding: 24px 0; background: var(--card-desk); }
  .card-flow {
    box-sizing: border-box;
    width: var(--card-page-width);
    min-height: var(--card-page-height);
    margin: 0 auto;
    padding: var(--card-sheet-margin, 0.5in);
    background: var(--card-paper);
  }
}

/* Page boxes, written by the paging script: one .sheet per page, the paper's size; its padding
   the page margins; .sheet-box the area inside them (a frame or rule goes here); .sheet-content
   what the card fills. */
/* Centered while the window is wider than a page; scrollable from the left edge when it is not. */
.card-sheets { display: flex; flex-direction: column; align-items: flex-start; gap: 24px; }
@media screen { .sheet { margin: 0 auto; } }
[data-paged="working"] .card-sheets { visibility: hidden; position: absolute; top: 0; left: 0; }
.sheet {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: var(--card-page-width);
  height: var(--card-page-height);
  padding: var(--card-sheet-margin);
  overflow: hidden;
  background: var(--card-paper);
  color: var(--card-ink);
  font-family: var(--card-font-body);
}
.sheet-box { box-sizing: border-box; flex: 1; min-height: 0; display: flex; flex-direction: column; }
.sheet-content { flex: 1; min-height: 0; position: relative; container: card-page / inline-size; }
@media screen {
  .sheet { box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); }
}
@media print {
  body.card-page[data-paged="done"] { padding: 0; }
  .card-sheets { display: block; }
  .sheet { break-after: page; box-shadow: none; }
  .sheet:last-child { break-after: auto; }
}

.intro p { margin: 0 0 0.5em; }

/* Ingredients: quantity, unit and item in three columns that line up. */
.ingr-table { border-collapse: collapse; }
.ingr-table th,
.ingr-table td {
  text-align: left;
  vertical-align: baseline;
  font-weight: normal;
}
.ingr-group { break-inside: avoid; }
.ingr-table .ingr-qty { text-align: right; white-space: nowrap; }
.ingr-table .ingr-unit { white-space: nowrap; }
/* A use remark in place of an amount starts where the quantities start and runs across the unit
   column. It is taken out of flow so it never widens the quantity column, which the steps' tables
   share through --ingr-qty-width; the no-break space keeps the row's height. */
.ingr-table .ingr-use { text-align: left; }
.ingr-table .ingr-use-text { position: absolute; white-space: nowrap; }
.ingr-ref { color: inherit; text-decoration: none; }
.ingr-ref-pointer { font-style: italic; }
.ingr-extra { margin: 8pt 0 0; }

/* Directions. */
.direction-list { list-style: none; margin: 0; padding: 0; }
.direction { break-inside: avoid; }
/* The only step of a run (a part with one step): no lone "1". A theme may show it again. */
.direction-alone > .direction-number { display: none; }
.direction-text { margin: 0; }
.direction-text + .direction-text,
.direction-body > * + * { margin-top: var(--card-paragraph-gap, 0.5em); }

.callout { break-inside: avoid; }
.callout p { margin: 0; }
.callout p + p { margin-top: 0.4em; }
/* A callout's label is the author's own word (SPEC §5.1): a long one wraps rather than overflow. */
.callout-label { overflow-wrap: anywhere; }

/* Markdown inside prose. */
.md-list { margin: 0.3em 0 0; padding-left: 1.3em; }
.md-quote { margin: 0.3em 0 0 1em; }
.md-code { white-space: pre-wrap; }
.card a { color: inherit; }

/* Parts: a part title stays with the part's first step. Paired, a part's ingredients may run
   on to the next page beside its steps, row by row, rather than leave the steps alone. */
.part-title { break-after: avoid; }
/* A top-level step after a component (hoisted): its title is the step heading, set as the
   theme sets a step label, at text size and without the run-in punctuation. */
.part-title.part-step-title { font-size: inherit; font-weight: inherit; line-height: inherit; }
.part-step-title .direction-label::after { content: none; }
.part-ingredients .ingr-group { break-inside: auto; }
.part-ingredients .ingr { break-inside: avoid; }

/* Components and steps. */
.component-title { break-after: avoid; }
.components > .component:first-child { margin-top: 0; }
.step { break-inside: avoid; }
.step-number { display: none; }
.step-echo > .step-body { display: none; }
.choose-label,
.branch-label,
.section-title { break-after: avoid; }

/* Notes. */
.note { break-inside: avoid; }
.note p { margin: 0; }
.note p + p { margin-top: 0.4em; }

/* The list layout: a checkbox column, an item's amounts in several units stacked, and rows
   (not the whole list) kept whole across pages. */
.list-table .ingr-group { break-inside: auto; }
.list-item { break-inside: avoid; }
.list-box {
  display: inline-block;
  box-sizing: border-box;
  width: 0.8em;
  height: 0.8em;
  border: 1px solid currentColor;
}
.list-amount { display: block; }
.list-uses { display: block; font-size: 0.85em; }

/* ---- end of core ---- */
`;
