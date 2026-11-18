// What each step's chart box will say, without drawing it (`etna marks`): the heading, each
// mark with its kinds (SPEC §5.3), the lines the box takes, and a flag when it is long. Pure:
// the recipe and the registries are passed in.

import { allSteps, nodeName, type Recipe } from '../core/index.ts';
import { kindsOf, MARK_KINDS, type KindRegistries, type MarkKind, type MarkKindName } from '../core/kinds.ts';
import { NODE_MAX_LINES, nodeText } from '../dag/text.ts';

export interface MarkReport {
  /** The mark as the box shows it. */
  text: string;
  /** Its kinds, in the order its words come; empty when untyped. */
  kinds: MarkKind[];
}

export interface StepReport {
  /** The heading as the box shows it (an optional step's qualifier left out). */
  heading: string;
  /** Line of the heading in the recipe file. */
  line: number;
  marks: MarkReport[];
  /** Lines the box takes, counted as `etna lint` counts them (`chart-box-long`). */
  lines: number;
  /** More than five lines. */
  long: boolean;
}

export interface MarksSummary {
  steps: number;
  withMarks: number;
  withoutMarks: number;
  marks: number;
  /** Marks holding each kind (a mark with two kinds counts under both). */
  byKind: Record<MarkKindName, number>;
  untyped: number;
  /** Temperatures whose own words do not say whether to set or to reach them. */
  roleUnknown: number;
  long: number;
}

export interface RecipeMarks {
  title: string;
  steps: StepReport[];
  summary: MarksSummary;
}

/** The boxes of a structured recipe's steps, with the kinds of their marks. */
export function marksOf(recipe: Recipe, registries: KindRegistries): RecipeMarks {
  const steps = allSteps(recipe.nodes).map((step): StepReport => {
    const lines = nodeText(step).length;
    return {
      heading: nodeName(step),
      line: step.heading.pos.start.line,
      marks: step.marks.map((text) => ({ text, kinds: kindsOf(text, registries) })),
      lines,
      long: step.marks.length > 0 && lines > NODE_MAX_LINES,
    };
  });
  return { title: recipe.title?.text ?? '', steps, summary: summarize(steps) };
}

/** The counts over some steps. */
export function summarize(steps: StepReport[]): MarksSummary {
  const byKind = Object.fromEntries(MARK_KINDS.map((k) => [k, 0])) as Record<MarkKindName, number>;
  let marks = 0;
  let untyped = 0;
  let roleUnknown = 0;
  for (const step of steps) {
    for (const mark of step.marks) {
      marks++;
      if (mark.kinds.length === 0) untyped++;
      for (const kind of new Set(mark.kinds.map((k) => k.kind))) byKind[kind]++;
      roleUnknown += mark.kinds.filter((k) => k.kind === 'temperature' && k.role === 'unknown').length;
    }
  }
  const withMarks = steps.filter((s) => s.marks.length > 0).length;
  return { steps: steps.length, withMarks, withoutMarks: steps.length - withMarks, marks, byKind, untyped, roleUnknown, long: steps.filter((s) => s.long).length };
}

/** Add summaries together. */
export function addSummaries(all: MarksSummary[]): MarksSummary {
  const total = summarize([]);
  for (const s of all) {
    total.steps += s.steps;
    total.withMarks += s.withMarks;
    total.withoutMarks += s.withoutMarks;
    total.marks += s.marks;
    total.untyped += s.untyped;
    total.roleUnknown += s.roleUnknown;
    total.long += s.long;
    for (const k of MARK_KINDS) total.byKind[k] += s.byKind[k];
  }
  return total;
}

// ------------------------------------------------------------------ text

const ROLE_WORDS = { set: 'to set', reach: 'to reach', unknown: 'role unknown' } as const;

/** One kind, as the text report says it: `setting "medium heat"`, `tool "Vitamix" (machine)`. */
export function kindText(k: MarkKind): string {
  const detail = k.kind === 'temperature' && k.role ? ` (${ROLE_WORDS[k.role]})` : k.tool ? ` (${k.tool.kind})` : '';
  return `${k.kind} "${k.words}"${detail}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : /x$/.test(word) ? 'es' : 's'}`;

/** The text report of one recipe: each step, its marks and their kinds, then the summary. */
export function recipeText(name: string, report: RecipeMarks): string {
  const out: string[] = [`${report.title || name} (${name})`, ''];
  const markWidth = Math.min(32, Math.max(0, ...report.steps.flatMap((s) => s.marks.map((m) => m.text.length))));
  for (const step of report.steps) {
    const size = `${plural(step.lines, 'line')}${step.long ? ', over five: mark fewer words' : ''}${step.marks.length === 0 ? ', heading only' : ''}`;
    out.push(`  ${step.heading}  (line ${step.line}; ${size})`);
    for (const mark of step.marks) {
      const kinds = mark.kinds.length === 0 ? 'untyped' : mark.kinds.map(kindText).join(', ');
      out.push(`    ${mark.text.padEnd(markWidth)}  ${kinds}`);
    }
  }
  out.push('', summaryText(report.summary));
  return out.join('\n');
}

/** The summary lines. */
export function summaryText(s: MarksSummary, label = 'Summary'): string {
  const kinds = MARK_KINDS.filter((k) => s.byKind[k] > 0).map((k) => `${k} ${s.byKind[k]}`);
  return [
    `${label}: ${plural(s.steps, 'step')}, ${s.withMarks} with marks, ${s.withoutMarks} without; ${plural(s.long, 'box')} over five lines.`,
    `  ${plural(s.marks, 'mark')}${kinds.length > 0 ? `; by kind: ${kinds.join(', ')}` : ''}.`,
    `  Untyped marks: ${s.untyped}. Temperatures whose role is unknown: ${s.roleUnknown}.`,
  ].join('\n');
}
