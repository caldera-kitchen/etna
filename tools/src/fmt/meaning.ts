// What a recipe means, reduced to something comparable.
//
// The formatter proves its own work with this: it parses the text before and after its
// content edits and refuses the edits when the two readings differ. The comparison ignores
// exactly what the formatter is allowed to change — the spelling of quantities and units,
// spacing inside an ingredient line, the separator after a bold label, temperature notation
// (including the scale a bare temperature is given under `context`), the order of
// frontmatter keys, and the spelling of a mark's delimiters (`_x_` or `*x*`) — and nothing
// else. A step's marks, and its prose as plain text, are compared as they are.

import type { Callout, Direction, Heading, IngredientLine, Node, Note, OtherBlock, Quantity, Recipe, StepBlock } from '../core/index.ts';
import { stable } from './frontmatter.ts';
import { rewriteTemperatures, type ScaleContext } from './temperature.ts';

/** A remark after ` — `, white space collapsed: the formatter only respaces it. */
const words = (s: string | null): string | null => (s === null ? null : s.replace(/\s+/g, ' ').trim());

/** A string that is equal for two sources exactly when they mean the same recipe. */
export function meaningOf(recipe: Recipe, context: ScaleContext = 'none'): string {
  const prose = (s: string | null): string | null => (s === null ? null : rewriteTemperatures(s, context));
  const spaced = (s: string | null): string | null => (s === null ? null : rewriteTemperatures(s.replace(/\s+/g, ' ').trim(), context));

  function quantity(q: Quantity | null): unknown {
    return q ? [q.min.value, q.max ? q.max.value : null] : null;
  }

  function line(l: IngredientLine): unknown {
    if (l.kind === 'reference') return ['reference', l.label, l.target, quantity(l.quantity), l.unit?.def.name ?? null, l.note, words(l.remark)];
    return ['ingredient', quantity(l.quantity), l.unit?.def.name ?? null, spaced(l.item), spaced(l.note), words(l.remark)];
  }

  function callout(c: Callout): unknown {
    return ['callout', prose(c.keyword), prose(c.raw)];
  }

  function block(b: StepBlock): unknown {
    if (b.kind === 'ingredients') return ['ingredients', b.items.map(line)];
    // The raw text without its emphasis and bold delimiters (an underscore and an asterisk
    // read the same), with the plain text and the step's marks to say they still delimit the
    // same words.
    if (b.kind === 'prose') return ['prose', prose(b.raw.replace(/[*_]/g, '')), prose(b.text)];
    if (b.kind === 'callout') return callout(b);
    return other(b);
  }

  function other(b: OtherBlock): unknown {
    return ['other', b.nodeType, b.raw];
  }

  /** Running text in a Directions or Notes section: its temperatures may be rewritten too. */
  function otherProse(b: OtherBlock): unknown {
    return ['other', b.nodeType, prose(b.raw)];
  }

  function node(n: Node): unknown {
    if (n.kind === 'step') return ['step', n.heading.text, n.heading.depth, n.blocks.map(block), n.marks.map((m) => prose(m))];
    return ['component', n.heading.text, n.heading.depth, n.choose, n.blocks.map(block), n.children.map(node)];
  }

  function direction(d: Direction): unknown {
    return [d.number, prose(d.label), prose(d.raw), prose(d.more)];
  }

  function note(n: Note): unknown {
    return [n.form, prose(n.label), prose(n.raw), prose(n.more)];
  }

  const t = recipe.traditional;
  return JSON.stringify({
    frontmatter: recipe.frontmatter.data === null ? null : stable(recipe.frontmatter.data),
    frontmatterError: recipe.frontmatter.error,
    form: recipe.form,
    title: recipe.title ? [recipe.title.text, recipe.title.plain] : null,
    h1Count: recipe.h1Count,
    headings: recipe.headings.map((h) => [h.text, h.depth, h.anchor]),
    preamble: recipe.preamble.map(block),
    nodes: recipe.nodes.map(node),
    notes: recipe.notes && { heading: recipe.notes.heading.text, items: recipe.notes.items.map(note), other: recipe.notes.other.map(otherProse) },
    traditional: t && {
      ingredients: t.ingredients && {
        groups: t.ingredients.items.map((g) => [g.label, g.items.map(line)]),
        other: t.ingredients.other.map(other),
      },
      directions: t.directions && {
        none: t.directions.none,
        items: t.directions.items.map(direction),
        other: t.directions.other.map(otherProse),
      },
      notes: t.notes && { items: t.notes.items.map(note), other: t.notes.other.map(otherProse) },
      otherSections: t.otherSections.map((s) => [s.heading.text, s.raw]),
    },
  });
}

/**
 * What a traditional recipe means once its parts are read the same way in either spelling:
 * the ingredient groups as a run of names and lines (bold line or `###` alike), and the
 * directions as one run of part names, steps and other blocks, without their numbers.
 * Everything else is compared as `meaningOf` compares it, except that part headings are left
 * out of the heading list (an older spelling has none).
 *
 * `partStart` says which directions of an older-spelling recipe head a part: such a step
 * reads as the part name followed by an unlabeled step. The migration in `parts.ts` proves
 * its work by comparing the recipe before (with its plan as `partStart`) and after.
 */
export function partsMeaningOf(recipe: Recipe, context: ScaleContext = 'none', partStart: (d: Direction) => boolean = () => false): string {
  const t = recipe.traditional;
  const base = JSON.parse(meaningOf(recipe, context)) as Record<string, unknown>;
  if (!t) return JSON.stringify(base);
  const prose = (s: string | null): string | null => (s === null ? null : rewriteTemperatures(s, context));
  const spaced = (s: string | null): string | null => (s === null ? null : rewriteTemperatures(s.replace(/\s+/g, ' ').trim(), context));
  const quantity = (q: Quantity | null): unknown => (q ? [q.min.value, q.max ? q.max.value : null] : null);
  const line = (l: IngredientLine): unknown =>
    l.kind === 'reference'
      ? ['reference', l.label, l.target, quantity(l.quantity), l.unit?.def.name ?? null, l.note, words(l.remark)]
      : ['ingredient', quantity(l.quantity), l.unit?.def.name ?? null, spaced(l.item), spaced(l.note), words(l.remark)];

  const partHeadings = new Set<Heading>();
  for (const g of t.ingredients?.items ?? []) if (g.heading) partHeadings.add(g.heading);
  for (const p of t.directions?.parts ?? []) if (p.heading) partHeadings.add(p.heading);

  const inOrder = (entries: { at: number; value: unknown }[]) => entries.sort((a, b) => a.at - b.at).map((e) => e.value);

  const ingredients = t.ingredients && [
    ...inOrder([
      ...t.ingredients.items.flatMap((g) => [
        ...(g.label !== null && g.labelPos ? [{ at: g.labelPos.start.offset, value: ['part', g.label] }] : []),
        ...g.items.map((l) => ({ at: l.pos.start.offset, value: line(l) })),
      ]),
      ...t.ingredients.other.map((o) => ({ at: o.pos.start.offset, value: ['other', o.nodeType, o.raw] })),
    ]),
  ];

  const directions = t.directions && {
    none: t.directions.none,
    run: inOrder([
      ...t.directions.parts.flatMap((p) => (p.heading ? [{ at: p.heading.pos.start.offset, value: ['part', prose(p.label)] }] : [])),
      ...t.directions.items.flatMap((d) =>
        partStart(d)
          ? [
              { at: d.pos.start.offset, value: ['part', prose(d.label)] },
              { at: d.pos.start.offset + 0.5, value: ['step', null, prose(d.raw), prose(d.text), prose(d.more)] },
            ]
          : [{ at: d.pos.start.offset, value: ['step', prose(d.label), prose(d.raw), prose(d.text), prose(d.more)] }],
      ),
      ...t.directions.other.map((o) => ({ at: o.pos.start.offset, value: ['other', o.nodeType, prose(o.raw)] })),
    ]),
  };

  return JSON.stringify({
    ...base,
    headings: recipe.headings.filter((h) => !partHeadings.has(h)).map((h) => [h.text, h.depth]),
    traditional: { ...(base.traditional as object), ingredients, directions },
  });
}
