// The inner HTML of a card: ingredient tables, direction lists, component sections, notes.
//
// The skeleton holds no loops, so everything repeated is produced here, with the class
// names documented in the theme README. Styling is by role (component, step run, choose
// branch, callout), never by the Markdown heading depth.

import { canonicalUnit, formatQuantity, isUseRemark, longUnit, splitQualifier, traditionalParts, type TraditionalPart } from '../core/index.ts';
import type {
  Callout,
  Component,
  Direction,
  DirectionPart,
  IngredientGroup,
  IngredientLine,
  OtherBlock,
  Node,
  Quantity,
  Recipe,
  Reference,
  Step,
  StepBlock,
  UnitMatch,
} from '../core/index.ts';
import type { LayoutName, PartsName } from './contract.ts';
import { blocksHtml, esc, inlineText, markdownBlocks, markdownHtml, safeUrl, type Block } from './html.ts';
import { KEYWORDS } from '../lint/callouts.ts';
import { itemKey } from '../list/index.ts';
import { addRanges, rangeOf, toQuantity } from '../list/rational.ts';

/** The longest use remark (in characters) that prints in the amount column: `for the pans`, `for greasing`. */
const AMOUNT_USE_MAX = 12;

export interface Display {
  units: 'long' | 'symbol';
  fractions: 'unicode' | 'ascii';
  range: 'to' | 'dash';
}

export interface Labels {
  choose: string;
  option: string;
  see: string;
  from: string;
  above: string;
  below: string;
  /** After an ingredient merged from the lines of several steps (`1 1/2 tsp kosher salt, divided`). */
  divided: string;
  /** Keyword (`Checkpoint`) → label printed on the card. Any other callout prints its own label. */
  callouts: Record<string, string>;
}

/**
 * The longest callout label a card prints as a label, in characters. A longer bold lead
 * (`> **Watch it closely once the sugar starts to color** — …`) is a sentence, not a label: the
 * card prints it in bold at the start of the aside, every word kept, and not in the theme's
 * label style (small capitals, capitals), where a sentence reads badly.
 */
export const CALLOUT_LABEL_MAX = 32;

/**
 * How a structured recipe lays out a run of steps (see LAYOUTS in contract.ts).
 * `hoisted` (the default): one ingredient table, grouped by component and never by step, then
 * the directions (SPEC §8). A recipe with a `Choose` keeps its titled component sections.
 * `paired`: each step is one block — its heading, its own ingredients, its direction.
 */
export type Layout = LayoutName;

/**
 * How a traditional recipe's parts are arranged (see PARTS in contract.ts).
 * `sections` (the default): the classic card — every ingredient in one table, the parts as
 * group labels; then the directions, each part a titled run of steps.
 * `paired`: part after part, each with its own ingredients beside its own steps. Only when at
 * least one named part has both; otherwise the classic sections.
 */
export type Parts = PartsName;

export interface Body {
  intro: string;
  /** Ingredient table of a recipe without components. */
  ingredients: string;
  /** Direction list of a recipe without components. */
  directions: string;
  /** Titled sections, each with its own ingredients and directions, when a recipe has components. */
  components: string;
  notes: string;
}

/** Prefix for element ids, so a card embedded in another page cannot collide with its ids. */
const ID_PREFIX = 'card-';

interface IngredientGroupView {
  label: string | null;
  items: IngredientLine[];
  /** The step the items enter at (structured form), for "above / below" pointers: one for all, or one per item. */
  step: Step | null | (Step | null)[];
  /** Print the label even when the group lists nothing: a traditional part the recipe names (`### Buttercream` with no lines under it). */
  keepEmpty?: boolean;
  /** The label is a traditional part heading: a qualifier after ` — ` prints in its own `part-qualifier`. */
  qualify?: boolean;
  /** Per item, how many lines were merged into it (`divided`); 1 or absent for a line as written. */
  merged?: number[];
}

interface DirectionView {
  number: number;
  /** The step name (a bold lead, or a structured step heading), printed after the number. */
  label: string | null;
  id: string | null;
  blocks: Block[];
  /** The only step of its run: the core stylesheet hides its number (`direction-alone`). */
  alone: boolean;
}

/** A run of directions with the unnumbered blocks between them, ready for directionList. */
type DirectionEntry = DirectionView | string;

/** One part of a recipe, ready to print: a title (null for an unnamed part) over its run of steps. */
interface PartView {
  title: string | null;
  /** The title is a traditional part heading: a qualifier after ` — ` prints in its own `part-qualifier`. */
  qualify?: boolean;
  id: string | null;
  /** Blocks before the first step (a component's own text). */
  lead: string;
  entries: DirectionEntry[];
  /** A top-level step after a component: its heading, printed as a step label in the part's title (`part-step-title`). */
  label?: string;
}

/**
 * A traditional part heading as HTML: the name, then a qualifier after ` — ` in its own
 * `part-qualifier` span, dash included, so a theme can set it smaller or lighter (SPEC §4.1).
 * `Biga — 50% hydration` → `Biga<span class="part-qualifier"> — 50% hydration</span>`.
 */
export function qualified(text: string): string {
  const { name, qualifier } = splitQualifier(text);
  return qualifier === null ? esc(text) : `${esc(name)}<span class="part-qualifier"> — ${esc(qualifier)}</span>`;
}

export function renderBody(recipe: Recipe, display: Display, labels: Labels, layout: Layout = 'hoisted', parts: Parts = 'sections'): Body {
  return new BodyRenderer(recipe, display, labels, layout, parts).render();
}

class BodyRenderer {
  private readonly recipe: Recipe;
  private readonly display: Display;
  private readonly labels: Labels;
  private readonly layout: Layout;
  private readonly parts: Parts;
  /** Heading anchor → node and its position in source order. */
  private readonly byAnchor = new Map<string, { node: Node; order: number }>();

  constructor(recipe: Recipe, display: Display, labels: Labels, layout: Layout, parts: Parts) {
    this.recipe = recipe;
    this.display = display;
    this.labels = labels;
    this.layout = layout;
    this.parts = parts;
    let order = 0;
    const index = (nodes: Node[]) => {
      for (const node of nodes) {
        this.byAnchor.set(node.heading.anchor, { node, order: order++ });
        if (node.kind === 'component') index(node.children);
      }
    };
    index(recipe.nodes);
  }

  render(): Body {
    const body: Body = { intro: this.loose(this.recipe.preamble), ingredients: '', directions: '', components: '', notes: '' };
    if (this.recipe.traditional) this.traditional(body);
    else this.structured(body);
    body.notes = this.notes();
    return body;
  }

  /**
   * The recipe's Notes section, in either form: each note (a paragraph, or one item of a
   * bullet list, its bold lead as a label) and each other block, in source order. A list
   * note is printed as a paragraph note is, without its bullet; its nested list or further
   * paragraphs follow inside the same `.note`.
   */
  private notes(): string {
    const notes = this.recipe.notes;
    if (!notes) return '';
    return [
      ...notes.items.map((n) => ({
        offset: n.pos.start.offset,
        html: this.labeled('note-label', n.label, [...markdownBlocks(n.raw), ...(n.more ? markdownBlocks(n.more) : [])]),
      })),
      ...notes.other.map((o) => ({ offset: o.pos.start.offset, html: markdownHtml(o.raw) })),
    ]
      .sort((a, b) => a.offset - b.offset)
      .map((n) => `<div class="note">${n.html}</div>`)
      .join('');
  }

  // --------------------------------------------------------- traditional form

  private traditional(body: Body): void {
    const t = this.recipe.traditional!;

    if (this.parts === 'paired' && pairsAnyPart(this.recipe)) {
      // Part after part, each with its own ingredients beside its own steps: the whole method
      // is in `directions`, so that the notes follow it as on any card.
      body.directions = this.pairedParts();
    } else {
      if (t.ingredients) {
        const groups = t.ingredients.items.map((g) => ({ label: g.label, items: g.items, step: null, keepEmpty: true, qualify: true }));
        const extra = t.ingredients.other.map((o) => `<div class="ingr-extra">${markdownHtml(o.raw)}</div>`).join('');
        body.ingredients = this.table(groups) + extra;
      }
      if (t.directions) body.directions = this.traditionalDirections();
    }

    // Sections the form gives no meaning to are printed after the directions, not dropped.
    for (const section of t.otherSections) {
      const content = section.raw.replace(/^[^\n]*\n?/, ''); // the raw text starts with the heading line
      body.directions +=
        `<section class="extra-section"><h2 class="section-title">${esc(section.heading.text)}</h2>` +
        `${markdownHtml(content)}</section>`;
    }
  }

  /**
   * The directions of a traditional recipe. Without named parts: one list, as it always was.
   * With them: each part a titled run of steps, numbered from 1. Blocks the form gives no
   * meaning to (a stray bullet list between two numbered runs) keep their place.
   */
  private traditionalDirections(): string {
    const d = this.recipe.traditional!.directions!;
    const parts = d.parts.filter((p) => p.label !== null || p.steps.length > 0);
    if (!parts.some((p) => p.label !== null)) {
      const steps = parts.flatMap((p) => p.steps);
      return this.directionList(withOthers(this.directionViews(steps), steps, d.other, (o) => markdownHtml(o.raw)));
    }
    const others = byPart(parts.map(partStart), d.other);
    return parts
      .map((part, i) => {
        const entries = withOthers(this.directionViews(part.steps), part.steps, others[i + 1], (o) => markdownHtml(o.raw));
        // Blocks before the first part heading print as an unnamed part of their own.
        const lead = i === 0 ? others[0].map((o) => `<li class="direction-extra">${markdownHtml(o.raw)}</li>`).join('') : '';
        const view: PartView = { title: part.label, qualify: true, id: null, lead: '', entries };
        return (lead === '' ? '' : `<section class="part part-unnamed"><ol class="direction-list">${lead}</ol></section>`) + this.part(view);
      })
      .join('');
  }

  /** A traditional recipe's steps as numbered views: 1, 2, 3 within the run, each step's bold lead as its name. */
  private directionViews(steps: Direction[]): DirectionView[] {
    return steps.map((d, i) => ({
      number: i + 1,
      label: d.label,
      id: null,
      blocks: [...markdownBlocks(d.raw), ...(d.more ? markdownBlocks(d.more) : [])],
      alone: steps.length === 1,
    }));
  }

  /**
   * One part: `part` (with `part-unnamed` when it has no name), its `part-title`, then its run
   * of steps. The title is a heading, so paging keeps it with the first step.
   */
  private part(view: PartView, extra: string[] = []): string {
    const classes = ['part', view.title === null && view.label === undefined ? 'part-unnamed' : '', ...extra].filter((c) => c !== '');
    const id = view.id === null ? '' : ` id="${esc(ID_PREFIX + view.id)}"`;
    const title =
      view.label !== undefined
        ? `<h3 class="part-title part-step-title"><span class="direction-label">${esc(view.label)}</span></h3>`
        : view.title === null
          ? ''
          : `<h3 class="part-title">${view.qualify ? qualified(view.title) : esc(view.title)}</h3>`;
    return `<section class="${classes.join(' ')}"${id}>${title}${view.lead}${this.directionList(view.entries)}</section>`;
  }

  /**
   * Layout `parts: paired`: each part's ingredients beside its steps, part after part, in the
   * order traditionalParts gives (by the ingredients; a part with steps only follows the part
   * before it). `part-body` holds `part-ingredients` and `part-directions`, either of which
   * may be missing.
   */
  private pairedParts(): string {
    const t = this.recipe.traditional!;
    const { parts } = traditionalParts(this.recipe);
    const ingrOthers = byPart(
      parts.map((p) => (p.ingredients === null ? null : groupStart(p.ingredients))),
      t.ingredients?.other ?? [],
    );
    const dirOthers = byPart(
      parts.map((p) => (p.directions === null ? null : partStart(p.directions))),
      t.directions?.other ?? [],
    );
    const out: string[] = [];
    parts.forEach((p, i) => {
      const items = p.ingredients?.items ?? [];
      const steps = p.directions?.steps ?? [];
      const ingrExtra = ingrOthers[i + 1].map((o) => `<div class="ingr-extra">${markdownHtml(o.raw)}</div>`).join('');
      const table = this.table([{ label: null, items, step: null }]) + ingrExtra;
      const entries = withOthers(this.directionViews(steps), steps, dirOthers[i + 1], (o) => markdownHtml(o.raw));
      if (table === '' && entries.length === 0) return;
      const classes = ['part-paired', table === '' ? '' : 'part-with-ingredients', entries.length === 0 ? '' : 'part-with-directions'];
      const title = p.name === null ? '' : `<h3 class="part-title">${qualified(p.name)}</h3>`;
      out.push(
        `<section class="${['part', p.name === null ? 'part-unnamed' : '', ...classes].filter((c) => c !== '').join(' ')}">` +
          title +
          '<div class="part-body">' +
          (table === '' ? '' : `<div class="part-ingredients">${table}</div>`) +
          (entries.length === 0 ? '' : `<div class="part-directions">${this.directionList(entries)}</div>`) +
          '</div></section>',
      );
    });
    // Blocks before every part: in front, so nothing is dropped.
    const lead = ingrOthers[0].map((o) => `<div class="ingr-extra">${markdownHtml(o.raw)}</div>`);
    const leadDirections = dirOthers[0].map((o) => `<li class="direction-extra">${markdownHtml(o.raw)}</li>`).join('');
    const head =
      lead.length === 0 && leadDirections === ''
        ? ''
        : '<section class="part part-unnamed part-paired"><div class="part-body">' +
          (lead.length === 0 ? '' : `<div class="part-ingredients">${lead.join('')}</div>`) +
          (leadDirections === '' ? '' : `<div class="part-directions"><ol class="direction-list">${leadDirections}</ol></div>`) +
          '</div></section>';
    return head + out.join('');
  }

  // ---------------------------------------------------------- structured form

  private structured(body: Body): void {
    const nodes = this.recipe.nodes;
    if (this.layout === 'paired') {
      // Paired steps carry their own ingredients, so the whole method is one slot.
      body.components = this.nodes(nodes, 1);
    } else if (nodes.every((n) => n.kind === 'step')) {
      // Hoisted, no components: one unlabeled list in step order (SPEC §8). A step heading
      // names what is done, not what is made, so it never labels a group.
      const steps = nodes as Step[];
      body.ingredients = this.table([divided(steps.flatMap((step) => step.ingredients.map((line) => ({ line, step }))), this.labels.divided)]);
      body.directions = this.stepList(steps, false);
    } else if (!nodes.some(hasChoose)) {
      // Hoisted, with components: printed as a traditional card is. Each top-level component
      // is a part — a group of the ingredient table, a titled run of steps — and each step's
      // heading is its step name. The ingredients of top-level steps outside any component
      // print ungrouped where those steps fall, in document order. A top-level step after a
      // component is its own part, titled with its step heading as a step label, so it does
      // not read as the end of that component. A Choose cannot be shown that way, so a recipe
      // with one keeps its component sections.
      const parts = structuredParts(nodes);
      const lines = (p: StructuredPart) => p.steps.flatMap((s) => s.step.ingredients.map((line) => ({ line, step: s.step })));
      body.ingredients = this.table(parts.map((p) => ({ ...divided(lines(p), this.labels.divided), label: p.title })));
      body.directions = parts
        .flatMap((p, k) => {
          const lead = p.lead.map((n) => this.loose(n)).join('');
          if (p.title === null && k > 0) {
            // After a component: each step stands alone, under its own heading.
            return p.steps.map((s, i) =>
              this.part(
                {
                  title: null,
                  label: s.name,
                  id: null,
                  lead: i === 0 ? lead : '',
                  entries: [{ number: 1, label: null, id: s.step.heading.anchor, blocks: s.step.blocks.flatMap((b) => this.stepBlock(b)), alone: true }],
                },
                ['part-step'],
              ),
            );
          }
          return [
            this.part({
              title: p.title,
              id: p.id,
              lead,
              entries: p.steps.map((s, i) => ({
                number: i + 1,
                label: s.name,
                id: s.step.heading.anchor,
                blocks: s.step.blocks.flatMap((b) => this.stepBlock(b)),
                alone: p.steps.length === 1,
              })),
            }),
          ];
        })
        .join('');
    } else {
      body.components = this.nodes(nodes, 1);
    }
  }

  /**
   * Siblings in source order: each run of steps is one block, each component a titled section.
   * Inside a component (`parent`), a run of its own steps that follows a sub-component would
   * read as part of that sub-component, whose label is the last one printed. Such a run is
   * printed as a section of its own, `component component-resumed`, titled with the parent's
   * heading at the sub-component's level, so every theme shows whose steps they are.
   */
  private nodes(nodes: Node[], level: number, parent: Component | null = null): string {
    let out = '';
    let run: Step[] = [];
    let afterComponent = false;
    const flush = () => {
      if (run.length > 0) {
        const steps = this.steps(run, false, level);
        out += parent !== null && afterComponent ? this.resumed(parent, steps, level) : steps;
      }
      run = [];
    };
    for (const node of nodes) {
      if (node.kind === 'step') run.push(node);
      else {
        flush();
        out += this.component(node, level);
        afterComponent = true;
      }
    }
    flush();
    return out;
  }

  /** A component's steps after one of its sub-components: under the component's own name again, with no id (the component has it). */
  private resumed(parent: Component, steps: string, level: number): string {
    const h = `h${Math.min(level + 1, 6)}`;
    return `<section class="component component-resumed"><${h} class="component-title">${esc(parent.heading.text)}</${h}>${steps}</section>`;
  }

  /** A run of steps: its hoisted ingredients (grouped by step), then its directions. */
  private steps(steps: Step[], bare: boolean, level = 1): string {
    if (this.layout === 'paired') return this.pairedSteps(steps, bare, level);
    const table = this.stepTable(steps, bare);
    const list = this.stepList(steps, bare);
    return (
      '<div class="steps">' +
      (table === '' ? '' : `<div class="ingredients">${table}</div>`) +
      (list === '' ? '' : `<div class="directions">${list}</div>`) +
      '</div>'
    );
  }

  /**
   * A run of steps, each one block: heading, the ingredients that enter at it, its direction.
   * `step-echo` marks a step whose direction only repeats its heading ("Chill" / "Chill."),
   * so a theme can print one of the two.
   */
  private pairedSteps(steps: Step[], bare: boolean, level: number): string {
    const h = `h${Math.min(level + 1, 6)}`;
    const blocks = steps.map((step, i) => {
      const table = this.table([{ label: null, items: step.ingredients, step }]);
      const body = blocksHtml(step.blocks.flatMap((b) => this.stepBlock(b)), 'direction-text');
      const prose = step.blocks.filter((b) => b.kind !== 'ingredients');
      const echo = !bare && prose.length === 1 && prose[0].kind !== 'callout' && sameWords(step.heading.text, prose[0].raw);
      const classes = ['step', table === '' ? '' : 'step-with-ingredients', echo ? 'step-echo' : ''].filter((c) => c !== '');
      const head = bare
        ? ''
        : `<header class="step-head"><span class="step-number">${i + 1}</span>` +
          `<${h} class="step-title">${esc(step.heading.text)}</${h}></header>`;
      return (
        `<section class="${classes.join(' ')}" id="${esc(ID_PREFIX + step.heading.anchor)}">` +
        head +
        (table === '' ? '' : `<div class="step-ingredients">${table}</div>`) +
        (body === '' ? '' : `<div class="step-body">${body}</div>`) +
        '</section>'
      );
    });
    return `<div class="steps steps-paired">${blocks.join('')}</div>`;
  }

  /** `bare` drops the step headings as labels — used where a branch label already names the step. */
  private stepTable(steps: Step[], bare: boolean): string {
    return this.table(steps.map((step) => ({ label: bare ? null : step.heading.text, items: step.ingredients, step })));
  }

  private stepList(steps: Step[], bare: boolean): string {
    return this.directionList(
      steps.map((step, i) => ({
        number: i + 1,
        label: bare ? null : step.heading.text,
        id: step.heading.anchor,
        blocks: step.blocks.flatMap((b) => this.stepBlock(b)),
        alone: steps.length === 1,
      })),
    );
  }

  /** A block inside a step's direction. Ingredient lists are hoisted into the table, so skipped here. */
  private stepBlock(block: StepBlock): Block[] {
    if (block.kind === 'ingredients') return [];
    if (block.kind === 'callout') return [{ kind: 'block', html: this.callout(block) }];
    return markdownBlocks(block.raw);
  }

  private component(node: Component, level: number): string {
    const h = `h${Math.min(level + 1, 6)}`;
    const classes = node.choose ? 'component choose' : 'component';
    return (
      `<section class="${classes}" id="${esc(ID_PREFIX + node.heading.anchor)}">` +
      `<${h} class="component-title">${esc(node.heading.text)}</${h}>` +
      this.componentInner(node, level) +
      '</section>'
    );
  }

  private componentInner(node: Component, level: number): string {
    const own = this.loose(node.blocks.filter((b) => !(b.kind === 'callout' && b.keyword === 'Choose')));
    if (!node.choose) return own + this.nodes(node.children, level + 1, node);

    const callout = node.callouts.find((c) => c.keyword === 'Choose');
    const said = callout ? markdownBlocks(callout.raw).find((b) => b.kind === 'p')?.html ?? '' : '';
    const text = said === '' ? '' : `<span class="choose-text"> — ${said}</span>`;
    const h = `h${Math.min(level + 2, 6)}`;
    const branches = node.children.map((child, i) => {
      const label =
        `<${h} class="branch-label"><span class="branch-marker">${esc(this.labels.option)} ${i + 1}</span> ` +
        `${esc(child.heading.text)}</${h}>`;
      if (child.kind === 'step') return `<div class="choose-branch">${label}${this.steps([child], true, level + 1)}</div>`;
      const id = esc(ID_PREFIX + child.heading.anchor);
      return `<div class="choose-branch" id="${id}">${label}${this.componentInner(child, level + 1)}</div>`;
    });
    return `${own}<p class="choose-label">${esc(this.labels.choose)}${text}</p>${branches.join('')}`;
  }

  /**
   * Blocks that sit outside any step: before the first heading, or directly under a
   * component heading. Neither is expected to hold content, but nothing is dropped.
   */
  private loose(blocks: StepBlock[]): string {
    return blocks
      .map((b) => {
        if (b.kind === 'ingredients') return `<div class="ingredients">${this.table([{ label: null, items: b.items, step: null }])}</div>`;
        if (b.kind === 'callout') return this.callout(b);
        return markdownHtml(b.raw);
      })
      .join('');
  }

  // ------------------------------------------------------------- ingredients

  private table(groups: IngredientGroupView[]): string {
    const bodies = groups
      .filter((g) => g.items.length > 0 || (g.keepEmpty === true && g.label !== null && g.label.trim() !== ''))
      .map((g) => {
        const label =
          g.label === null ? '' : `<tr><th class="ingr-group-label" colspan="3" scope="rowgroup">${g.qualify ? qualified(g.label) : esc(g.label)}</th></tr>`;
        const stepOf = (i: number) => (Array.isArray(g.step) ? (g.step[i] ?? null) : g.step);
        return `<tbody class="ingr-group">${label}${g.items.map((item, i) => this.row(item, stepOf(i), g.merged?.[i] ?? 1)).join('')}</tbody>`;
      });
    return bodies.length === 0 ? '' : `<table class="ingr-table">${bodies.join('')}</table>`;
  }

  /** `merged` > 1: the row stands for that many lines of the recipe (`ingr-divided`, `data-lines`). */
  private row(line: IngredientLine, step: Step | null, merged = 1): string {
    // A staple with no amount and a use remark (`salt — to taste`) prints the remark where the
    // amount would be, so it lines up with the other rows and the item column stays clean.
    // Only a short one: the amount column is as wide as the card's widest amount, and a longer
    // phrase (`for the pasta water`) would run into the item. It stays a remark after the item.
    const use =
      line.kind === 'ingredient' && line.quantity === null && line.unit === null && isUseRemark(line.remark) && line.remark!.length <= AMOUNT_USE_MAX;
    // A reference keeps its note and remark as written; they print as an ingredient's do, plain.
    const plain = (text: string) => (line.kind === 'reference' ? inlineText(text) : text);
    const note =
      (line.note === null ? '' : `<span class="ingr-note">, ${esc(plain(line.note))}</span>`) +
      (line.remark === null || use ? '' : `<span class="ingr-remark"> — ${esc(plain(line.remark))}</span>`);
    let item: string;
    if (line.kind === 'reference') item = this.reference(line, step);
    else item = esc(line.item === '' && line.quantity === null ? line.raw : line.item);
    const amount = use
      ? `<td class="ingr-qty ingr-use"><span class="ingr-use-text">${esc(line.remark!)}</span>&nbsp;</td><td class="ingr-unit"></td>`
      : `<td class="ingr-qty">${esc(this.quantity(line.quantity))}</td>` + `<td class="ingr-unit">${esc(this.unit(line.unit, line.quantity))}</td>`;
    return (
      `<tr class="ingr${line.kind === 'reference' ? ' ingr-reference' : ''}${merged > 1 ? ' ingr-divided' : ''}"${merged > 1 ? ` data-lines="${merged}"` : ''}>` +
      amount +
      `<td class="ingr-item">${item}${note}</td></tr>`
    );
  }

  private quantity(q: Quantity | null): string {
    if (!q) return '';
    return formatQuantity(q, { fractions: this.display.fractions, range: this.display.range === 'to' ? ' to ' : '–' });
  }

  private unit(unit: UnitMatch | null, q: Quantity | null): string {
    if (!unit) return '';
    return this.display.units === 'long' ? longUnit(unit.def, q) : canonicalUnit(unit.def, q);
  }

  /**
   * A reference link. Internal: the name, linked, with a pointer to the component it comes
   * from. External: "see <name>", carrying the target in `data-target` for a host page.
   */
  private reference(ref: Reference, step: Step | null): string {
    const name = esc(ref.label);
    if (!ref.internal) {
      const url = safeUrl(ref.target);
      const target = url === null ? '' : ` data-target="${esc(url)}"`;
      return (
        `<span class="ingr-ref-pointer">${esc(this.labels.see)}</span> ` +
        `<span class="ingr-ref ingr-ref-external"${target}>${name}</span>`
      );
    }
    const target = this.byAnchor.get(decodeAnchor(ref.target));
    if (!target) return `<span class="ingr-ref ingr-ref-internal">${name}</span>`;

    const here = step ? this.byAnchor.get(step.heading.anchor)?.order : undefined;
    const where = here === undefined || here === target.order ? '' : target.order < here ? this.labels.above : this.labels.below;
    const heading = target.node.heading.text;
    const sameName = heading.trim().toLowerCase() === ref.label.trim().toLowerCase();
    const parts = [sameName ? '' : `${this.labels.from} ${heading}`, where].filter((p) => p !== '');
    const pointer = parts.length === 0 ? '' : ` <span class="ingr-ref-pointer">(${esc(parts.join(', '))})</span>`;
    return `<a class="ingr-ref ingr-ref-internal" href="#${esc(ID_PREFIX + target.node.heading.anchor)}">${name}</a>${pointer}`;
  }

  // -------------------------------------------------------------- directions

  /**
   * A string entry is an unnumbered block that sits between directions. Every direction of a
   * run carries its number; the only step of a run is marked `direction-alone`, whose number
   * the core stylesheet hides (a lone "1" under a part title reads oddly).
   */
  private directionList(items: DirectionEntry[]): string {
    if (items.length === 0) return '';
    const rows = items.map((d) => {
      if (typeof d === 'string') return `<li class="direction-extra">${d}</li>`;
      const id = d.id === null ? '' : ` id="${esc(ID_PREFIX + d.id)}"`;
      return (
        `<li class="direction${d.alone ? ' direction-alone' : ''}"${id} value="${d.number}">` +
        `<span class="direction-number">${d.number}</span>` +
        `<div class="direction-body">${this.labeled('direction-label', d.label, d.blocks, 'direction-text')}</div></li>`
      );
    });
    return `<ol class="direction-list">${rows.join('')}</ol>`;
  }

  /** Blocks with a run-in label opening the first paragraph. The theme's CSS adds the colon. */
  private labeled(labelClass: string, label: string | null, blocks: Block[], paragraphClass?: string): string {
    if (label === null || label.trim() === '') return blocksHtml(blocks, paragraphClass);
    const span = `<span class="${labelClass}">${esc(label.trim().replace(/\s*:$/, ''))}</span>`;
    const [first, ...rest] = blocks;
    if (first && first.kind === 'p') return blocksHtml([{ kind: 'p', html: `${span} ${first.html}` }, ...rest], paragraphClass);
    return blocksHtml([{ kind: 'p', html: span }, ...blocks], paragraphClass);
  }

  /**
   * A callout under its step. A keyword (`Checkpoint`) is `callout callout-checkpoint`, with the
   * theme's label for it. Any other label is an informational aside (SPEC §5.1): `callout
   * callout-aside`, the same class for every label, printed as written. A bold lead longer than
   * CALLOUT_LABEL_MAX is not a label: it prints as the aside's own bold opening words.
   */
  private callout(callout: Callout): string {
    const blocks = markdownBlocks(callout.raw);
    if (KEYWORDS.includes(callout.keyword)) {
      // The keyword is the recipe's own text: `constructor` is a label, not Object.prototype's.
      const label = Object.hasOwn(this.labels.callouts, callout.keyword) ? this.labels.callouts[callout.keyword] : callout.keyword;
      return `<aside class="callout callout-${callout.keyword.toLowerCase()}">${this.labeled('callout-label', label, blocks)}</aside>`;
    }
    const label = callout.keyword.trim();
    if ([...label].length <= CALLOUT_LABEL_MAX) return `<aside class="callout callout-aside">${this.labeled('callout-label', label, blocks)}</aside>`;
    const lead = `<strong>${esc(label)}</strong>`;
    const [first, ...rest] = blocks;
    const opened: Block[] = first && first.kind === 'p' ? [{ kind: 'p', html: `${lead} — ${first.html}` }, ...rest] : [{ kind: 'p', html: lead }, ...blocks];
    return `<aside class="callout callout-aside">${blocksHtml(opened)}</aside>`;
  }
}

/**
 * True when a traditional recipe's parts can be printed paired: some named part has both
 * ingredients and steps, and the parts do not miss on both sides at once. A group and a
 * direction part that each have no partner are most often one part under two names
 * ("Sauté & Puree" / "Onion & Tomato Puree"); paired, they would print apart, so such a
 * recipe keeps the classic sections until its names agree.
 */
function pairsAnyPart(recipe: Recipe): boolean {
  const { parts } = traditionalParts(recipe);
  const items = (p: TraditionalPart) => p.ingredients?.items.length ?? 0;
  const steps = (p: TraditionalPart) => p.directions?.steps.length ?? 0;
  // The unnamed leading part counts too: steps before the first heading with no unnamed
  // ingredients are as unpartnered as a named part ("Cake" ingredients, unnamed cake steps).
  const unpairedSteps = parts.some((p) => steps(p) > 0 && items(p) === 0 && p.ingredients === null);
  const unpairedItems = parts.some((p) => items(p) > 0 && steps(p) === 0 && p.directions === null);
  if (unpairedSteps && unpairedItems) return false;
  return parts.some((p) => p.name !== null && items(p) > 0 && steps(p) > 0);
}

/** Where a direction part starts in the source: its heading, or its first step. */
function partStart(part: DirectionPart): number | null {
  return part.heading?.pos.start.offset ?? part.pos?.start.offset ?? part.steps[0]?.pos.start.offset ?? null;
}

/** Where an ingredient group starts in the source: its heading or bold line, or its first item. */
function groupStart(group: IngredientGroup): number | null {
  return group.heading?.pos.start.offset ?? group.labelPos?.start.offset ?? group.items[0]?.pos.start.offset ?? null;
}

/**
 * Stray blocks shared out among parts by source position: entry 0 holds those before every
 * part, entry i + 1 those inside part i (the part starting last before the block).
 */
function byPart(starts: (number | null)[], others: OtherBlock[]): OtherBlock[][] {
  const out: OtherBlock[][] = [[], ...starts.map(() => [])];
  for (const o of others) {
    let best = -1;
    starts.forEach((start, i) => {
      if (start !== null && start <= o.pos.start.offset && (best < 0 || start > starts[best]!)) best = i;
    });
    out[best + 1].push(o);
  }
  return out;
}

/** Directions and the stray blocks among them, in source order. */
function withOthers(views: DirectionView[], steps: Direction[], others: OtherBlock[], html: (o: OtherBlock) => string): DirectionEntry[] {
  return [
    ...views.map((view, i) => ({ offset: steps[i].pos.start.offset, entry: view as DirectionEntry })),
    ...others.map((o) => ({ offset: o.pos.start.offset, entry: html(o) as DirectionEntry })),
  ]
    .sort((a, b) => a.offset - b.offset)
    .map((e) => e.entry);
}

/**
 * One ingredient group from lines in step order, with no label. Lines of one item that enter
 * at several steps merge into one line marked `divided` (`1/2 tsp` + `1 tsp` kosher salt →
 * `1 1/2 tsp kosher salt, divided`) only when every amount is stated, in one unit, and the
 * lines agree on their note and remark; otherwise each line prints as written, in order (SPEC
 * §8). The merged line takes the place, and the step, of the first. A note that already says
 * `divided` is not given the word a second time.
 */
function divided(entries: { line: IngredientLine; step: Step }[], word: string): IngredientGroupView {
  // A staple with no amount and a use remark (`salt — to taste`) listed at several steps is one
  // row too: the same item, note and remark, no amount to sum.
  const staple = (line: IngredientLine): boolean => line.kind === 'ingredient' && line.quantity === null && line.unit === null && isUseRemark(line.remark);
  const key = (line: IngredientLine): string | null =>
    line.kind !== 'ingredient' || line.unit?.def.kind === 'recipe'
      ? null
      : staple(line)
        ? ['use', itemKey(line.item), norm(line.note), norm(line.remark)].join('\u0000')
        : line.quantity === null
          ? null
          : [itemKey(line.item), line.unit?.def.name ?? '', norm(line.note), norm(line.remark)].join('\u0000');
  const byKey = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const k = key(e.line);
    if (k !== null) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  // An item whose other lines are not all mergeable (an amount missing, another unit or note) prints as written.
  const items = (line: IngredientLine) => (line.kind === 'ingredient' ? itemKey(line.item) : null);
  const count = new Map<string, number>();
  for (const e of entries) {
    const k = items(e.line);
    if (k !== null) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const out: { line: IngredientLine; step: Step; merged: number }[] = [];
  const skip = new Set<number>();
  entries.forEach((e, i) => {
    if (skip.has(i)) return;
    const k = key(e.line);
    const same = k === null ? [i] : byKey.get(k)!;
    const line = e.line;
    const steps = new Set(same.map((j) => entries[j].step));
    // A staple's use rows merge among themselves; a measured line of the same item elsewhere stays its own row.
    if (same.length < 2 || steps.size !== same.length || line.kind !== 'ingredient' || (!staple(line) && count.get(itemKey(line.item)) !== same.length)) {
      out.push({ ...e, merged: 1 });
      return;
    }
    for (const j of same) skip.add(j);
    if (staple(line)) {
      out.push({ ...e, merged: same.length });
      return;
    }
    const sum = same.map((j) => rangeOf(entries[j].line.quantity!)).reduce(addRanges);
    const quantity = toQuantity(sum);
    // The recipe may say so itself at each step (`1 tbsp oil, divided`): once is enough.
    const written = (line.note ?? '').trim();
    const said = written.split(',').some((part) => part.trim().toLowerCase() === word.toLowerCase());
    const note = written === '' ? word : said ? written : `${written}, ${word}`;
    out.push({ line: { ...line, quantity, note }, step: e.step, merged: same.length });
  });
  return { label: null, items: out.map((e) => e.line), step: out.map((e) => e.step), merged: out.map((e) => e.merged) };
}

function norm(text: string | null): string {
  return (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function hasChoose(node: Node): boolean {
  return node.kind === 'component' && (node.choose || node.children.some(hasChoose));
}

interface StructuredPart {
  title: string | null;
  id: string | null;
  /** Blocks directly under component headings, before their steps. */
  lead: StepBlock[][];
  steps: { step: Step; name: string }[];
}

/**
 * A hoisted structured recipe as parts: each top-level component one part, each run of
 * top-level steps an unnamed one. A component inside a part adds its steps to the part; such a
 * step is named after its component when it is the component's only step ("Yudane"), and
 * "component — step" otherwise.
 */
function structuredParts(nodes: Node[]): StructuredPart[] {
  const parts: StructuredPart[] = [];
  let run: StructuredPart | null = null;
  const collect = (node: Component, part: StructuredPart, prefix: string | null) => {
    if (node.blocks.length > 0) part.lead.push(node.blocks);
    for (const child of node.children) {
      if (child.kind === 'step') {
        part.steps.push({ step: child, name: prefix === null ? child.heading.text : `${prefix} — ${child.heading.text}` });
      } else {
        const only = child.children.length === 1 && child.children[0].kind === 'step' ? child.children[0] : null;
        if (only !== null) {
          if (child.blocks.length > 0) part.lead.push(child.blocks);
          const title = prefix === null ? child.heading.text : `${prefix} — ${child.heading.text}`;
          part.steps.push({ step: only, name: title });
        } else collect(child, part, prefix === null ? child.heading.text : `${prefix} — ${child.heading.text}`);
      }
    }
  };
  for (const node of nodes) {
    if (node.kind === 'step') {
      if (run === null) {
        run = { title: null, id: null, lead: [], steps: [] };
        parts.push(run);
      }
      run.steps.push({ step: node, name: node.heading.text });
    } else {
      run = null;
      const part: StructuredPart = { title: node.heading.text, id: node.heading.anchor, lead: [], steps: [] };
      collect(node, part, null);
      parts.push(part);
    }
  }
  return parts;
}

/**
 * True when a step's heading prints its direction word for word: the same text, white space
 * and one closing full stop or exclamation mark aside ("Chill" / "Chill."). A theme may then
 * hide the direction (`step-echo`), and nothing the author wrote is lost. Any other difference,
 * however small (case, "the", "for", `&` for "and", other punctuation), keeps both: the
 * direction is the author's text and the heading is not, so the direction must print.
 */
function sameWords(heading: string, direction: string): boolean {
  const plain = (text: string) =>
    text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!]$/, '')
      .trim();
  const left = plain(heading);
  return left !== '' && left === plain(direction);
}

function decodeAnchor(target: string): string {
  const anchor = target.replace(/^#/, '');
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}
