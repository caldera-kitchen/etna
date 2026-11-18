# Color roles

> The decision record: [ADR 0017](decisions/0017-one-color-vocabulary.md).

Etna names its colors by role, and a role name means the same color in the app, on the cards
and on the flow charts. The picture behind the names is a **desk with sheets of paper on it**:
the paper lies on the desk, ink is written on the paper, thin hairlines and firmer rules are
ruled on it, and one accent color marks what can be acted on.

## The roles

Shared by the app, the cards and the charts:

| Role | What it is |
|------|------------|
| `desk` | What a sheet lies on: the surface around a card or a chart page. |
| `paper` | The sheet: panels, boxes, the card page. |
| `ink` | Text and lines drawn at full strength. |
| `ink-soft` | Secondary text: notes, captions, hints. |
| `hairline` | Thin dividers between rows and sections. |
| `rule` | Firmer lines: the outlines of fields, buttons and boxes (3:1 or more against what is behind them). |
| `accent` | The one color that marks what can be acted on: primary buttons, links, the selection bar. |
| `on-accent` | Text and marks drawn on the accent. |
| `accent-soft` | A pale accent: the selected row, a highlighted box. |

The app only:

| Role | What it is |
|------|------------|
| `ground` | The ground of the app's own window, and the fill of inset controls; on screen, also a "Match the app" chart's background. |
| `focus` | The keyboard focus ring. |
| `mark` | The search highlight. |
| `error`, `warning`, `ok` | Problems found, cautions, and "no problems found". |

The app sets every role as a CSS variable (`--ground`, `--paper`, `--ink-soft`, …) in
`tools/src/web/palettes.css`, once for each palette in light and in dark; `tools/src/web/app.css`
holds the Plain defaults.

### Orientation: Material Design 3

Only for orientation; Etna does not follow Material's scheme, and the match is approximate.

| Etna | Nearest Material 3 role |
|------|-------------------------|
| `desk` | `surface-dim` |
| `paper` | `surface-container-low` |
| `ground` | `surface` |
| `ink` | `on-surface` |
| `ink-soft` | `on-surface-variant` |
| `hairline` | `outline-variant` |
| `rule` | `outline` |
| `accent` | `primary` |
| `on-accent` | `on-primary` |
| `accent-soft` | `primary-container` (Etna writes `ink` on it, not a separate on-color) |
| `focus` | none; Material draws focus with `primary` |
| `mark` | none; nearest `tertiary-container` |
| `error` | `error` |
| `warning`, `ok` | none; custom colors in Material's terms |

## Charts

A chart theme that says `palette: app` (`flow`, `dense`) takes its colors from the roles, with
Settings > Cards and printing > Flow chart > Colors on "match the app" (the default):

| Chart values | Role |
|--------------|------|
| `background` | `ground` (white in a PDF) |
| `operation-fill`, `operation-stroke` | `accent` |
| `operation-text-color` | `on-accent` |
| `ingredient-fill` | `accent-soft` |
| `ingredient-text-color`, `text-color`, `edge-stroke`, `title-stroke`, `choose-stroke`, `checkpoint-stroke` | `ink` |
| `ingredient-stroke`, `component-stroke` | `rule` |
| `title-fill`, `component-fill`, `component-title-fill`, `checkpoint-fill`, `prep-fill` | `paper` |
| `prep-text-color` | `ink` |
| `caption-color` | `ink-soft` |

The fallbacks, and how a missing role is blended: [Match the app](../themes/README.md#match-the-app).
The mapping is `tools/src/dag/palette.ts`.

**A PDF is ink on paper.** The chart on screen, and a saved SVG, use the appearance as shown,
light or dark. A chart saved as PDF always uses the **light** scheme of the same palette, on a
plain white page: its background is `#ffffff`, not `ground`. Slate dark on screen gives a PDF in
Slate light's colors on white. A theme with `palette: own`, Colors on "Style's own", and
`etna dag` on the command line are unaffected.

## Cards

Cards use four of the shared roles, with a `--card-` prefix: `--card-paper`, `--card-ink`,
`--card-ink-soft` and `--card-desk`, each meaning the role of the same name on the card. A
card's lines are its ink: on paper a thin line and a heavy one differ by weight, not color, so
cards have no `hairline` or `rule`. The defaults are black on white, so a card prints as it
always has; a role is a color, and each theme keeps its own line widths. Details are in the card part
of the theme guide: [Custom properties](../themes/README.md#custom-properties).

**On screen a card may take the app's palette; on paper it is always its own.**
With Settings > Cards and printing > Card > Colors on "match the app" (the default), a card and
the shopping list in the app take `paper`, `ink`, `ink-soft` and `desk` from the app's roles of
the same name, so their lines are drawn in the app's `ink`. Printing, a saved PDF and
`etna card` are untouched. The mapping is `tools/src/web/card-palette.ts`.

## Glossary

- **Appearance**: how Etna itself looks on screen: a palette, light or dark, and corners. Kept
  in this browser.
- **Palette**: the app's set of colors (Plain, Slate, Linen, Pistachio, Catppuccin, Nord,
  Solarized), each in a light and a dark form. Stored as `appearance.palette`.
- **Scheme**: light or dark, or "Match this device" to follow the computer or phone.
- **Corners**: how rounded the app's buttons, fields and panels are: Square, Soft or Round.
  Printing is not affected.
- **Role**: a named color in a palette (`ground`, `desk`, `paper`, `ink`, `accent`…; the
  tables above), drawn with by the app and by "Match the app" chart styles.
- **Ground**: the app window's own background. A chart drawn to match the app has it as its
  background on screen, never in a PDF.
- **Desk**: the surface a sheet lies on: behind the card page in the app, and around a chart page.
- **Style**: the look of a printed card, shopping list or flow chart: its layout, type, shapes
  and its own colors. Chosen under Cards and printing or in the toolbar.
- **Theme**: the folder under `themes/` that holds a style: `theme.yaml` and its stylesheet or
  chart values. A developer's word; `etna theme check` checks one.
- **Paper**: the size of sheet a card or chart prints on (Letter, A4, index card…). As a role,
  `paper` is the color of a sheet on the desk.
- **Sheet**: one printed page of paper. A card is shown and printed as sheets. A chart fitted
  to a sheet is fitted to its paper, its page margin and its shape; the app's buttons and
  menus say "page" for it (Portrait page).
- **Fit**: what a chart is laid out for, a screen or a sheet (ADR 0020; `chart.shape`, `etna
  dag --shape`). A card's fit is something else: its text made smaller to save a page
  (`etna card --fit`).
- **Screen**: a chart fitted to the screen is one column, as large as the width allows; a
  screen scrolls.
- **Shape**: which way up a sheet is: `auto` (whichever prints the chart larger), `portrait` or
  `landscape`; `screen` is the fourth value of the same setting.
- **Match the app**: a chart style that allows it (`palette: app`) is drawn in the app's palette
  instead of its own colors: on screen and in a saved SVG in the colors shown, light or dark;
  in a PDF in the palette's light colors on a white page. A card and the shopping list match
  the app on screen only; on paper they are always their own.
- **Match the card**: a chart style that allows it (`fonts: card`) is set in a card style's
  fonts: its title in the card's title font and weight, the rest in the card's body font. The
  Font choice is "Match active card" (the card style in use, shown selected in the chart
  toolbar), "Style's own" (in the toolbar, "Style"), or a card style by name. Every text size
  is scaled so the card's fonts stand as tall in lower case as the chart's own (x-height, ADR
  0018); shapes, spacing and colors stay the chart's. See [Type roles](type-roles.md).
