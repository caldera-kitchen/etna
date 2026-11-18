# 0020 — A chart is fitted to a screen or a sheet, and takes the layout that prints largest

Status: Accepted

> Decided 2026-11-11, on side-by-side alternatives.

## Question

A chart had one layout, whatever it was shown or printed on. A long recipe became a tall strip
that printed small, and the only other arrangement was a second way of reading
(`direction: right`). What should decide a chart's arrangement, and what may the engine change
to make it fit?

## Decision

1. **The purpose is the choice.** A chart is fitted to a **screen** or to a **sheet**.
   - A screen scrolls. There the largest chart is the narrowest: one column, every step on
     the spine, as large as the width allows.
   - A sheet is paper, a margin, and a shape: `auto` (whichever way up prints the chart
     larger), `portrait` or `landscape`. There the chart must fit whole.
   - The defaults follow the output: what the app shows, a saved SVG and `etna dag` are
     fitted to the screen; a PDF is always a sheet (`auto` unless a shape is chosen). Choosing
     a sheet in the app shows the print layout on screen.
2. **One number decides: the print scale.** A chart is scaled as a whole, text included: into
   the sheet's printable box, or into a screen's width. The engine lays the chart out in every
   way the style allows, each in full, and takes the one with the largest scale. Nothing is
   estimated.
3. **What the engine may change** (the candidates):
   - **The third column.** Steps that take no new ingredients may sit beside the spine, as
     the hand-made charts have them, or every step may stand on the spine. The first is wider
     and shorter, the second narrower and taller.
   - **Columns**, on a sheet. In one column a chart is a strip. It may be cut into up to six
     columns that each read top to bottom and follow one another left to right, as a
     newspaper's do. That is the only way a chart is ever rearranged, so there is one rule for
     reading every chart.
4. **What it may never change** (the rules; `src/dag/check.ts` checks the geometry of every
   chart in the test suite):
   - no two boxes overlap, and everything is on the canvas;
   - an ingredient box stands beside its own step;
   - a container is one rectangle around its own steps and no others;
   - an edge passes through no box, no name, and **no container it neither starts nor ends
     in**;
   - steps read down each column, and columns in order across, exactly as the one-column
     chart reads;
   - a cut never falls inside a Choose group, a run of the third column, or the preparation
     row; a container that is cut takes whole columns to itself and keeps one frame;
   - one scale for the whole chart; the same input always gives the same bytes.
5. **Ties.** Two layouts whose print sizes are within 2% of each other are tied (`TIE`, in
   `src/dag/layout/fit.ts`). A tie goes to fewer columns, then to the third column. So a chart
   does not change its arrangement for one percent, and the order of preference is fixed, not
   computed.
6. **Full size.** On a sheet, print scale counts up to body text of 12 pt (`FULL_SIZE`) and no
   further: a chart that already prints at full size is not rearranged to print larger still.
   A screen has no full size.
7. **The cuts are chosen exactly** (`src/dag/layout/columns.ts`): for a number of columns, the
   cuts that make the tallest column shortest, and among those within 4% of it the ones that
   break the fewest edges. A cut where only the spine crosses is the cheapest there is.
8. **Where a fold cuts the spine**, the spine leaves the foot of one column, climbs the gutter
   and comes in through the top of the next column's first node. An edge to a column beyond
   the next, or back to an earlier one, goes over the top, in a band above the columns.
   **A column shorter than the tallest slides down** in the room it has to spare, as far as it
   takes for the edges into it from the column before to run level or down: the parts on the
   left, what they go into lower on the right. A column that continues a cut snake or
   container stays at the top, where the reader looks for it.
9. **A style may pin what it cares about**: `third-column: auto | always | never` and
   `columns: auto | 1…6`. They replace `component-columns` and `page-ratio`; a chart style no
   longer holds a copy of the page.
10. **Charts across the page are gone** (`direction: right`, `--direction`,
    `chart.direction`). It was a second way of reading; fitted to a landscape
    sheet a chart now prints larger in all but a few cases, and reads the one way.

## Why this and not the alternatives

- **Why print scale.** It is what the reader gets, it is one number, and both published
  methods for this problem use it (Rüegg and von Hanxleden, "Wrapping Layered Graphs", 2018;
  the Kiel work on order-preserving rectangle packing, 2021).
- **Why a screen is its own purpose.** Side by side, the larger, narrower chart is the better
  one for a web page and the fitted one for paper: the same chart serves two purposes, and
  the purpose is known from the output.
- **Why newspaper columns, and not frames packed in rows, or a serpentine.** A simulator
  searched a wider space (folds inside each frame, frames in rows or columns, a
  serpentine). The engine as built reproduces its gains with one reading rule instead of
  three. A serpentine prints within 0.3% of plain columns and makes every other column read
  upward, which the reading studies the literature report found count against.
- **Why exact.** The order of a recipe is given and its graph is chains that merge, so cutting
  it is the linear partition problem: solved exactly in well under a millisecond. All the
  candidate layouts of a chart take about a third of a millisecond together.
- **Why a tie window and not a price on each departure.** Charging a fold and a spine-only
  chart a share of print size before taking them refused charts that, side by side, were
  preferred every time (one folded at 7.9 pt body text against 7.1 unfolded, another in two
  columns). So the larger layout wins, and the window only stops a chart flipping for
  nothing.

## What it does to a collection

Measured on the 489 structured recipes of one cook's collection of home recipes, on Letter,
against the charts as they printed before:

| Style | Fitted to | Median body text | Mean gain | Charts that change | Every step on the spine | Folded |
|---|---|---|--:|--:|--:|--:|
| Flow | portrait | 8.5 → 10.4 pt | ×1.14 | 234 | 232 | 4 |
| Flow | landscape | 9.1 → 9.2 pt | ×1.07 | 182 | 137 | 159 |
| Flow | auto | 10.2 → 10.5 pt | ×1.04 | 182 | 172 | 31 |
| Dense | portrait | 10.7 → 13.5 pt | ×1.18 | 281 | 280 | 1 |
| Dense | landscape | 13.3 → 13.3 pt | ×1.02 | 55 | 44 | 55 |
| Dense | auto | 13.6 → 13.7 pt | ×1.03 | 103 | 100 | 8 |

On a screen, 346 of the 489 charts stand on the spine where they had a third column.

By the geometry rules of the decision, no chart has a flaw: none in 19,560 charts over every
pinned layout and mirrored, in all four styles, where 65 Flow and 74 Dense charts had one at
the default before. Charts under 6 pt in Flow on a sheet: 14 → 7.

Three further rules (two edges along one line, an edge along a frame's side, an edge close by
a box) find 46 flaws in the same 19,560 charts, none on a screen at a style's own settings:
fitted to a page, two recipes run two edges along one line, and the rest are in pinned folds.
None was fixed, because each needs a choice of route.

Pinned to one column with the third column, about five in six of the corpus layouts are byte
for byte what the old engine drew. The rest differ by changes made on purpose:

- **An edge no longer runs through a container it does not belong to** (67 recipes). It used
  to run down the channel straight through a container standing between its source and its
  target, and now goes round in the gutter, which makes the chart 14 to 42 units wider. About
  twenty charts therefore print 1 to 4% **smaller** than before with no change of arrangement.
- **Edges that enter one row through the top each run at their own height**, where they used
  to share a line when the row had no room for more.
- **The flaws the geometry check found are fixed**: an amount on an edge moves along its
  edge to a clear spot; a long branch name stands over the empty ingredient column instead of
  running through an edge; a mirrored chart's container name moves clear of the edges that
  enter there; a hop is exactly level; and the lanes of a gutter are reordered where the
  drawn chart then crosses fewer edges. Only charts that had the flaw moved.

## Limits

- **Mirrored charts (`ingredient-side: right`) fold only as they always could**: their
  containers in two stacks, cut between two of them. They may also drop the third column.
- **No reader has been tested on a folded chart.**
- **A floor for type size.** About 35 Flow charts stay under 7 pt on Letter whatever is done;
  the Dense style brings all of them above it. Since 2026-11-12 the app says so under a chart
  fitted to a page whose text prints under 7 pt (`SMALL_PRINT`) and offers Dense when Dense
  prints it larger; a second page is not built.
- **Spacing is the larger lever**: Dense prints a third larger than Flow at the median, more
  than any arrangement. The engine does not change spacing to fit a sheet.
- **A screen is taken to scroll.** Fitting a chart to the window it is shown in (a wide
  window could keep the third column at full size) is not built.
