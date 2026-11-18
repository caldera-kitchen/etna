// The layout's types: what it returns (the public shape and the drawer's detail), what it
// measures once per chart (`Sizes`), and the mutable model the placing stages work on
// (`Op`, `Row`, `Snake`, `Route`), made fresh for each arrangement.

import type { Component, Graph, GraphEdge, Recipe, Step } from '../../core/index.ts';
import type { Measure } from '../measure.ts';
import type { TableRow } from '../text.ts';
import type { ThemeReader } from '../theme.ts';
import type { Plan } from './fit.ts';

// ------------------------------------------------------------------ the output

export interface Point {
  x: number;
  y: number;
}

export interface LayoutBox {
  id: string;
  kind: 'ingredients' | 'operation' | 'title' | 'component';
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

export interface LayoutEdge {
  from: string;
  to: string;
  kind: string;
  points: Point[];
}

export interface DagLayout {
  width: number;
  height: number;
  boxes: LayoutBox[];
  edges: LayoutEdge[];
}

/** The layout with everything the drawer needs beyond the public shape. */
export interface DetailedLayout extends DagLayout {
  title: { box: LayoutBox; main: string[]; sub: string[] } | null;
  tables: { box: LayoutBox; rows: TableRow[]; quantityRight: number; unitLeft: number; itemLeft: number }[];
  /**
   * `prep`: a step with no edges at all (a preheat, a pan to line), drawn apart as preparation.
   * `mark`: the optional mark (`(optional)`) drawn small under the text of a step designated optional.
   */
  operations: { box: LayoutBox; checkpoints: string[]; prep: boolean; mark?: string }[];
  /**
   * `inset`: how far from the left of the top border the name sits, when not the usual 18 (14 for a Choose).
   * `note`: the optional mark drawn small after the name, for a component designated optional.
   */
  containers: { box: LayoutBox; title: string; choose: boolean; inset?: number; note?: string }[];
  /** Dashed rules between the alternatives of a Choose component. */
  separators: { x1: number; y1: number; x2: number; y2: number }[];
  /** Small names over the first row of a side branch. */
  /** Small texts: branch names over a row, and the amount a quantified reference carries, beside its arrow (`edge`). */
  captions: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; edge?: boolean }[];
  /** Which of its layouts the chart was given, and how large it prints on its screen or sheet (points per unit). */
  plan?: Plan & { scale: number };
}

// ------------------------------------------------------------------ measured once (sizes.ts)

/** An ingredient table, measured. */
export interface Table {
  rows: TableRow[];
  quantityChars: number;
  unitChars: number;
  itemColumn: number;
  widthChars: number;
  lineCount: number;
  lines: string[];
  height: number;
}

/** One step, measured: its node text and height, its ingredient table, its checkpoints. */
export interface StepSize {
  id: string;
  step: Step;
  lines: string[];
  height: number;
  table: Table | null;
  checkpoints: string[];
  /** The optional mark under the node's text (`(optional)`), for a step designated optional; null otherwise. */
  mark: string | null;
}

/** The title pill's text and size. */
export interface TitleSize {
  main: string[];
  sub: string[];
  width: number;
  height: number;
}

/**
 * Everything measured once per chart, independent of placement: the theme numbers the stages
 * share, every step's size, the shared widths, the title. Read-only after `measure`.
 */
export interface Sizes {
  recipe: Recipe;
  graph: Graph;
  t: ThemeReader;
  /** The steps by id, in the graph's order. */
  steps: Map<string, StepSize>;
  /** Component name, with what it makes when a quantified reference takes part of it. */
  labels: Map<Component, string>;
  /** The optional mark, `(optional)` with the style's `optional-label`. */
  mark: string;
  title: TitleSize | null;

  mirrored: boolean;
  titleLeft: boolean;
  separate: boolean;
  showCaptions: boolean;
  ingredientShape: string;
  operationShape: string;
  ingredientMeasure: Measure;
  operationMeasure: Measure;
  fontSize: number;
  cw: number;
  lineHeight: number;
  margin: number;
  rowGap: number;
  columnGap: number;
  channelGap: number;
  laneGap: number;
  lanePad: number;
  turnDepth: number;
  point: number;
  operationRadius: number;
  captionSize: number;
  branchGap: number;
  titleGap: number;
  componentGap: number;
  /** The style's `third-column`: whether the third column is tried (`auto`), always used, or never. */
  thirdColumn: string;
  /** The style's `columns`: the number pinned, or 0 for `auto`. */
  columns: number;
  /** How far an edge that comes in through a node's top runs straight down, when the row gap allows. */
  arrowRun: number;

  /** The gap between table columns, in cells. */
  space: number;
  hasTables: boolean;
  /** How far the ingredient shape pushes the text in, on each side. */
  tableInset: number;
  /** Width of every ingredient box. */
  tableWidth: number;
  /** Width of every operation node. */
  opWidth: number;
  /** Half the flat part of a node's top, the narrowest. */
  flatHalf: number;
  /** How far off the center an offset port is. */
  portOffset: number;
}

// ------------------------------------------------------------------ the placing model

export type Port = '' | 'spine' | 'in' | 'out';

/** Where one step is placed: made fresh by `arrange` for each arrangement. */
export interface Op {
  id: string;
  size: StepSize;
  snake: Snake;
  row: number;
  /** 0 = the spine column, 1 = the third column. */
  col: 0 | 1;
  placed: boolean;
  used: { left: Port; right: Port; top: Port; bottom: Port };
  x: number;
  y: number;
}

export interface Row {
  cells: [Op | null, Op | null];
  /** Space above the row beyond the ordinary row gap. */
  extra: number;
  /** The part of `extra` that only sets the row apart from the one above it (a branch gap, the gap under a Choose group): a row at the head of a column drops it. */
  gap: number;
  /** False where the third column may not be used (inside a Choose group). */
  third: boolean;
  caption: string | null;
  y: number;
  height: number;
}

export interface ChooseGroup {
  component: Component;
  start: number;
  end: number;
  /** Row indexes where a new alternative starts (not counting the first). */
  breaks: number[];
}

export interface Snake {
  component: Component | null;
  /** The leading row of preparation steps that join nothing (a preheat, a pan to line). */
  prep: boolean;
  rows: Row[];
  groups: ChooseGroup[];
  pendingExtra: number;
  pendingGap: number;
  /** Which column of the chart the snake is in (0 unless the chart is folded into columns). */
  column: number;
  /** The item it is, or is part of: its place in reading order before any fold. */
  item: number;
  /** False for the later parts of an item cut by a fold, which start a column; and for all but the last. */
  head: boolean;
  tail: boolean;
  lanes: number;
  turn: boolean;
  x: number;
  y: number;
  topClear: number;
  bottomClear: number;
  height: number;
}

/** The arrangement `arrange` makes: every step's placement, and the snakes in order. */
export interface Arrangement {
  ops: Map<string, Op>;
  snakes: Snake[];
  /** True when some snake is a container (a component drawn framed). */
  contained: boolean;
}

export type RouteType = 'vertical' | 'hop' | 'lane' | 'gutter';

export interface Route {
  edge: GraphEdge;
  from: Op;
  to: Op;
  type: RouteType;
  turn: boolean;
  /** `bottom` and `top`: the middle of the node's bottom or top, for the spine where a fold cuts it. */
  exit: 'tip' | 'offset' | 'bottom';
  entry: 'tip' | 'offset' | 'top';
  /** For an edge between containers: the side of the target container it comes in from. */
  side: 'left' | 'right';
  lane: number;
  /** The spine itself, cut by a fold: from the foot of one column to the head of the next. */
  back: boolean;
  /**
   * For an edge that must pass over a column (to a column further on than the next, or back to
   * an earlier one): the gutter it comes down, its lane there, and its lane in the band over
   * the columns. `via` is -1 for every other edge.
   */
  via: number;
  lane2: number;
  band: number;
  /** A joining edge that runs straight down into a third-column node's top: no lane, no jog. */
  drop: boolean;
  /**
   * `join-edges: separate`: for an edge that leaves its node from one side with others for
   * other nodes, its own point of exit (`dy` up or down the tip from its middle, `dx` along the
   * bottom out from the usual port), the height it runs out toward its lane at, and which fork
   * it is part of with how near its lane is to be among the fork's (0 the nearest) (place.ts,
   * `spreadExits`). Null for every other edge.
   */
  fork: { dy: number; dx: number; y: number; key: string; near: number } | null;
}

// ------------------------------------------------------------------ placement (place.ts)

/** The frame's fixed offsets: container paddings, the step column. */
export interface Frame {
  padSide: number;
  padTop: number;
  padBottom: number;
  /** Left of the operations column, from the snake's left. */
  col2: number;
  usesThird: boolean;
}

/** What `placeVertical` works out. */
export interface Vertical {
  /** The top of the columns: under the title and the band over the columns. */
  top0: number;
  containerTops: Map<Snake, number>;
  height: number;
}

/** What `foldColumns` did: how many columns, and how many edges its cuts break. */
export interface Folded {
  columnCount: number;
  broken: number;
}

/** What `placeHorizontal` works out. */
export interface Horizontal {
  /** Left of the third column, from the snake's left. */
  col3: number;
  containerWidth: number;
  containersWidth: number;
  blockWidth: number;
  width: number;
  blockX: number;
  /** Per column of containers: the x of its gutter's first lane. */
  gutterX: number[];
}

/** Everything placed, as `emitLayout` reads it. */
export interface Placement {
  frame: Frame;
  vertical: Vertical;
  horizontal: Horizontal;
}
