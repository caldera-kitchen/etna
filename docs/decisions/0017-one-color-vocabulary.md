# 0017 — One color vocabulary: a desk, paper and ink; palettes and styles

Status: Accepted

> Decided 2026-11-09 after a review of the app, card and chart theming against common design
> practice. The roles are stated in
> [`docs/color-roles.md`](../color-roles.md).

## Question

The app, the cards and the charts each stated color in their own way: fifteen role variables
in the app, literal black and gray in every card stylesheet (with five private hairline
variables), twenty literal values in every chart theme. All three were called a "theme". A
chart could take the app's colors, but that mapping first borrowed a highlight color and
printed a dark page from a dark appearance. Should the three share one vocabulary, and what
should the words be?

## Decision

- **One metaphor, one role list.** A desk with sheets of paper on it: `desk`, `paper`, `ink`,
  `ink-soft`, `hairline`, `rule`, `accent`, `on-accent`, `accent-soft`. A role name means a
  color in every layer. The app adds `ground`, `focus`, `mark` and three status colors.
- **Roles by job, as design systems do**, with Etna's own names. Material Design 3 is the
  orientation table in the roles page, not the scheme.
- **Cards and charts are sheets.** On screen a sheet may take the app's palette
  ("Match the app", the default for cards and for the chart styles that allow it). On paper it
  is always ink on paper: a card prints in its own colors, and a chart PDF is drawn in the
  palette's light colors on a white page.
- **Shape carries the node type; color carries emphasis.** A chart that matches the app uses
  one accent: operations solid, ingredients soft. No color is brought in that the palette
  does not show itself.
- **Three words.** *Palette*: the app's colors. *Style*: the look of a card, list or chart.
  *Theme*: the folder under `themes/` that holds a style, a developer's word.
- **Clean breaks.** Made before any release, with no aliases, migrations or contract bump.

## Consequences

- Card themes read four `--card-*` roles (`paper`, `desk`, `ink`, `ink-soft`) and hold no
  literal color but their own; chart themes keep their drawing words (`*-fill`, `*-stroke`),
  mapped from the roles.
- Cards draw their lines in ink: on paper a card's lines differ by weight, not color, so a
  card has no `hairline` or `rule` role. On a card shown in the app every card role maps to the
  app role of the same name.
- Settings follow the same split: a `cards` section and a `chart` section, each with its own
  `theme` and `palette`.
- Left as they are: the chart styles named Ink and Flow, and `--theme` on the command line.
- Type has the same treatment: [ADR 0018](0018-type-roles-and-match-the-card.md). A second accent,
  if charts ever want two hues, belongs in the palettes.
