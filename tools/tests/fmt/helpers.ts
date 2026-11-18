// Shared by the formatter tests: small builders, and a comparison of two parsed recipes that
// is written independently of the formatter's own safety check (src/fmt/meaning.ts).

import { parseRecipe, type Callout, type Direction, type DirectionPart, type Heading, type IngredientLine, type Node, type Recipe, type StepBlock } from '../../src/core/index.ts';
import { formatRecipe, type FormatResult } from '../../src/fmt/index.ts';
import { loadUnits } from '../../src/node/files.ts';

export const units = loadUnits();
export const parse = (source: string): Recipe => parseRecipe(source, { units });
export const format = (source: string): FormatResult => formatRecipe(source, { units });

/** A traditional recipe with the given sections. */
export function traditional(parts: { ingredients?: string; directions?: string; notes?: string }): string {
  let out = '---\netna: 1\nform: traditional\n---\n\n# Test\n';
  if (parts.ingredients !== undefined) out += `\n## Ingredients\n\n${parts.ingredients}\n`;
  if (parts.directions !== undefined) out += `\n## Directions\n\n${parts.directions}\n`;
  if (parts.notes !== undefined) out += `\n## Notes\n\n${parts.notes}\n`;
  return out;
}

/** A structured recipe with one step holding `body`. */
export function structured(body: string): string {
  return `---\netna: 1\n---\n\n# Test\n\n## Step\n\n${body}\n`;
}

/** Format one ingredient line and return the line as it comes out. */
export function ingredient(line: string): string {
  const out = format(traditional({ ingredients: line, directions: '1. Mix.' })).output;
  return out.split('\n')[out.split('\n').indexOf('## Ingredients') + 2];
}

/** Format one direction (the text after `1. `) and return it. */
export function direction(text: string): string {
  const out = format(traditional({ ingredients: '- salt', directions: `1. ${text}` })).output;
  return out.split('\n')[out.split('\n').indexOf('## Directions') + 2].replace(/^1\. /, '');
}

// ------------------------------------------------------------------ comparison

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

// Temperatures, read by a second and simpler implementation than the formatter's: it knows
// nothing about ranges or angles, only "a number, a degree mark, maybe a scale".
const TEMPERATURE_RE =
  /(\d+(?:\.\d+)?)[ \t\u00a0]*(?:[°º˚](?:[ \t\u00a0]*([FCfc])(?![A-Za-z0-9]))?|([℉℃])|-?[ \t\u00a0]*degrees?(?![A-Za-z])(?:[ \t\u00a0]+(fahrenheit|celsius|[fc])(?![A-Za-z0-9]))?|(F)(?![A-Za-z0-9-]))/gi;

interface Temperature {
  value: number;
  scale: 'F' | 'C' | null;
}

export function temperatures(s: string): Temperature[] {
  return [...s.matchAll(TEMPERATURE_RE)].map((m) => {
    const written = m[2] ?? m[4] ?? (m[5] === 'F' ? 'F' : undefined);
    const scale = written ? (written[0].toUpperCase() as 'F' | 'C') : m[3] ? (m[3] === '℉' ? 'F' : 'C') : null;
    return { value: Number(m[1]), scale };
  });
}

/** The text with every temperature reduced to `350°`: what must not change at all. */
export function withoutScales(s: string): string {
  return s.replace(TEMPERATURE_RE, '$1°');
}

/** Which scale a bare temperature of `value` may be given in a recipe, per the formatter's rules. */
function allowedScale(recipeSource: string): (value: number) => 'F' | 'C' | null {
  const all = temperatures(recipeSource);
  const stated = new Set(all.flatMap((t) => (t.scale ? [t.scale] : [])));
  const only = stated.size === 1 ? [...stated][0] : null;
  const someHighBare = all.some((t) => t.scale === null && t.value >= 300);
  return (value) => {
    if (only === 'C') return value >= 300 ? null : 'C'; // too hot for Celsius: left undecided
    if (only === 'F') return 'F'; // rule 1: the recipe's own scale
    if (value >= 300) return 'F'; // rule 2: that hot is Fahrenheit
    // No scale stated anywhere, but a 300+ temperature became °F: now the recipe states °F.
    return stated.size === 0 && someHighBare ? 'F' : null;
  };
}

/**
 * True when `after` is `before` with nothing changed but temperature notation: same words,
 * same digits, every stated scale kept, and a scale added only where the rules allow it.
 */
export function sameApartFromTemperatures(before: string, after: string, recipeSource: string): boolean {
  if (before === after) return true;
  if (withoutScales(before) !== withoutScales(after)) return false;
  const a = temperatures(before);
  const b = temperatures(after);
  if (a.length !== b.length) return false;
  const allowed = allowedScale(recipeSource);
  return a.every((t, i) => {
    if (t.value !== b[i].value) return false;
    if (t.scale !== null) return b[i].scale === t.scale;
    return b[i].scale === null || b[i].scale === allowed(t.value);
  });
}

export function allLines(recipe: Recipe): IngredientLine[] {
  const fromBlocks = (blocks: StepBlock[]) => blocks.flatMap((b) => (b.kind === 'ingredients' ? b.items : []));
  const fromNode = (n: Node): IngredientLine[] => [...fromBlocks(n.blocks), ...(n.kind === 'component' ? n.children.flatMap(fromNode) : [])];
  return [
    ...fromBlocks(recipe.preamble),
    ...recipe.nodes.flatMap(fromNode),
    ...(recipe.traditional?.ingredients?.items.flatMap((g) => g.items) ?? []),
  ];
}

export function allCallouts(recipe: Recipe): Callout[] {
  const fromBlocks = (blocks: StepBlock[]) => blocks.filter((b): b is Callout => b.kind === 'callout');
  const fromNode = (n: Node): Callout[] => [...fromBlocks(n.blocks), ...(n.kind === 'component' ? n.children.flatMap(fromNode) : [])];
  return [...fromBlocks(recipe.preamble), ...recipe.nodes.flatMap(fromNode)];
}

/** Every piece of prose a cook reads, in order: instructions, callouts, directions, notes. */
export function allProse(recipe: Recipe): string[] {
  const out: string[] = [];
  const fromBlocks = (blocks: StepBlock[]) => {
    for (const b of blocks) {
      if (b.kind === 'prose') out.push(b.text);
      else if (b.kind === 'callout') out.push(b.text);
    }
  };
  const fromNode = (n: Node) => {
    fromBlocks(n.blocks);
    if (n.kind === 'component') n.children.forEach(fromNode);
  };
  fromBlocks(recipe.preamble);
  recipe.nodes.forEach(fromNode);
  const t = recipe.traditional;
  // `more` is raw source (nested lists, further paragraphs): compare it without its layout.
  const unlaid = (s: string | null) =>
    (s ?? '')
      .split('\n')
      .map((l) => l.trim().replace(/^[*+] /, '- '))
      .filter((l) => l !== '')
      .join('\n');
  // Labels are compared by `labelDifferences`: a label that heads a run of steps may move
  // out of its step into a part heading.
  for (const d of t?.directions?.items ?? []) out.push(`${d.text}|${unlaid(d.more)}`);
  for (const n of t?.notes?.items ?? []) out.push(`${n.label ?? ''}|${n.text}`);
  return out;
}

function structure(recipe: Recipe): unknown {
  const node = (n: Node): unknown =>
    n.kind === 'step'
      ? ['step', n.heading.text, n.heading.depth, n.blocks.map((b) => b.kind)]
      : ['component', n.heading.text, n.heading.depth, n.choose, n.blocks.map((b) => b.kind), n.children.map(node)];
  const t = recipe.traditional;
  return {
    etna: recipe.etna,
    form: recipe.form,
    title: recipe.title?.text ?? null,
    frontmatter: Object.entries(recipe.frontmatter.data ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    // Part headings are compared by `labelDifferences`; an older spelling has none. Anchors
    // after a new part heading shift, and a traditional recipe has no references to them.
    headings: recipe.headings.filter((h) => !partHeadings(recipe).has(h)).map((h) => [h.depth, h.text, recipe.traditional ? null : h.anchor]),
    nodes: recipe.nodes.map(node),
    callouts: allCallouts(recipe).map((c) => c.keyword),
    groups: t?.ingredients?.items.map((g) => [g.label, g.items.length]) ?? null,
    directions: t?.directions ? [t.directions.none, t.directions.items.length] : null,
    notes: t?.notes?.items.length ?? null,
    other: [t?.ingredients?.other.length ?? 0, t?.directions?.other.length ?? 0, t?.notes?.other.length ?? 0, t?.otherSections.map((s) => s.heading.text) ?? []],
  };
}

function partHeadings(recipe: Recipe): Set<Heading> {
  const t = recipe.traditional;
  return new Set([
    ...(t?.ingredients?.items.flatMap((g) => (g.heading ? [g.heading] : [])) ?? []),
    ...(t?.directions?.parts.flatMap((p) => (p.heading ? [p.heading] : [])) ?? []),
  ]);
}

/**
 * Differences in the labels of a traditional recipe. A step's label is either untouched, or
 * — when it headed a run of steps — it reappears exactly as the heading of a part that opens
 * with that step. No other part heading may appear; every ingredient group keeps its name
 * (as a heading or a bold line); and numbering is 1…n in each part that gained a heading,
 * unchanged everywhere else.
 */
export function labelDifferences(before: Recipe, after: Recipe): string[] {
  const diffs: string[] = [];
  const a = before.traditional;
  const b = after.traditional;
  if (!a || !b) return a === b ? [] : ['form'];
  const ga = a.ingredients?.items.map((g) => g.label) ?? [];
  const gb = b.ingredients?.items.map((g) => g.label) ?? [];
  if (JSON.stringify(ga) !== JSON.stringify(gb)) diffs.push(`group labels: ${JSON.stringify(ga)} != ${JSON.stringify(gb)}`);

  const da = a.directions?.items ?? [];
  const db = b.directions?.items ?? [];
  if (da.length !== db.length) return [...diffs, `direction count: ${da.length} != ${db.length}`];
  const partOf = new Map<Direction, DirectionPart>();
  for (const p of b.directions?.parts ?? []) for (const s of p.steps) partOf.set(s, p);
  const used = new Set<DirectionPart>();
  const headedBefore = new Set((a.directions?.parts ?? []).flatMap((p) => (p.heading ? [p.heading.text] : [])));
  for (let i = 0; i < da.length; i++) {
    const x = da[i];
    const y = db[i];
    if (x.label === y.label) continue;
    const part = partOf.get(y);
    if (x.label !== null && y.label === null && part?.heading && part.steps[0] === y && withoutScales(part.label!) === withoutScales(x.label)) {
      used.add(part);
      continue;
    }
    diffs.push(`direction ${i + 1}: label ${JSON.stringify(x.label)} became ${JSON.stringify(y.label)} under ${JSON.stringify(part?.label ?? null)}`);
  }
  for (const p of b.directions?.parts ?? []) {
    if (p.heading && !used.has(p) && !headedBefore.has(p.heading.text)) diffs.push(`part heading "${p.label}" came from no label`);
  }
  const migrated = used.size > 0;
  for (const p of b.directions?.parts ?? []) {
    const numbers = p.steps.map((s) => s.number);
    if (migrated && numbers.some((n, i) => n !== i + 1)) diffs.push(`part ${JSON.stringify(p.label)} numbered ${numbers.join(',')}`);
  }
  if (!migrated && JSON.stringify(da.map((d) => d.number)) !== JSON.stringify(db.map((d) => d.number))) {
    // Only written numbers that already rendered 1…n may be rewritten; how they render stays.
    diffs.push(`numbers: ${da.map((d) => d.number).join(',')} != ${db.map((d) => d.number).join(',')}`);
  }
  return diffs;
}

/** Differences in meaning between two readings of a recipe; empty when there are none. */
export function meaningDifferences(before: Recipe, after: Recipe): string[] {
  const diffs: string[] = [...labelDifferences(before, after)];
  const a = JSON.stringify(structure(before));
  const b = JSON.stringify(structure(after));
  if (a !== b) diffs.push(`structure: ${a} != ${b}`);

  const la = allLines(before);
  const lb = allLines(after);
  if (la.length !== lb.length) diffs.push(`ingredient count: ${la.length} != ${lb.length}`);
  for (let i = 0; i < Math.min(la.length, lb.length); i++) {
    const x = la[i];
    const y = lb[i];
    const where = `ingredient ${i + 1} (${x.raw})`;
    if (x.kind !== y.kind) diffs.push(`${where}: kind`);
    if ((x.quantity?.min.value ?? null) !== (y.quantity?.min.value ?? null)) diffs.push(`${where}: quantity`);
    if ((x.quantity?.max?.value ?? null) !== (y.quantity?.max?.value ?? null)) diffs.push(`${where}: upper quantity`);
    if ((x.unit?.def.name ?? null) !== (y.unit?.def.name ?? null)) diffs.push(`${where}: unit`);
    if (x.kind === 'ingredient' && y.kind === 'ingredient') {
      // The item is kept as written; only runs of spaces may collapse.
      if (collapse(x.item) !== collapse(y.item)) diffs.push(`${where}: item "${x.item}" != "${y.item}"`);
      const sameNote = x.note === null || y.note === null ? x.note === y.note : sameApartFromTemperatures(collapse(x.note), collapse(y.note), before.source);
      if (!sameNote) diffs.push(`${where}: note "${x.note}" != "${y.note}"`);
    } else if (x.kind === 'reference' && y.kind === 'reference') {
      if (x.label !== y.label || x.target !== y.target || x.note !== y.note) diffs.push(`${where}: reference`);
    }
  }
  return diffs;
}

/**
 * Differences in the prose: apart from temperature notation every text must be identical,
 * and even a temperature rewrite may not touch a digit.
 */
export function proseDifferences(before: Recipe, after: Recipe): string[] {
  const diffs: string[] = [];
  const a = allProse(before);
  const b = allProse(after);
  if (a.length !== b.length) return [`prose count: ${a.length} != ${b.length}`];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!sameApartFromTemperatures(a[i], b[i], before.source)) diffs.push(`prose ${i + 1}: "${a[i]}" != "${b[i]}"`);
    else if (a[i].replace(/\D/g, '') !== b[i].replace(/\D/g, '')) diffs.push(`prose ${i + 1}: digits changed`);
  }
  return diffs;
}
