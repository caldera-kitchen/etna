// recipe.md → Recipe model.
//
// The parser is forgiving: it never throws on a malformed recipe. It records what it
// found; deciding what is an error is the linter's job.

import GithubSlugger from 'github-slugger';
import type { Blockquote, Heading as MdHeading, List, ListItem, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { toString } from 'mdast-util-to-string';
import { frontmatter } from 'micromark-extension-frontmatter';
import { parse as parseYaml } from 'yaml';

import { isOptionalRemark, parseAmount, parseIngredientText, splitRemark } from './ingredient.ts';
import { splitQualifier } from './qualifier.ts';

export { nodeName, splitQualifier } from './qualifier.ts';
import type {
  Callout,
  Component,
  Direction,
  DirectionPart,
  Form,
  Frontmatter,
  Heading,
  IngredientGroup,
  IngredientLine,
  IngredientList,
  Node,
  Note,
  NotesSection,
  OtherBlock,
  Pos,
  Prose,
  Recipe,
  Step,
  StepBlock,
  Title,
  TraditionalBody,
} from './model.ts';
import type { UnitRegistry } from './units.ts';

/** Separators accepted after a bold keyword or label. The canonical one is the em dash. */
const SEPARATOR_RE = /^\s*(—|–|--|-|:)\s+/;

export interface ParseOptions {
  units: UnitRegistry;
}

export function parseRecipe(source: string, options: ParseOptions): Recipe {
  const tree = fromMarkdown(source, {
    extensions: [frontmatter(['yaml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
  }) as Root;

  const ctx = new Context(source, options.units);
  const content = [...tree.children];

  const fm = readFrontmatter(content, ctx);
  const data = fm.data ?? {};
  const etna = Number.isInteger(data.etna) ? (data.etna as number) : null;
  const formRaw = data.form === undefined || data.form === null ? null : String(data.form);
  const form: Form = formRaw === 'traditional' ? 'traditional' : 'structured';

  // Split the body at headings.
  let title: Title | null = null;
  let h1Count = 0;
  let titleFirst = false;
  const preamble: RootContent[] = [];
  const sections: RawSection[] = [];
  for (const node of content) {
    if (node.type === 'heading') {
      if (node.depth === 1) {
        h1Count++;
        const text = toString(node).trim();
        ctx.slugger.slug(text); // GitHub de-duplicates anchors across every heading, the H1 included.
        if (!title) {
          title = { text, plain: node.children.every((c) => c.type === 'text'), pos: pos(node) };
          titleFirst = preamble.length === 0 && sections.length === 0;
          continue;
        }
        // A second H1 is kept as an ordinary block so nothing is lost; the linter reports it.
      } else {
        sections.push({ heading: ctx.heading(node), node, blocks: [] });
        continue;
      }
    }
    if (sections.length === 0) preamble.push(node);
    else sections[sections.length - 1].blocks.push(node);
  }

  const headings = sections.map((s) => s.heading);
  const recipe: Recipe = {
    source,
    frontmatter: fm,
    etna,
    form,
    formRaw,
    title,
    h1Count,
    titleFirst,
    preamble: ctx.blocks(preamble),
    nodes: [],
    traditional: null,
    notes: null,
    headings,
  };

  if (form === 'traditional') {
    recipe.traditional = readTraditional(sections, ctx);
    recipe.notes = recipe.traditional.notes;
  } else {
    // The notes section is the last H2 when its text is `Notes`; everything after it is its own.
    let last = -1;
    sections.forEach((s, i) => {
      if (s.heading.depth === 2) last = i;
    });
    if (last >= 0 && isNotesHeading(sections[last].heading)) {
      const [head, ...rest] = sections.slice(last);
      recipe.notes = readNotes(head.heading, head.node, [...head.blocks, ...rest.flatMap((s) => [s.node, ...s.blocks])], ctx);
      recipe.nodes = nest(sections.slice(0, last), ctx);
    } else recipe.nodes = nest(sections, ctx);
  }
  return recipe;
}

/** True for a heading whose text is `Notes`, case ignored. */
export function isNotesHeading(heading: { text: string }): boolean {
  return heading.text.trim().toLowerCase() === 'notes';
}

/**
 * A Notes section. Each top-level paragraph is a note, and so is each item of a top-level
 * bullet list (the convention, SPEC §4.2); a bold lead opening the note is its label. A nested
 * list or continuation paragraph belongs to its item. Anything else (a numbered list, a table,
 * a sub-heading, a quote) is an other-block.
 */
function readNotes(heading: Heading, node: MdHeading, blocks: RootContent[], ctx: Context): NotesSection {
  const items: Note[] = [];
  const other: OtherBlock[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      const lead = splitLead(b, ctx);
      const p = pos(b);
      if (lead && lead.separator !== '') items.push({ form: 'paragraph', label: lead.label, raw: lead.raw, text: lead.text, more: null, pos: p });
      else items.push({ form: 'paragraph', label: null, raw: ctx.slice(p), text: toString(b), more: null, pos: p });
    } else if (b.type === 'list' && !b.ordered) {
      for (const item of b.children) items.push(noteItem(item, ctx));
    } else other.push(ctx.other(b));
  }
  const last = blocks.length > 0 ? blocks[blocks.length - 1] : node;
  return { heading, items, other, pos: span(node, last) };
}

/** One item of a Notes list as a note: its first paragraph (and lead), then the rest of the item. */
function noteItem(item: ListItem, ctx: Context): Note {
  const p = pos(item);
  const [first, ...rest] = item.children;
  if (!first) return { form: 'item', label: null, raw: '', text: '', more: null, pos: p };
  const column = pos(first).start.column - 1;
  const restText = rest.map(plainText);
  const joined = (head: string) => [head, ...restText].filter((t) => t !== '').join('\n');
  if (first.type !== 'paragraph') {
    const whole = dedent(ctx.slice(span(first, item.children[item.children.length - 1])), column);
    return { form: 'item', label: null, raw: whole, text: toString(item), more: null, pos: p };
  }
  const more = rest.length > 0 ? dedent(ctx.slice(span(rest[0], rest[rest.length - 1])), column) : null;
  const lead = splitLead(first, ctx);
  if (lead && lead.separator !== '') return { form: 'item', label: lead.label, raw: dedent(lead.raw, column), text: joined(lead.text), more, pos: p };
  return { form: 'item', label: null, raw: dedent(ctx.slice(pos(first)), column), text: joined(toString(first)), more, pos: p };
}

/** Plain text of a block, a list's items (and a quote's blocks) one per line. */
function plainText(node: RootContent | ListItem): string {
  if (node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote') return node.children.map(plainText).join('\n');
  return toString(node);
}

/**
 * Source taken from inside a list item, made to stand alone: every line after the first
 * loses up to `column` leading spaces (the item's content indent). The first line starts at
 * the content already.
 */
function dedent(source: string, column: number): string {
  if (column <= 0) return source;
  const strip = new RegExp(`^ {1,${column}}`);
  return source
    .split('\n')
    .map((line, i) => (i === 0 ? line : line.replace(strip, '')))
    .join('\n');
}

// --------------------------------------------------------------------- helpers

interface RawSection {
  heading: Heading;
  node: MdHeading;
  blocks: RootContent[];
}

function pos(node: { position?: unknown }): Pos {
  return node.position as Pos;
}

function span(first: { position?: unknown }, last: { position?: unknown }): Pos {
  return { start: pos(first).start, end: pos(last).end };
}

class Context {
  readonly source: string;
  readonly units: UnitRegistry;
  readonly slugger = new GithubSlugger();

  constructor(source: string, units: UnitRegistry) {
    this.source = source;
    this.units = units;
  }

  slice(p: Pos): string {
    return this.source.slice(p.start.offset, p.end.offset);
  }

  /**
   * A block's source with its first line's indentation kept, so that re-parsing it on its
   * own gives the same tree. `slice` starts at the block's first character: for a list that
   * sits two spaces in, that drops the indentation of the first item only, and a second
   * `  - ` item then reads as nested under the first.
   */
  sliceBlock(p: Pos): string {
    return ' '.repeat(Math.max(0, p.start.column - 1)) + this.slice(p);
  }

  heading(node: MdHeading): Heading {
    const text = toString(node).trim();
    return { text, depth: node.depth, anchor: this.slugger.slug(text), pos: pos(node) };
  }

  other(node: RootContent): OtherBlock {
    const p = pos(node);
    return { kind: 'other', nodeType: node.type, raw: this.sliceBlock(p), text: toString(node), pos: p };
  }

  prose(node: Paragraph): Prose {
    const p = pos(node);
    return { kind: 'prose', raw: this.slice(p), text: toString(node), pos: p };
  }

  /** A blockquote led by a bold keyword is a callout; any other blockquote is an other-block. */
  callout(node: Blockquote): Callout | null {
    const first = node.children[0];
    if (!first || first.type !== 'paragraph') return null;
    const lead = splitLead(first, this);
    if (!lead) return null;
    const rest = node.children.slice(1).map((c) => toString(c));
    const text = [lead.text, ...rest].filter((s) => s !== '').join('\n\n');
    const raw = [lead.raw, ...node.children.slice(1).map((c) => this.slice(pos(c)))].filter((s) => s !== '').join('\n\n');
    return { kind: 'callout', keyword: lead.label, separator: lead.separator, raw, text, source: this.slice(pos(node)), pos: pos(node) };
  }

  ingredientList(node: List): IngredientList {
    return { kind: 'ingredients', items: node.children.map((item) => this.ingredientLine(item)), pos: pos(node) };
  }

  ingredientLine(item: ListItem): IngredientLine {
    const p = pos(item);
    const first = item.children[0];
    const body = item.children.length > 0 ? span(item.children[0], item.children[item.children.length - 1]) : p;
    const raw = this.slice(body);
    if (first && first.type === 'paragraph') {
      const link = first.children.find((c) => c.type === 'link');
      if (link && link.type === 'link') {
        const before = this.source.slice(pos(first).start.offset, pos(link).start.offset).trim();
        const after = this.source.slice(pos(link).end.offset, body.end.offset).trim();
        const amount = parseAmount(before, this.units);
        const split = splitRemark(after);
        const note = split.text.replace(/^,\s*/, '').trim();
        return {
          kind: 'reference',
          raw,
          label: toString(link),
          target: link.url,
          internal: link.url.startsWith('#'),
          quantity: amount.quantity,
          unit: amount.unit,
          note: note === '' ? null : note,
          remark: split.remark,
          pos: p,
        };
      }
    }
    const text = first ? toString(first) : '';
    return { kind: 'ingredient', raw, ...parseIngredientText(text, this.units), pos: p };
  }

  /** Classify the blocks found under a heading (or before the first one). */
  blocks(nodes: RootContent[]): StepBlock[] {
    const out: StepBlock[] = [];
    for (const node of nodes) {
      if (node.type === 'list' && !node.ordered) out.push(this.ingredientList(node));
      else if (node.type === 'paragraph') out.push(this.prose(node));
      else if (node.type === 'blockquote') out.push(this.callout(node) ?? this.other(node));
      else out.push(this.other(node));
    }
    return out;
  }
}

/**
 * If a paragraph opens with `**Label** — rest`, return the label, the separator as written,
 * and the rest. Returns null when the paragraph does not open with bold text.
 * A paragraph that is only bold text yields an empty rest and separator.
 */
function splitLead(
  node: Paragraph,
  ctx: Context,
): { label: string; separator: string; raw: string; text: string } | null {
  const [first, ...others] = node.children as PhrasingContent[];
  if (!first || first.type !== 'strong') return null;
  const label = toString(first).trim();
  const afterRaw = ctx.source.slice(pos(first).end.offset, pos(node).end.offset);
  const afterText = others.map((c) => toString(c)).join('');
  const m = SEPARATOR_RE.exec(afterRaw);
  if (!m) {
    if (afterRaw.trim() === '') return { label, separator: '', raw: '', text: '' };
    return null; // bold text that simply starts a sentence
  }
  const mt = SEPARATOR_RE.exec(afterText);
  return {
    label,
    separator: m[1],
    raw: afterRaw.slice(m[0].length).trim(),
    text: (mt ? afterText.slice(mt[0].length) : afterText).trim(),
  };
}

// ------------------------------------------------------------ structured form

/**
 * The marks of one instruction paragraph (SPEC §5, "Marks"): every emphasis node, in source
 * order, outermost only, as its plain text. A mark inside bold, bold inside a mark and a link
 * inside a mark all give their words; a line break or a run of spaces is one space.
 */
function marksOf(paragraph: Paragraph): string[] {
  const out: string[] = [];
  const walk = (nodes: PhrasingContent[]) => {
    for (const node of nodes) {
      if (node.type === 'emphasis') {
        const text = plainWords(node.children).replace(/\s+/g, ' ').trim();
        if (text !== '') out.push(text);
      } else if ('children' in node) walk(node.children as PhrasingContent[]);
    }
  };
  walk(paragraph.children);
  return out;
}

/** The words of inline content: text, code and alt text as written; a hard line break is a space. */
function plainWords(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'break') return ' ';
      if (node.type === 'image') return node.alt ?? '';
      if ('value' in node) return node.value;
      return 'children' in node ? plainWords(node.children as PhrasingContent[]) : '';
    })
    .join('');
}

function nest(sections: RawSection[], ctx: Context): Node[] {
  interface Frame {
    heading: Heading;
    blocks: RootContent[];
    children: Frame[];
  }
  const roots: Frame[] = [];
  const stack: Frame[] = [];
  for (const s of sections) {
    const frame: Frame = { heading: s.heading, blocks: s.blocks, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].heading.depth >= s.heading.depth) stack.pop();
    if (stack.length === 0) roots.push(frame);
    else stack[stack.length - 1].children.push(frame);
    stack.push(frame);
  }

  const build = (f: Frame): Node => {
    const blocks = ctx.blocks(f.blocks);
    const callouts = blocks.filter((b): b is Callout => b.kind === 'callout');
    if (f.children.length === 0) {
      const step: Step = {
        kind: 'step',
        heading: f.heading,
        blocks,
        ingredients: blocks.flatMap((b) => (b.kind === 'ingredients' ? b.items : [])),
        instructions: blocks.filter((b): b is Prose => b.kind === 'prose'),
        callouts,
        marks: f.blocks.flatMap((b) => (b.type === 'paragraph' ? marksOf(b) : [])),
        optional: isOptionalHeading(f.heading.text),
      };
      return step;
    }
    const component: Component = {
      kind: 'component',
      heading: f.heading,
      blocks,
      callouts,
      children: f.children.map(build),
      choose: callouts.some((c) => c.keyword === 'Choose'),
      optional: isOptionalHeading(f.heading.text),
    };
    return component;
  };
  return roots.map(build);
}

// ----------------------------------------------------------- traditional form

function readTraditional(sections: RawSection[], ctx: Context): TraditionalBody {
  const body: TraditionalBody = { ingredients: null, directions: null, notes: null, otherSections: [] };

  // Group everything under its H2; deeper headings stay inside as blocks. Under Ingredients
  // and Directions an H3 opens a part; everywhere else (and deeper than H3) it is an
  // other-block.
  const headingOf = new Map<RootContent, Heading>();
  const tops: { heading: Heading; node: MdHeading; blocks: RootContent[] }[] = [];
  for (const s of sections) {
    if (s.heading.depth === 2 || tops.length === 0) tops.push({ heading: s.heading, node: s.node, blocks: [...s.blocks] });
    else {
      headingOf.set(s.node, s.heading);
      tops[tops.length - 1].blocks.push(s.node, ...s.blocks);
    }
  }
  const partHeading = (node: RootContent): Heading | null => (node.type === 'heading' && node.depth === 3 ? (headingOf.get(node) ?? null) : null);

  for (const top of tops) {
    const last = top.blocks.length > 0 ? top.blocks[top.blocks.length - 1] : top.node;
    const sectionPos = span(top.node, last);
    const name = top.heading.text.toLowerCase();

    if (name === 'ingredients' && !body.ingredients) {
      const groups: IngredientGroup[] = [];
      const other: OtherBlock[] = [];
      for (const node of top.blocks) {
        const heading = partHeading(node);
        if (heading) {
          groups.push({ label: heading.text, labelPos: heading.pos, items: [], heading, legacy: false });
        } else if (node.type === 'paragraph' && node.children.length === 1 && node.children[0].type === 'strong') {
          groups.push({ label: toString(node).trim(), labelPos: pos(node), items: [], heading: null, legacy: true });
        } else if (node.type === 'list') {
          if (groups.length === 0) groups.push({ label: null, labelPos: null, items: [], heading: null, legacy: false });
          groups[groups.length - 1].items.push(...node.children.map((item) => ctx.ingredientLine(item)));
        } else other.push(ctx.other(node));
      }
      const count = groups.reduce((n, g) => n + g.items.length, 0);
      body.ingredients = { heading: top.heading, items: groups, other, pos: sectionPos, count };
    } else if (name === 'directions' && !body.directions) {
      const items: Direction[] = [];
      const other: OtherBlock[] = [];
      const parts: DirectionPart[] = [];
      let part: DirectionPart = { label: null, heading: null, steps: [], pos: null };
      const extend = (node: RootContent) => {
        part.pos = part.pos ? { start: part.pos.start, end: pos(node).end } : pos(node);
      };
      let none = false;
      for (const node of top.blocks) {
        const heading = partHeading(node);
        if (heading) {
          // The unnamed leading part is kept only when something stands in it.
          if (part.heading || part.pos) parts.push(part);
          part = { label: heading.text, heading, steps: [], pos: heading.pos };
          continue;
        }
        extend(node);
        if (node.type === 'list' && node.ordered) {
          const start = node.start ?? 1;
          node.children.forEach((item, i) => {
            const d = direction(item, start + i, ctx);
            items.push(d);
            part.steps.push(d);
          });
        } else if (isNonePlaceholder(node)) none = true;
        else other.push(ctx.other(node));
      }
      parts.push(part);
      body.directions = { heading: top.heading, items, other, pos: sectionPos, none, parts };
    } else if (name === 'notes' && !body.notes) {
      body.notes = readNotes(top.heading, top.node, top.blocks, ctx);
    } else {
      body.otherSections.push({ heading: top.heading, raw: ctx.slice(sectionPos), pos: sectionPos });
    }
  }
  return body;
}

function isNonePlaceholder(node: RootContent): boolean {
  return (
    node.type === 'paragraph' &&
    node.children.length === 1 &&
    node.children[0].type === 'emphasis' &&
    toString(node).trim().toLowerCase() === 'none'
  );
}

function direction(item: ListItem, number: number, ctx: Context): Direction {
  const p = pos(item);
  const first = item.children[0];
  const rest = item.children.slice(1);
  const more = rest.length > 0 ? ctx.sliceBlock(span(rest[0], rest[rest.length - 1])) : null;
  if (first && first.type === 'paragraph') {
    const lead = splitLead(first, ctx);
    if (lead && lead.separator !== '') {
      return { kind: 'direction', number, label: lead.label, raw: lead.raw, text: lead.text, more, pos: p };
    }
    return { kind: 'direction', number, label: null, raw: ctx.slice(pos(first)), text: toString(first), more, pos: p };
  }
  const whole = item.children.length > 0 ? ctx.slice(span(item.children[0], item.children[item.children.length - 1])) : '';
  return { kind: 'direction', number, label: null, raw: whole, text: toString(item), more: null, pos: p };
}

// ----------------------------------------------------------------- frontmatter

function readFrontmatter(content: RootContent[], ctx: Context): Frontmatter {
  const first = content[0];
  if (!first || first.type !== 'yaml') {
    // A file that starts with `---` but whose YAML block never closes is not parsed as
    // frontmatter at all; report that as malformed rather than missing.
    const unclosed = /^---\s*\n/.test(ctx.source);
    return { raw: null, data: null, error: unclosed ? 'frontmatter block is not closed with ---' : null, pos: null };
  }
  content.shift();
  const raw = first.value;
  try {
    const data = parseYaml(raw);
    if (data === null || data === undefined) return { raw, data: {}, error: null, pos: pos(first) };
    if (typeof data !== 'object' || Array.isArray(data)) {
      return { raw, data: null, error: 'frontmatter is not a YAML mapping', pos: pos(first) };
    }
    return { raw, data: data as Record<string, unknown>, error: null, pos: pos(first) };
  } catch (e) {
    return { raw, data: null, error: e instanceof Error ? e.message.split('\n')[0] : String(e), pos: pos(first) };
  }
}

// ------------------------------------------------------------- traditional parts

/**
 * True when a heading's qualifier designates the component or step optional (SPEC §6): the
 * qualifier after ` — ` is `optional`, `if desired` or `if using`, alone or before a comma, case
 * ignored, the words that make an ingredient optional. `Glaze — optional`, `Toast the nuts — if
 * desired`, `Seed mix — optional, for crunch`. `Dough — Day 1` and `Glaze (optional)` are not.
 */
export function isOptionalHeading(text: string): boolean {
  return isOptionalRemark(splitQualifier(text).qualifier);
}

/**
 * The key two part names pair by: a qualifier after ` — ` removed (it is a note, not part of
 * the name; SPEC §4.1), trimmed, white space collapsed, case ignored.
 * `partKey(' Pie  crust ') === partKey('pie crust')`;
 * `partKey('Dough — Day 1') === partKey('Dough')`.
 */
export function partKey(name: string): string {
  return splitQualifier(name).name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** One part of a traditional recipe: its ingredient group and its direction part, paired by name. */
export interface TraditionalPart {
  /** The part name as first written (ingredients first), or null for the unnamed leading part. */
  name: string | null;
  /** `partKey(name)`, or null for the unnamed part. */
  key: string | null;
  ingredients: IngredientGroup | null;
  directions: DirectionPart | null;
}

export interface TraditionalParts {
  /**
   * Every part, paired where the names match. Ordered by the ingredients; a direction part
   * with no ingredient group follows the part holding the direction part before it.
   */
  parts: TraditionalPart[];
  /** Named ingredient groups with no direction part of the same name. */
  unpairedIngredients: IngredientGroup[];
  /** Named direction parts with no ingredient group of the same name. */
  unpairedDirections: DirectionPart[];
}

/**
 * Pair a traditional recipe's ingredient groups with its direction parts by name. The
 * unnamed leading group pairs with the unnamed leading direction part. A name used twice in
 * one section pairs once; the repeat stays unpaired. Pure: reads the model only.
 */
export function traditionalParts(recipe: Recipe): TraditionalParts {
  const t = recipe.traditional;
  const groups = t?.ingredients?.items ?? [];
  const directionParts = t?.directions?.parts ?? [];
  const keyOf = (label: string | null) => (label === null ? null : partKey(label));

  const parts: TraditionalPart[] = groups.map((g) => ({ name: g.label, key: keyOf(g.label), ingredients: g, directions: null }));
  let after = -1; // index in `parts` of the part holding the previous direction part
  for (const d of directionParts) {
    const key = keyOf(d.label);
    let at = parts.findIndex((p) => p.directions === null && p.ingredients !== null && p.key === key);
    if (at >= 0) parts[at].directions = d;
    else {
      // The unnamed leading part with no steps of its own adds nothing.
      if (d.label === null && d.steps.length === 0 && d.pos === null) continue;
      at = after + 1;
      parts.splice(at, 0, { name: d.label, key, ingredients: null, directions: d });
    }
    after = at;
  }
  return {
    parts,
    unpairedIngredients: parts.flatMap((p) => (p.key !== null && p.ingredients && !p.directions ? [p.ingredients] : [])),
    unpairedDirections: parts.flatMap((p) => (p.key !== null && p.directions && !p.ingredients ? [p.directions] : [])),
  };
}
