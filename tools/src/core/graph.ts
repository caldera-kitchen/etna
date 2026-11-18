// The coarse dataflow graph of a structured recipe (SPEC §7, §8).
//
// Nodes are steps. Edges are the implicit spine plus explicit reference links. The graph is
// acyclic by construction for spine edges; reference links can only be checked, not prevented.

import type { Component, Heading, Ingredient, Node, Recipe, Reference, Step } from './model.ts';

export type EdgeKind = 'spine' | 'reference' | 'choose';

export interface GraphStep {
  /** The step heading's anchor: unique within a recipe. */
  id: string;
  step: Step;
  /** Headings of the enclosing components, outermost first. */
  path: Heading[];
  /** Raw ingredients entering at this step (references excluded). */
  ingredients: Ingredient[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** The reference link that created the edge, for `reference` edges. */
  reference: Reference | null;
}

export interface ReferenceProblem {
  reference: Reference;
  step: Step;
  /**
   * `unresolved`: the anchor matches no heading. `ambiguous`: the heading's text is not
   * unique. `empty`: the heading has no step to take an output from. `cycle`: the heading
   * is the linking step itself, or holds it (at any depth), so the step would take in its
   * own output. No edges are drawn for an `unresolved`, `empty` or `cycle` reference.
   */
  reason: 'unresolved' | 'ambiguous' | 'empty' | 'cycle';
}

export interface Graph {
  steps: GraphStep[];
  edges: GraphEdge[];
  /** Internal references that point at no heading, or at a heading whose text is not unique. */
  problems: ReferenceProblem[];
  /** References to other recipes (`../slug/`), with the step they enter at. */
  external: { reference: Reference; step: Step }[];
  /** Ids of the steps whose output nothing consumes; the last one is the recipe's product. */
  sinks: string[];
}

/** Every step of a structured recipe, depth-first in source order. */
export function allSteps(nodes: Node[]): Step[] {
  return nodes.flatMap((n) => (n.kind === 'step' ? [n] : allSteps(n.children)));
}

/** Every component, depth-first in source order. */
export function allComponents(nodes: Node[]): Component[] {
  return nodes.flatMap((n) => (n.kind === 'component' ? [n, ...allComponents(n.children)] : []));
}

/**
 * True for a **group**: a component whose children are all components, with no step of its
 * own and no `Choose` callout (SPEC §7). A link to a group stands for a link to each child.
 */
export function isGroup(node: Node): boolean {
  return node.kind === 'component' && !node.choose && node.children.length > 0 && node.children.every((c) => c.kind === 'component');
}

/**
 * The steps whose results make up a node's output (SPEC §7). A step outputs itself. A group
 * outputs every child's output, in order, expanding nested groups all the way down. A
 * `Choose` component outputs every branch, of which the cook takes one. Any other component
 * (one with at least one step child) outputs its last child's output, whether that child is
 * a step or a component.
 */
export function outputsOf(node: Node): Step[] {
  if (node.kind === 'step') return [node];
  if (node.children.length === 0) return [];
  if (node.choose || isGroup(node)) return node.children.flatMap(outputsOf);
  return outputsOf(node.children[node.children.length - 1]);
}

/**
 * How many separate products a link to this node brings in: 1 for a step or a `Choose`
 * (one branch is taken), the sum over the children for a group, and otherwise the count of
 * the last child. More than one means the link expands a group.
 */
export function productCount(node: Node): number {
  if (node.kind === 'step' || node.choose) return 1;
  if (node.children.length === 0) return 0;
  if (isGroup(node)) return node.children.reduce((sum, c) => sum + productCount(c), 0);
  return productCount(node.children[node.children.length - 1]);
}

/** True when `node` is `step` or holds it at any depth. */
function holds(node: Node, step: Step): boolean {
  return node === step || (node.kind === 'component' && node.children.some((c) => holds(c, step)));
}

/**
 * The first steps of a node: where an input entering the node arrives. A `Choose` is entered
 * at every branch, and a group at every child (nested groups expanded all the way down, as a
 * link to a group is; SPEC §7). Any other component is entered at its first child.
 */
function entriesOf(node: Node): Step[] {
  if (node.kind === 'step') return [node];
  if (node.children.length === 0) return [];
  if (node.choose || isGroup(node)) return node.children.flatMap(entriesOf);
  return entriesOf(node.children[0]);
}

export function buildGraph(recipe: Recipe): Graph {
  const steps: GraphStep[] = [];
  const edges: GraphEdge[] = [];
  const problems: ReferenceProblem[] = [];
  const external: Graph['external'] = [];

  // Index headings by anchor, and count heading texts to detect ambiguous targets.
  const byAnchor = new Map<string, Node>();
  const textCount = new Map<string, number>();
  const index = (nodes: Node[]) => {
    for (const n of nodes) {
      byAnchor.set(n.heading.anchor, n);
      textCount.set(n.heading.text, (textCount.get(n.heading.text) ?? 0) + 1);
      if (n.kind === 'component') index(n.children);
    }
  };
  index(recipe.nodes);

  const walk = (nodes: Node[], path: Heading[]) => {
    // `prev` holds the steps the next step on this spine consumes.
    let prev: Step[] = [];
    // At the top level, the steps before the first component (a preheat, a pan to line) are a
    // run of their own: the spine does not carry them past a component, so the closing steps
    // after the components start a chain of their own (SPEC §7). Under a component, a
    // sub-component between two steps stays a side branch the spine runs past.
    let leading = path.length === 0;
    for (const node of nodes) {
      if (leading && node.kind === 'component' && !node.choose) {
        leading = false;
        prev = [];
      }
      if (node.kind === 'step') {
        steps.push({
          id: node.heading.anchor,
          step: node,
          path,
          ingredients: node.ingredients.filter((i): i is Ingredient => i.kind === 'ingredient'),
        });
        for (const p of prev) edges.push({ from: p.heading.anchor, to: node.heading.anchor, kind: 'spine', reference: null });
        prev = [node];
        continue;
      }
      walk(node.children, [...path, node.heading]);
      if (node.choose) {
        // A Choose component sits on the spine: the step before it feeds every branch (each
        // sub-component of a branch that is a group), and the step after it consumes the
        // chosen branch.
        for (const entry of entriesOf(node)) {
          for (const p of prev) edges.push({ from: p.heading.anchor, to: entry.heading.anchor, kind: 'choose', reference: null });
        }
        prev = outputsOf(node);
      }
      // Any other component is a side branch: `prev` is unchanged, and its output enters
      // only where a reference link names it.
    }
  };
  walk(recipe.nodes, []);

  // Inside a Choose component the branches are alternatives, not a sequence: remove the
  // spine edges `walk` drew between sibling branch steps.
  const chooseSiblings = new Set<string>();
  const markChoose = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind !== 'component') continue;
      if (n.choose) {
        const direct = n.children.filter((c): c is Step => c.kind === 'step');
        for (const a of direct) for (const b of direct) chooseSiblings.add(`${a.heading.anchor}>${b.heading.anchor}`);
      }
      markChoose(n.children);
    }
  };
  markChoose(recipe.nodes);
  const kept = edges.filter((e) => !(e.kind === 'spine' && chooseSiblings.has(`${e.from}>${e.to}`)));

  // Reference links.
  for (const gs of steps) {
    for (const line of gs.step.ingredients) {
      if (line.kind !== 'reference') continue;
      if (!line.internal) {
        external.push({ reference: line, step: gs.step });
        continue;
      }
      const target = byAnchor.get(decodeAnchor(line.target.slice(1)));
      if (!target) {
        problems.push({ reference: line, step: gs.step, reason: 'unresolved' });
        continue;
      }
      if ((textCount.get(target.heading.text) ?? 0) > 1) {
        problems.push({ reference: line, step: gs.step, reason: 'ambiguous' });
      }
      if (holds(target, gs.step)) {
        problems.push({ reference: line, step: gs.step, reason: 'cycle' });
        continue;
      }
      const outputs = outputsOf(target);
      if (outputs.length === 0) {
        problems.push({ reference: line, step: gs.step, reason: 'empty' });
        continue;
      }
      for (const out of outputs) {
        kept.push({ from: out.heading.anchor, to: gs.id, kind: 'reference', reference: line });
      }
    }
  }

  const consumed = new Set(kept.map((e) => e.from));
  const sinks = steps.filter((s) => !consumed.has(s.id)).map((s) => s.id);
  return { steps, edges: kept, problems, external, sinks };
}

/** Decode a link fragment; a malformed percent escape (`#50%`) is taken literally. */
function decodeAnchor(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

/** True when the edges contain a cycle (only reference links can create one). */
export function hasCycle(graph: Graph): boolean {
  const out = new Map<string, string[]>();
  for (const e of graph.edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of out.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return graph.steps.some((s) => visit(s.id));
}
