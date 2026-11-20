// The shopping list (SPEC §8): the ingredients of one or more recipes as a single list, with
// amounts totaled where the item and the unit are the same. Pure and browser-safe.

import type { IngredientLine, Quantity, Recipe, StepBlock, UnitDef, UnitRegistry } from '../core/index.ts';
import { isOptionalRemark, isPlural, nodeName } from '../core/index.ts';
import type { DensityTable } from '../density/index.ts';
import { combineAmounts } from './convert.ts';
import { matchCase, normalizeName, pluralMerges, splitLast } from './inflect.ts';
import { addRanges, rangeOf, toQuantity, type RationalRange } from './rational.ts';

export { chooseOne, formatListMarkdown, formatListText, formatAmount, ledText, OPTIONAL_SET, setHeading, setName, unconvertedFooter, type ListFormat, type SetWords } from './render.ts';

export interface ListSource {
  /** One recipe going into the list, e.g. keyed by its slug. */
  id: string;
  title: string;
  recipe: Recipe;
}

export interface Amount {
  /** One total for an item, in one unit. null = "some": the lines gave no quantity. */
  quantity: Quantity | null;
  unit: UnitDef | null;
  /** How many ingredient lines went into this total. */
  lines: number;
  /**
   * Addition: the item's name agreeing with this amount (`1 egg`, `3 eggs`, `300 g carrots`).
   * Equal to `ListItem.item` for an item written only one way. Optional so that hand-built
   * amounts (and older callers) need not supply it.
   */
  name?: string;
  /** Addition: set when this amount was combined from amounts in other units. */
  converted?: Conversion | null;
}

/** How a combined amount was made. */
export interface Conversion {
  /** The per-unit amounts that went into it, in order (`170 g`, `3 tbsp`). */
  from: Amount[];
  /** `unit`: same kind, by unit size alone (tbsp + cup). `density`: volumes weighed through a reference row. */
  by: 'unit' | 'density';
  /** The reference row used, for `by: 'density'`. */
  density: { ingredient: string; source: string; file: string | null } | null;
  /** The exact total; `Amount.quantity` holds it rounded for display. */
  exact: Quantity;
  /** True when a density was used or the display value is rounded from `exact`. */
  approximate: boolean;
}

/** An item listed by both weight and volume whose amounts were left side by side. */
export interface Unconverted {
  item: string;
  amounts: Amount[];
  uses: ListUse[];
  /**
   * Why: `liquid-ounces` when the item is a liquid measured in `oz` (by weight, or fluid
   * ounces?); absent when no reference row covers the item.
   */
  reason?: 'liquid-ounces';
}

export interface ConsolidateOptions {
  /** Reference densities. When given, a weight and a volume of one item are totaled by weight. */
  densities?: DensityTable | null;
  /** The units registry, for choosing display units (g, tsp, tbsp, cup) when totaling across units. */
  units?: UnitRegistry | null;
}

export interface ListUse {
  source: string;
  /**
   * The step heading for a structured recipe; for a traditional recipe the name of the
   * ingredient part the line is listed under. Null for a preamble or an unnamed group.
   */
  step: string | null;
}

export interface ListItem {
  /**
   * Display name. For an item written only one way: exactly as first written. For an item whose
   * singular and plural were both written (merged), the form agreeing with its amounts.
   */
  item: string;
  /** Addition: both spellings, for an item merged from singular and plural forms; else null. */
  forms: { singular: string; plural: string } | null;
  /** One entry per distinct unit (and one for unquantified uses), in order of first appearance. */
  amounts: Amount[];
  /**
   * The preparation notes of the lines that went in (`softened`, `King Arthur`), distinct (case
   * ignored), in order of first appearance; each led by the amounts of the lines that carry it
   * when some line of the item does not (SPEC §8).
   */
  notes: ListNote[];
  /**
   * True when every line that went in says it is optional (`— optional`, `— if desired`, `— if
   * using`, or the note `, optional`): one recipe that needs it makes it needed. The renderers
   * print "(optional)". Absent on a hand-built item: false.
   */
  optional?: boolean;
  /** The remarks of the lines that went in (SPEC §6), distinct, in order of first appearance. Absent on a hand-built item: none. */
  remarks?: ListRemark[];
  /** Where it is used: source id, plus the step heading (structured) or ingredient part (traditional). */
  uses: ListUse[];
}

/**
 * One remark on a list item: the text after the em dash, as written, less an optional word that
 * leads it (`optional, for topping` gives `for topping`): optional is said only by the flag.
 */
export interface ListRemark {
  text: string;
  /**
   * The amounts, as written, of the lines that carry it, when some line of the item does not
   * (`500 g` of 1 kg carrots is `or parsnips`); empty when every line carries it, so that it
   * applies to the whole total. A line without a quantity gives an amount with none (`some`).
   */
  amounts: Amount[];
}

/**
 * One preparation note on a list item: the text after the comma, as written. A note that is only
 * "optional" is said by the flag and is not one.
 */
export interface ListNote {
  text: string;
  /**
   * The amounts, as written, of the lines that carry it, when some line of the item does not
   * (`45 g` of 560 g whole milk is `room temperature`); empty when every line carries it, so that
   * it applies to the whole total. A line without a quantity gives an amount with none (`some`).
   */
  amounts: Amount[];
}

export interface ListRecipe {
  label: string;
  /** Link destination (`../mango-chutney/`), or null for a line written with the unit `recipe`. */
  target: string | null;
  source: string;
  /** Additions beyond the task's signature, for renderers: the amount, note and step as written. */
  quantity: Quantity | null;
  unit: UnitDef | null;
  note: string | null;
  step: string | null;
  /** True when the line says it is optional, as for `ListItem.optional`. */
  optional?: boolean;
  /** The line's remark, as for `ListRemark.text`; null for none. Absent on a hand-built entry: none. */
  remark?: string | null;
}

/**
 * The ingredients of one component or step designated optional (`## Glaze — optional`, SPEC
 * §6): bought all together or not at all (SPEC §8). Or the ingredients of one branch of a
 * `Choose` (SPEC §5.2): the cook makes one branch, so each branch is bought on its own. Its
 * lines are totaled among themselves and never with the needed items, nor with another set, so
 * each set carries its own amounts.
 */
export interface ListSet {
  /** The recipe it belongs to (`ListSource.id`). */
  source: string;
  /** The component's or step's name, without its optional qualifier (`Glaze`); for a branch, the `Choose` component's (`Dough`). */
  name: string;
  /** Its heading anchor, unique in its recipe (`glaze--optional`); for a branch, the branch's (`butter-dough`). */
  anchor: string;
  /** Its ingredients, totaled within the set. `optional` here means optional even when the set is bought. */
  items: ListItem[];
  /** Other recipes used as ingredients inside it. */
  recipes: ListRecipe[];
  /**
   * Present on the set of a branch of a `Choose`: the branch's name, and `optional` when the
   * `Choose` component, or a heading around it, is designated optional, so that the branch is
   * an optional set as well. Absent on an optional set.
   */
  branch?: { name: string; optional: boolean };
}

export interface ShoppingList {
  sources: { id: string; title: string }[];
  /** What is needed: every line that stands under no optional heading and in no branch of a `Choose`. */
  items: ListItem[];
  /** Other recipes used as ingredients (`[mango chutney](../mango-chutney/)`, or the unit `recipe`), not expanded. */
  recipes: ListRecipe[];
  /** Addition: items listed by weight and by volume that could not be totaled for lack of a density (only filled when a table is given). */
  unconverted: Unconverted[];
  /**
   * The sets: one per component or step designated optional (the outermost, when one is inside
   * another), and one per branch of a `Choose` (the innermost, when one is inside another), in
   * recipe order and then in the order of their first lines. Absent when there is none.
   */
  sets?: ListSet[];
}

/** One ingredient bullet with the step it enters at. */
export interface PlacedLine {
  line: IngredientLine;
  step: string | null;
  /**
   * The optional set it belongs to: the outermost component or step around it designated
   * optional (SPEC §6), by name and anchor; null when it is needed, or when it is in a branch
   * of a `Choose` (then `branch` says which).
   */
  set: { name: string; anchor: string } | null;
  /**
   * True when a heading inside its set is designated optional as well: optional even when the
   * set is bought. For a line in a branch: when the branch, or a heading inside it, is.
   */
  optionalInSet: boolean;
  /**
   * The branch of a `Choose` it is in: the innermost one around it (SPEC §5.2, §8), by the
   * `Choose` component's name, the branch's name and the branch's anchor. `optional` is true
   * when the `Choose` component, or a heading around it, is designated optional. Null, or
   * absent on a hand-built line, outside every `Choose`.
   */
  branch?: { choose: string; name: string; anchor: string; optional: boolean } | null;
}

/**
 * Every ingredient bullet of a recipe, in source order, with where it sits.
 *
 * Structured: the preamble (step null), then each component's own blocks (step = the
 * component heading) and each step's ingredients, depth-first. The format gives bullets in a
 * preamble or directly under a component no meaning, but a shopping list must not drop an
 * ingredient, so they are listed. Every branch of a `Choose` component is listed, each line
 * with the branch it is in.
 *
 * Traditional: the preamble, then every ingredient group; `step` is the name of the part
 * (`### Sauce`, or the older bold line `**Sauce**`) the line is listed under, null for the
 * unnamed leading group.
 */
export function ingredientLines(recipe: Recipe): PlacedLine[] {
  const out: PlacedLine[] = [];
  type Set = PlacedLine['set'];
  type Branch = NonNullable<PlacedLine['branch']>;
  /** Where a line sits: its optional set and its branch; `inner` is its own optional flag within either. */
  interface At {
    set: Set;
    branch: Branch | null;
    inner: boolean;
  }
  const place = (line: IngredientLine, step: string | null, at: At): PlacedLine =>
    at.branch ? { line, step, set: null, optionalInSet: at.inner, branch: at.branch } : { line, step, set: at.set, optionalInSet: at.inner, branch: null };
  const fromBlocks = (blocks: StepBlock[], step: string | null, at: At) => {
    for (const b of blocks) if (b.kind === 'ingredients') for (const line of b.items) out.push(place(line, step, at));
  };
  fromBlocks(recipe.preamble, null, { set: null, branch: null, inner: false });
  if (recipe.traditional) {
    for (const group of recipe.traditional.ingredients?.items ?? []) for (const line of group.items) out.push({ line, step: group.label, set: null, optionalInSet: false, branch: null });
    return out;
  }
  const walk = (nodes: Recipe['nodes'], at: At) => {
    for (const node of nodes) {
      // The outermost optional heading makes the set; one inside it makes its lines optional
      // within it. Inside a branch, the branch is the set: an optional heading there makes its
      // lines optional within the branch.
      const set = node.optional && at.set === null ? { name: nodeName(node), anchor: node.heading.anchor } : at.set;
      const inner = at.inner || (node.optional && (at.set !== null || at.branch !== null));
      const here: At = { set, branch: at.branch, inner };
      if (node.kind === 'step') {
        for (const line of node.ingredients) out.push(place(line, node.heading.text, here));
        continue;
      }
      fromBlocks(node.blocks, node.heading.text, here);
      if (!node.choose) {
        walk(node.children, here);
        continue;
      }
      // Each branch of a Choose is its own set; one inside a branch replaces the outer branch.
      for (const child of node.children) {
        const branch = { choose: nodeName(node), name: nodeName(child), anchor: child.heading.anchor, optional: set !== null };
        walk([child], { set, branch, inner: false });
      }
    }
  };
  walk(recipe.nodes, { set: null, branch: null, inner: false });
  return out;
}

/**
 * Spelling identity of an item: trimmed, whitespace collapsed, lower-cased. `consolidate` also
 * merges two keys that differ only in the number of their last word, when both were written.
 */
export function itemKey(item: string): string {
  return normalizeName(item);
}

function displayItem(item: string): string {
  return item.trim().replace(/\s+/g, ' ');
}

/**
 * The bucket an amount totals in. Today that is the registry unit itself, so `g` and `kg`
 * stay apart. A conversion step for `mass` and `volume` kinds would go here: map such units to
 * one base bucket, and convert each line's range into the base unit before `addRanges`.
 */
function bucketOf(unit: UnitDef | null, quantified: boolean): string {
  if (!quantified) return 'some';
  return unit ? `unit:${unit.name}` : 'count';
}

interface Bucket {
  unit: UnitDef | null;
  lines: number;
  /** The quantity as written, kept while only one line has gone in. */
  first: Quantity | null;
  sum: RationalRange | null;
  /** True when any line in this bucket wrote the plural form of a merged item. */
  plural: boolean;
}

interface Entry {
  item: string;
  /** Lower-case last words of the two forms, for a merged item. */
  singularLast: string | null;
  pluralLast: string | null;
  buckets: Map<string, Bucket>;
  optional: boolean;
  /** Every line's note and remark (null for none) with its amount as written, in order. */
  lines: { note: string | null; remark: string | null; amount: Amount }[];
  uses: ListUse[];
  useKeys: Set<string>;
}

export function consolidate(sources: ListSource[], options: ConsolidateOptions = {}): ShoppingList {
  const placed = sources.map((source) => ({ source, lines: ingredientLines(source.recipe) }));
  // Singular and plural are merged by what was written anywhere on the list, sets included,
  // so an item reads the same in the needed list and in a set.
  const merges = pluralMerges(
    placed.flatMap((p) => p.lines.flatMap(({ line }) => (line.kind === 'ingredient' && line.unit?.def.kind !== 'recipe' ? [itemKey(line.item)] : []))),
  );
  const unconverted: Unconverted[] = [];
  const gather = (groups: { source: ListSource; lines: PlacedLine[] }[]) => totals(groups, merges, options, unconverted);

  // Each optional set and each branch of a Choose on its own, recipe by recipe, in the order its
  // first line comes.
  const grouped = placed.map(({ source, lines }) => {
    const byAnchor = new Map<string, { name: string; anchor: string; branch: ListSet['branch']; lines: PlacedLine[] }>();
    for (const l of lines) {
      const at = l.branch ? { anchor: l.branch.anchor, name: l.branch.choose, branch: { name: l.branch.name, optional: l.branch.optional } } : l.set ? { ...l.set, branch: undefined } : null;
      if (at === null) continue;
      const key = `${at.branch ? 'branch' : 'set'}:${at.anchor}`;
      const found = byAnchor.get(key);
      if (found) found.lines.push(l);
      else byAnchor.set(key, { name: at.name, anchor: at.anchor, branch: at.branch, lines: [l] });
    }
    // One item is not an optional set (SPEC §8): its line is an optional line among what is
    // needed. Counted on a trial total, which reports nothing. A branch is a set however small.
    const alone = new Set<string>();
    for (const [key, { branch, lines: setLines }] of byAnchor) {
      if (branch) continue;
      const trial = totals([{ source, lines: setLines }], merges, options, []);
      if (trial.items.length + trial.recipes.length === 1) alone.add(key);
    }
    return { source, lines, byAnchor, alone };
  });

  // What is needed: every line under no optional heading and in no branch, and the line of an
  // optional set of one, optional.
  const needed = gather(
    grouped.map(({ source, lines, alone }) => ({
      source,
      lines: lines.flatMap((l) => (l.branch ? [] : l.set === null ? [l] : alone.has(`set:${l.set.anchor}`) ? [{ ...l, set: null, optionalInSet: true }] : [])),
    })),
  );

  const sets: ListSet[] = [];
  for (const { source, byAnchor, alone } of grouped) {
    for (const [key, { name, anchor, branch, lines: setLines }] of byAnchor) {
      if (alone.has(key)) continue;
      const { items, recipes } = gather([{ source, lines: setLines }]);
      if (items.length > 0 || recipes.length > 0) sets.push({ source: source.id, name, anchor, items, recipes, ...(branch ? { branch } : {}) });
    }
  }

  return {
    sources: sources.map((s) => ({ id: s.id, title: s.title })),
    items: needed.items,
    recipes: needed.recipes,
    unconverted,
    ...(sets.length > 0 ? { sets } : {}),
  };
}

/** Lines totaled into items and other recipes; what could not be converted goes into `unconverted`. */
function totals(
  groups: { source: ListSource; lines: PlacedLine[] }[],
  merges: Map<string, string>,
  options: ConsolidateOptions,
  unconverted: Unconverted[],
): { items: ListItem[]; recipes: ListRecipe[] } {
  const entries = new Map<string, Entry>();
  const recipes: ListRecipe[] = [];
  const mergedSingulars = new Set(merges.values());

  for (const { source, lines } of groups) {
    for (const { line, step, optionalInSet } of lines) {
      const optionalLine = optionalInSet || isOptionalRemark(line.remark) || isOptionalNote(line.note);
      if (line.kind === 'reference') {
        if (line.internal) continue; // an intermediate of this recipe
        recipes.push({
          label: line.label,
          target: line.target,
          source: source.id,
          quantity: line.quantity,
          unit: line.unit?.def ?? null,
          note: isOptionalNote(line.note) ? null : line.note,
          step,
          optional: optionalLine,
          remark: listRemark(line.remark),
        });
        continue;
      }
      const unit = line.unit?.def ?? null;
      if (unit?.kind === 'recipe') {
        recipes.push({
          label: displayItem(line.item),
          target: null,
          source: source.id,
          quantity: line.quantity,
          unit,
          note: isOptionalNote(line.note) ? null : line.note,
          step,
          optional: optionalLine,
          remark: listRemark(line.remark),
        });
        continue;
      }

      const spelled = itemKey(line.item);
      const key = merges.get(spelled) ?? spelled;
      const isPluralForm = key !== spelled;
      let entry = entries.get(key);
      if (!entry) {
        const merged = mergedSingulars.has(key);
        const singularLast = merged ? splitLast(key).last : null;
        const pluralLast = merged ? splitLast([...merges].find(([, s]) => s === key)![0]).last : null;
        entry = { item: displayItem(line.item), singularLast, pluralLast, buckets: new Map(), optional: true, lines: [], uses: [], useKeys: new Set() };
        entries.set(key, entry);
      }

      const bucketKey = bucketOf(unit, line.quantity !== null);
      let bucket = entry.buckets.get(bucketKey);
      if (!bucket) {
        bucket = { unit: line.quantity ? unit : null, lines: 0, first: line.quantity, sum: null, plural: false };
        entry.buckets.set(bucketKey, bucket);
      }
      bucket.lines++;
      if (isPluralForm) bucket.plural = true;
      if (line.quantity) {
        const r = rangeOf(line.quantity);
        bucket.sum = bucket.sum ? addRanges(bucket.sum, r) : r;
      }

      // Optional only while every line says so. A note that is only "optional" is said by the flag.
      entry.optional &&= optionalLine;
      entry.lines.push({ note: listNote(line.note), remark: listRemark(line.remark), amount: { quantity: line.quantity, unit: line.quantity ? unit : null, lines: 1 } });

      const useKey = `${source.id}\u0000${step ?? ''}`;
      if (!entry.useKeys.has(useKey)) {
        entry.useKeys.add(useKey);
        entry.uses.push({ source: source.id, step });
      }
    }
  }

  const items: ListItem[] = [...entries.values()].map((e) => {
    const item = finishItem(e);
    const combined = combineAmounts(item, options);
    if (combined.unconverted) {
      unconverted.push({
        item: combined.item.item,
        amounts: combined.item.amounts,
        uses: combined.item.uses,
        ...(combined.liquidOunces ? { reason: 'liquid-ounces' as const } : {}),
      });
    }
    return combined.item;
  });

  return { items, recipes };
}

/**
 * An item's buckets in the order its amounts print: the measured ones in order of first use,
 * then the one without an amount (`378 g + some`), whatever order the lines came in.
 */
function orderedBuckets(e: Entry): Bucket[] {
  return [...e.buckets.entries()].filter(([k]) => k !== 'some').concat([...e.buckets.entries()].filter(([k]) => k === 'some')).map(([, b]) => b);
}

function finishItem(e: Entry): ListItem {
  const buckets = orderedBuckets(e);
  const amounts: Amount[] = buckets.map((b) => ({
    quantity: b.sum === null ? null : b.lines === 1 ? b.first : toQuantity(b.sum),
    unit: b.unit,
    lines: b.lines,
    name: e.item,
  }));
  const base = { notes: ledBy(e, 'note'), optional: e.optional, remarks: ledBy(e, 'remark'), uses: e.uses };
  if (e.singularLast === null || e.pluralLast === null) return { item: e.item, forms: null, amounts, ...base };

  // Re-spell the first spelling seen with the other last word, keeping its letter case.
  const { head, last } = splitLast(e.item);
  const singular = head + matchCase(e.singularLast, last);
  const plural = head + matchCase(e.pluralLast, last);
  amounts.forEach((a, i) => {
    const b = buckets[i];
    const counted = a.unit === null || a.unit.kind === 'size';
    if (counted && a.quantity) a.name = isPlural(a.quantity) ? plural : singular;
    // Any other unit, or no quantity: number does not decide. Plural if a line wrote it, else singular as written.
    else a.name = b.plural ? plural : singular;
  });
  // Several amounts (`2 large + 50 g`) read as more than one: the plural.
  const item = amounts.length === 1 ? amounts[0].name! : plural;
  return { item, forms: { singular, plural }, amounts, ...base };
}

/**
 * An item's distinct notes or remarks (case ignored, the first spelling kept). One that every
 * line carries applies to the total; any other names the amounts of the lines that carry it.
 */
function ledBy(e: Entry, field: 'note' | 'remark'): ListNote[] {
  const byKey = new Map<string, ListNote>();
  for (const line of e.lines) {
    const text = line[field];
    if (text === null) continue;
    const key = text.toLowerCase();
    const found = byKey.get(key);
    if (found) found.amounts.push(line.amount);
    else byKey.set(key, { text, amounts: [line.amount] });
  }
  const out = [...byKey.values()];
  for (const r of out) if (r.amounts.length === e.lines.length) r.amounts = [];
  return out;
}

/** A line's preparation note as the list prints it: white space collapsed; null for none, or for a note that is only "optional". */
function listNote(note: string | null): string | null {
  if (note === null || isOptionalNote(note)) return null;
  const text = note.trim().replace(/\s+/g, ' ');
  return text === '' ? null : text;
}

/**
 * A line's remark as the list prints it: white space collapsed, and an optional word that leads
 * it taken off with its comma (`optional, for topping` → `for topping`; `optional` → null),
 * because the list says optional only for an item every line of which is optional.
 */
export function listRemark(remark: string | null): string | null {
  if (remark === null) return null;
  let text = remark.trim().replace(/\s+/g, ' ');
  if (isOptionalRemark(text)) {
    const cut = text.search(/[,;]/);
    text = cut === -1 ? '' : text.slice(cut + 1).trim();
  }
  return text === '' ? null : text;
}

/** A preparation note that is only "optional" (`- rainbow sprinkles, optional`), not `chopped, optional`. */
function isOptionalNote(note: string | null): boolean {
  return note !== null && !/[,;]/.test(note) && isOptionalRemark(note);
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function sortItems(items: ListItem[]): ListItem[] {
  return [...items].sort((a, b) => {
    const c = collator.compare(a.item, b.item);
    if (c !== 0) return c;
    return a.item < b.item ? -1 : a.item > b.item ? 1 : 0;
  });
}

/** The same list with items in alphabetical order (case-insensitive; ties in code-point order), the needed ones and each set's apart. */
export function sortList(list: ShoppingList): ShoppingList {
  const sets = list.sets?.map((set) => ({ ...set, items: sortItems(set.items) }));
  return { ...list, items: sortItems(list.items), ...(sets ? { sets } : {}) };
}
