// The paging script: the one script a card document runs. It cuts the card into page boxes of
// the paper's size and, when fitting is on, chooses the text size (fit.ts). The renderer inserts
// its text into every paged card and admits exactly that text by its hash in the page's
// Content-Security-Policy (render.ts). Documented for theme authors in themes/README.md.
//
// Rules for this file:
// - `pagingProgram` runs in the card document, not here: it is shipped as its own source text
//   (Function.prototype.toString), so it must not refer to anything outside its body except its
//   parameter, and must run in every current browser without a build step.
// - The card's content is data. The program moves and clones existing nodes, reads computed
//   styles and sets text with textContent and lengths with element.style. It never builds markup
//   from text (no innerHTML, insertAdjacentHTML, document.write), never evaluates text (no eval,
//   Function, string timers), and loads nothing.
// - The card's markup comes from a theme, which may be a stranger's. An element with a `name`
//   (or `id`) can shadow a property of `document` ("DOM clobbering"), so every document method
//   and getter is taken once from Document.prototype and called on the document explicitly.
//   Whatever goes wrong, the card ends in a defined state: paged (`data-paged="done"`), or the
//   original flow left in place and printable (`data-paged="failed"`).
//
// How it pages. The card's content arrives as an ordinary flow (`body > .card-flow`), which is
// also what a reader without scripts gets. The program builds one `.sheet` per page and fills
// its `.sheet-content` box node by node:
// - an element that fits is cloned whole;
// - one that does not is split — its shell cloned and its children placed one by one, or, for a
//   block of text, cut at a line (at least two lines on each side when it has four or more) —
//   or moved whole to the next page. It is moved whole only when it is to be kept whole (a text
//   block, or `break-inside: avoid`) and that is worth it: it fits on a fresh page, and the page
//   it leaves is at least half full;
// - a heading (h1–h6, a header, a group label, anything with `break-after: avoid`) is never left
//   last on a page: it goes to the next page with what follows it, across containers too.
// Each new page re-creates the containers that were open (`card-continued`). Side-by-side
// containers (a grid with two or more columns, a flex row, a block that says its children are
// set side by side: `--card-side-by-side: yes`) fill each column independently. A
// multi-column container is given the height left on its page so its columns fill top to bottom.

import type { FitDecision, FitRule, Layout } from './fit.ts';

type DecideFit = (rule: FitRule, measure: (size: number) => Layout) => FitDecision;

export function pagingProgram(decideFit: DecideFit): void {
  // ---- the document, reached only through its prototype (see "DOM clobbering" above)
  const D = Document.prototype;
  const get = (proto: object, name: string) => (Object.getOwnPropertyDescriptor(proto, name) as PropertyDescriptor).get as () => unknown;
  const doc = document;
  const root = get(D, 'documentElement').call(doc) as HTMLElement;
  const docQuery = D.querySelector;
  const docById = D.getElementById;
  const docCreate = D.createElement;
  const docRange = D.createRange;
  const docWalker = D.createTreeWalker;
  const dispatch = EventTarget.prototype.dispatchEvent;
  const create = (tag: string) => docCreate.call(doc, tag) as HTMLElement;

  const found = docQuery.call(doc, 'body > .card-flow') as HTMLElement | null;
  if (found === null || root.hasAttribute('data-paged')) return;
  const flow: HTMLElement = found;
  root.setAttribute('data-paged', 'working');
  const flowParent = flow.parentNode;
  const flowNext = flow.nextSibling;
  const holder = create('div');

  // Whatever went wrong: no pages, the flow back where it was, printable with its own @page rules.
  const fail = (error: unknown) => {
    try {
      holder.remove();
      if (flow.parentNode === null && flowParent !== null) flowParent.insertBefore(flow, flowNext);
      root.style.removeProperty('--card-font-size');
      const print = docById.call(doc, 'card-print-paged') as Element | null;
      if (print !== null) print.setAttribute('media', 'not all');
      root.removeAttribute('data-overflow');
      root.setAttribute('data-paging-error', String(error).slice(0, 300));
    } finally {
      root.setAttribute('data-paged', 'failed');
      try {
        dispatch.call(doc, new CustomEvent('etna-paged', { detail: { failed: true } }));
      } catch {
        // Nothing more to do: the flow is the card.
      }
    }
  };

  try {
    const program = setUp();
    // Measure with the card's own fonts: load every face the document declares, for three
    // seconds at most, then page.
    void flow.offsetHeight;
    const fonts = get(D, 'fonts').call(doc) as FontFaceSet;
    const faces = Array.from(fonts as unknown as Iterable<FontFace>, (face) => face.load().catch(() => null));
    const wait = new Promise((resolve) => setTimeout(resolve, 3000));
    Promise.race([Promise.all(faces).then(() => fonts.ready), wait]).then(program, program);
  } catch (error) {
    fail(error);
  }

  function setUp(): () => void {
    type Seq = { i: number; inner: Token | null };
    type Rest = { rest: Element };
    type Par = { par: (Token | 'start' | 'done')[]; empty: boolean };
    type Token = Seq | Par | Rest;
    type Ctx = { content: HTMLElement; top: number; bottom: number; right: number; height: number; units: number };

    const MAX_PAGES = 120;
    const data = root.dataset;
    holder.className = 'card-sheets';
    // Visible content placed in an element on this page, headings not counted.
    const placedCount = new WeakMap<Element, number>();
    const multicols = new WeakSet<Element>();
    let sheets: HTMLElement[] = [];
    let ctx: Ctx;
    let overflowed = false;

    const style = (el: Element) => getComputedStyle(el);
    const px = (v: string) => parseFloat(v) || 0;
    const make = (tag: string, cls: string): HTMLElement => {
      const el = create(tag);
      el.className = cls;
      return el;
    };

    const newSheet = (): HTMLElement => {
      const sheet = make('div', 'sheet');
      const box = make('div', 'sheet-box');
      box.append(make('div', 'sheet-content'));
      sheet.append(box);
      return sheet;
    };

    // Padding and border below `el` inside its ancestors, up to the page or a multi-column box.
    const below = (el: Element): number => {
      let extra = 0;
      for (let a = el.parentElement; a !== null && a !== ctx.content && !multicols.has(a); a = a.parentElement) {
        const cs = style(a);
        extra += px(cs.paddingBottom) + px(cs.borderBottomWidth);
      }
      return extra;
    };
    const multicolOf = (el: Element, content: Element): Element | null => {
      for (let a = el.parentElement; a !== null && a !== content; a = a.parentElement) if (multicols.has(a)) return a;
      return null;
    };
    const overflows = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.bottom + below(el) > ctx.bottom + 0.5) return true;
      return multicolOf(el, ctx.content) !== null && r.right > ctx.right + 0.5;
    };
    const visible = (el: Element): boolean => {
      for (const r of Array.from(el.getClientRects())) if (r.height > 0 && r.width > 0) return true;
      return false;
    };
    // Something that must not end a page: it belongs with what follows.
    const heading = (el: Element): boolean => {
      if (/^(H[1-6]|HEADER|TH)$/.test(el.tagName)) return true;
      // A block that asks to stay with what follows, when it is small enough to go along.
      if (/avoid/.test(style(el).breakAfter)) return el.getBoundingClientRect().height <= ctx.height * 0.25;
      if (el.matches('.ingr-group-label, .card-label, .step-head, .choose-label, .branch-label')) return true;
      if (el.tagName === 'TR') return Array.from(el.children).every((c) => c.tagName === 'TH' || !visible(c));
      return false;
    };

    const count = (el: Element, by: number) => {
      for (let a: Element | null = el; a !== null && a !== ctx.content; a = a.parentElement) placedCount.set(a, (placedCount.get(a) ?? 0) + by);
      ctx.units += by;
    };
    const place = (el: Element) => {
      if (visible(el) && !heading(el)) count(el, 1);
    };
    const unplace = (el: Element) => count(el, -(placedCount.get(el) ?? 0));
    const placed = (el: Element) => (placedCount.get(el) ?? 0) > 0;

    // How far down the page content reaches, as a fraction (a multi-column box column by column).
    const fillOf = (content: Element): number => {
      const box = content.getBoundingClientRect();
      let lowest = box.top;
      for (const el of Array.from(content.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        let bottom = r.bottom;
        const m = multicolOf(el, content);
        if (m !== null) {
          const mr = m.getBoundingClientRect();
          const cs = style(m);
          const n = Math.max(1, Math.round(Number(cs.columnCount) || 1));
          const gap = px(cs.columnGap);
          const width = (mr.width - (n - 1) * gap) / n;
          const col = Math.min(n - 1, Math.max(0, Math.floor((r.left - mr.left + 1) / (width + gap))));
          bottom = mr.top + (col * mr.height + (r.bottom - mr.top)) / n;
        }
        if (bottom > lowest) lowest = bottom;
      }
      return Math.min(1, Math.max(0, (lowest - box.top) / box.height));
    };

    const isMulticol = (cs: CSSStyleDeclaration) => (cs.columnCount !== 'auto' && Number(cs.columnCount) > 1) || cs.columnWidth !== 'auto';
    const isParallel = (el: Element): boolean => {
      if (el.childElementCount < 2) return false;
      const cs = style(el);
      if (cs.display === 'grid' || cs.display === 'inline-grid') {
        const tracks = cs.gridTemplateColumns.replace(/\[[^\]]*\]/g, ' ').replace(/\([^()]*(\([^()]*\)[^()]*)*\)/g, '').trim();
        return tracks !== 'none' && tracks.split(/\s+/).length >= 2;
      }
      if ((cs.display === 'flex' || cs.display === 'inline-flex') && cs.flexDirection.startsWith('row') && cs.flexWrap === 'nowrap') return true;
      // Columns made another way (one floated beside the others): only the theme knows, and says
      // so. The core registers the property as not inherited, so it marks that one container.
      return cs.getPropertyValue('--card-side-by-side').trim() === 'yes';
    };
    // A container of blocks, to be split between its children.
    const container = (el: Element): boolean => {
      if (el.firstElementChild === null) return false;
      if (/^(table-row|table-cell|contents)$|^inline/.test(style(el).display)) return false;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === 3 && /\S/.test((n as Text).data)) return false;
        if (n.nodeType === 1) {
          const d = style(n as Element).display;
          if (d.startsWith('inline') || d === 'table-cell' || d === 'contents') return false;
        }
      }
      return true;
    };
    // A block of text (and inline elements), to be cut between two lines.
    const textBlock = (el: Element): boolean => {
      const d = style(el).display;
      if (!/^(block|list-item|flow-root)$/.test(d)) return false;
      return /\S/.test(el.textContent ?? '') && !container(el);
    };

    // A shell: the element without its children, on this page.
    const shell = (src: Element, continued: boolean, dst: Element): Element => {
      const el = src.cloneNode(false) as Element;
      if (continued) {
        el.classList.add('card-continued');
        el.removeAttribute('id');
      }
      dst.append(el);
      if (isMulticol(style(el))) {
        multicols.add(el);
        const h = el as HTMLElement;
        h.style.boxSizing = 'border-box';
        h.style.columnFill = 'auto';
        h.style.height = `${Math.max(0, ctx.bottom - below(el) - el.getBoundingClientRect().top)}px`;
      }
      return el;
    };

    // The text of `el` as (node, offset) positions: the position before character `k`.
    const textAt = (el: Element, k: number): [Text, number] | null => {
      const walker = docWalker.call(doc, el, 4) as TreeWalker;
      let seen = 0;
      while (walker.nextNode()) {
        const t = walker.currentNode as Text;
        if (k <= seen + t.length) return [t, k - seen];
        seen += t.length;
      }
      return null;
    };
    const textLength = (el: Element) => (el.textContent ?? '').length;

    // Cut the block of text `whole` (on the page, overflowing) between two lines: `whole` keeps
    // the lines that fit, and the rest comes back as a new element. Null when it cannot be cut
    // with at least one line on each side (two when it has four lines or more); `whole` is then
    // as it was.
    const cutText = (whole: Element): Element | null => {
      const range = docRange.call(doc) as Range;
      range.selectNodeContents(whole);
      const lines: { top: number; bottom: number }[] = [];
      for (const r of Array.from(range.getClientRects())) {
        if (r.height <= 0 || r.width <= 0) continue;
        const line = lines.find((l) => r.top < l.bottom - 1 && r.bottom > l.top + 1);
        if (line) {
          line.top = Math.min(line.top, r.top);
          line.bottom = Math.max(line.bottom, r.bottom);
        } else lines.push({ top: r.top, bottom: r.bottom });
      }
      lines.sort((a, b) => a.top - b.top);
      const total = lines.length;
      const least = total >= 4 ? 2 : 1;
      const cs = style(whole);
      const limit = ctx.bottom - below(whole) - px(cs.paddingBottom) - px(cs.borderBottomWidth);
      let fit = Math.min(lines.filter((l) => l.bottom <= limit + 0.5).length, total - least);
      const n = textLength(whole);
      const original = whole.cloneNode(true) as Element;
      // The lines' glyph boxes are not the line boxes: cut, check, and cut a line earlier if need be.
      for (; fit >= least; fit--) {
        const breakTop = lines[fit].top;
        const startsLine = (k: number): boolean => {
          const at = textAt(whole, k);
          if (at === null) return true;
          const [node, offset] = at;
          if (offset >= node.length) return false;
          range.setStart(node, offset);
          range.setEnd(node, offset + 1);
          const r = range.getBoundingClientRect();
          return r.height > 0 && r.top >= breakTop - 1;
        };
        let lo = 0;
        let hi = n;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (startsLine(mid)) hi = mid;
          else lo = mid + 1;
        }
        const k = lo;
        if (k <= 0 || k >= n) continue;
        const rest = original.cloneNode(true) as Element;
        const cutEnd = textAt(whole, k);
        const cutStart = textAt(rest, k);
        if (cutEnd === null || cutStart === null) continue;
        range.setStart(cutEnd[0], cutEnd[1]);
        range.setEndAfter(whole.lastChild as Node);
        range.deleteContents();
        if (overflows(whole)) {
          whole.replaceChildren(...Array.from((original.cloneNode(true) as Element).childNodes));
          continue;
        }
        const tail = docRange.call(doc) as Range;
        tail.setStartBefore(rest.firstChild as Node);
        tail.setEnd(cutStart[0], cutStart[1]);
        tail.deleteContents();
        // The rest does not start with the space the line broke at.
        const first = textAt(rest, 0);
        if (first !== null) first[0].data = first[0].data.replace(/^\s+/, '');
        rest.classList.add('card-continued');
        rest.removeAttribute('id');
        whole.classList.add('card-split');
        return rest;
      }
      return null;
    };

    // Move the break back over previous siblings that must stay with what follows. Never empties
    // the page of content.
    const pullBack = (src: Element, dst: Element, at: number, clones: Map<number, Element>): Seq => {
      let i = at;
      for (;;) {
        let p = i - 1;
        while (p >= 0 && src.childNodes[p].nodeType !== 1) p--;
        const clone = p >= 0 ? clones.get(p) : null;
        if (!clone || ctx.units - (placedCount.get(clone) ?? 0) <= 0) break;
        if (visible(clone)) {
          if (!heading(clone)) break;
          if (!/^(H[1-6]|HEADER|TH|TR)$/.test(clone.tagName) && clone.getBoundingClientRect().height > ctx.height * 0.25) break;
        }
        while (dst.lastChild !== null && dst.lastChild !== clone) dst.lastChild.remove();
        unplace(clone);
        clone.remove();
        i = p;
      }
      while (dst.lastChild !== null && dst.lastChild.nodeType !== 1) dst.lastChild.remove();
      return { i, inner: null };
    };

    const nothingPlaced = (el: Element, token: Token): boolean => ('par' in token ? token.empty : !placed(el));

    // `parallel`: whether src lays its children side by side (decided on a laid-out clone of it).
    // `force`: an ancestor that was to be kept whole is being split, so nothing inside it is kept
    // whole either (where the break falls is no longer a choice between pages).
    const fill = (src: Element, dst: Element, token: Token | null, parallel: boolean, force: boolean): Token | null => {
      if (parallel || (token !== null && 'par' in token)) return fillParallel(src, dst, token as Par | null, force);
      const kids = src.childNodes;
      const clones = new Map<number, Element>();
      let i = 0;
      let carry: Element | null = null;
      if (token !== null && 'i' in token) {
        i = token.i;
        if (token.inner !== null && 'rest' in token.inner) carry = token.inner.rest;
        else if (token.inner !== null) {
          const part = shell(kids[i] as Element, true, dst);
          const rest = fill(kids[i] as Element, part, token.inner, false, force);
          if (rest !== null) {
            part.classList.add('card-split');
            return { i, inner: rest };
          }
          clones.set(i, part);
          i++;
        }
      }
      for (; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.nodeType !== 1 && carry === null) {
          if (kid.nodeType === 3) dst.append(kid.cloneNode(false));
          continue;
        }
        const source = carry ?? (kid as Element);
        carry = null;
        const whole = source.cloneNode(true) as Element;
        dst.append(whole);
        if (!overflows(whole)) {
          clones.set(i, whole);
          place(whole);
          continue;
        }
        const empty = ctx.units === 0;
        const tall = whole.getBoundingClientRect().height > ctx.height - 1;
        const height = whole.getBoundingClientRect().height;
        const isContainer = container(whole);
        const isText = !isContainer && textBlock(whole);
        const sideBySide = isContainer && isParallel(whole);
        whole.remove();
        // Kept whole (moved to the next page) only when that is possible and worth it: it fits on
        // a fresh page, and it leaves less than half this page empty — a quarter, if it is itself
        // more than half a page tall.
        const left = 1 - fillOf(ctx.content);
        const worth = left < 0.25 || (left < 0.5 && height <= ctx.height * 0.5);
        const keepable = isText || /avoid/.test(style(source).breakInside);
        const keep = keepable && !force && !empty && !tall && worth;
        if (isContainer && !keep) {
          const part = shell(source, source !== kid, dst);
          const rest = fill(source, part, null, sideBySide, force || keepable);
          if (rest === null) {
            clones.set(i, part);
            continue;
          }
          // Keep it when it placed content, or when taking it away would leave the page empty.
          if (!nothingPlaced(part, rest) || ctx.units === (placedCount.get(part) ?? 0)) {
            part.classList.add('card-split');
            return { i, inner: rest };
          }
          unplace(part);
          part.remove();
        } else if (isText && !keep) {
          dst.append(whole);
          const rest = cutText(whole);
          if (rest !== null) {
            place(whole);
            return { i, inner: { rest } };
          }
          whole.remove();
        }
        // Nothing but headings on this page, and the block fits on a fresh one: it goes there, so
        // that nothing is cut off (the headings stay — a page cannot begin earlier than itself).
        if (empty && !tall && /\S/.test(ctx.content.textContent ?? '')) return pullBack(src, dst, i, clones);
        if (empty) {
          // Taller than a whole page and not to be split: it is printed cut off rather than lost.
          dst.append(whole);
          place(whole);
          if (overflows(whole)) overflowed = true;
          clones.set(i, whole);
          continue;
        }
        return pullBack(src, dst, i, clones);
      }
      return null;
    };

    // Side-by-side columns: each filled on its own; a column that is finished leaves an empty
    // shell on later pages so that the others keep their places. `empty`: no column that goes on
    // placed any content here (a heading alone does not count), so the whole row moves on.
    const fillParallel = (src: Element, dst: Element, token: Par | null, force: boolean): Par | null => {
      const kids = src.childNodes;
      const state = token?.par ?? Array.from(kids, () => 'start' as const);
      const out: Par['par'] = [];
      let empty = true;
      let finished = true;
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.nodeType !== 1) {
          if (kid.nodeType === 3) dst.append(kid.cloneNode(false));
          out.push('done');
          continue;
        }
        const st = state[i];
        if (st === 'done') {
          shell(kid as Element, true, dst);
          out.push('done');
          continue;
        }
        // A column that is not a container of blocks: placed whole, cut between lines, or left
        // for the next page (an empty shell keeps its place here).
        if ((st === 'start' && !container(kid as Element)) || (st !== 'start' && 'rest' in st)) {
          const source = st === 'start' ? (kid as Element) : (st as Rest).rest;
          const whole = source.cloneNode(true) as Element;
          dst.append(whole);
          if (!overflows(whole)) {
            place(whole);
            out.push('done');
            continue;
          }
          const rest = textBlock(whole) ? cutText(whole) : null;
          if (rest !== null) {
            place(whole);
            out.push({ rest });
            finished = false;
            empty = false;
            continue;
          }
          if (ctx.units === 0) {
            place(whole);
            if (overflows(whole)) overflowed = true;
            out.push('done');
            continue;
          }
          whole.remove();
          shell(source, true, dst);
          out.push(st);
          finished = false;
          continue;
        }
        let sideBySide = false;
        if (st === 'start') {
          const whole = kid.cloneNode(true) as Element;
          dst.append(whole);
          if (!overflows(whole)) {
            place(whole);
            out.push('done');
            continue;
          }
          sideBySide = isParallel(whole);
          whole.remove();
        }
        const part = shell(kid as Element, st !== 'start', dst);
        const rest = fill(kid as Element, part, st === 'start' ? null : st, sideBySide, force);
        out.push(rest ?? 'done');
        if (rest !== null) {
          finished = false;
          part.classList.add('card-split');
          if (!nothingPlaced(part, rest)) empty = false;
        }
      }
      return finished ? null : { par: out, empty };
    };

    // The last page's columns are balanced, as a multi-column box is at the end of its content.
    // Before that, a multi-column box is as tall as the page left to it (place), however little
    // is in it: its fill is only known once it is balanced.
    const balance = (content: HTMLElement) => {
      const limit = content.getBoundingClientRect().bottom;
      for (const m of Array.from(content.querySelectorAll('*'))) {
        if (!multicols.has(m)) continue;
        const h = m as HTMLElement;
        const height = h.style.height;
        h.style.height = '';
        h.style.columnFill = '';
        if (h.getBoundingClientRect().bottom > limit + 0.5) {
          h.style.height = height;
          h.style.columnFill = 'auto';
        }
      }
    };

    const layOut = (size: number | null): Layout => {
      if (size !== null) root.style.setProperty('--card-font-size', `${size}pt`);
      holder.replaceChildren();
      sheets = [];
      overflowed = false;
      let token: Token | null = null;
      do {
        const sheet = newSheet();
        holder.append(sheet);
        sheets.push(sheet);
        const content = sheet.querySelector('.sheet-content') as HTMLElement;
        const box = content.getBoundingClientRect();
        ctx = { content, top: box.top, bottom: box.bottom, right: box.right, height: box.height, units: 0 };
        token = fill(flow, content, token, false, false);
      } while (token !== null && sheets.length < MAX_PAGES);
      if (token !== null) throw new Error(`more than ${MAX_PAGES} pages`);
      const last = sheets[sheets.length - 1].querySelector('.sheet-content') as HTMLElement;
      balance(last);
      return { pages: sheets.length, fill: fillOf(last), overflow: overflowed };
    };

    const finish = (size: string, decision: FitDecision | null) => {
      const n = sheets.length;
      sheets.forEach((sheet, i) => {
        sheet.classList.toggle('sheet-last', i === n - 1);
        sheet.classList.toggle('sheet-only', n === 1);
        sheet.setAttribute('data-page', String(i + 1));
      });
      root.setAttribute('data-pages', String(n));
      root.setAttribute('data-size', size);
      if (overflowed) root.setAttribute('data-overflow', 'true');
      else root.removeAttribute('data-overflow');
      if (decision !== null) root.setAttribute('data-fit-result', decision.reason);
      flow.remove();
      const print = docById.call(doc, 'card-print-paged') as Element | null;
      if (print !== null) print.setAttribute('media', 'all');
      root.setAttribute('data-paged', 'done');
      dispatch.call(doc, new CustomEvent('etna-paged', { detail: { pages: n, size } }));
    };

    return () => {
      try {
        flow.after(holder);
        let rule: FitRule | null = null;
        try {
          rule = data.fitRule ? (JSON.parse(data.fitRule) as FitRule) : null;
        } catch {
          rule = null;
        }
        if (data.fit === 'auto' && rule !== null) {
          let current = -1;
          const decision = decideFit(rule, (size) => {
            current = size;
            return layOut(size);
          });
          if (current !== decision.size) layOut(decision.size);
          finish(`${decision.size}pt`, decision);
        } else {
          layOut(null);
          finish(data.size ?? '', null);
        }
      } catch (error) {
        fail(error);
      }
    };
  }
}
