// The recipe model: what `parseRecipe` produces and every other tool consumes.
//
// Everything keeps its source position, so the linter can point at a line and the
// formatter can rewrite precisely. `raw` is always the exact source slice.

export interface Point {
  line: number; // 1-based
  column: number; // 1-based
  offset: number; // 0-based index into the source
}

export interface Pos {
  start: Point;
  end: Point;
}

export type Form = 'structured' | 'traditional';

// ---------------------------------------------------------------- frontmatter

export interface Frontmatter {
  /** The YAML text between the `---` fences, or null when there is no frontmatter. */
  raw: string | null;
  /** Parsed YAML, or null when missing or malformed. */
  data: Record<string, unknown> | null;
  /** YAML parse error message, when malformed. */
  error: string | null;
  pos: Pos | null;
}

// ------------------------------------------------------------------ quantities

export type NumberStyle = 'integer' | 'decimal' | 'fraction' | 'mixed';

export interface NumberValue {
  value: number;
  /** The text as written (`1 1/2`, `½`, `2.5`). */
  text: string;
  style: NumberStyle;
  /** True when a Unicode fraction glyph was used (`½`, `1½`). */
  unicode: boolean;
  /** Whole part, numerator and denominator for fraction / mixed styles. */
  whole: number;
  num: number;
  den: number;
}

export interface Quantity {
  raw: string;
  min: NumberValue;
  /** Present for a range (`2-3`). */
  max: NumberValue | null;
  /** The separator as written between min and max: `-`, `–`, `to`. */
  rangeSeparator: string | null;
}

// ----------------------------------------------------------------------- units

export type UnitKind =
  | 'mass'
  | 'volume'
  | 'length'
  | 'size'
  | 'piece'
  | 'container'
  | 'approximate'
  | 'recipe';

export interface UnitDef {
  name: string;
  symbol: string | null;
  plural: string | null;
  aliases: string[];
  kind: UnitKind;
  system: 'metric' | 'us' | null;
  /** Grams in one of this unit, for a mass unit; null otherwise. */
  grams: number | null;
  /** Milliliters in one of this unit, for a volume unit (kitchen convention); null otherwise. */
  ml: number | null;
}

export interface UnitMatch {
  /** The unit text as written (`grams`, `Tbsp.`). */
  raw: string;
  def: UnitDef;
}

// ----------------------------------------------------------------- ingredients

export interface Ingredient {
  kind: 'ingredient';
  /** The whole bullet text as written, without the `- ` marker. */
  raw: string;
  quantity: Quantity | null;
  unit: UnitMatch | null;
  /** The ingredient name: everything after quantity and unit, up to the first comma (or ` — `). */
  item: string;
  /** How it is prepared: the text after the first comma, up to a ` — ` remark; or null. */
  note: string | null;
  /** A remark that is not preparation: the text after the first ` — ` (`— 52%`); or null. */
  remark: string | null;
  pos: Pos;
}

export interface Reference {
  kind: 'reference';
  raw: string;
  /** Link text. */
  label: string;
  /** Link destination as written: `#anchor` or `../slug/`. */
  target: string;
  internal: boolean;
  /** Optional quantity / unit written before the link (`80 g [mango chutney](../mango-chutney/)`). */
  quantity: Quantity | null;
  unit: UnitMatch | null;
  /** Text after the link, following a comma, up to a ` — ` remark. */
  note: string | null;
  /** Text after the first ` — ` following the link; or null. */
  remark: string | null;
  pos: Pos;
}

export type IngredientLine = Ingredient | Reference;

// ---------------------------------------------------------------------- blocks

export interface Text {
  /** Markdown source of the block (inline formatting kept). */
  raw: string;
  /** Plain text with formatting removed. */
  text: string;
  pos: Pos;
}

export interface Callout {
  kind: 'callout';
  /** The bold keyword as written (`Checkpoint`, `Choose`, `Note`, …). */
  keyword: string;
  /** The separator as written after the keyword (canonically an em dash). */
  separator: string;
  /** Markdown source of the callout text after the separator. */
  raw: string;
  text: string;
  /** Source of the whole blockquote. */
  source: string;
  pos: Pos;
}

export interface IngredientList {
  kind: 'ingredients';
  items: IngredientLine[];
  pos: Pos;
}

export interface Prose extends Text {
  kind: 'prose';
}

/** Anything the format does not give meaning to: tables, code, images, ordered lists in a step… */
export interface OtherBlock extends Text {
  kind: 'other';
  /** mdast node type, for diagnostics. */
  nodeType: string;
}

export type StepBlock = IngredientList | Prose | Callout | OtherBlock;

// ------------------------------------------------------------ structured form

export interface Heading {
  /** Plain heading text. */
  text: string;
  /** Markdown heading level (2–6 for structural headings). */
  depth: number;
  /** GitHub-style anchor for this heading (deduplicated the way GitHub does). */
  anchor: string;
  pos: Pos;
}

export interface Step {
  kind: 'step';
  heading: Heading;
  /** Every block under the heading, in source order. */
  blocks: StepBlock[];
  /** Convenience views over `blocks`. */
  ingredients: IngredientLine[];
  instructions: Prose[];
  callouts: Callout[];
  /**
   * The step's marks (SPEC §5, "Marks"): each run of words its instruction paragraphs write
   * with Markdown emphasis (`*medium-low*`), in source order, outermost only, as plain text
   * with runs of white space as one space. Emphasis in a callout, an ingredient line or the
   * heading is not a mark. A chart box shows the heading, then these.
   */
  marks: string[];
  /**
   * True when the step's heading designates it optional: the cook may leave it out (SPEC §6,
   * "Optional components and steps"). Only the step's own designation: a step under an optional
   * component may be left out too, and the outputs that care walk the tree for it.
   */
  optional: boolean;
}

export interface Component {
  kind: 'component';
  heading: Heading;
  /** Blocks directly under the component heading, before its first child heading. */
  blocks: StepBlock[];
  callouts: Callout[];
  children: Node[];
  /** True when a `Choose` callout marks the children as exclusive branches. */
  choose: boolean;
  /** True when the heading designates the component optional: it and everything under it may be left out (SPEC §6). */
  optional: boolean;
}

export type Node = Step | Component;

// ----------------------------------------------------------- traditional form

/**
 * One ingredient part. Written `### Frosting` (a part heading), or in the older spelling as a
 * paragraph that is a single bold phrase (`**Frosting**`). The leading group, before any
 * label, is unnamed.
 */
export interface IngredientGroup {
  /** Part name (`Frosting`), from either spelling, or null for the unlabeled leading group. */
  label: string | null;
  /** Where the label is written: the heading, or the bold line. */
  labelPos: Pos | null;
  items: IngredientLine[];
  /** The `###` heading that opens this part, when written that way; null otherwise. */
  heading: Heading | null;
  /** True when the label was written the older way, as a bold line (`**Frosting**`). */
  legacy: boolean;
}

/**
 * One direction part: a `###` heading under `## Directions` and the steps under it, up to
 * the next part heading. Steps before the first heading form the unnamed leading part.
 * Numbering restarts in each part.
 */
export interface DirectionPart {
  /** The heading text, or null for the unnamed leading part. */
  label: string | null;
  heading: Heading | null;
  /** The part's directions, in source order. Each also appears in the section's `items`. */
  steps: Direction[];
  /** From the heading (or the part's first block) to the end of its last block. */
  pos: Pos | null;
}

export interface Direction {
  kind: 'direction';
  /** The number as it would render (list start + index). */
  number: number;
  /**
   * Bold step label, when the item opens with `**Label** — `. In the current spelling it names
   * this one step; an un-migrated recipe may still use it to head a run of steps.
   */
  label: string | null;
  /** Markdown source of the direction text (after the label). */
  raw: string;
  text: string;
  /** Source of anything else inside the list item (nested lists, further paragraphs). */
  more: string | null;
  pos: Pos;
}

export interface Note {
  /**
   * How the note is written: a top-level paragraph of the section, or one item of a
   * top-level bullet list (the convention, SPEC §4.2: one `- ` item per note).
   */
  form: 'paragraph' | 'item';
  /** Bold lead, when the note's first paragraph opens with `**Title** — `. */
  label: string | null;
  /** Markdown source of the note's first paragraph (after the label). */
  raw: string;
  /** Plain text of the whole note after the label, continuation and nested lists included. */
  text: string;
  /**
   * An item's further blocks (continuation paragraphs, a nested list), as Markdown source
   * de-indented to the item's content column; null when there are none, and for a paragraph.
   */
  more: string | null;
  /** The paragraph, or the whole list item from its marker. */
  pos: Pos;
}

/**
 * A recipe's notes: the `## Notes` section, in either form. Notes (`items`: each top-level
 * paragraph and each item of a top-level bullet list, with an optional bold lead) and anything
 * else written there (`other`: numbered lists, tables, sub-headings, quotes), both in source
 * order by `pos`.
 */
export type NotesSection = TraditionalSection<Note>;

export interface TraditionalSection<T> {
  heading: Heading;
  items: T[];
  /** Blocks in the section the form gives no meaning to, in source order with the rest. */
  other: OtherBlock[];
  pos: Pos;
}

export interface TraditionalBody {
  ingredients: (TraditionalSection<IngredientGroup> & { count: number }) | null;
  /**
   * `none` is true when the section holds the `_none_` placeholder. `items` is every
   * direction in source order; `parts` groups them under their `###` part headings. A
   * section with no part heading has exactly one unnamed part holding all its directions.
   */
  directions: (TraditionalSection<Direction> & { none: boolean; parts: DirectionPart[] }) | null;
  notes: TraditionalSection<Note> | null;
  /** H2 sections with any other heading text. */
  otherSections: { heading: Heading; raw: string; pos: Pos }[];
}

// ---------------------------------------------------------------------- recipe

export interface Title {
  text: string;
  /** False when the H1 contains inline formatting. */
  plain: boolean;
  pos: Pos;
}

/**
 * The picture line (SPEC §4.3): one Markdown image, alone in its paragraph, the first thing
 * under the title, whose address is exactly `image/markdown.jpg` or `image/markdown.png`.
 */
export interface PictureLine {
  /** The words in the brackets: what the picture shows. */
  alt: string;
  /** The address as written: `image/markdown.jpg` or `image/markdown.png`. */
  address: string;
  pos: Pos;
}

export interface Recipe {
  source: string;
  frontmatter: Frontmatter;
  /** `etna` frontmatter value when it is an integer, else null. */
  etna: number | null;
  /** The form the body was read as. An unknown `form:` value is read as structured. */
  form: Form;
  /** The `form:` value as written, or null when absent. */
  formRaw: string | null;
  title: Title | null;
  /** Number of H1 headings in the body (should be exactly 1). */
  h1Count: number;
  /** True when the title is the first thing in the body, as SPEC §4 requires. */
  titleFirst: boolean;
  /** The picture line, or null when the recipe has none. It is not in `preamble`. */
  picture: PictureLine | null;
  /** Blocks between the title and the first H2, the picture line left out. */
  preamble: StepBlock[];
  /** Structured form: the top-level components and steps. Empty for traditional. */
  nodes: Node[];
  /** Traditional form body. Null for structured. */
  traditional: TraditionalBody | null;
  /**
   * The recipe's notes, in either form, or null when it has none. Traditional: the same
   * object as `traditional.notes`. Structured: the last H2 when its text is `Notes` (case
   * ignored), with everything after it; it is not a step or component and is not in `nodes`
   * (SPEC §4.2). A `## Notes` that is not the last H2 is read as an ordinary heading.
   */
  notes: NotesSection | null;
  /** Every structural heading (H2 and deeper), in source order. */
  headings: Heading[];
}
