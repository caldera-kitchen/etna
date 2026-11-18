// Measuring: everything about a chart that is worked out once and does not depend on where
// anything is placed. Node texts and heights, ingredient tables, the shared widths, the
// title, the components' names, and the theme numbers the stages share.

import type { Component, Graph, Node as RecipeNode, Recipe } from '../../core/index.ts';
import { allSteps } from '../../core/graph.ts';
import { nodeName } from '../../core/qualifier.ts';
import { nodeText, tableRows, titleParts, wrapText, type IngredientTextMode } from '../text.ts';
import type { Measure } from '../measure.ts';
import type { ThemeReader } from '../theme.ts';
import { cornerInset, sideInset } from './shapes.ts';
import type { Sizes, StepSize, Table, TitleSize } from './types.ts';

/**
 * Measure a chart: reads the recipe, its graph and the theme; returns a `Sizes` that the
 * placing stages only read.
 */
export function measure(recipe: Recipe, graph: Graph, t: ThemeReader, options: { title?: boolean }): Sizes {
  const ingredientMeasure = t.measure(t.num('ingredient-font-weight'));
  const operationMeasure = t.measure(t.num('operation-font-weight'));
  const ingredientShape = t.str('ingredient-shape');
  const operationShape = t.str('operation-shape');
  const fontSize = t.num('font-size');
  const cw = fontSize * t.num('char-width');
  const lineHeight = fontSize * t.num('line-height');
  const point = t.num('operation-point');
  const operationRadius = t.num('operation-radius');
  const channelGap = t.num('channel-gap');

  const captionSize = t.num('caption-font-size');
  const mark = `(${t.str('optional-label')})`;
  // A step designated optional carries the mark under its text, a line at the caption size.
  const markLine = captionSize * t.num('line-height');

  const steps = new Map<string, StepSize>();
  for (const gs of graph.steps) {
    const lines = nodeText(gs.step, operationMeasure);
    const rows = tableRows(gs.step.ingredients, t.num('ingredient-unit-width'), t.str('ingredient-text') as IngredientTextMode);
    const marked = gs.step.optional;
    steps.set(gs.id, {
      id: gs.id,
      step: gs.step,
      lines,
      height: Math.max(t.num('operation-min-height'), lines.length * lineHeight + (marked ? markLine : 0) + 2 * t.num('operation-padding-y')),
      table: rows.length > 0 ? ({ rows } as Table) : null,
      // Only the keyword, exactly: `checkpoint` is an aside (SPEC §5.1), which a chart leaves out.
      checkpoints: gs.step.callouts.filter((c) => c.keyword === 'Checkpoint').map((c) => c.text),
      mark: marked ? mark : null,
    });
  }

  const tables = [...steps.values()].flatMap((o) => (o.table ? [o.table] : []));
  const space = measureTables(tables, t, ingredientMeasure, lineHeight);
  const hasTables = tables.length > 0;
  // A shape that closes in at the top and bottom (a pill, a hexagon) pushes the text in by
  // what it takes at the outermost line of the tallest box; all boxes keep one text column.
  const tableInset = Math.max(
    0,
    ...tables.map((tb) =>
      sideInset(
        ingredientShape,
        tb.height,
        t.num('ingredient-point'),
        t.num('ingredient-radius'),
        ((tb.lineCount - 1) / 2) * lineHeight + fontSize * 0.45,
      ),
    ),
  );
  const tableWidth = hasTables
    ? Math.max(t.num('ingredient-min-width'), Math.max(...tables.map((tb) => tb.widthChars)) * cw + 2 * t.num('ingredient-padding-x') + 2 * tableInset)
    : 0;

  // Operation nodes share one width: the widest text, allowing for the shape's ends (a
  // hexagon's slant, a pill's round).
  let opWidth = t.num('operation-min-width');
  for (const op of steps.values()) {
    const n = op.lines.length;
    op.lines.forEach((line, i) => {
      const reach = Math.abs((i - (n - 1) / 2) * lineHeight) + fontSize * 0.45;
      const slant = 2 * sideInset(operationShape, op.height, point, operationRadius, reach);
      opWidth = Math.max(opWidth, operationMeasure(line) * cw + 2 * t.num('operation-padding-x') + slant);
    });
    if (op.mark) opWidth = Math.max(opWidth, operationMeasure(op.mark) * captionSize * t.num('char-width') + 2 * t.num('operation-padding-x') + 2 * point);
  }
  opWidth = Math.ceil(opWidth);
  // An edge that enters or leaves through a node's top or bottom off the center must still
  // meet the flat part of the outline.
  const flatHalf = Math.min(
    ...[...steps.values()].map((op) => opWidth / 2 - cornerInset(operationShape, opWidth, op.height, point, operationRadius)),
  );
  const portOffset = Math.max(0, Math.min(t.num('port-offset'), flatHalf - 6));

  return {
    recipe,
    graph,
    t,
    steps,
    labels: componentLabels(recipe, graph),
    mark,
    title: measureTitle(recipe, t, options),
    mirrored: t.str('ingredient-side') === 'right',
    titleLeft: t.str('title-position') === 'left',
    separate: t.str('join-edges') === 'separate',
    showCaptions: t.num('branch-caption') > 0,
    ingredientShape,
    operationShape,
    ingredientMeasure,
    operationMeasure,
    fontSize,
    cw,
    lineHeight,
    margin: t.num('margin'),
    rowGap: t.num('row-gap'),
    columnGap: t.num('column-gap'),
    channelGap,
    laneGap: t.num('lane-gap'),
    lanePad: channelGap / 2,
    turnDepth: t.num('turn-depth'),
    point,
    operationRadius,
    captionSize,
    branchGap: t.num('branch-gap'),
    titleGap: t.num('title-gap'),
    componentGap: t.num('component-gap'),
    thirdColumn: t.str('third-column'),
    columns: t.str('columns') === 'auto' ? 0 : Number(t.str('columns')),
    arrowRun: t.num('arrow-length') * 0.7 + 4,
    space,
    hasTables,
    tableInset,
    tableWidth,
    opWidth,
    flatHalf,
    portOffset,
  };
}

/**
 * Ingredient tables: fills every field of each table but `rows`, and each row's
 * `item`. Returns the gap between columns, in cells.
 */
function measureTables(tables: Table[], t: ThemeReader, m: Measure, lineHeight: number): number {
  // Ingredient tables. Quantities share one right edge across the chart (so every unit lines
  // up); the unit column is as wide as the box's own widest unit. Every box has the same
  // room for text: a line that starts further left (no quantity, or a long unit run into the
  // item) may run that much longer before it wraps.
  // Widths are in cells (measure.ts): characters, with `mono`.
  // The gap between columns: a space, but never less than 0.4 em (a proportional space is
  // narrow, and the quantity would crowd its unit).
  const space = Math.max(m(' '), 0.4 / t.num('char-width'));
  const allRows = tables.flatMap((tb) => tb.rows);
  const chartQuantity = Math.max(0, ...allRows.map((r) => m(r.quantity)));
  const chartUnit = Math.max(0, ...allRows.map((r) => m(r.unit)));
  const lineChars = (chartQuantity ? chartQuantity + space : 0) + (chartUnit ? chartUnit + space : 0) + t.num('ingredient-wrap');
  const alignChart = t.str('ingredient-align') !== 'box';
  // The box's text, as plain lines (for `LayoutBox.lines`), is padded in characters.
  const chartQuantityLength = Math.max(0, ...allRows.map((r) => r.quantity.length));
  for (const tb of tables) {
    const own = Math.max(0, ...tb.rows.map((r) => m(r.quantity)));
    tb.quantityChars = own === 0 ? 0 : alignChart ? chartQuantity : own;
    tb.unitChars = Math.max(0, ...tb.rows.map((r) => m(r.unit)));
    const unitColumn = tb.quantityChars ? tb.quantityChars + space : 0;
    tb.itemColumn = unitColumn + (tb.unitChars ? tb.unitChars + space : 0);
    for (const r of tb.rows) {
      // Wrap the first line to the room it has, and the rest to the item column's.
      const first = wrapText(r.text, lineChars - (r.inline ? unitColumn : tb.itemColumn), false, m);
      r.item = first.length > 1 ? [first[0], ...wrapText(first.slice(1).join(' '), lineChars - tb.itemColumn, false, m)] : first;
    }
    const ownLength = Math.max(0, ...tb.rows.map((r) => r.quantity.length));
    const quantityLength = ownLength === 0 ? 0 : alignChart ? chartQuantityLength : ownLength;
    const unitLength = Math.max(0, ...tb.rows.map((r) => r.unit.length));
    const itemLength = (quantityLength ? quantityLength + 1 : 0) + (unitLength ? unitLength + 1 : 0);
    tb.lines = tb.rows.flatMap((r) =>
      r.item.map((text, i) =>
        (i === 0
          ? (quantityLength ? r.quantity.padStart(quantityLength) + ' ' : '') +
            (unitLength && !r.inline ? r.unit.padEnd(unitLength) + ' ' : '') +
            text
          : ' '.repeat(itemLength) + text
        ).trimEnd(),
      ),
    );
    tb.lineCount = tb.lines.length;
    tb.widthChars = Math.max(
      ...tb.rows.flatMap((r) =>
        r.item.map((text, i) =>
          i === 0 ? unitColumn + (tb.unitChars && !r.inline ? tb.unitChars + space : 0) + m(text) : tb.itemColumn + m(text),
        ),
      ),
    );
    tb.height = Math.max(t.num('ingredient-min-height'), tb.lineCount * lineHeight + 2 * t.num('ingredient-padding-y'));
  }
  return space;
}

/** The title pill: its lines and size, or null when there is no title. */
function measureTitle(recipe: Recipe, t: ThemeReader, options: { title?: boolean }): TitleSize | null {
  const titleFont = t.num('title-font-size');
  const subtitleFont = t.num('subtitle-font-size');
  if (!(options.title !== false && recipe.title && t.str('title-position') !== 'none')) return null;
  const tm = t.measure(t.num('title-font-weight'), 'title');
  const parts = titleParts(recipe.title.text);
  const wrap = t.num('title-wrap');
  const main = wrapText(parts.main, wrap, true, tm);
  const sub = parts.sub ? wrapText(parts.sub, Math.round((wrap * titleFont) / subtitleFont), true, tm) : [];
  const textWidth = Math.max(
    ...main.map((l) => tm(l) * titleFont * t.num('char-width')),
    ...sub.map((l) => tm(l) * subtitleFont * t.num('char-width')),
  );
  const height = main.length * titleFont * 1.15 + sub.length * subtitleFont * 1.35 + 2 * t.num('title-padding-y');
  return { main, sub, height, width: Math.max(textWidth + 2 * t.num('title-padding-x'), height * 1.8) };
}

// What a component makes, derived from its own lines, shown only when a quantified reference
// takes part of it. Exact when every line shares one unit; "about" when the lines left out are
// small spoon or pinch amounts; nothing when the units do not resolve. A component with a
// reference of its own is not summed.
const SMALL_UNITS = new Set(['teaspoon', 'tablespoon', 'pinch', 'dash', 'splash']);

/** A unit as the chart prints it: the symbol (`g`, `tsp`) when it has one, else the name. */
export const unitShown = (def: { name: string; symbol: string | null; plural: string | null }, n: number): string =>
  def.symbol ?? (n === 1 || !def.plural ? def.name : def.plural);

/** Every component's name as the chart shows it (`componentLabel`), by component. */
function componentLabels(recipe: Recipe, graph: Graph): Map<Component, string> {
  const quantifiedTargets = new Set(graph.edges.filter((e) => e.kind === 'reference' && e.reference?.quantity).map((e) => e.reference!.target.replace(/^#/, '')));
  const labels = new Map<Component, string>();
  const walk = (nodes: RecipeNode[]): void => {
    for (const n of nodes) {
      if (n.kind !== 'component') continue;
      labels.set(n, componentLabel(n, quantifiedTargets));
      walk(n.children);
    }
  };
  walk(recipe.nodes);
  return labels;
}

/** A component's name, with what it makes when a quantified reference takes part of it. */
function componentLabel(component: Component, quantifiedTargets: Set<string>): string {
  const total = componentTotal(component, quantifiedTargets);
  const name = nodeName(component);
  return total ? `${name} — ${total}` : name;
}

function componentTotal(component: Component, quantifiedTargets: Set<string>): string | null {
  if (!quantifiedTargets.has(component.heading.anchor)) return null;
  const lines = allSteps([component]).flatMap((st) => st.ingredients);
  if (lines.some((l) => l.kind === 'reference')) return null;
  let unit: string | null = null;
  let def: { name: string; symbol: string | null; plural: string | null } | null = null;
  let sum = 0;
  let about = false;
  for (const l of lines) {
    if (l.kind !== 'ingredient') return null;
    if (!l.quantity || !l.unit) return null;
    const u = l.unit.def.name;
    if (unit === null || u === unit) {
      unit = u;
      def = l.unit.def;
      sum += l.quantity.min.value;
      if (l.quantity.max) about = true;
    } else if (SMALL_UNITS.has(u) || (unit !== null && SMALL_UNITS.has(unit) && !SMALL_UNITS.has(u))) {
      // A spoonful beside grams: left out, and the total says "about".
      if (SMALL_UNITS.has(unit) && !SMALL_UNITS.has(u)) {
        // The first lines were the spoonfuls: restart the sum on the larger unit.
        unit = u;
        def = l.unit.def;
        sum = l.quantity.min.value;
      }
      about = true;
    } else return null;
  }
  if (unit === null || def === null || sum <= 0) return null;
  const n = Math.round(sum * 10) / 10;
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `makes ${about ? 'about ' : ''}${shown} ${unitShown(def, n)}`;
}
