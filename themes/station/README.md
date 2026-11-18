# Station — black hairlines and a light title

A flow chart drawn in the manner of the [Mise](../mise/) card: black lines, no color, and
Mise's header, a light title flush left over a rule. It keeps its own font, Nunito Sans, whatever
card style is in use (`fonts: own`); Mise itself is set in Figtree. For a chart in the card's
own fonts, use `flow`, `dense` or `ink`, which say `fonts: card`. In the GUI the chart's
Font menu shows "Style" for Station, disabled. What Station is:

- **Nunito Sans**, a free font the chart carries with it (Avenir Next and then Helvetica
  Neue are the fallbacks), measured by its own widths. Ingredients in medium weight,
  operations demi-bold, like Mise's items and step titles.
- **The title** set light (weight 300) and flush left, over a rule across the chart — Mise's
  header.
- **Black hairlines**, no color: square ingredient boxes with a 0.75-unit outline, operations
  as pills on a faint warm gray, containers as plain rectangles.
- **Rounded edges**: the same routes as `flow`, each corner turned on a 16-unit radius,
  twice `flow`'s. (Not `curved`: on a long run a curved bend grows into a swoop that cuts
  across the lanes beside it.)

```sh
etna dag cookbook/frosty-chocolate --theme station --out frosty.svg
```

Nunito Sans is embedded in the SVG and the PDF from the font cache (`etna fonts`), so the chart
looks the same on every machine. With `font-embedding: none` the SVG uses what the machine
has: Avenir Next, then Helvetica Neue, Helvetica or Arial. The layout measures Nunito Sans's
own widths; the fallbacks set a few percent wider (Avenir Next up to about 6%),
so without the embedded font a long line can reach the edge of its box.

It states only the values it changes from `flow`. All values: [`../README.md`](../README.md#chart-themes).
