// HTML escaping, and a minimal Markdown → HTML renderer for recipe prose on a card.
//
// Nothing from a recipe reaches the output except through `esc` (text and attributes). Raw
// HTML written in a recipe is shown as text, never emitted.
//
// Italic is for the chart, bold is for the card (ADR 0021, SPEC §8): emphasis (`*x*`, `_x_`)
// prints as plain text everywhere on a card, since in a step's instruction it marks words for
// the chart's box; bold prints bold.

import type { Nodes, PhrasingContent, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML content or a quoted attribute value. */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/**
 * Links a card may carry: web, mail, in-page and relative. Anything else prints as plain text,
 * a protocol-relative `//host/…` included (opened from disk it is `file://host/…`, on Windows a
 * network share).
 */
export function safeUrl(url: string): string | null {
  const compact = url.replace(/[\u0000- ]/g, '');
  if (/^[\\/][\\/]/.test(compact)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
  if (scheme && !['http', 'https', 'mailto'].includes(scheme[1].toLowerCase())) return null;
  return compact;
}

/**
 * The href of a link written in recipe prose: a safeUrl, and, when relative, one that stays in
 * the recipe's own folder. A card opened from disk would otherwise link to any file on the
 * computer (`../../../etc/passwd`, `/etc/passwd`). Null: print the text alone.
 */
export function linkHref(url: string): string | null {
  const safe = safeUrl(url);
  if (safe === null || safe.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(safe)) return safe;
  let path = safe.replace(/[?#].*$/s, '');
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (/^[\\/]/.test(path) || path.split(/[\\/]/).includes('..')) return null;
  return safe;
}

/**
 * The plain text of a short inline fragment the parser keeps as written (a reference's note or
 * remark): emphasis, bold and link syntax taken out, as an ingredient's own note already is.
 * A fragment that does not read as one paragraph (`1. …`, `# …`) is returned as written.
 */
export function inlineText(source: string): string {
  const children = source.trim() === '' ? [] : fromMarkdown(source).children;
  if (children.length !== 1 || children[0].type !== 'paragraph') return source;
  return toString(children[0]);
}

/** A rendered block: `p` is the inner HTML of a paragraph, `block` is a complete element. */
export interface Block {
  kind: 'p' | 'block';
  html: string;
}

/** Render Markdown source to blocks. Paragraphs come back unwrapped so the caller picks the tag and class. */
export function markdownBlocks(source: string): Block[] {
  if (source.trim() === '') return [];
  return fromMarkdown(source).children.map(block);
}

/** Render Markdown source to HTML, paragraphs as `<p>` (with an optional class). */
export function markdownHtml(source: string, paragraphClass?: string): string {
  return blocksHtml(markdownBlocks(source), paragraphClass);
}

export function blocksHtml(blocks: Block[], paragraphClass?: string): string {
  const open = paragraphClass ? `<p class="${esc(paragraphClass)}">` : '<p>';
  return blocks.map((b) => (b.kind === 'p' ? `${open}${b.html}</p>` : b.html)).join('');
}

function block(node: RootContent): Block {
  switch (node.type) {
    case 'paragraph':
      return { kind: 'p', html: inline(node.children) };
    case 'heading':
      return { kind: 'p', html: `<strong>${inline(node.children)}</strong>` };
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = node.ordered && node.start != null && node.start !== 1 ? ` start="${node.start}"` : '';
      const items = node.children.map((item) => {
        const only = item.children.length === 1 ? item.children[0] : null;
        const inner = only && only.type === 'paragraph' ? inline(only.children) : blocksHtml(item.children.map(block));
        return `<li>${inner}</li>`;
      });
      return { kind: 'block', html: `<${tag} class="md-list"${start}>${items.join('')}</${tag}>` };
    }
    case 'blockquote':
      return { kind: 'block', html: `<blockquote class="md-quote">${blocksHtml(node.children.map(block))}</blockquote>` };
    case 'code':
      return { kind: 'block', html: `<pre class="md-code">${esc(node.value)}</pre>` };
    case 'thematicBreak':
      return { kind: 'block', html: '<hr class="md-rule">' };
    case 'html':
      return { kind: 'p', html: esc(node.value) };
    default:
      return { kind: 'p', html: esc(toString(node as Nodes)) };
  }
}

function inline(nodes: PhrasingContent[]): string {
  return nodes.map(phrase).join('');
}

function phrase(node: PhrasingContent): string {
  switch (node.type) {
    case 'text':
      return esc(node.value);
    case 'emphasis':
      return inline(node.children);
    case 'strong':
      return `<strong>${inline(node.children)}</strong>`;
    case 'inlineCode':
      return `<code>${esc(node.value)}</code>`;
    case 'break':
      return '<br>';
    case 'link': {
      const url = linkHref(node.url);
      const text = inline(node.children);
      if (url === null) return text;
      // A link out of the card opens in a new window, never in the card's own frame: a page
      // loaded there would inherit the frame's permissions. (Where new windows are not
      // allowed, as in the GUI's sandboxed frame, the host page opens the link itself.)
      const out = url.startsWith('#') ? '' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${esc(url)}"${out}>${text}</a>`;
    }
    case 'image':
      return esc(node.alt ?? '');
    case 'html':
      return esc(node.value);
    default:
      return esc(toString(node as Nodes));
  }
}
