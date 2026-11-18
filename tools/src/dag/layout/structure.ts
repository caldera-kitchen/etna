// Structure: which steps share a row and a column, and which snakes there are. A snake is one
// run of rows: the whole recipe when it is drawn flat, or one container's (see index.ts for
// the three columns).

import type { Component, Node as RecipeNode, Step } from '../../core/index.ts';
import { allSteps } from '../../core/graph.ts';
import { nodeName } from '../../core/qualifier.ts';
import type { Arrangement, Op, Row, Sizes, Snake } from './types.ts';

/** What the row builders share: the measured chart and the placements being filled. */
interface Builder {
  sizes: Sizes;
  ops: Map<string, Op>;
}

/** The row an op is in. */
export const rowOf = (op: Op): Row => op.snake.rows[op.row];

/**
 * Arrange the chart into rows and snakes, with the third column (`third`) or every step on the
 * spine. Reads `sizes` only (each step's table, the theme's `trailing-down-max`,
 * `branch-max-steps`, `prep-label`, the caption settings). Returns a fresh `Op` for every step
 * (placed ones with `snake`, `row`, `col`, `placed` set; positions and ports still zero) and
 * the snakes with their rows, Choose groups, captions, row extras and `item` (their place in
 * reading order). Nothing in `sizes` is changed, so it can be called again for each candidate.
 */
export function arrange(sizes: Sizes, third: boolean): Arrangement {
  const { recipe, graph, t } = sizes;
  const ops = new Map<string, Op>();
  const placeholder = {} as Snake;
  for (const size of sizes.steps.values()) {
    ops.set(size.id, {
      id: size.id,
      size,
      snake: placeholder,
      row: 0,
      col: 0,
      placed: false,
      used: { left: '', right: '', top: '', bottom: '' },
      x: 0,
      y: 0,
    });
  }
  const b: Builder = { sizes, ops };

  // Which top-level components become containers. A flat recipe, one with a top-level
  // Choose, or one made only of components of which all but the main one are small side
  // branches (Frosty Chocolate's cacao bloom), is drawn flat, as one snake.
  // Top-level steps that join nothing (no edge in or out, no ingredient: "Heat the oven",
  // "Line the pan") are preparation. They come first, in a row of their own, drawn apart, so
  // the chart says "before you start" instead of showing a node that lost its arrows.
  const touched = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  const isPrep = (n: RecipeNode): n is Step => n.kind === 'step' && n.ingredients.length === 0 && !touched.has(n.heading.anchor) && ops.has(n.heading.anchor);
  const prepSteps = recipe.nodes.filter(isPrep);
  const top: RecipeNode[] = recipe.nodes.filter((n): boolean => !isPrep(n));
  const snakes: Snake[] = [];
  if (prepSteps.length > 0) {
    const snake = newSnake(null);
    snake.prep = true;
    for (const step of prepSteps) put(b, snake, step, addRow(snake, false), 0);
    nameRow(sizes, snake, 0, t.str('prep-label'));
    snakes.push(snake);
  }
  // Top-level steps beside components (the closing steps after them, and any before them that
  // are not preparation) keep the components framed, however small: each component is a
  // container, and each run of top-level steps between them is an unframed snake in the
  // containers' step column, in source order. The steps after the components are joined to
  // them only by their links (SPEC §7), so they read as the work that brings the parts
  // together. A top-level Choose sits on the spine, so a recipe with one is drawn flat.
  const loose = top.some((n) => n.kind === 'step');
  const framed = top.some((n) => n.kind === 'component' && !n.choose);
  if (top.length === 0) {
    // Nothing but preparation: the one snake stands for the recipe.
  } else if (top.some((n) => n.kind === 'step' || n.choose) && (!loose || !framed || top.some((n) => n.kind === 'component' && n.choose))) {
    const snake = newSnake(null);
    emit(b, snake, top, third);
    snakes.push(snake);
  } else if (loose) {
    let run: RecipeNode[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      const snake = newSnake(null);
      emit(b, snake, run, third);
      if (snake.rows.length > 0) snakes.push(snake);
      run = [];
    };
    for (const node of top) {
      if (node.kind === 'component' && !node.choose) {
        flush();
        const snake = newSnake(node);
        emit(b, snake, node.children, third);
        if (snake.rows.length > 0) snakes.push(snake);
      } else run.push(node);
    }
    flush();
  } else {
    const components = top as Component[];
    const product = graph.sinks[graph.sinks.length - 1];
    const main = components.find((c) => allSteps([c]).some((s) => s.heading.anchor === product)) ?? components[components.length - 1];
    const others = components.filter((c) => c !== main);
    if (others.every((c) => allSteps([c]).length <= t.num('branch-max-steps'))) {
      const snake = newSnake(null);
      emit(b, snake, [...others, ...main.children], third);
      snakes.push(snake);
    } else {
      for (const component of components) {
        const snake = newSnake(component);
        emit(b, snake, component.children, third);
        if (snake.rows.length > 0) snakes.push(snake);
      }
    }
  }
  const contained = snakes.some((s) => s.component !== null);
  snakes.forEach((s, i) => (s.item = i));
  return { ops, snakes, contained };
}

/** A snake with no rows yet: a whole item (`head` and `tail`), in the first column. */
export function newSnake(component: Component | null): Snake {
  return {
    component,
    prep: false,
    rows: [],
    groups: [],
    pendingExtra: 0,
    pendingGap: 0,
    column: 0,
    item: 0,
    head: true,
    tail: true,
    lanes: 0,
    turn: false,
    x: 0,
    y: 0,
    topClear: 0,
    bottomClear: 0,
    height: 0,
  };
}

function addRow(snake: Snake, third: boolean): number {
  snake.rows.push({ cells: [null, null], extra: snake.pendingExtra, gap: snake.pendingGap, third, caption: null, y: 0, height: 0 });
  snake.pendingExtra = 0;
  snake.pendingGap = 0;
  return snake.rows.length - 1;
}

function put(b: Builder, snake: Snake, step: Step, row: number, col: 0 | 1): Op {
  const op = b.ops.get(step.heading.anchor)!;
  op.snake = snake;
  op.row = row;
  op.col = col;
  op.placed = true;
  snake.rows[row].cells[col] = op;
  return op;
}

const hasTable = (b: Builder, step: Step): boolean => b.ops.get(step.heading.anchor)!.size.table !== null;

/** Lay a run of consecutive spine steps into rows. */
function layoutSegment(b: Builder, snake: Snake, steps: Step[], snakeMode: boolean, isLast: boolean): void {
  const ownRows = (run: Step[]) => {
    for (const s of run) put(b, snake, s, addRow(snake, snakeMode), 0);
  };
  let prev: Op | null = null;
  let reuse = -1;
  let i = 0;
  while (i < steps.length) {
    if (hasTable(b, steps[i])) {
      prev = put(b, snake, steps[i], reuse >= 0 ? reuse : addRow(snake, snakeMode), 0);
      reuse = -1;
      i++;
      continue;
    }
    let j = i;
    while (j < steps.length && !hasTable(b, steps[j])) j++;
    const run = steps.slice(i, j);
    const trailing = j === steps.length;
    i = j;
    if (!snakeMode || !prev || (trailing && !isLast)) {
      ownRows(run);
      prev = b.ops.get(run[run.length - 1].heading.anchor)!;
      continue;
    }
    const start = prev.row;
    if (!trailing) {
      // Between two steps with ingredients: one step stays on the spine; two or more go
      // down the third column and come back to the next step's row.
      if (run.length === 1 || snake.rows[start].cells[1] || !snake.rows[start].third) {
        ownRows(run);
      } else {
        put(b, snake, run[0], start, 1);
        for (const s of run.slice(1)) put(b, snake, s, addRow(snake, true), 1);
        reuse = snake.rows.length - 1;
      }
      continue;
    }
    // The trailing run. Count the free third-column cells from this row upward.
    let free = 0;
    for (let r = start; r >= 0 && snake.rows[r].third && !snake.rows[r].cells[1]; r--) free++;
    if (run.length <= b.sizes.t.num('trailing-down-max') && free >= 1) {
      // Short: turn into the third column and run down.
      put(b, snake, run[0], start, 1);
      for (const s of run.slice(1)) put(b, snake, s, addRow(snake, true), 1);
      continue;
    }
    // Long: stay on the spine just far enough that the rest fits running back up the
    // third column, which keeps the chart compact.
    const down = Math.max(0, Math.ceil((run.length - free) / 2));
    ownRows(run.slice(0, down));
    const bottom = start + down;
    run.slice(down).forEach((s, k) => put(b, snake, s, bottom - k, 1));
  }
}

/** Put a component's name in the caption over a row. A row that already has one (the first
 *  row of a group, shared with its first sub-component) gets both, outer first. */
function nameRow(sizes: Sizes, snake: Snake, at: number, name: string): void {
  if (!sizes.showCaptions) return;
  const inner = snake.rows[at].caption;
  snake.rows[at].caption = inner ? `${name} — ${inner}` : name;
  if (!inner) snake.rows[at].extra += sizes.captionSize + 4;
}

/** A component's name as a caption over a row prints it: with the optional mark when it is designated optional. */
function marked(sizes: Sizes, component: Component, name: string): string {
  return component.optional ? `${name} ${sizes.mark}` : name;
}

function emitChoose(b: Builder, snake: Snake, component: Component): void {
  if (component.children.length === 0) return;
  const start = snake.rows.length;
  snake.pendingExtra += 26;
  const breaks: number[] = [];
  component.children.forEach((alt, i) => {
    if (i > 0) breaks.push(snake.rows.length);
    const first = snake.rows.length;
    if (alt.kind === 'step') put(b, snake, alt, addRow(snake, false), 0);
    else if (alt.choose) emitChoose(b, snake, alt);
    else {
      emit(b, snake, alt.children, false);
      // Name the alternative over its first row, as a side branch is named.
      if (snake.rows.length > first) nameRow(b.sizes, snake, first, marked(b.sizes, alt, nodeName(alt)));
    }
  });
  if (snake.rows.length === start) {
    snake.pendingExtra = 0;
    snake.pendingGap = 0;
    return;
  }
  for (let r = start; r < snake.rows.length; r++) snake.rows[r].third = false;
  snake.groups.push({ component, start, end: snake.rows.length - 1, breaks: breaks.filter((x) => x < snake.rows.length) });
  snake.pendingExtra += 18;
  snake.pendingGap += 18;
}

/** Lay out the children of a component (or of the recipe): side branches first, then the spine. */
function emit(b: Builder, snake: Snake, children: RecipeNode[], snakeMode: boolean): void {
  const { branchGap } = b.sizes;
  const before = snake.rows.length;
  for (const child of children) {
    if (child.kind !== 'component' || child.choose) continue;
    const start = snake.rows.length;
    if (start > 0) {
      snake.pendingExtra += branchGap;
      snake.pendingGap += branchGap;
    }
    emit(b, snake, child.children, false);
    if (snake.rows.length === start) continue;
    // Name the branch over its first own row.
    const direct = new Set(child.children.filter((c) => c.kind === 'step').map((c) => c.heading.anchor));
    let at = start;
    for (let r = start; r < snake.rows.length; r++) {
      const op = snake.rows[r].cells[0];
      if (op && direct.has(op.id)) {
        at = r;
        break;
      }
    }
    nameRow(b.sizes, snake, at, marked(b.sizes, child, b.sizes.labels.get(child)!));
  }
  if (snake.rows.length > before) {
    snake.pendingExtra += branchGap;
    snake.pendingGap += branchGap;
  }

  const spine = children.filter((c) => c.kind === 'step' || c.choose);
  let k = 0;
  while (k < spine.length) {
    const node = spine[k];
    if (node.kind === 'component') {
      emitChoose(b, snake, node);
      k++;
      continue;
    }
    let j = k;
    while (j < spine.length && spine[j].kind === 'step') j++;
    layoutSegment(b, snake, spine.slice(k, j) as Step[], snakeMode, j === spine.length);
    k = j;
  }
  // A pending gap with no row after it belongs to nothing.
  if (spine.length === 0) {
    snake.pendingExtra = 0;
    snake.pendingGap = 0;
  }
}
