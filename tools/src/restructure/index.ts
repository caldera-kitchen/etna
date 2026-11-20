// `etna restructure check`: prove that a structured conversion kept a traditional recipe.
//
// The conversion of a traditional recipe (SPEC §4.1) to the structured form (§5–§7) moves the
// author's words around: ingredient lines go under the step where they enter, directions are
// cut into steps, parts become components. It must never add, drop or alter a word, an
// amount, a unit, an item or a note. This module compares the two parsed recipes and says
// precisely what was kept, what moved in an accepted way, what is new by necessity, and what
// was lost or altered. Directions are compared as plain text, so marks (SPEC §5.3), which add
// no words, are no difference: adding or removing them is never a finding. Pure: no file
// system, browser-safe.

import { diffArrays } from 'diff';

import { canonicalUnit, formatQuantity, partKey } from '../core/index.ts';
import type { Callout, Heading, IngredientLine, Node, Pos, Recipe, Step, StepBlock } from '../core/index.ts';
import { rewriteTemperatures, scaleContext, scanTemperatures, type ScaleContext } from '../fmt/temperature.ts';
import { addRanges, equals, rangeOf, toQuantity, type RationalRange } from '../list/rational.ts';

// ----------------------------------------------------------------------- types

/**
 * - `lost`: something of the original was dropped, altered or added to. Fails the check.
 * - `review`: an accepted change the person converting should read (a stated split, an ingredient listed
 *   at two steps without an amount, or in full in each branch of a `Choose`, a step name turned
 *   heading). Does not fail.
 * - `new`: words or structure the structured form needs and the original cannot have: step
 *   and component headings, link bullets, callout keywords. Listed, not failed.
 */
export type Severity = 'lost' | 'review' | 'new';

export type FindingKind =
  // whole recipe
  | 'not-traditional'
  | 'not-structured'
  | 'title-changed'
  | 'frontmatter-changed'
  // ingredients
  | 'ingredient-missing'
  | 'ingredient-added'
  | 'ingredient-changed'
  | 'ingredient-duplicated'
  | 'ingredient-each-branch'
  | 'split-sum'
  | 'split-note'
  | 'ingredient-split'
  | 'ingredient-multi-step'
  | 'ingredient-linked'
  | 'ingredient-ambiguous'
  // directions
  | 'sentence-missing'
  | 'sentence-added'
  | 'sentence-altered'
  | 'sentence-reordered'
  | 'step-name-lost'
  | 'step-name-kept'
  | 'part-name-unused'
  | 'inner-number-dropped'
  | 'choose-separator'
  // notes
  | 'note-missing'
  | 'note-added'
  | 'note-reordered'
  | 'note-misplaced'
  | 'note-listed'
  | 'note-moved'
  | 'note-repeated'
  // new by necessity
  | 'step-heading'
  | 'component-heading'
  | 'link'
  | 'callout';

export interface Finding {
  severity: Severity;
  kind: FindingKind;
  message: string;
  /** Line numbers in the original recipe this finding is about. */
  original: number[];
  /** Line numbers in the structured recipe this finding is about. */
  structured: number[];
}

export interface CheckReport {
  /** True when nothing was lost or altered: no finding has severity `lost`. */
  ok: boolean;
  findings: Finding[];
  counts: {
    ingredients: { original: number; accounted: number };
    sentences: { original: number; kept: number };
    notes: { original: number; kept: number };
    lost: number;
    review: number;
    new: number;
  };
}

// ---------------------------------------------------------------- normalizing

const ws = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Strip the word "divided" from a note: the split itself says it. `softened, divided` → `softened`. */
export function withoutDivided(note: string | null): string | null {
  if (note === null) return null;
  // A remark after ` — ` is kept whole; only the prep before it loses "divided".
  const dash = note.indexOf(' — ');
  const remark = dash < 0 ? '' : note.slice(dash);
  const prep = dash < 0 ? note : note.slice(0, dash);
  const rest = prep
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '' && !/^divided$/i.test(p))
    .join(', ');
  const out = (rest + remark).trim().replace(/^— /, '— ');
  return out === '' ? null : out;
}

/**
 * Split prose into sentences. A sentence ends at `.`, `!`, `?` or `…` (with any closing quote
 * or bracket) followed by white space and a capital, a digit or an opening quote. A bullet
 * `•` used to separate instructions inside one direction also ends a sentence, and is itself
 * dropped. Both recipes are split by this same function, so a doubtful split is harmless;
 * only a cut made inside a sentence shows up.
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const chunk of ws(text).split(/\s*•\s*/)) {
    if (chunk === '') continue;
    for (const s of chunk.split(/(?<=[.!?…]["”’)\]]?)\s+(?=["“‘(]?[A-Z0-9])/)) {
      const t = s.trim();
      if (t !== '') out.push(t);
    }
  }
  return out;
}

// ----------------------------------------------------------------- ingredients

interface Line {
  line: IngredientLine;
  item: string;
  itemKey: string;
  note: string | null;
  qty: RationalRange | null;
  unit: string | null;
  /** Exact key: quantity, unit, item and note. */
  key: string;
  lineNo: number;
  /** Structured only: the index of the step it is listed under. */
  step: number;
  /** Structured only: the `Choose` components it is inside, outermost first, and which branch of each. */
  branches: { choose: Node; branch: number }[];
  /** Original only: the index of the ingredient part (`###`) it is listed in. */
  group: number;
  link: boolean;
}

function qtyKey(q: RationalRange | null): string {
  if (!q) return '-';
  return `${q.min.num}/${q.min.den}..${q.max.num}/${q.max.den}`;
}

function toLine(l: IngredientLine, step: number, group = -1, branches: Line['branches'] = []): Line {
  const item = ws(l.kind === 'ingredient' ? l.item : l.label);
  // A remark after ` — ` is checked with the note: a portion must keep it as written.
  const written = [l.note, l.remark === null ? null : `— ${l.remark}`].filter((x) => x !== null && ws(x) !== '').join(' ');
  const note = written === '' ? null : ws(written);
  const qty = l.quantity ? rangeOf(l.quantity) : null;
  const unit = l.unit ? l.unit.def.name : null;
  const link = l.kind === 'reference';
  // A link to another recipe is matched against the line it replaces case-insensitively,
  // since the link text is often written in the target recipe's own case.
  const keyItem = link ? item.toLowerCase() : item;
  return {
    line: l,
    item,
    itemKey: item.toLowerCase(),
    note,
    qty,
    unit,
    key: `${qtyKey(qty)}|${unit ?? '-'}|${keyItem}|${note ?? '-'}`,
    lineNo: l.pos.start.line,
    step,
    branches,
    group,
    link,
  };
}

/**
 * True when two structured lines are in different branches of one `Choose`: they are
 * alternatives, never two parts of one amount (SPEC §5.2).
 */
function apart(a: Line, b: Line): boolean {
  return a.branches.some((x) => b.branches.some((y) => y.choose === x.choose && y.branch !== x.branch));
}

/** The `Choose` components a step is inside, outermost first, and which branch of each: `inside` is the components around it, outermost first. */
function branchesOf(step: Step, inside: Node[]): Line['branches'] {
  const out: Line['branches'] = [];
  inside.forEach((c, k) => {
    if (c.kind !== 'component' || !c.choose) return;
    const child = inside[k + 1] ?? step;
    out.push({ choose: c, branch: c.children.indexOf(child) });
  });
  return out;
}

function caseKey(l: Line): string {
  return `${qtyKey(l.qty)}|${l.unit ?? '-'}|${l.itemKey}|${l.note ?? '-'}`;
}

const show = (l: Line): string => `"${ws(l.line.raw)}"`;

function amountText(q: RationalRange | null, unit: string | null, l?: Line): string {
  if (!q) return 'no amount';
  const quantity = toQuantity(q);
  const sym = l?.line.unit ? canonicalUnit(l.line.unit.def, quantity) : unit;
  return `${formatQuantity(quantity)}${sym ? ` ${sym}` : ''}`;
}

function sameQty(a: RationalRange | null, b: RationalRange | null): boolean {
  if (a === null || b === null) return a === b;
  return equals(a.min, b.min) && equals(a.max, b.max);
}

/** Subsets of `pool` (indices), at least two members, none in different branches of one Choose, whose quantities sum to `target`. */
function findSplit(target: RationalRange, pool: Line[]): number[] | null {
  const n = Math.min(pool.length, 14);
  let best: number[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    const picked: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) picked.push(i);
    if (picked.length < 2) continue;
    let sum: RationalRange | null = null;
    for (const i of picked) sum = sum ? addRanges(sum, pool[i].qty!) : pool[i].qty!;
    if (sum && sameQty(sum, target) && !picked.some((i) => picked.some((j) => apart(pool[i], pool[j])))) {
      // Prefer the split that uses the most lines: every portion of a divided ingredient.
      if (!best || picked.length > best.length) best = picked;
    }
  }
  return best;
}

/** Every step in source order, with the components it is inside, outermost first. */
function stepsIn(nodes: Node[]): { step: Step; inside: Node[] }[] {
  const out: { step: Step; inside: Node[] }[] = [];
  const walk = (n: Node, inside: Node[]) => {
    if (n.kind === 'step') out.push({ step: n, inside });
    else n.children.forEach((c) => walk(c, [...inside, n]));
  };
  nodes.forEach((n) => walk(n, []));
  return out;
}

/**
 * The component of the structured recipe that each ingredient part of the original became:
 * the component holding most of the part's lines (the outer one when a component and one
 * inside it hold as many), or null when the recipe is flat or two separate components hold
 * as many.
 */
function partHomes(O: Line[], matched: Map<Line, Line[]>, inside: Node[][]): Map<number, Node | null> {
  const homes = new Map<number, Node | null>();
  for (const g of new Set(O.map((o) => o.group))) {
    const count = new Map<Node, number>();
    for (const o of O) {
      if (o.group !== g) continue;
      for (const s of matched.get(o) ?? []) for (const c of inside[s.step] ?? []) count.set(c, (count.get(c) ?? 0) + 1);
    }
    let best: Node | null = null;
    let bestN = 0;
    let tie = false;
    for (const [c, n] of count) {
      if (n > bestN) {
        best = c;
        bestN = n;
        tie = false;
      } else if (n === bestN && best) {
        // As many on a component inside the best one (it was counted after it): keep the outer one.
        const nested = inside.some((cs) => cs.includes(best!) && cs.indexOf(c) > cs.indexOf(best!));
        if (!nested) tie = true;
      }
    }
    homes.set(g, tie ? null : best);
  }
  return homes;
}

function componentsOf(nodes: Node[]): Node[] {
  const out: Node[] = [];
  const walk = (n: Node) => {
    if (n.kind === 'component') {
      out.push(n);
      n.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return out;
}

function checkIngredients(original: Recipe, structured: Recipe, findings: Finding[]): { original: number; accounted: number } {
  const groups = original.traditional?.ingredients?.items ?? [];
  const O = groups.flatMap((g, gi) => g.items.map((l) => toLine(l, -1, gi)));
  const placed = stepsIn(structured.nodes);
  const steps = placed.map((p) => p.step);
  const inside = placed.map((p) => p.inside);
  const S: Line[] = [];
  /** Links to a component of this recipe that carry an amount: they may stand for a line of the original. */
  const amountLinks: { line: Line; step: Step }[] = [];
  steps.forEach((step, i) => {
    const branches = branchesOf(step, inside[i]);
    for (const l of step.ingredients) {
      if (l.kind === 'reference' && l.internal && l.quantity) {
        amountLinks.push({ line: toLine(l, i, -1, branches), step });
        continue;
      }
      if (l.kind === 'reference' && l.internal) {
        findings.push({
          severity: 'new',
          kind: 'link',
          message: `link "${ws(l.raw)}" under "${step.heading.text}"`,
          original: [],
          structured: [l.pos.start.line],
        });
        continue;
      }
      S.push(toLine(l, i, -1, branches));
    }
  });
  // Ingredient lines outside any step (in the preamble) are still lines of the recipe.
  for (const b of structured.preamble) if (b.kind === 'ingredients') for (const l of b.items) S.push(toLine(l, -1));

  const oUsed = new Set<Line>();
  const sUsed = new Set<Line>();
  const matchedBy = new Map<Line, Line[]>(); // original line → structured lines that account for it
  const account = (o: Line, s: Line[]) => {
    oUsed.add(o);
    s.forEach((x) => sUsed.add(x));
    matchedBy.set(o, [...(matchedBy.get(o) ?? []), ...s]);
  };

  // A0. A line of the original that names something the recipe itself makes (`133 g dry mix`),
  // written as a link to that component with the same amount (`133 g [dry mix](#dry-mix)`).
  for (const { line: s, step } of amountLinks) {
    const o = O.find((x) => !oUsed.has(x) && caseKey(x) === caseKey(s));
    if (o) {
      account(o, [s]);
      findings.push({
        severity: 'review',
        kind: 'ingredient-linked',
        message: `${show(o)} is now a link to this recipe's own component: ${show(s)}`,
        original: [o.lineNo],
        structured: [s.lineNo],
      });
    } else {
      findings.push({ severity: 'new', kind: 'link', message: `link "${ws(s.line.raw)}" under "${step.heading.text}"`, original: [], structured: [s.lineNo] });
    }
  }

  // A. Exact matches, as a multiset: the same quantity, unit, item and note. An external link
  // that names the line it replaces counts too. Lines the original lists once are matched
  // first; they tell which component each ingredient part became, and a line the original
  // lists in two parts (`1 tsp vanilla` in the cake and in the frosting) is then matched
  // within its own part where it can be.
  const exact = (o: Line) => (x: Line) => !sUsed.has(x) && (x.link ? caseKey(x) === caseKey(o) : x.key === o.key);
  const twice = new Set(O.filter((o) => O.some((p) => p !== o && caseKey(p) === caseKey(o))));
  let homes = new Map<number, Node | null>();
  const inHome = (o: Line, x: Line) => {
    const home = homes.get(o.group);
    return home != null && (inside[x.step] ?? []).includes(home);
  };
  for (const round of [false, true]) {
    if (round) homes = partHomes(O, matchedBy, inside);
    for (const o of O) {
      if (oUsed.has(o) || twice.has(o) !== round) continue;
      const free = S.filter(exact(o));
      const s = free.find((x) => inHome(o, x)) ?? free[0];
      if (!s) continue;
      account(o, [s]);
      if (s.link) {
        findings.push({
          severity: 'review',
          kind: 'ingredient-linked',
          message: `${show(o)} is now a link to another recipe: ${show(s)}`,
          original: [o.lineNo],
          structured: [s.lineNo],
        });
      }
    }
  }

  // A2. A line every branch of a `Choose` takes, listed in full in each (SPEC §5.2): the
  // copies in other branches of the same Choose are alternatives, not more of it. A copy in
  // the same branch as another, or outside any Choose they share, is left for the duplicate
  // finding below.
  for (const o of O) {
    const kept = matchedBy.get(o);
    if (!kept || kept.length !== 1) continue;
    const copies = [kept[0]];
    for (const x of S) if (exact(o)(x) && copies.every((c) => apart(c, x))) copies.push(x);
    if (copies.length < 2) continue;
    account(o, copies.slice(1));
    // The Choose to name: one every copy is in, each in a branch of its own.
    const choose = kept[0].branches
      .map((b) => b.choose)
      .find((c) => copies.every((x) => x.branches.some((y) => y.choose === c)) && new Set(copies.map((x) => x.branches.find((y) => y.choose === c)!.branch)).size === copies.length);
    findings.push({
      severity: 'review',
      kind: 'ingredient-each-branch',
      message: `${show(o)} is listed in full in ${countWord(copies.length)} branches of ${choose ? `the Choose "${choose.heading.text}"` : 'a Choose'}, once in each`,
      original: [o.lineNo],
      structured: copies.map((x) => x.lineNo).sort((a, b) => a - b),
    });
  }

  // B. Stated splits: lines with the same item and unit whose amounts sum exactly to an
  // original line's amount. Portions are never taken from two branches of one Choose: those
  // are alternatives, never added together.
  for (const o of O) {
    if (oUsed.has(o) || o.qty === null) continue;
    const pool = S.filter((x) => !sUsed.has(x) && !x.link && x.qty !== null && x.item === o.item && x.unit === o.unit);
    if (pool.length < 2) continue;
    const picked = findSplit(o.qty, pool);
    const parts = picked ? picked.map((i) => pool[i]) : pool;
    if (!picked) {
      // Lines in different branches have no sum to report: left as changed or added, below.
      if (pool.some((p) => pool.some((q) => apart(p, q)))) continue;
      let sum: RationalRange | null = null;
      for (const p of pool) sum = sum ? addRanges(sum, p.qty!) : p.qty!;
      account(o, pool);
      findings.push({
        severity: 'lost',
        kind: 'split-sum',
        message: `${show(o)} is split into ${pool.map((p) => amountText(p.qty, p.unit, p)).join(' + ')} = ${amountText(sum, o.unit, o)}, not ${amountText(o.qty, o.unit, o)}`,
        original: [o.lineNo],
        structured: pool.map((p) => p.lineNo),
      });
      continue;
    }
    account(o, parts);
    findings.push({
      severity: 'review',
      kind: 'ingredient-split',
      message: `${show(o)} is split ${parts.map((p) => amountText(p.qty, p.unit, p)).join(' + ')} = ${amountText(o.qty, o.unit, o)}`,
      original: [o.lineNo],
      structured: parts.map((p) => p.lineNo),
    });
    const allowed = new Set([o.note, withoutDivided(o.note)]);
    for (const p of parts) {
      if (allowed.has(p.note)) continue;
      findings.push({
        severity: 'lost',
        kind: 'split-note',
        message: `a portion of ${show(o)} has a different note: ${show(p)} (expected ${o.note === null ? 'no note' : `"${o.note}"`}${withoutDivided(o.note) !== o.note ? ` or ${withoutDivided(o.note) === null ? 'no note' : `"${withoutDivided(o.note)}"`}` : ''})`,
        original: [o.lineNo],
        structured: [p.lineNo],
      });
    }
  }

  // C. One line listed at several steps. With no amount, the line itself is repeated at each
  // step it enters. With an amount, it is listed once with it and at other steps without.
  //
  // A bare name (`Vanilla`) may stand for more than one line of the original (`1 tsp Vanilla`
  // in the cake, `1/2 tsp Vanilla` in the frosting). It belongs to the line of the same part:
  // the original's `###` part against the component it became. Failing that, to the line
  // listed nearest before it. What neither settles is paired with the first and listed for
  // review.
  homes = partHomes(O, matchedBy, inside);
  const bareFor = (o: Line, x: Line): boolean => {
    if (!oUsed.has(o) || x.qty !== null || x.unit !== null) return false;
    if (!(x.link ? x.itemKey === o.itemKey : x.item === o.item)) return false;
    if (o.qty === null) return x.key === o.key || (x.link && caseKey(x) === caseKey(o));
    return new Set([o.note, withoutDivided(o.note)]).has(x.note);
  };
  const extras = new Map<Line, Line[]>();
  const pairing = new Map<Line, string[]>();
  const steps0 = (o: Line) => [...(matchedBy.get(o) ?? []), ...(extras.get(o) ?? [])].map((y) => y.step);
  for (const x of S) {
    if (sUsed.has(x)) continue;
    const all = O.filter((o) => bareFor(o, x));
    if (all.length === 0) continue;
    // A line already listed at this step cannot take it again (unless nothing else can).
    let cands = all.filter((o) => !steps0(o).includes(x.step));
    if (cands.length === 0) {
      if (all[0].qty !== null) continue;
      cands = [all[0]];
    }
    let pick = cands[0];
    let how = '';
    if (cands.length > 1) {
      const others = (p: Line) => cands.filter((o) => o !== p).map(show).join(', ');
      const same = cands.filter((o) => inHome(o, x));
      if (same.length === 1) {
        pick = same[0];
        how = `"${ws(x.line.raw)}" at line ${x.lineNo} paired by its part, "${groups[pick.group]?.label ?? '(unnamed)'}"; the original also lists ${others(pick)}`;
      } else {
        const pool = same.length > 1 ? same : cands;
        // Nearest line before it (in step order); one after it only when none is before.
        const dist = (o: Line) => Math.min(...steps0(o).map((k) => (k <= x.step ? x.step - k : 1000 + k - x.step)));
        const ds = pool.map(dist);
        const min = Math.min(...ds);
        const at = pool.filter((_, i) => ds[i] === min);
        pick = at[0];
        if (at.length === 1) {
          how = `"${ws(x.line.raw)}" at line ${x.lineNo} paired by position; the original also lists ${others(pick)}`;
        } else {
          findings.push({
            severity: 'review',
            kind: 'ingredient-ambiguous',
            message: `"${ws(x.line.raw)}" could stand for ${at.map(show).join(' or ')}: neither its part nor its place decides; taken as ${show(pick)}, check which is meant`,
            original: at.map((o) => o.lineNo),
            structured: [x.lineNo],
          });
        }
      }
    }
    extras.set(pick, [...(extras.get(pick) ?? []), x]);
    if (how) pairing.set(pick, [...(pairing.get(pick) ?? []), how]);
  }
  const pairedBy = (o: Line) => (pairing.has(o) ? ` (${pairing.get(o)!.join('; ')})` : '');
  for (const o of O) {
    const extra = extras.get(o) ?? [];
    if (extra.length === 0) continue;
    const kept = matchedBy.get(o) ?? [];
    if (o.qty === null) {
      const same = extra;
      const all = [...kept, ...same];
      const distinct = new Set(all.map((x) => x.step));
      if (distinct.size < all.length) {
        same.forEach((x) => sUsed.add(x));
        findings.push({
          severity: 'lost',
          kind: 'ingredient-duplicated',
          message: `${show(o)} is listed ${all.length} times, more than once under the same step`,
          original: [o.lineNo],
          structured: all.map((x) => x.lineNo),
        });
        continue;
      }
      account(o, same);
      findings.push({
        severity: 'review',
        kind: 'ingredient-multi-step',
        message: `${show(o)} is listed at ${countWord(all.length)} steps without an amount${pairedBy(o)}`,
        original: [o.lineNo],
        structured: all.map((x) => x.lineNo),
      });
    } else if (extra.length > 0) {
      const stepsSeen = new Set(kept.map((x) => x.step));
      const fresh = extra.filter((x) => {
        if (stepsSeen.has(x.step)) return false;
        stepsSeen.add(x.step);
        return true;
      });
      if (fresh.length === 0) continue;
      account(o, fresh);
      findings.push({
        severity: 'review',
        kind: 'ingredient-multi-step',
        message: `${show(o)} is listed with its amount at one step and without an amount at ${countWord(fresh.length)} more${pairedBy(o)}`,
        original: [o.lineNo],
        structured: [...kept, ...fresh].map((x) => x.lineNo),
      });
    }
  }

  // D. What is left: changed (same item, something else differs), missing, duplicated, added.
  const restO = O.filter((o) => !oUsed.has(o));
  let restS = S.filter((s) => !sUsed.has(s));
  for (const o of restO) {
    const s = restS.find((x) => x.itemKey === o.itemKey) ?? restS.find((x) => x.qty !== null && sameQty(x.qty, o.qty) && x.unit === o.unit && x.note === o.note);
    if (!s) continue;
    restS = restS.filter((x) => x !== s);
    oUsed.add(o);
    const what: string[] = [];
    if (!sameQty(o.qty, s.qty) || o.unit !== s.unit) {
      if (o.qty === null && s.qty !== null) what.push(`an amount was added (${amountText(s.qty, s.unit, s)})`);
      else if (o.qty !== null && s.qty === null) what.push(`the amount was dropped (was ${amountText(o.qty, o.unit, o)})`);
      else what.push(`amount ${amountText(o.qty, o.unit, o)} → ${amountText(s.qty, s.unit, s)}`);
    }
    if (o.item !== s.item) what.push(`item "${o.item}" → "${s.item}"`);
    if (o.note !== s.note) what.push(`note ${o.note === null ? 'none' : `"${o.note}"`} → ${s.note === null ? 'none' : `"${s.note}"`}`);
    if (s.link && what.length === 0) what.push('now a link');
    findings.push({
      severity: 'lost',
      kind: 'ingredient-changed',
      message: `${show(o)} became ${show(s)}: ${what.join('; ')}`,
      original: [o.lineNo],
      structured: [s.lineNo],
    });
  }
  for (const o of O) {
    if (oUsed.has(o)) continue;
    findings.push({ severity: 'lost', kind: 'ingredient-missing', message: `${show(o)} is not in the structured recipe`, original: [o.lineNo], structured: [] });
  }
  for (const s of restS) {
    const twin = O.find((o) => o.key === s.key);
    if (twin) {
      findings.push({
        severity: 'lost',
        kind: 'ingredient-duplicated',
        message: `${show(s)} is listed again with its amount; the original lists it once`,
        original: [twin.lineNo],
        structured: [...(matchedBy.get(twin) ?? []).map((x) => x.lineNo), s.lineNo],
      });
    } else {
      const same = O.find((o) => o.itemKey === s.itemKey);
      const message = same
        ? `${show(s)} is not in the original, which lists ${show(same)}${same.qty === null && s.qty !== null ? ' without an amount: an amount was added' : ''}`
        : `${show(s)} is not in the original`;
      findings.push({ severity: 'lost', kind: 'ingredient-added', message, original: same ? [same.lineNo] : [], structured: [s.lineNo] });
    }
  }
  const lostLines = new Set(findings.filter((f) => f.severity === 'lost' && (f.kind.startsWith('ingredient') || f.kind.startsWith('split'))).flatMap((f) => f.original));
  return { original: O.length, accounted: O.filter((o) => matchedBy.has(o) && !lostLines.has(o.lineNo)).length };
}

function countWord(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
}

// ------------------------------------------------------------------ directions

interface Sentence {
  text: string;
  line: number;
  /** Where it stands: a part name (original) or a step heading (structured). */
  where: string;
  callout: boolean;
  /**
   * Original only, on the first sentence of a direction that opens with a number of its own
   * (`1. 1) Beat…`): that number, `1)`. Markdown reads it as a list marker, so it is not in the
   * text; whether the conversion kept it is checked against the structured block's source.
   */
  marker?: string;
  /** Structured only: the Markdown source of the block the sentence is in. */
  raw?: string;
  /** Structured only: the Choose components it is inside, outermost first, and which branch of each. */
  branches?: { choose: number; branch: number }[];
  /** Structured only: set on a sentence of a `Choose` callout, to the number of its component. */
  chooseCallout?: number;
}

function directionSentences(original: Recipe, ctx: ScaleContext): { part: string | null; items: Sentence[] }[] {
  const d = original.traditional?.directions;
  if (!d) return [];
  const out: { part: string | null; items: Sentence[] }[] = d.parts.map((p) => ({
    part: p.label,
    items: p.steps.flatMap((step) => {
      const texts = [step.text, ...(step.more ? [plainMarkdown(step.more)] : [])];
      const items: Sentence[] = texts.flatMap((t) => sentences(rewriteTemperatures(t, ctx)).map((text) => ({ text, line: step.pos.start.line, where: p.label ?? 'Directions', callout: false })));
      const marker = innerNumber(step.raw, step.text);
      if (marker !== null && items.length > 0) items[0].marker = marker;
      return items;
    }),
  }));
  // Other text in the section (most often a bullet list under a direction, indented too little
  // to be part of it): its sentences belong after the direction it follows, in that part, so
  // a conversion that writes them as prose in that place keeps them in order.
  const loose: Sentence[] = [];
  for (const o of d.other) {
    const items = sentences(rewriteTemperatures(otherText(o), ctx)).map((text) => ({ text, line: o.pos.start.line, where: 'Directions', callout: false }));
    let part = -1;
    d.parts.forEach((p, pi) => {
      const start = p.pos?.start.offset ?? p.steps[0]?.pos.start.offset;
      if (start !== undefined && start < o.pos.start.offset) part = pi;
    });
    if (part < 0) {
      loose.push(...items);
      continue;
    }
    const target = out[part];
    // after that direction's sentences: before the first sentence written below the block
    let k = target.items.findIndex((it) => it.line > o.pos.start.line);
    if (k < 0) k = target.items.length;
    for (const it of items) it.where = target.part ?? 'Directions';
    target.items.splice(k, 0, ...items);
  }
  if (loose.length > 0) out.push({ part: '(other text in Directions)', items: loose });
  return out;
}

/**
 * The plain text of a block the format gives no meaning to. A list's items are read one by
 * one, so that "…comes first." and the next item's "KitchenAid…" stay two sentences.
 */
function otherText(o: { nodeType: string; raw: string; text: string }): string {
  return o.nodeType === 'list' ? plainMarkdown(o.raw) : plainMarkdown(o.text);
}

/**
 * The number a direction writes at its own start (`1. 1) Beat…` gives `1)`), which Markdown
 * reads as a list marker and leaves out of the direction's text. Null when there is none, or
 * when the text still has it.
 */
function innerNumber(raw: string, text: string): string | null {
  const m = /^\s*(\d{1,3}[.)])\s/.exec(raw);
  if (!m || ws(text).startsWith(m[1])) return null;
  return m[1];
}

/** A rough plain-text reading of a Markdown fragment: list markers and emphasis dropped. */
function plainMarkdown(md: string): string {
  return md
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\*\*|__|(?<!\w)[*_](?!\s)|(?<!\s)[*_](?!\w)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function lineAt(pos: Pos, text: string, needle: string): number {
  const at = text.indexOf(needle.slice(0, 20));
  if (at < 0) return pos.start.line;
  return pos.start.line + (text.slice(0, at).match(/\n/g)?.length ?? 0);
}

function blockSentences(b: StepBlock, where: string, ctx: ScaleContext): Sentence[] {
  if (b.kind === 'ingredients') return [];
  const text = b.kind === 'other' ? otherText(b) : b.text;
  return sentences(rewriteTemperatures(text, ctx)).map((s) => ({ text: s, line: lineAt(b.pos, b.kind === 'callout' ? b.source : b.raw, s), where, callout: b.kind === 'callout' }));
}

/** `skip`: callouts (by source offset) whose text is checked with the notes, not the directions. */
function structuredSentences(structured: Recipe, ctx: ScaleContext, skip: Set<number>): Sentence[] {
  const out: Sentence[] = [];
  let chooses = 0;
  const walk = (n: Node, branches: { choose: number; branch: number }[]) => {
    const choose = n.kind === 'component' && n.choose ? chooses++ : null;
    for (const b of n.blocks) {
      if (b.kind === 'ingredients') continue;
      if (b.kind === 'callout' && skip.has(b.pos.start.offset)) continue;
      for (const s of blockSentences(b, n.heading.text, ctx)) {
        s.raw = b.raw;
        s.branches = branches;
        if (choose !== null && b.kind === 'callout' && b.keyword === 'Choose') s.chooseCallout = choose;
        out.push(s);
      }
    }
    if (n.kind === 'component') n.children.forEach((c, i) => walk(c, choose === null ? branches : [...branches, { choose, branch: i }]));
  };
  structured.nodes.forEach((n) => walk(n, []));
  return out;
}

/** The branch of Choose component `choose` that structured sentence `s` is in, or null. */
function branchOf(s: Sentence, choose: number): number | null {
  return s.branches?.find((b) => b.choose === choose)?.branch ?? null;
}

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

/** Share of words two sentences have in common, 0…1. */
function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.length + wb.length === 0) return 1;
  const common = diffArrays(wa, wb)
    .filter((c) => !c.added && !c.removed)
    .reduce((n, c) => n + c.count!, 0);
  return (2 * common) / (wa.length + wb.length);
}

/** A compact word diff: `[-old-]{+new+}`. */
export function wordDiff(a: string, b: string): string {
  return diffArrays(words(a), words(b))
    .map((c) => (c.added ? `{+${c.value.join(' ')}+}` : c.removed ? `[-${c.value.join(' ')}-]` : c.value.join(' ')))
    .join(' ');
}

/** Indices (into `xs`) of a longest strictly increasing subsequence. */
function longestIncreasing(xs: number[]): Set<number> {
  const n = xs.length;
  const len = new Array<number>(n).fill(1);
  const prev = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if (xs[j] < xs[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
  let end = -1;
  for (let i = 0; i < n; i++) if (end < 0 || len[i] > len[end]) end = i;
  const keep = new Set<number>();
  for (let i = end; i >= 0; i = prev[i]) keep.add(i);
  return keep;
}

const clip = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function checkDirections(original: Recipe, structured: Recipe, ctx: ScaleContext, moves: NoteMoves, findings: Finding[]): { original: number; kept: number } {
  const parts = directionSentences(original, ctx);
  const S = structuredSentences(structured, ctx, moves.callouts);
  const byText = new Map<string, number[]>();
  S.forEach((s, i) => byText.set(s.text, [...(byText.get(s.text) ?? []), i]));
  const used = new Set<number>();
  const missing: { s: Sentence; part: string | null }[] = [];
  let total = 0;
  let kept = 0;

  for (const p of parts) {
    let last = -1;
    const assigned: { s: Sentence; at: number; k: number }[] = [];
    p.items.forEach((s, k) => {
      total++;
      const free = (byText.get(s.text) ?? []).filter((i) => !used.has(i));
      const at = free.find((i) => i > last) ?? free[0];
      if (at === undefined) {
        missing.push({ s, part: p.part });
        return;
      }
      used.add(at);
      assigned.push({ s, at, k });
      last = Math.max(last, at);
    });

    // A direction's own number (`1)`) that the conversion left out: accepted, and listed.
    for (const a of assigned) {
      if (!a.s.marker || (S[a.at].raw ?? '').trimStart().startsWith(a.s.marker)) continue;
      findings.push({
        severity: 'review',
        kind: 'inner-number-dropped',
        message: `inner number dropped: "${a.s.marker}" before "${clip(a.s.text, 60)}"`,
        original: [a.s.line],
        structured: [S[a.at].line],
      });
    }

    // The one move a Choose needs: the recipe's own separator sentence ("OR"), written between
    // two alternative methods, becomes the Choose callout, which the form puts before the
    // branches. Accepted only when, in the original, the sentence just before it is the last
    // sentence of one branch and the sentence just after it the first of the next branch.
    const separators = new Set<number>();
    assigned.forEach((a, i) => {
      const choose = S[a.at].chooseCallout;
      const prev = assigned[i - 1];
      const next = assigned[i + 1];
      if (choose === undefined || !prev || !next || prev.k !== a.k - 1 || next.k !== a.k + 1) return;
      const before = branchOf(S[prev.at], choose);
      const after = branchOf(S[next.at], choose);
      if (before === null || after !== before + 1) return;
      const inBranch = (b: number) => S.map((_, j) => j).filter((j) => branchOf(S[j], choose) === b);
      if (prev.at !== Math.max(...inBranch(before)) || next.at !== Math.min(...inBranch(after))) return;
      separators.add(i);
      kept++;
      findings.push({
        severity: 'review',
        kind: 'choose-separator',
        message: `"${clip(a.s.text, 60)}", between two alternatives in the original, is now the Choose callout before them (under "${S[a.at].where}")`,
        original: [a.s.line],
        structured: [S[a.at].line],
      });
    });

    const ordered = assigned.filter((_, i) => !separators.has(i));
    const inOrder = longestIncreasing(ordered.map((a) => a.at));
    ordered.forEach((a, i) => {
      if (inOrder.has(i)) {
        kept++;
        return;
      }
      findings.push({
        severity: 'lost',
        kind: 'sentence-reordered',
        message: `sentence moved out of order within ${p.part ? `part "${p.part}"` : 'the directions'}: "${clip(a.s.text)}" (now under "${S[a.at].where}")`,
        original: [a.s.line],
        structured: [S[a.at].line],
      });
    });
  }

  // Pair what is missing with what is left over, by words in common: those were altered.
  const left = () => S.map((_, i) => i).filter((i) => !used.has(i));
  for (const m of missing) {
    let best = -1;
    let score = 0;
    for (const i of left()) {
      const sc = similarity(m.s.text, S[i].text);
      if (sc > score) {
        score = sc;
        best = i;
      }
    }
    if (best >= 0 && score >= 0.5) {
      used.add(best);
      findings.push({
        severity: 'lost',
        kind: 'sentence-altered',
        message: `sentence altered: ${clip(wordDiff(m.s.text, S[best].text), 240)}`,
        original: [m.s.line],
        structured: [S[best].line],
      });
    } else if (/^\d{1,3}[.)]$/.test(m.s.text)) {
      // A number inside a direction ("…with lid. 2. Add flour…") is the author's text: it stays.
      findings.push({
        severity: 'lost',
        kind: 'sentence-missing',
        message: `inner number "${m.s.text}" dropped from inside a direction${m.part ? ` (part "${m.part}")` : ''}: keep it; where it begins a step, escape it (${m.s.text.replace(/([.)])$/, '\\$1')})`,
        original: [m.s.line],
        structured: [],
      });
    } else {
      findings.push({
        severity: 'lost',
        kind: 'sentence-missing',
        message: `sentence missing${m.part ? ` from part "${m.part}"` : ''}: "${clip(m.s.text)}"`,
        original: [m.s.line],
        structured: [],
      });
    }
  }
  for (const i of left()) {
    findings.push({
      severity: 'lost',
      kind: 'sentence-added',
      message: `${S[i].callout ? 'callout ' : ''}sentence not in the original, under "${S[i].where}": "${clip(S[i].text)}"`,
      original: [],
      structured: [S[i].line],
    });
  }
  return { original: total, kept };
}

// ----------------------------------------------------------- headings, callouts

function checkHeadings(original: Recipe, structured: Recipe, moves: NoteMoves, findings: Finding[]): void {
  const t = original.traditional;
  // The Notes heading and any heading inside the notes are checked with the notes.
  const notesAt = structured.notes?.heading.pos.start.offset ?? Infinity;
  const headings = structured.headings.filter((h) => h.pos.start.offset < notesAt);
  const byKey = new Map<string, Heading>();
  for (const h of headings) if (!byKey.has(partKey(h.text))) byKey.set(partKey(h.text), h);
  const accounted = new Set<Heading>();

  // Step names written on a direction (`1. **Soak** — …`) are the author's words: they must
  // survive, as a heading.
  for (const d of t?.directions?.items ?? []) {
    if (!d.label) continue;
    const h = byKey.get(partKey(d.label));
    if (h) {
      accounted.add(h);
      findings.push({
        severity: 'review',
        kind: 'step-name-kept',
        message: `step name "${d.label}" is now the heading "${h.text}"`,
        original: [d.pos.start.line],
        structured: [h.pos.start.line],
      });
    } else {
      findings.push({
        severity: 'lost',
        kind: 'step-name-lost',
        message: `step name "${d.label}" is not a heading of the structured recipe`,
        original: [d.pos.start.line],
        structured: [],
      });
    }
  }

  // Part names: they should become component headings, but a part may need none (a part of
  // one step becomes that step), so a name not used is for review, not a failure.
  const names = new Map<string, { name: string; line: number }>();
  for (const g of t?.ingredients?.items ?? []) if (g.label && g.labelPos) names.set(partKey(g.label), { name: g.label, line: g.labelPos.start.line });
  for (const p of t?.directions?.parts ?? []) if (p.label && p.heading && !names.has(partKey(p.label))) names.set(partKey(p.label), { name: p.label, line: p.heading.pos.start.line });
  for (const [key, { name, line }] of names) {
    const h = byKey.get(key);
    if (h) accounted.add(h);
    else
      findings.push({
        severity: 'review',
        kind: 'part-name-unused',
        message: `part name "${name}" is not used as a heading`,
        original: [line],
        structured: [],
      });
  }

  const components = new Set(componentsOf(structured.nodes).map((c) => c.heading));
  for (const h of headings) {
    if (accounted.has(h)) continue;
    const isComponent = components.has(h);
    findings.push({
      severity: 'new',
      kind: isComponent ? 'component-heading' : 'step-heading',
      message: `${isComponent ? 'component' : 'step'} heading "${h.text}"`,
      original: [],
      structured: [h.pos.start.line],
    });
  }

  const callouts: Callout[] = [];
  const walk = (n: Node) => {
    callouts.push(...n.callouts);
    if (n.kind === 'component') n.children.forEach(walk);
  };
  structured.nodes.forEach(walk);
  for (const c of callouts) {
    findings.push({
      severity: 'new',
      kind: 'callout',
      message: `callout keyword "${c.keyword}" (its text is checked with the ${moves.callouts.has(c.pos.start.offset) ? 'notes' : 'directions'})`,
      original: [],
      structured: [c.pos.start.line],
    });
  }
}

// ------------------------------------------------------- title, frontmatter, notes

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

function checkFrontmatter(original: Recipe, structured: Recipe, findings: Finding[]): void {
  const a = { ...(original.frontmatter.data ?? {}) };
  const b = { ...(structured.frontmatter.data ?? {}) };
  delete a.form;
  delete b.form;
  const oLine = original.frontmatter.pos?.start.line ?? 1;
  const sLine = structured.frontmatter.pos?.start.line ?? 1;
  const compare = (x: Record<string, unknown>, y: Record<string, unknown>, prefix: string) => {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const name = prefix + k;
      if (!(k in y)) findings.push({ severity: 'lost', kind: 'frontmatter-changed', message: `frontmatter key "${name}" was removed (was ${stable(x[k])})`, original: [oLine], structured: [] });
      else if (!(k in x)) findings.push({ severity: 'lost', kind: 'frontmatter-changed', message: `frontmatter key "${name}" was added (${stable(y[k])})`, original: [], structured: [sLine] });
      else if (stable(x[k]) !== stable(y[k])) {
        const xv = x[k];
        const yv = y[k];
        if (xv && yv && typeof xv === 'object' && typeof yv === 'object' && !Array.isArray(xv) && !Array.isArray(yv)) {
          compare(xv as Record<string, unknown>, yv as Record<string, unknown>, `${name}.`);
        } else {
          findings.push({ severity: 'lost', kind: 'frontmatter-changed', message: `frontmatter key "${name}" changed: ${stable(xv)} → ${stable(yv)}`, original: [oLine], structured: [sLine] });
        }
      }
    }
  };
  compare(a, b, '');
}

interface FreeText {
  text: string;
  line: number;
  /** For a block inside a step: the step's heading. */
  where?: string;
  /** For a note: written as a paragraph or as one `- ` item (its text without the marker). */
  form?: 'paragraph' | 'item';
}

function blockText(source: string, pos: Pos, ctx: ScaleContext): string {
  return ws(rewriteTemperatures(source.slice(pos.start.offset, pos.end.offset), ctx));
}

const ITEM_MARKER_RE = /^[-*+][ \t]+/;

/**
 * The blocks of a Notes section in source order: each note (a paragraph, or one list item
 * read without its marker, so that the two compare alike) and anything else written there.
 */
function notesBlocks(recipe: Recipe, ctx: ScaleContext): FreeText[] {
  const notes = recipe.notes;
  if (!notes) return [];
  const source = recipe.source;
  return [
    ...notes.items.map((n) => {
      const text = blockText(source, n.pos, ctx);
      return { at: n.pos.start.offset, f: { text: n.form === 'item' ? text.replace(ITEM_MARKER_RE, '') : text, line: n.pos.start.line, form: n.form } };
    }),
    ...notes.other.map((o) => ({ at: o.pos.start.offset, f: { text: blockText(source, o.pos, ctx), line: o.pos.start.line } })),
  ]
    .sort((x, y) => x.at - y.at)
    .map((b) => b.f);
}

/**
 * Match one run of free text block for block: each original block must be in `S`, word for
 * word (white space and temperature notation aside), in the same order. Returns the indices
 * of `O` left unmatched, for the caller to look for elsewhere, and records the rest.
 */
function matchFreeText(
  O: FreeText[],
  S: FreeText[],
  area: string,
  findings: Finding[],
): { kept: number; missing: FreeText[]; extra: FreeText[] } {
  const used = new Set<number>();
  const assigned: number[] = [];
  const assignedO: FreeText[] = [];
  const missing: FreeText[] = [];
  for (const o of O) {
    const at = S.findIndex((s, i) => !used.has(i) && s.text === o.text);
    if (at < 0) {
      missing.push(o);
      continue;
    }
    used.add(at);
    assigned.push(at);
    assignedO.push(o);
    // A paragraph note written as one `- ` item, word for word (SPEC §4.2), or the reverse.
    const s = S[at];
    if (o.form && s.form && o.form !== s.form) {
      const how = o.form === 'paragraph' ? 'paragraph written as a list item' : 'list item written as a paragraph';
      findings.push({ severity: 'review', kind: 'note-listed', message: `${how}, word for word: "${clip(o.text)}"`, original: [o.line], structured: [s.line] });
    }
  }
  // An altered block: the unmatched original block closest to an unmatched structured one.
  const stillMissing: FreeText[] = [];
  for (const o of missing) {
    const near = S.findIndex((s, i) => !used.has(i) && similarity(s.text, o.text) >= 0.5);
    if (near < 0) {
      stillMissing.push(o);
      continue;
    }
    used.add(near);
    findings.push({ severity: 'lost', kind: 'note-missing', message: `${area} altered: ${clip(wordDiff(o.text, S[near].text), 240)}`, original: [o.line], structured: [S[near].line] });
  }
  const inOrder = longestIncreasing(assigned);
  assigned.forEach((at, i) => {
    if (!inOrder.has(i))
      findings.push({ severity: 'lost', kind: 'note-reordered', message: `${area} out of order: "${clip(assignedO[i].text)}"`, original: [assignedO[i].line], structured: [S[at].line] });
  });
  return { kept: inOrder.size, missing: stillMissing, extra: S.filter((_, i) => !used.has(i)) };
}

interface NoteMove {
  /** The note of the original. */
  note: FreeText;
  callout: Callout;
  /** The heading of the step the callout is under. */
  step: string;
  /** For a repeat: where the note already is (the Notes section, or an earlier callout). */
  already?: 'notes' | 'callout';
}

interface NoteMoves {
  /** Notes of the original that moved, word for word, to a callout under a step. */
  moved: NoteMove[];
  /** Callouts that repeat a note the structured recipe already has elsewhere. */
  repeated: NoteMove[];
  /** Source offsets of the callouts of `moved` and `repeated`: checked with the notes, not the directions. */
  callouts: Set<number>;
}

/**
 * The one move the notes allow: a note of the original's Notes that
 * belongs to one step may become a callout under that step, with a label of the author's
 * choosing and the note's words unchanged, and leaves the Notes section. A callout is such a
 * move when its whole text is, word for word, the text of one note (a paragraph or one list
 * item; not a table or a heading), and that note is not also in the Notes section. A
 * `Choose` callout is never one (it belongs to a component and carries a choice), and a
 * callout whose sentences are all direction sentences of the original is left to the
 * directions, which accept it there. Every other label is accepted, `Checkpoint` included:
 * the checker cannot judge meaning, for a direction sentence or for a note, and lists the
 * label so a reviewer sees it.
 */
function findNoteMoves(original: Recipe, structured: Recipe, ctx: ScaleContext): NoteMoves {
  const out: NoteMoves = { moved: [], repeated: [], callouts: new Set() };
  if (structured.form !== 'structured') return out;
  const oNotes = notesBlocks(original, ctx).filter((n) => n.form !== undefined);
  if (oNotes.length === 0) return out;
  const sNotes = notesBlocks(structured, ctx);
  const said = new Set(directionSentences(original, ctx).flatMap((p) => p.items.map((s) => s.text)));
  const taken = new Set<FreeText>();
  for (const { step } of stepsIn(structured.nodes)) {
    for (const c of step.callouts) {
      if (c.keyword === 'Choose') continue;
      const text = ws(rewriteTemperatures(c.raw, ctx));
      const same = oNotes.filter((n) => n.text === text);
      if (same.length === 0) continue;
      if (sentences(text).every((s) => said.has(s))) continue;
      out.callouts.add(c.pos.start.offset);
      // As many of these notes may move as the Notes section no longer has.
      const inNotes = sNotes.filter((n) => n.text === text).length;
      const movable = same.length - inNotes;
      const note = same.find((n) => !taken.has(n));
      if (note && same.filter((n) => taken.has(n)).length < movable) {
        taken.add(note);
        out.moved.push({ note, callout: c, step: step.heading.text });
      } else {
        out.repeated.push({ note: same[0], callout: c, step: step.heading.text, already: inNotes > 0 ? 'notes' : 'callout' });
      }
    }
  }
  return out;
}

/**
 * Notes and the text before the first heading. The original's notes must be in the
 * structured recipe's `## Notes` section, word for word and in order (SPEC §4.2); a
 * paragraph note written as one `- ` item (the convention), or the reverse, is listed for
 * review as `note-listed`. A note that belongs to one step may instead be a callout under
 * that step, word for word (`findNoteMoves`), listed for review as `note-moved`; a note both
 * there and in the Notes section, or in two callouts, is `note-repeated`. Its
 * preamble must be the structured preamble. A note found anywhere else (before the first
 * step, in a step's prose) is reported as misplaced; one found nowhere is missing. Text in the
 * structured preamble or Notes section that the original does not have is added.
 */
function checkNotes(original: Recipe, structured: Recipe, ctx: ScaleContext, moves: NoteMoves, findings: Finding[]): { original: number; kept: number } {
  const free = (recipe: Recipe, ps: Pos[]): FreeText[] => ps.map((p) => ({ text: blockText(recipe.source, p, ctx), line: p.start.line }));
  const oPre = free(original, original.preamble.map((b) => b.pos));
  const movedLines = new Set(moves.moved.map((m) => m.note.line));
  const oAll = notesBlocks(original, ctx);
  const oNotes = oAll.filter((n) => !movedLines.has(n.line));
  const sPre = free(structured, structured.preamble.map((b) => b.pos));
  const sNotes = notesBlocks(structured, ctx);

  const pre = matchFreeText(oPre, sPre, 'text before the first step', findings);
  const notes = matchFreeText(oNotes, sNotes, 'note', findings);

  for (const m of moves.moved) {
    findings.push({
      severity: 'review',
      kind: 'note-moved',
      message: `note moved to its step, "${m.step}", as a "${m.callout.keyword}" callout, word for word: "${clip(m.note.text)}"`,
      original: [m.note.line],
      structured: [m.callout.pos.start.line],
    });
  }
  for (const m of moves.repeated) {
    findings.push({
      severity: 'lost',
      kind: 'note-repeated',
      message: `note is ${m.already === 'notes' ? 'in the Notes section' : 'in another callout'} and again in a "${m.callout.keyword}" callout of the step "${m.step}": "${clip(m.note.text)}"`,
      original: [m.note.line],
      structured: [m.callout.pos.start.line],
    });
  }

  // Where else a block may have gone: the other free-text area, or any block of a step.
  const stepTexts: FreeText[] = [];
  const kindOf = new Map<FreeText, StepBlock['kind']>();
  const calloutText = new Map<FreeText, string>();
  const walk = (n: Node) => {
    for (const b of n.blocks) {
      if (b.kind === 'callout' && moves.callouts.has(b.pos.start.offset)) continue;
      const f = { text: blockText(structured.source, b.pos, ctx), line: b.pos.start.line, where: n.heading.text };
      kindOf.set(f, b.kind);
      if (b.kind === 'callout') calloutText.set(f, ws(rewriteTemperatures(b.raw, ctx)));
      stepTexts.push(f);
    }
    if (n.kind === 'component') n.children.forEach(walk);
  };
  structured.nodes.forEach(walk);
  const claimed = new Set<FreeText>();
  const findElsewhere = (o: FreeText, areas: { list: FreeText[]; name: (f: FreeText) => string }[]): { at: FreeText; name: string } | null => {
    for (const a of areas) {
      const hit = a.list.find((s) => !claimed.has(s) && (s.text === o.text || s.text.includes(o.text)));
      if (hit) {
        if (hit.text === o.text) claimed.add(hit);
        return { at: hit, name: a.name(hit) };
      }
    }
    return null;
  };
  const inStep = (f: FreeText) => {
    const kind = kindOf.get(f);
    if (kind === 'prose') return `in the prose of the step "${f.where}" (a note may move to its step only as a callout, word for word)`;
    if (kind === 'callout') return `in a callout of the step "${f.where}", with other words or as a Choose`;
    return `in the step "${f.where}"`;
  };
  // A note moved to a callout with its words changed: name the callout and the change.
  const callouts = [...calloutText.keys()];

  for (const o of notes.missing) {
    const found = findElsewhere(o, [
      { list: pre.extra, name: () => 'before the first step' },
      { list: stepTexts, name: inStep },
    ]);
    const near = found ? undefined : callouts.find((f) => similarity(calloutText.get(f)!, o.text) >= 0.5);
    if (found) {
      findings.push({ severity: 'lost', kind: 'note-misplaced', message: `note is ${found.name}, not in the Notes section: "${clip(o.text)}"`, original: [o.line], structured: [found.at.line] });
    } else if (near) {
      findings.push({
        severity: 'lost',
        kind: 'note-missing',
        message: `note moved to a callout of the step "${near.where}" and altered: ${clip(wordDiff(o.text, calloutText.get(near)!), 240)}`,
        original: [o.line],
        structured: [near.line],
      });
    } else findings.push({ severity: 'lost', kind: 'note-missing', message: `note missing: "${clip(o.text)}"`, original: [o.line], structured: [] });
  }
  for (const o of pre.missing) {
    const found = findElsewhere(o, [
      { list: notes.extra, name: () => 'in the Notes section' },
      { list: stepTexts, name: inStep },
    ]);
    if (found) {
      findings.push({ severity: 'lost', kind: 'note-misplaced', message: `text from before the original's first direction is ${found.name}: "${clip(o.text)}"`, original: [o.line], structured: [found.at.line] });
    } else findings.push({ severity: 'lost', kind: 'note-missing', message: `text before the first step missing: "${clip(o.text)}"`, original: [o.line], structured: [] });
  }
  for (const s of pre.extra) {
    if (!claimed.has(s)) findings.push({ severity: 'lost', kind: 'note-added', message: `text before the first step that is not in the original's preamble: "${clip(s.text)}"`, original: [], structured: [s.line] });
  }
  for (const s of notes.extra) {
    if (!claimed.has(s)) findings.push({ severity: 'lost', kind: 'note-added', message: `text in the Notes section that is not in the original's notes: "${clip(s.text)}"`, original: [], structured: [s.line] });
  }
  return { original: oPre.length + oAll.length, kept: pre.kept + notes.kept + moves.moved.length };
}

// ------------------------------------------------------------------------- check

/**
 * The suffix a twin's title carries when Etna ships a recipe in both forms side by side
 * (`cookbook/potato-soup-traditional-form`): "Potato Soup (Traditional Form)" beside "Potato Soup".
 */
export const TWIN_SUFFIX = ' (Traditional Form)';

/**
 * The titles agree when they are the same, or when the original's is the structured title
 * followed by exactly ` (Traditional Form)`. The suffix on the structured side does not count.
 */
export function titlesAgree(original: string, structured: string): boolean {
  return original === structured || (structured !== '' && original === structured + TWIN_SUFFIX);
}

/** Compare a traditional recipe with its structured conversion. */
export function checkRestructure(original: Recipe, structured: Recipe): CheckReport {
  const findings: Finding[] = [];
  if (original.form !== 'traditional') {
    findings.push({ severity: 'lost', kind: 'not-traditional', message: 'the original is not in the traditional form (form: traditional)', original: [1], structured: [] });
  }
  if (structured.form !== 'structured') {
    findings.push({ severity: 'lost', kind: 'not-structured', message: 'the conversion is not in the structured form (remove form: traditional)', original: [], structured: [1] });
  }
  if (!titlesAgree(original.title?.text ?? '', structured.title?.text ?? '')) {
    findings.push({
      severity: 'lost',
      kind: 'title-changed',
      message: `title "${original.title?.text ?? ''}" → "${structured.title?.text ?? ''}"`,
      original: original.title ? [original.title.pos.start.line] : [],
      structured: structured.title ? [structured.title.pos.start.line] : [],
    });
  }
  checkFrontmatter(original, structured, findings);

  // The temperature scale the original uses decides how a bare `350 degrees` reads on both sides.
  const texts = (original.traditional?.directions?.items ?? []).map((d) => d.text).join('\n');
  const ctx = scaleContext(scanTemperatures(texts).stated);

  const ingredients = checkIngredients(original, structured, findings);
  const moves = findNoteMoves(original, structured, ctx);
  const sentenceCounts = structured.form === 'structured' ? checkDirections(original, structured, ctx, moves, findings) : { original: 0, kept: 0 };
  checkHeadings(original, structured, moves, findings);
  const notes = checkNotes(original, structured, ctx, moves, findings);

  const order: Record<Severity, number> = { lost: 0, review: 1, new: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.original[0] ?? 1e9) - (b.original[0] ?? 1e9) || (a.structured[0] ?? 1e9) - (b.structured[0] ?? 1e9));
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
  return {
    ok: count('lost') === 0,
    findings,
    counts: { ingredients, sentences: sentenceCounts, notes, lost: count('lost'), review: count('review'), new: count('new') },
  };
}

// ------------------------------------------------------------------------ output

export interface ReportNames {
  original: string;
  structured: string;
}

function where(f: Finding, names: ReportNames): string {
  const parts: string[] = [];
  if (f.original.length) parts.push(`${names.original}:${f.original.join(',')}`);
  if (f.structured.length) parts.push(`${names.structured}:${f.structured.join(',')}`);
  return parts.join(' ↔ ');
}

/** The report as plain text, one finding per line, grouped by severity. */
export function formatReport(report: CheckReport, names: ReportNames): string {
  const c = report.counts;
  const out: string[] = [
    `etna restructure check: ${names.original} → ${names.structured}`,
    '',
    `Ingredient lines accounted for: ${c.ingredients.accounted} of ${c.ingredients.original}`,
    `Direction sentences kept in order: ${c.sentences.kept} of ${c.sentences.original}`,
    `Notes kept: ${c.notes.kept} of ${c.notes.original}`,
  ];
  const sections: [Severity, string][] = [
    ['lost', 'Lost or altered (these fail the check)'],
    ['review', 'Accepted changes (they pass; read each one before you share the recipe)'],
    ['new', 'New by necessity'],
  ];
  for (const [sev, title] of sections) {
    const list = report.findings.filter((f) => f.severity === sev);
    out.push('', `${title}: ${list.length}`);
    for (const f of list) out.push(`  ${where(f, names)}  ${f.kind}: ${f.message}`);
  }
  out.push('', report.ok ? 'Result: PASS — nothing was lost or altered.' : `Result: FAIL — ${c.lost} finding${c.lost === 1 ? '' : 's'} above.`);
  return out.join('\n');
}
