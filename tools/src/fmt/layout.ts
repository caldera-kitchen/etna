// Markdown layout: the rules `etna fmt` applies (SPEC §13, Canonical source style).
//
//   - exactly one blank line between blocks (so headings and lists are surrounded by one);
//   - no blank line between the items of a list, nor before a list nested inside an item;
//   - `-` as the bullet marker;
//   - no trailing white space, no runs of blank lines, one newline at the end of the file.
//
// Lines are never re-wrapped or joined. Fenced and indented code, HTML and the frontmatter
// are passed through untouched, and so is a hard line break written as trailing spaces.

import type { List, Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { frontmatter } from 'micromark-extension-frontmatter';

import { applyEdits, type Edit } from './edits.ts';

export function parseMarkdown(source: string): Root {
  return fromMarkdown(source, {
    extensions: [frontmatter(['yaml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
  });
}

interface Range {
  start: number;
  end: number;
}

const range = (n: Nodes): Range => ({ start: n.position!.start.offset!, end: n.position!.end.offset! });

/** Node types whose source is kept byte for byte. */
const PROTECTED = new Set(['code', 'html', 'yaml', 'inlineCode', 'break']);

function walk(node: Nodes, visit: (n: Nodes) => void): void {
  visit(node);
  if ('children' in node) for (const child of node.children) walk(child, visit);
}

export interface Layout {
  /** The edits that bring the source to the canonical layout. */
  edits: Edit[];
  /** 1-based lines whose trailing spaces were kept because they are a hard line break. */
  hardBreaks: number[];
}

export function layoutEdits(source: string, tree: Root = parseMarkdown(source)): Layout {
  if (tree.children.length === 0) return { edits: [], hardBreaks: [] };
  const structural: Edit[] = []; // spacing between blocks and items: these win over line clean-up
  const protectedRanges: Range[] = [];
  const breaks: Range[] = [];
  const lists: List[] = [];
  walk(tree, (n) => {
    if (PROTECTED.has(n.type)) protectedRanges.push(range(n));
    if (n.type === 'break') breaks.push(range(n));
    if (n.type === 'list') lists.push(n);
  });

  // --- one blank line between top-level blocks -----------------------------------------
  const blocks = tree.children;
  const first = range(blocks[0]);
  const lead = source.slice(0, first.start);
  // A thematic break that moved to the first line would turn into a frontmatter fence.
  if (/^\s+$/.test(lead) && lead.includes('\n') && blocks[0].type !== 'thematicBreak') {
    structural.push({ start: 0, end: first.start, text: lead.slice(lead.lastIndexOf('\n') + 1) });
  }
  for (let i = 1; i < blocks.length; i++) {
    const start = range(blocks[i - 1]).end;
    const end = range(blocks[i]).start;
    const gap = source.slice(start, end);
    if (!gap.includes('\n') || !/^[ \t\n]*$/.test(gap)) continue;
    // Link reference definitions are customarily stacked; they are not prose blocks.
    if (blocks[i - 1].type === 'definition' && blocks[i].type === 'definition') continue;
    structural.push({ start, end, text: `\n\n${gap.slice(gap.lastIndexOf('\n') + 1)}` });
  }
  // One newline at the end. An unclosed code fence runs to the end of the file: its last
  // newline is its own, so there is nothing to add after it.
  const last = range(blocks[blocks.length - 1]);
  const tail = source.slice(last.end);
  if (/^\s*$/.test(tail) && !(tail === '' && source.endsWith('\n'))) {
    structural.push({ start: last.end, end: source.length, text: '\n' });
  }

  // --- lists: tight items, one marker --------------------------------------------------
  const siblingsOf = new Map<Nodes, Nodes[]>();
  walk(tree, (n) => {
    if ('children' in n) for (const child of n.children) siblingsOf.set(child, n.children);
  });
  for (const list of lists) {
    const tighten = (a: Nodes, b: Nodes): void => {
      const start = range(a).end;
      const end = range(b).start;
      const gap = source.slice(start, end);
      if (!/^[ \t\n]*$/.test(gap) || gap.split('\n').length < 3) return;
      structural.push({ start, end, text: `\n${gap.slice(gap.lastIndexOf('\n') + 1)}` });
    };
    for (let i = 1; i < list.children.length; i++) tighten(list.children[i - 1], list.children[i]);
    // Inside an item, a nested list sits right under the text above it: a list may follow a
    // paragraph with no blank line, and the item then reads as tight on both sides.
    for (const item of list.children) {
      for (let i = 1; i < item.children.length; i++) {
        if (item.children[i].type === 'list') tighten(item.children[i - 1], item.children[i]);
      }
    }
    if (list.ordered) continue;
    // Two bullet lists side by side are told apart by their markers; unifying the markers
    // would merge them, so leave both as written.
    const siblings = siblingsOf.get(list) ?? [];
    const at = siblings.indexOf(list);
    const neighbor = (n: Nodes | undefined) => n !== undefined && n.type === 'list' && !n.ordered;
    if (neighbor(siblings[at - 1]) || neighbor(siblings[at + 1])) continue;
    const markers: Edit[] = [];
    let safe = true;
    for (const item of list.children) {
      const start = range(item).start;
      const marker = source[start];
      if (marker === '-') continue;
      const eol = source.indexOf('\n', start);
      const rest = source.slice(start + 1, eol === -1 ? source.length : eol);
      // `-` alone under a paragraph is a heading underline; `- - -` is a thematic break.
      if ((marker !== '*' && marker !== '+') || rest.trim() === '' || /^[ \t]*(?:-[ \t]*){2,}$/.test(rest)) {
        safe = false;
        break;
      }
      markers.push({ start, end: start + 1, text: '-' });
    }
    if (safe) structural.push(...markers);
  }

  // --- line clean-up: trailing white space and runs of blank lines ---------------------
  const cleanup: Edit[] = [];
  const hardBreaks: number[] = [];
  let lineNumber = 0;
  const isProtected = (start: number, end: number) => protectedRanges.some((r) => start < r.end && r.start < end);
  let offset = 0;
  let blankRunStart = -1; // offset just after the first blank line of the current run
  for (const text of source.split('\n')) {
    const lineStart = offset;
    const lineEnd = offset + text.length;
    offset = lineEnd + 1;
    lineNumber++;
    const blank = text.trim() === '';
    if (blank && lineEnd < source.length && !isProtected(lineStart, lineEnd + 1)) {
      if (blankRunStart !== -1) {
        cleanup.push({ start: lineStart, end: lineEnd + 1, text: '' }); // a second blank line: drop it whole
        continue;
      }
      blankRunStart = lineEnd + 1;
    } else blankRunStart = -1;
    const trailing = /[ \t]+$/.exec(text);
    if (!trailing) continue;
    const from = lineStart + trailing.index;
    const to = Math.min(lineEnd + 1, source.length);
    if (!isProtected(from, to)) cleanup.push({ start: from, end: lineEnd, text: '' });
    else if (breaks.some((r) => from < r.end && r.start < to)) hardBreaks.push(lineNumber);
  }

  // Structural edits first: applyEdits drops whatever overlaps an earlier edit.
  return { edits: [...structural, ...cleanup], hardBreaks };
}

/**
 * The shape of a Markdown document without its layout: node types, nesting and text.
 * Two sources with the same shape differ only in white space, bullet markers and list
 * spacing — which is all the layout pass may change.
 */
export function shapeOf(tree: Root): string {
  const shape = (n: Nodes): unknown => {
    const out: unknown[] = [n.type];
    if ('value' in n) out.push(n.value);
    if (n.type === 'heading') out.push(n.depth);
    if (n.type === 'list') out.push(n.ordered ?? false, n.start ?? null);
    if (n.type === 'link' || n.type === 'image' || n.type === 'definition') out.push(n.url, n.title ?? null);
    if (n.type === 'code') out.push(n.lang ?? null, n.meta ?? null);
    if ('children' in n) out.push(n.children.map(shape));
    return out;
  };
  return JSON.stringify(shape(tree));
}

/**
 * Apply the layout rules. `text` is null when the result would not read as the same
 * document, in which case nothing should be changed.
 */
export function applyLayout(source: string): { text: string | null; hardBreaks: number[] } {
  const tree = parseMarkdown(source);
  const { edits, hardBreaks } = layoutEdits(source, tree);
  const out = applyEdits(source, edits);
  if (out === source) return { text: source, hardBreaks };
  return { text: shapeOf(parseMarkdown(out)) === shapeOf(tree) ? out : null, hardBreaks };
}
