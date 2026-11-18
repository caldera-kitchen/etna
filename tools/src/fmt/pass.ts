// One formatting pass over a recipe: content edits, then layout.

import type { Nodes, Root } from 'mdast';

import {
  parseRecipe,
  type Callout,
  type IngredientLine,
  type Node,
  type OtherBlock,
  type Pos,
  type Recipe,
  type StepBlock,
  type UnitRegistry,
} from '../core/index.ts';
import { applyEdits, lineAt, type Edit } from './edits.ts';
import { orderFrontmatter } from './frontmatter.ts';
import type { FormatNote } from './index.ts';
import { canonicalAmount, formatIngredientText, leadingAmount } from './ingredient.ts';
import { applyLayout, parseMarkdown } from './layout.ts';
import { meaningOf } from './meaning.ts';
import { migrateParts } from './parts.ts';
import { scaleContext, scanTemperatures, undecidedMessage, type ScaleContext } from './temperature.ts';

export interface FirstPass {
  recipe: Recipe;
  notes: FormatNote[];
}

/**
 * One formatting pass: content edits (checked against the recipe's meaning), then layout
 * (checked against the document's shape). Notes are collected on the first pass only, so
 * their line numbers refer to the text the author has.
 */
export function formatOnce(text: string, units: UnitRegistry, first: FirstPass | null = null): string {
  const recipe = first?.recipe ?? parseRecipe(text, { units });
  const notes = first?.notes ?? [];

  // What the recipe says about its temperature scale decides the bare `350 degrees`.
  const tree = parseMarkdown(text);
  const texts = textRanges(tree);
  let context = scaleContext(texts.flatMap((t) => scanTemperatures(text.slice(t.start, t.end)).stated));
  let found = contentEdits(recipe, units, context, texts, tree);
  if (context === 'none' && found.valueDecided) {
    // A bare temperature of 300 or more was read as °F. Once written, that °F is what the
    // recipe states, and the next run would apply it to every other bare temperature —
    // so apply it now, and one run is enough.
    context = 'F';
    found = contentEdits(recipe, units, context, texts, tree);
  }
  notes.push(...found.notes);

  let content = applyEdits(text, found.edits);
  if (content !== text && meaningOf(parseRecipe(content, { units }), context) !== meaningOf(recipe, context)) {
    notes.push({ line: 1, message: 'quantities, units, labels and temperatures left as written: a rewrite would have changed how the recipe reads' });
    content = text;
  }

  // Traditional parts: bold-line groups and run-heading labels become `###` headings.
  content = migrateParts(content, units, context, first ? notes : null);

  const laid = applyLayout(content);
  if (laid.text === null) {
    notes.push({ line: 1, message: 'layout left as written: a rewrite would have changed the Markdown structure' });
    return content;
  }
  // Content edits never add or remove a line, so these line numbers are the author's — unless
  // part headings were just written, which adds lines above the later ones.
  for (const line of laid.hardBreaks) notes.push({ line, message: 'trailing spaces kept: they are a hard line break' });
  return laid.text;
}

// ---------------------------------------------------------------- content edits

interface TextRange {
  start: number;
  end: number;
}

/** Where the literal text of the document is: code spans, link destinations and HTML are other nodes. */
function textRanges(tree: Root): TextRange[] {
  const texts: TextRange[] = [];
  const collect = (n: { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[] }) => {
    if (n.type === 'text' && n.position) texts.push({ start: n.position.start.offset!, end: n.position.end.offset! });
    for (const child of n.children ?? []) collect(child as Parameters<typeof collect>[0]);
  };
  collect(tree);
  return texts;
}

/**
 * A mark written with underscores is written with asterisks (SPEC §13, "Marks"): in a
 * structured step's instruction, `_x_` becomes `*x*`, and bold with emphasis `___x___`
 * becomes `***x***`. Only the delimiters are replaced; the words, and where the mark begins
 * and ends, are not part of any edit. Bold on its own is not a mark and is left as written.
 */
function markEdits(source: string, tree: Root, instructions: Pos[], edits: Edit[]): void {
  const inside = (n: Nodes) => instructions.some((p) => p.start.offset <= n.position!.start.offset! && n.position!.end.offset! <= p.end.offset);
  const underscored = (n: Nodes) => n.position !== undefined && source[n.position.start.offset!] === '_';
  const swap = (n: Nodes, width: number) => {
    const start = n.position!.start.offset!;
    const end = n.position!.end.offset!;
    edits.push({ start, end: start + width, text: '*'.repeat(width) });
    edits.push({ start: end - width, end, text: '*'.repeat(width) });
  };
  /** Bold and emphasis written as one run of three underscores on each side, either way nested. */
  const sameRun = (outer: Nodes, inner: Nodes, width: number) =>
    inner.position!.start.offset! === outer.position!.start.offset! + width && inner.position!.end.offset! === outer.position!.end.offset! - width;
  const walk = (n: Nodes, parent: Nodes | null) => {
    if (n.type === 'emphasis' && underscored(n) && inside(n)) {
      swap(n, 1);
      const only = n.children.length === 1 ? n.children[0] : null;
      if (only && only.type === 'strong' && underscored(only) && sameRun(n, only, 1)) swap(only, 2);
      if (parent && parent.type === 'strong' && underscored(parent) && parent.children.length === 1 && sameRun(parent, n, 2)) swap(parent, 2);
    }
    if ('children' in n) for (const child of n.children) walk(child as Nodes, n);
  };
  walk(tree, null);
}

interface ContentEdits {
  edits: Edit[];
  notes: FormatNote[];
  /** True when a bare temperature was given °F for its value alone (300 or more). */
  valueDecided: boolean;
}

function contentEdits(recipe: Recipe, units: UnitRegistry, context: ScaleContext, texts: TextRange[], tree: Root): ContentEdits {
  const source = recipe.source;
  const edits: Edit[] = [];
  const notes: FormatNote[] = [];
  let valueDecided = false;
  /** Blocks whose prose may have its temperature notation rewritten. */
  const prose: Pos[] = [];
  /** A structured step's instruction paragraphs: where a mark is (SPEC §5.3). */
  const instructions: Pos[] = [];

  frontmatterEdit(recipe, edits, notes);

  const lines: IngredientLine[] = [];
  const callouts: Callout[] = [];
  const visitBlocks = (blocks: StepBlock[], isStep: boolean) => {
    for (const b of blocks) {
      if (b.kind === 'ingredients') lines.push(...b.items);
      else if (b.kind === 'callout') callouts.push(b);
      else if (b.kind === 'prose' && isStep) {
        prose.push(b.pos);
        instructions.push(b.pos);
      }
    }
  };
  const visit = (n: Node) => {
    visitBlocks(n.blocks, n.kind === 'step');
    if (n.kind === 'component') n.children.forEach(visit);
  };
  recipe.nodes.forEach(visit);

  const t = recipe.traditional;
  if (t) {
    for (const group of t.ingredients?.items ?? []) lines.push(...group.items);
    for (const d of t.directions?.items ?? []) {
      prose.push(d.pos);
      if (d.label !== null) {
        const marker = /^\d{1,9}[.)][ \t]+/.exec(source.slice(d.pos.start.offset, d.pos.end.offset));
        if (marker) leadEdits(source, d.pos.start.offset + marker[0].length, d.label, edits);
      }
    }
    // Directions written some other way (a bullet list, a paragraph between the numbered
    // steps) are still directions.
    for (const o of t.directions?.other ?? []) if (isProseBlock(o)) prose.push(o.pos);
  }
  // The notes, in either form, are formatted alike: a lead's separator and the temperatures
  // in their running text (a list or blockquote there is still notes).
  for (const n of recipe.notes?.items ?? []) {
    prose.push(n.pos);
    if (n.label === null) continue;
    if (n.form === 'paragraph') leadEdits(source, n.pos.start.offset, n.label, edits);
    else {
      // A list note: the lead follows the item's marker, as a labeled direction's does.
      const marker = /^[-*+][ \t]+/.exec(source.slice(n.pos.start.offset, n.pos.end.offset));
      if (marker) leadEdits(source, n.pos.start.offset + marker[0].length, n.label, edits);
    }
  }
  for (const o of recipe.notes?.other ?? []) if (isProseBlock(o)) prose.push(o.pos);

  for (const line of lines) if (ingredientEdit(source, line, units, context, edits, notes)) valueDecided = true;

  for (const c of callouts) {
    prose.push(c.pos);
    if (c.separator === '') continue; // a bare `> **Keyword**` has nothing to normalize
    const open = /^>[ \t]*/.exec(source.slice(c.pos.start.offset, c.pos.end.offset));
    if (!open) continue;
    const at = c.pos.start.offset + open[0].length;
    if (leadEdits(source, at, c.keyword, edits)) edits.push({ start: c.pos.start.offset, end: at, text: '> ' });
  }

  if (temperatureEdits(source, prose, context, texts, edits, notes)) valueDecided = true;
  if (recipe.form === 'structured') markEdits(source, tree, instructions, edits);
  return { edits, notes, valueDecided };
}

/** Blocks of a Directions or Notes section that hold running text (not code, HTML or a sub-heading). */
export function isProseBlock(block: OtherBlock): boolean {
  return block.nodeType === 'paragraph' || block.nodeType === 'list' || block.nodeType === 'blockquote';
}

function frontmatterEdit(recipe: Recipe, edits: Edit[], notes: FormatNote[]): void {
  const fm = recipe.frontmatter;
  if (fm.raw === null || fm.data === null || fm.pos === null) return;
  const result = orderFrontmatter(fm.raw, fm.data);
  if (result.reason) notes.push({ line: fm.pos.start.line, message: result.reason });
  if (result.text === null) return;
  // The YAML sits between the first and the last line of the block (the `---` fences).
  const block = recipe.source.slice(fm.pos.start.offset, fm.pos.end.offset);
  const from = block.indexOf('\n') + 1;
  const to = block.lastIndexOf('\n');
  if (from <= 0 || to < from || block.slice(from, to) !== fm.raw) {
    notes.push({ line: fm.pos.start.line, message: 'frontmatter keys left in their order: the YAML could not be located in the source' });
    return;
  }
  edits.push({ start: fm.pos.start.offset + from, end: fm.pos.start.offset + to, text: result.text });
}

const LEAD_RE = /^(\*\*|__)(.+?)\1([ \t]*(?:—|–|--|-|:)[ \t]+)/;

/**
 * Canonicalize `**Label** — ` at `offset`: asterisks for the bold, an em dash with single
 * spaces after it. Only the delimiters and the separator are replaced; the label and the
 * text after it are not part of any edit. Returns false when the lead is not plain enough.
 */
function leadEdits(source: string, offset: number, label: string, edits: Edit[]): boolean {
  const eol = source.indexOf('\n', offset);
  const m = LEAD_RE.exec(source.slice(offset, eol === -1 ? source.length : eol));
  if (!m || m[2] !== label) return false;
  const close = offset + 2 + m[2].length;
  if (m[1] !== '**') {
    edits.push({ start: offset, end: offset + 2, text: '**' });
    edits.push({ start: close, end: close + 2, text: '**' });
  }
  edits.push({ start: close + 2, end: close + 2 + m[3].length, text: ' — ' });
  return true;
}

const MARKER_RE = /^([-*+]|\d{1,9}[.)])([ \t]{1,4})/;

/** Returns true when a bare temperature in the note was given °F for its value alone. */
function ingredientEdit(source: string, line: IngredientLine, units: UnitRegistry, context: ScaleContext, edits: Edit[], notes: FormatNote[]): boolean {
  const start = line.pos.start.offset;
  const item = source.slice(start, line.pos.end.offset);
  const newline = item.indexOf('\n');
  const whole = newline === -1; // the item is this one line and nothing else
  const firstLine = whole ? item : item.slice(0, newline);
  const marker = MARKER_RE.exec(firstLine);
  if (!marker) return false;
  const content = firstLine.slice(marker[0].length);
  if (content === '' || /^[ \t]/.test(content)) return false;

  // Read the amount from the source and make sure it is the one the parser saw: inline
  // markup or a character reference in front would make the two disagree.
  const amount = leadingAmount(content, units);
  if ((amount?.quantity.raw ?? null) !== (line.quantity?.raw ?? null)) return false;
  if ((amount?.unit?.raw ?? null) !== (line.unit?.raw ?? null)) return false;

  let out: string;
  let valueDecided = false;
  if (line.kind === 'reference') {
    // Only a leading amount is canonicalized; the link is untouched.
    if (!amount) return false;
    const rest = content.slice(amount.length);
    out = canonicalAmount(amount.quantity, amount.unit) + (/^[ \t]*\[/.test(rest) ? ` ${rest.replace(/^[ \t]+/, '')}` : rest);
  } else {
    if (whole ? content.trimEnd() !== line.raw.trimEnd() : !line.raw.startsWith(content.trimEnd())) return false;
    const result = formatIngredientText(content, units, whole, context);
    out = result.text;
    valueDecided = result.valueDecided;
    for (const b of result.bare) notes.push({ line: line.pos.start.line, message: undecidedMessage(b) });
  }
  // A single-line item also gets exactly one space after its marker.
  const spacing = whole ? ' ' : marker[2];
  edits.push({ start: start + marker[1].length, end: start + firstLine.length, text: spacing + out });
  return valueDecided;
}

/**
 * Rewrite temperature notation in the given blocks and report the temperatures whose scale
 * stays undecided. Each block is scanned as a whole, so a range or an angle is seen in its
 * sentence, but only what lies in literal text is touched or reported.
 * Returns true when a bare temperature was given °F for its value alone.
 */
function temperatureEdits(source: string, blocks: Pos[], context: ScaleContext, texts: TextRange[], edits: Edit[], notes: FormatNote[]): boolean {
  const inText = (start: number, end: number) => texts.some((t) => t.start <= start && end <= t.end);
  let valueDecided = false;
  for (const block of blocks) {
    const base = block.start.offset;
    const scan = scanTemperatures(source.slice(base, block.end.offset), context);
    for (const e of scan.edits) {
      if (!inText(base + e.from, base + e.end)) continue;
      edits.push({ start: base + e.start, end: base + e.end, text: e.text });
      if (e.decidedBy === 'value') valueDecided = true;
    }
    for (const b of scan.bare) {
      if (inText(base + b.index, base + b.end)) notes.push({ line: lineAt(source, base + b.index), message: undecidedMessage(b) });
    }
  }
  return valueDecided;
}
