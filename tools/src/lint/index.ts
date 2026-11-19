// The Etna linter: the deterministic pass/fail authority of SPEC §9.
//
// Pure and browser-safe: it takes a parsed recipe and returns findings. Reading files, walking
// a collection and the collection-level rules live in `node.ts`.

import { slug } from 'github-slugger';
import type { Nodes } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';

import { allSteps, buildGraph, isGroup, isNotesHeading, partKey, productCount, splitQualifier, traditionalParts } from '../core/index.ts';
import type { Callout, Component, IngredientLine, Node, OtherBlock, Pos, Prose, Recipe, Step, StepBlock } from '../core/index.ts';
import { NODE_MAX_LINES, nodeText } from '../dag/text.ts';
import { classifyLabel, levenshtein, slipDistance } from './callouts.ts';
import { lintPicture, type PictureFile } from './picture.ts';
import { SEVERITY, type RuleId, type Severity } from './rules.ts';

export { SEVERITY, type RuleId, type Severity } from './rules.ts';
export { classifyLabel, levenshtein, KEYWORDS, type LabelClass } from './callouts.ts';
export type { PictureFile } from './picture.ts';

export interface Finding {
  /** Rule id from rules.yaml. */
  rule: string;
  severity: Severity;
  /** One plain sentence. */
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** Text of the nearest enclosing heading, or null. */
  at: string | null;
}

export interface LintOptions {
  /**
   * Called for each external reference target (`../slug/`). Return false if it does not exist.
   * Omitted = external references are not checked.
   */
  resolveExternal?: (target: string) => boolean;
  /**
   * The files directly in the recipe's `image/` folder (SPEC §4.3), an empty list when it has
   * none. Omitted = the folder cannot be seen: the checks of the files, and of whether the
   * picture line's file is there, are skipped.
   */
  pictures?: PictureFile[];
}

/** Lint one parsed recipe. Findings are sorted by line, then column. */
export function lintRecipe(recipe: Recipe, options: LintOptions = {}): Finding[] {
  const out = new Collector();

  lintFrontmatter(recipe, out);
  lintTitle(recipe, out);
  lintPicture(recipe, options.pictures, (rule, where, at, message) => out.add(rule, where, at, message));

  // An unknown `form:` is already an error, and the body was read as structured only for want
  // of a better guess. Form-specific rules would then report on a form the author may not
  // have meant, so they wait until the form is fixed.
  const formKnown = recipe.formRaw === null || recipe.formRaw === 'structured' || recipe.formRaw === 'traditional';
  if (formKnown) {
    if (recipe.traditional) lintTraditional(recipe, out);
    else lintStructured(recipe, options, out);
  }

  return out.sorted();
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'error');
}

/** Build a finding with the severity the rule table gives it. For the collection-level rules in `node.ts`. */
export function finding(rule: RuleId, message: string, line = 1, column = 1, at: string | null = null): Finding {
  return { rule, severity: SEVERITY[rule], message, line, column, at };
}

// --------------------------------------------------------------------- helpers

interface Where {
  line: number;
  column: number;
}

class Collector {
  private readonly findings: Finding[] = [];

  add(rule: RuleId, where: Where | Pos, at: string | null, message: string): void {
    const point = 'start' in where ? where.start : where;
    this.findings.push(finding(rule, message, point.line, point.column, at));
  }

  sorted(): Finding[] {
    // Array.prototype.sort is stable, so findings at one position keep the order they were found in.
    return [...this.findings].sort((a, b) => a.line - b.line || a.column - b.column);
  }
}

/** Where the body starts: the title, or the first line after the frontmatter. */
function bodyStart(recipe: Recipe): Where {
  if (recipe.title) return recipe.title.pos.start;
  const fm = recipe.frontmatter.pos;
  return fm ? { line: fm.end.line + 1, column: 1 } : { line: 1, column: 1 };
}

/** The line of a top-level frontmatter key, or the start of the frontmatter. */
function frontmatterKey(recipe: Recipe, key: string): Where {
  const { raw, pos } = recipe.frontmatter;
  if (raw === null || pos === null) return { line: 1, column: 1 };
  const index = raw.split('\n').findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`"${key}":`) || l.startsWith(`'${key}':`));
  // The YAML text starts on the line after the opening `---`.
  return index < 0 ? pos.start : { line: pos.start.line + 1 + index, column: 1 };
}

/** Text quoted inside a message: whitespace collapsed, long text cut short. */
function quote(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// ------------------------------------------------------------------ both forms

function lintFrontmatter(recipe: Recipe, out: Collector): void {
  const fm = recipe.frontmatter;
  const rule = 'missing-frontmatter-field';
  if (fm.error !== null) {
    out.add(rule, fm.pos ?? { line: 1, column: 1 }, null, `The frontmatter is malformed: ${quote(fm.error, 120).replace(/[.:]$/, '')}.`);
  } else if (fm.raw === null || fm.data === null) {
    out.add(rule, { line: 1, column: 1 }, null, 'The file has no frontmatter, so the required `etna` key is missing.');
  } else if (!('etna' in fm.data)) {
    out.add(rule, fm.pos ?? { line: 1, column: 1 }, null, 'The frontmatter has no `etna` key; it is required.');
  } else if (recipe.etna === null) {
    const value = JSON.stringify(fm.data.etna) ?? String(fm.data.etna);
    out.add(rule, frontmatterKey(recipe, 'etna'), null, `The frontmatter \`etna\` value must be an integer format version, not ${quote(value, 40)}.`);
  }

  const form = recipe.formRaw;
  if (form !== null && form !== 'structured' && form !== 'traditional') {
    out.add('unknown-form', frontmatterKey(recipe, 'form'), null, `The frontmatter \`form\` value "${quote(form, 40)}" is neither "structured" nor "traditional".`);
  }
}

function lintTitle(recipe: Recipe, out: Collector): void {
  const title = recipe.title;
  if (!title) {
    out.add('missing-title', bodyStart(recipe), null, 'The body has no H1 title.');
    return;
  }
  if (!recipe.titleFirst) {
    out.add('missing-title', title.pos, null, `The title "${quote(title.text)}" is not the first thing in the body; the body must open with its H1.`);
  }
  if (!title.plain) {
    out.add('title-not-plain-text', title.pos, null, `The title "${quote(title.text)}" contains inline formatting; it should be plain text.`);
  }
  if (recipe.h1Count > 1) {
    const extras = extraTitles(recipe);
    for (const extra of extras) {
      out.add('missing-title', extra.where, extra.at, `The body has more than one H1: "${quote(extra.text)}" follows the title "${quote(title.text)}".`);
    }
    if (extras.length === 0) {
      out.add('missing-title', title.pos, null, `The body has ${recipe.h1Count} H1 headings; only the title "${quote(title.text)}" may be an H1.`);
    }
  }
}

const ATX_H1 = /^ {0,3}#(?!#)\s*(.*?)\s*#*\s*$/;
const SETEXT_H1 = /^(.*)\n {0,3}=+\s*$/s;

/** The H1 headings after the first. The parser keeps them as other-blocks where they stand. */
function extraTitles(recipe: Recipe): { text: string; where: Where; at: string | null }[] {
  const found: { text: string; where: Where; at: string | null }[] = [];
  const scan = (blocks: (StepBlock | OtherBlock)[], at: string | null) => {
    for (const b of blocks) {
      if (b.kind !== 'other' || b.nodeType !== 'heading') continue;
      if (ATX_H1.test(b.raw) || SETEXT_H1.test(b.raw)) found.push({ text: b.text.trim(), where: b.pos.start, at });
    }
  };
  scan(recipe.preamble, null);
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      scan(n.blocks, n.heading.text);
      if (n.kind === 'component') walk(n.children);
    }
  };
  walk(recipe.nodes);
  if (recipe.notes && !recipe.traditional) scan(recipe.notes.other, recipe.notes.heading.text);
  const t = recipe.traditional;
  if (t) {
    for (const section of [t.ingredients, t.directions, t.notes]) if (section) scan(section.other, section.heading.text);
    // A section the form gives no meaning to is kept as source text only: look for `# ` lines in it.
    for (const section of t.otherSections) {
      section.raw.split('\n').forEach((text, i) => {
        const m = i > 0 ? ATX_H1.exec(text) : null;
        if (m) found.push({ text: m[1], where: { line: section.pos.start.line + i, column: 1 }, at: section.heading.text });
      });
    }
  }
  return found;
}

function lintIngredients(lines: IngredientLine[], at: string | null, out: Collector): void {
  for (const line of lines) {
    if (line.kind !== 'ingredient') continue;
    if (line.item === '') {
      const message =
        /^[-*+]?\s*$/.test(line.raw)
          ? 'An ingredient bullet is empty.'
          : `The ingredient line "${quote(line.raw)}" names no item; it does not parse as "quantity unit item".`;
      out.add('ingredient-unparsed', line.pos, at, message);
      continue;
    }
    if (line.quantity === null && line.remark === null) {
      out.add('missing-quantity', line.pos, at, `The ingredient "${quote(line.raw)}" has no quantity; add one, or say its use after an em dash (\u2014 to taste, \u2014 for dusting).`);
    }
    if (line.unit?.def.kind === 'recipe') {
      out.add('include-as-text', line.pos, at, `The ingredient "${quote(line.raw)}" names another recipe as text; consider a reference link.`);
    }
  }
}

// ------------------------------------------------------------ structured form

function lintStructured(recipe: Recipe, options: LintOptions, out: Collector): void {
  if (allSteps(recipe.nodes).length === 0) {
    out.add('no-steps', bodyStart(recipe), null, 'The recipe has no steps: a structured recipe needs at least one heading below the title.');
  }

  // A callout before the first heading is attached to nothing.
  lintCallouts(recipe.preamble, null, out);
  for (const c of calloutsOf(recipe.preamble)) {
    if (c.keyword === 'Choose') {
      out.add('choose-too-few-branches', c.pos, null, 'The Choose callout is above the first heading, so it marks no component and has no branches to choose between.');
    }
  }

  const visit = (node: Node) => {
    if (node.kind === 'step') lintStep(node, out);
    else {
      lintComponent(node, out);
      node.children.forEach(visit);
    }
  };
  recipe.nodes.forEach(visit);

  lintNotesPlacement(recipe, out);
  lintHeadings(recipe, out);
  lintOptional(recipe, out);
  lintReferences(recipe, options, out);
}

/**
 * `## Notes` is reserved (SPEC §4.2): it is the recipe's notes when it is the last H2, and
 * any other H2 of that name is read as an ordinary step or component, which is never what was
 * meant. Say which of the two mistakes it is and how to fix it.
 */
function lintNotesPlacement(recipe: Recipe, out: Collector): void {
  for (const n of recipe.nodes) {
    if (n.heading.depth !== 2 || !isNotesHeading(n.heading)) continue;
    const text = quote(n.heading.text);
    const message = recipe.notes
      ? `The heading "${text}" repeats the Notes section on line ${recipe.notes.heading.pos.start.line}; a recipe has one Notes section, at the end. Merge the two, or if this is a step, give it another name (for example "${text} on serving").`
      : `The heading "${text}" is read as a step, not as the recipe's notes: the Notes section must be the last section. Move it after the final step, or if this is a step, give it another name.`;
    out.add('notes-misplaced', n.heading.pos, n.heading.text, message);
  }
}

function calloutsOf(blocks: StepBlock[]): Callout[] {
  return blocks.filter((b): b is Callout => b.kind === 'callout');
}

function lintStep(step: Step, out: Collector): void {
  const name = step.heading.text;
  if (step.instructions.length === 0) {
    const message =
      step.ingredients.length > 0
        ? `The step "${quote(name)}" has ingredients but no instruction.`
        : `The step "${quote(name)}" has no instruction.`;
    out.add('step-missing-instruction', step.heading.pos, name, message);
  }
  lintIngredients(step.ingredients, name, out);
  lintCallouts(step.blocks, name, out);
  lintMarks(step, out);
  for (const c of step.callouts) {
    if (c.keyword === 'Choose') {
      out.add('choose-too-few-branches', c.pos, name, `The Choose callout is on the step "${quote(name)}", which has no child headings to choose between.`);
    }
  }
}

/** Spelled out for a message: a box of more than five lines. */
const MAX_LINES_WORD = 'five';

/**
 * The marks (SPEC §5, "Marks"): a box drawn longer than five lines, counted with the chart's
 * own wrap at one cell per character (`chart-box-long`), and an asterisk left in the
 * instruction as text, which prints as an asterisk (`stray-asterisk`). A step with no marks
 * shows its heading alone and is never long.
 */
function lintMarks(step: Step, out: Collector): void {
  const name = step.heading.text;
  if (step.marks.length > 0) {
    const lines = nodeText(step).length;
    if (lines > NODE_MAX_LINES) {
      out.add('chart-box-long', step.heading.pos, name, `The step "${quote(name)}" draws a chart box of ${lines} lines, more than ${MAX_LINES_WORD}: mark fewer words.`);
    }
  }
  for (const prose of step.instructions) {
    for (const where of strayAsterisks(prose)) {
      out.add('stray-asterisk', where, name, `An asterisk in the instruction of "${quote(name)}" is not part of a mark and prints as an asterisk: close the mark (*like this*), or write \\* for an asterisk.`);
    }
  }
}

/**
 * Where an instruction paragraph has a `*` as text: in the literal text of its parsed tree,
 * not escaped (`\*` is an asterisk on purpose). Code spans, links' destinations and the
 * delimiters of emphasis and bold are not text.
 */
function strayAsterisks(prose: Prose): Where[] {
  const found: Where[] = [];
  const start = prose.pos.start;
  const walk = (node: Nodes) => {
    if (node.type === 'text' && node.position) {
      const from = node.position.start.offset!;
      const text = prose.raw.slice(from, node.position.end.offset!);
      let line = node.position.start.line;
      let column = node.position.start.column;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '*' && text[i - 1] !== '\\') found.push({ line: start.line + line - 1, column: line === 1 ? start.column + column - 1 : column });
        if (text[i] === '\n') {
          line++;
          column = 1;
        } else column++;
      }
    }
    if ('children' in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(fromMarkdown(prose.raw));
  return found;
}

function lintComponent(component: Component, out: Collector): void {
  const name = component.heading.text;
  const content = component.blocks.filter((b) => b.kind !== 'callout');
  if (content.length > 0) {
    const kinds = new Set(content.map((b) => b.kind));
    const what =
      kinds.size === 1 && kinds.has('ingredients')
        ? 'ingredients'
        : kinds.size === 1 && kinds.has('prose')
          ? 'instructions'
          : kinds.has('ingredients') && kinds.has('prose') && kinds.size === 2
            ? 'ingredients and instructions'
            : 'content';
    out.add('component-has-content', content[0].pos, name, `The component "${quote(name)}" has ${what} of its own; they belong in a step.`);
  }
  lintCallouts(component.blocks, name, out);
  for (const c of component.callouts) {
    if (c.keyword === 'Choose' && component.children.length < 2) {
      out.add(
        'choose-too-few-branches',
        c.pos,
        name,
        `The Choose callout on "${quote(name)}" has only ${component.children.length} child heading to choose between; it needs at least two.`,
      );
    }
  }
}

function lintCallouts(blocks: StepBlock[], at: string | null, out: Collector): void {
  // Any label is an aside (SPEC §5.1); only one that looks like a mistake for a keyword is reported.
  for (const c of calloutsOf(blocks)) {
    const cls = classifyLabel(c.keyword);
    if (cls.kind !== 'near-miss') continue;
    const label = quote(c.keyword, 40);
    out.add('callout-near-miss', c.pos, at, `The callout label "${label}" looks like a mistake for the keyword "${cls.suggestion}". Write "${cls.suggestion}" if that is meant; for an aside, use another word.`);
  }
}

/** The words that designate a heading optional after its em dash (SPEC §6), as in an ingredient remark. */
const OPTIONAL_WORDS = /^(optional|if desired|if using)\b/i;

/** `optional` within one slip, a trailing `s` dropped: the measure `callout-near-miss` uses (SPEC §5.1). */
function nearOptional(letters: string): boolean {
  const forms = letters.endsWith('s') ? [letters, letters.slice(0, -1)] : [letters];
  return forms.some((f) => slipDistance(f, 'optional') <= 1);
}

/**
 * A heading whose optional qualifier is written wrongly, so it is not read (SPEC §6, §9):
 * `optional` in parentheses or square brackets, or after a hyphen, an en dash, an unspaced dash or a comma; a qualifier
 * that misspells it (`— optinal`, `— Optoinal`) or runs on without a comma (`— optional if you
 * like`). The author's own words are left alone: a heading that begins `Optionally…` and a
 * callout labeled `Optional` are not reported.
 */
function lintOptional(recipe: Recipe, out: Collector): void {
  const fix = (name: string) => `\`${name} — optional\``;
  const visit = (node: Node) => {
    const text = node.heading.text;
    if (!node.optional) {
      const { name, qualifier } = splitQualifier(text);
      const head = qualifier?.split(',')[0].trim() ?? '';
      const letters = head.toLowerCase().replace(/[^a-z]+/g, '');
      const tail = /^(.*?)(?:\s*[(\[]\s*|\s+[-–]\s*|\s*[-–—]\s*|\s*,\s*)(optional|if desired|if using)\s*[)\]]?\s*$/i.exec(text);
      let message: string | null = null;
      if (qualifier !== null && (OPTIONAL_WORDS.test(head) || nearOptional(letters))) {
        message = `The heading "${quote(text)}" has the qualifier "${quote(qualifier, 40)}", which is not read as optional: write ${fix(name)} (or "if desired", "if using"; anything more after a comma).`;
      } else if (qualifier === null && tail && tail[1].trim() !== '') {
        message = `The heading "${quote(text)}" is not read as optional: only a qualifier after a spaced em dash designates it. Write ${fix(tail[1].trim())}.`;
      }
      if (message) out.add('optional-near-miss', node.heading.pos, text, message);
    }
    if (node.kind === 'component') node.children.forEach(visit);
  };
  recipe.nodes.forEach(visit);
}

function lintHeadings(recipe: Recipe, out: Collector): void {
  const first = new Map<string, number>();
  for (const h of recipe.headings) {
    const line = first.get(h.text);
    if (line === undefined) first.set(h.text, h.pos.start.line);
    else out.add('duplicate-heading', h.pos, h.text, `The heading "${quote(h.text)}" is also used on line ${line}; heading text must be unique within a recipe.`);
  }
}

/** True for a link destination that is a URL rather than a path to another recipe. */
function isUrl(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

function lintReferences(recipe: Recipe, options: LintOptions, out: Collector): void {
  // buildGraph percent-decodes anchors and throws on a malformed escape (`#50%`). Such an
  // anchor can match no heading: report it here, and keep it away from buildGraph.
  let malformed = false;
  for (const step of allSteps(recipe.nodes)) {
    for (const line of step.ingredients) {
      if (!isMalformedAnchor(line)) continue;
      malformed = true;
      out.add('unresolved-reference', line.pos, step.heading.text, `The reference "${quote(line.raw)}" has a malformed anchor that matches no heading.`);
    }
  }
  const graph = buildGraph(malformed ? { ...recipe, nodes: withoutMalformedAnchors(recipe.nodes) } : recipe);

  for (const problem of graph.problems) {
    const { reference, step } = problem;
    const anchor = decodeURIComponent(reference.target.slice(1));
    if (problem.reason === 'unresolved') {
      // The title takes the first anchor of its text, so a heading that repeats the title
      // gets a numbered anchor and the plain one resolves to nothing.
      const shadowed = recipe.title && slug(recipe.title.text) === anchor ? recipe.headings.find((h) => slug(h.text) === anchor) : undefined;
      const message = shadowed
        ? `The reference "${quote(reference.raw)}" points at the title's anchor; the heading "${quote(shadowed.text)}" repeats the title, so its anchor is #${shadowed.anchor}.`
        : `The reference "${quote(reference.raw)}" points at no heading in this recipe.`;
      out.add('unresolved-reference', reference.pos, step.heading.text, message);
    } else if (problem.reason === 'empty' || problem.reason === 'cycle') {
      const target = recipe.headings.find((h) => h.anchor === anchor);
      const name = quote(target?.text ?? anchor);
      const message =
        problem.reason === 'empty'
          ? `The reference "${quote(reference.raw)}" points at "${name}", which has no step to take an output from.`
          : target?.text === step.heading.text
            ? `The reference "${quote(reference.raw)}" points at its own step; a step cannot take in its own output.`
            : `The reference "${quote(reference.raw)}" points at "${name}", which holds this step; a step cannot take in its own output.`;
      out.add('unresolved-reference', reference.pos, step.heading.text, message);
    } else {
      const target = recipe.headings.find((h) => h.anchor === anchor);
      const named = target ? `the heading "${quote(target.text)}", whose text is` : 'a heading whose text is';
      out.add('ambiguous-reference', reference.pos, step.heading.text, `The reference "${quote(reference.raw)}" points at ${named} used more than once in this recipe.`);
    }
  }

  // A link to a group stands for each of its sub-components (SPEC §7), so one amount cannot
  // say how much of which. A Choose is one product, whichever branch is taken.
  const byAnchor = new Map<string, Node>();
  const index = (nodes: Node[]) => {
    for (const n of nodes) {
      byAnchor.set(n.heading.anchor, n);
      if (n.kind === 'component') index(n.children);
    }
  };
  index(recipe.nodes);
  const problemRefs = new Set(graph.problems.map((p) => p.reference));
  for (const step of allSteps(recipe.nodes)) {
    for (const line of step.ingredients) {
      if (line.kind !== 'reference' || !line.internal || problemRefs.has(line) || isMalformedAnchor(line)) continue;
      if (line.quantity === null && line.unit === null) continue;
      const target = byAnchor.get(decodeURIComponent(line.target.slice(1)));
      if (!target || productCount(target) < 2) continue;
      const what = isGroup(target) ? `the group "${quote(target.heading.text)}"` : `"${quote(target.heading.text)}", which ends in a group`;
      out.add(
        'quantity-on-group-reference',
        line.pos,
        step.heading.text,
        `The reference "${quote(line.raw)}" puts an amount on ${what}, which stands for ${productCount(target)} sub-components; link the sub-component the amount applies to.`,
      );
    }
  }

  const resolve = options.resolveExternal;
  if (!resolve) return;
  for (const { reference, step } of graph.external) {
    if (isUrl(reference.target)) continue; // a web link is not a recipe reference; nothing to resolve
    if (!resolve(reference.target)) {
      out.add('unresolved-reference', reference.pos, step.heading.text, `The reference "${quote(reference.raw)}" points at "${quote(reference.target)}", which is not a recipe.`);
    }
  }
}

function isMalformedAnchor(line: IngredientLine): boolean {
  if (line.kind !== 'reference' || !line.internal) return false;
  try {
    decodeURIComponent(line.target);
    return false;
  } catch {
    return true;
  }
}

/** A copy of the tree whose steps leave out references with a malformed anchor. */
function withoutMalformedAnchors(nodes: Node[]): Node[] {
  return nodes.map((n) =>
    n.kind === 'step'
      ? { ...n, ingredients: n.ingredients.filter((line) => !isMalformedAnchor(line)) }
      : { ...n, children: withoutMalformedAnchors(n.children) },
  );
}

// ----------------------------------------------------------- traditional form

function lintTraditional(recipe: Recipe, out: Collector): void {
  const t = recipe.traditional;
  if (!t) return;
  const start = bodyStart(recipe);

  if (!t.ingredients && !t.directions) {
    // The two warnings below would only repeat this.
    out.add('missing-sections', start, null, 'The recipe has neither an Ingredients nor a Directions section.');
    return;
  }

  if (!t.ingredients) {
    out.add('no-ingredients', start, null, 'The recipe has no Ingredients section.');
  } else {
    const name = t.ingredients.heading.text;
    if (t.ingredients.count === 0) out.add('no-ingredients', t.ingredients.heading.pos, name, 'The Ingredients section lists no ingredients.');
    for (const group of t.ingredients.items) lintIngredients(group.items, name, out);
  }

  if (!t.directions) {
    out.add('no-directions', start, null, 'The recipe has no Directions section.');
  } else if (t.directions.none || t.directions.items.length === 0) {
    const message = t.directions.none
      ? 'The Directions section holds the _none_ placeholder: the recipe has no directions.'
      : 'The Directions section has no numbered directions.';
    out.add('no-directions', t.directions.heading.pos, t.directions.heading.text, message);
  }

  lintParts(recipe, out);

  // A second Notes section is kept as a section the form gives no meaning to.
  for (const section of t.otherSections) {
    if (t.notes && isNotesHeading(section.heading)) {
      out.add(
        'notes-misplaced',
        section.heading.pos,
        section.heading.text,
        `The heading "${quote(section.heading.text)}" repeats the Notes section on line ${t.notes.heading.pos.start.line}; a recipe has one Notes section, so this one is not read as notes. Merge the two.`,
      );
    }
  }
}

/** Words that say nothing about which part a name means. */
const PART_STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'make', 'making', 'prepare', 'in', 'on', 'at']);

function partWords(name: string): Set<string> {
  const words = partKey(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '' && !/^\d+$/.test(w) && !PART_STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
  return new Set(words);
}

/** How close two part names are: 0 for none, higher for closer. */
function partNearness(a: string, b: string): number {
  const ka = partKey(a);
  const kb = partKey(b);
  const distance = levenshtein(ka, kb);
  if (distance <= 2) return 100 - distance;
  const wb = partWords(b);
  return [...partWords(a)].filter((w) => wb.has(w)).length;
}

/**
 * Parts pair by name across Ingredients and Directions. When both sections name parts, a
 * part with no partner but a near-miss in the other section (`### Sauce` / `### Sauces`) has
 * almost certainly failed to pair. A recipe whose directions have no part headings, or a part
 * that simply has nothing in the other section (`### Assembly`), is not reported.
 */
function lintParts(recipe: Recipe, out: Collector): void {
  const t = recipe.traditional!;
  const directionParts = t.directions?.parts.filter((p) => p.heading) ?? [];
  const groups = t.ingredients?.items.filter((g) => g.label !== null) ?? [];
  if (directionParts.length === 0 || groups.length === 0) return;
  const { unpairedIngredients, unpairedDirections } = traditionalParts(recipe);
  for (const d of unpairedDirections) {
    let best: { group: (typeof groups)[number]; nearness: number } | null = null;
    for (const g of unpairedIngredients) {
      const nearness = partNearness(d.label!, g.label!);
      if (nearness > 0 && (!best || nearness > best.nearness)) best = { group: g, nearness };
    }
    if (!best) continue;
    out.add(
      'unpaired-part',
      d.heading!.pos,
      d.label,
      `The direction part "${quote(d.label!)}" pairs with no ingredient part; the ingredient part "${quote(best.group.label!)}" (line ${best.group.labelPos!.start.line}) is a near miss. Parts pair by the same name.`,
    );
  }
}
