// Every themeable value of a flow chart, in one table: its type, its default and what it does.
//
// The table is used three ways: to read a theme (defaults fill what it leaves out), to check
// one (unknown keys, wrong types, numbers out of range), and to write the documentation table
// in themes/README.md (`etna dag --list-values`). The defaults are the `flow` theme.
//
// Every value ends up in SVG markup — in a <style> block or an attribute — so every type is
// narrow: a theme can say "this color" or "this many units", never arbitrary text.

import { TEXT_MEASURES } from './measure.ts';

export type ValueType =
  | { type: 'color' }
  | { type: 'number'; min: number; max: number; integer?: boolean }
  | { type: 'enum'; options: readonly string[] }
  | { type: 'font' }
  | { type: 'dash' }
  | { type: 'label'; max: number };

export interface ValueSpec {
  key: string;
  group: string;
  spec: ValueType;
  default: string | number;
  effect: string;
}

export const GROUPS = [
  'Page',
  'Text',
  'Title',
  'Ingredient boxes',
  'Operation nodes',
  'Edges',
  'Layout',
  'Components',
  'Choose and Checkpoint marks',
] as const;

const color = { type: 'color' } as const;
const font = { type: 'font' } as const;
const dash = { type: 'dash' } as const;
const num = (min: number, max: number, integer = false): ValueType => ({ type: 'number', min, max, integer });
const oneOf = (...options: string[]): ValueType => ({ type: 'enum', options });
const weight = num(100, 900, true);

const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, "Courier New", monospace';

const v = (group: string, key: string, spec: ValueType, def: string | number, effect: string): ValueSpec => ({
  key,
  group,
  spec,
  default: def,
  effect,
});

export const SCHEMA: readonly ValueSpec[] = [
  v('Page', 'background', color, '#ffffff', 'Color of the whole chart.'),
  v('Page', 'margin', num(0, 200), 32, 'Empty space around the chart.'),
  v('Page', 'palette', oneOf('own', 'app'), 'own', '`own`: the chart is drawn in this theme\'s colors, always. `app`: in the GUI, with Settings > Cards and printing > Flow chart > Colors on "match the app", every color value is replaced by one made from the app\'s appearance (operations solid in its accent with its on-accent text, ingredient boxes its soft accent with its ink, edges and outlines its ink and rule color; no hue the appearance does not carry; a PDF takes the light scheme of the same palette); `etna dag` has no app and uses the theme\'s own.'),

  v('Text', 'fonts', oneOf('own', 'card'), 'own', '`own`: the chart is set in this theme\'s fonts, always. `card`: given a card style (in the GUI the one in use, or one pinned in the chart\'s Font menu or Settings > Cards and printing > Flow chart > Fonts; `etna dag --card`), the title is set in the card\'s title font at its title weight and all other text in its body font, ingredients in its regular weight; every text size is scaled so the card\'s fonts have the x-height this theme\'s own have; `char-width` becomes the body font\'s nominal character and `title-wrap` is scaled to the title font, so the `*-wrap` counts keep their meaning; shapes, padding, spacing and colors stay this theme\'s. Without a card it uses its own.'),
  v('Text', 'font-family', font, MONO, 'Font stack for all text but the title. End it with a generic family. Its first family is the free font the SVG and the PDF embed (`etna fonts` caches it).'),
  v('Text', 'font-embedding', oneOf('embedded', 'none'), 'embedded', '`embedded`: the SVG carries the free font that heads `font-family` and `title-font-family` (from the font cache, as data: URLs), so it looks the same on every machine; a PDF embeds it too. `none`: a smaller SVG that uses the fonts the machine has.'),
  v('Text', 'text-measure', oneOf(...TEXT_MEASURES), 'mono', 'How text width is worked out when the first family of `font-family` has no metrics: `mono` (characters × `char-width`), or the built-in `sans` or `serif` width table. Must match the font stack. A cached font (every bundled one) is measured by its own widths instead.'),
  v('Text', 'font-size', num(6, 48), 14, 'Size of ingredient and operation text.'),
  v('Text', 'font-weight', weight, 700, 'Weight of captions and container names.'),
  v('Text', 'line-height', num(1, 3), 1.2, 'Line spacing, as a multiple of `font-size`.'),
  v('Text', 'char-width', num(0.3, 1.2), 0.6, 'The average character, in em, which turns the `*-wrap` counts into widths. With `mono` and a font without metrics, also the advance of every character.'),
  v('Text', 'text-color', color, '#333333', 'Color of captions and container names.'),

  v('Title', 'title-position', oneOf('center', 'left', 'none'), 'center', 'Where the title goes: top center, top left, or no title.'),
  v('Title', 'title-shape', oneOf('pill', 'rectangle', 'plain', 'underline'), 'pill', 'What surrounds the title: a pill, a rectangle, nothing, or a rule under it across the chart.'),
  v('Title', 'title-font-family', font, MONO, 'Font stack for the title and subtitle.'),
  v('Title', 'title-text-measure', oneOf(...TEXT_MEASURES), 'mono', 'As `text-measure`, for the title font.'),
  v('Title', 'title-font-size', num(8, 96), 30, 'Size of the title.'),
  v('Title', 'title-font-weight', weight, 400, 'Weight of the title and subtitle.'),
  v('Title', 'subtitle-font-size', num(6, 64), 15, 'Size of the subtitle (`in the style of …`, or after a dash).'),
  v('Title', 'title-wrap', num(8, 80, true), 22, 'Characters per title line.'),
  v('Title', 'title-fill', color, '#ffffff', 'Inside of the pill or rectangle.'),
  v('Title', 'title-stroke', color, '#333333', 'Outline of the pill or rectangle, or the rule.'),
  v('Title', 'title-stroke-width', num(0, 12), 5, 'Width of that outline or rule.'),
  v('Title', 'title-radius', num(0, 60), 0, 'Corner radius of the `rectangle` shape.'),
  v('Title', 'title-padding-x', num(0, 120), 44, 'Space left and right of the title text.'),
  v('Title', 'title-padding-y', num(0, 120), 20, 'Space above and below the title text.'),
  v('Title', 'title-gap', num(0, 200), 40, 'Space between the title and the chart.'),

  v('Ingredient boxes', 'ingredient-shape', oneOf('rectangle', 'pill', 'hexagon'), 'rectangle', 'Shape of an ingredient box.'),
  v('Ingredient boxes', 'ingredient-fill', color, '#ffeca9', 'Inside of the box.'),
  v('Ingredient boxes', 'ingredient-stroke', color, '#0c7cba', 'Outline.'),
  v('Ingredient boxes', 'ingredient-stroke-width', num(0, 12), 2, 'Outline width.'),
  v('Ingredient boxes', 'ingredient-stroke-dash', dash, 'none', 'Outline dashes: `none`, or dash and gap lengths (`4 3`).'),
  v('Ingredient boxes', 'ingredient-radius', num(0, 60), 6, 'Corner radius (`rectangle`, `hexagon`).'),
  v('Ingredient boxes', 'ingredient-point', num(0, 100), 16, 'How far the ends of a `hexagon` box reach out.'),
  v('Ingredient boxes', 'ingredient-text-color', color, '#333333', 'Color of the ingredient text.'),
  v('Ingredient boxes', 'ingredient-font-weight', weight, 700, 'Weight of the ingredient text.'),
  v('Ingredient boxes', 'ingredient-padding-x', num(0, 100), 10, 'Space left and right of the text.'),
  v('Ingredient boxes', 'ingredient-padding-y', num(0, 100), 12, 'Space above and below the text.'),
  v('Ingredient boxes', 'ingredient-min-height', num(16, 300), 52, 'Smallest box height.'),
  v('Ingredient boxes', 'ingredient-min-width', num(40, 800), 200, 'Smallest box width. All boxes share one width.'),
  v('Ingredient boxes', 'ingredient-wrap', num(8, 80, true), 26, 'Characters per item line; a longer item wraps under the item column.'),
  v('Ingredient boxes', 'ingredient-unit-width', num(0, 12, true), 7, 'A unit longer than this (`teaspoon`, `tablespoons`) runs on into the item instead of widening the unit column.'),
  v('Ingredient boxes', 'ingredient-text', oneOf('full', 'name'), 'full', '`full`: each line as written, notes and all (`611 g Water, 115°F, 52%`). `name`: quantity, unit and the ingredient\'s name only; everything from the first comma on is dropped (`611 g Water`).'),
  v('Ingredient boxes', 'ingredient-align', oneOf('chart', 'box'), 'chart', '`chart`: quantities share one right edge down the whole chart. `box`: each box aligns its own.'),

  v('Operation nodes', 'operation-shape', oneOf('hexagon', 'rectangle', 'pill'), 'hexagon', 'Shape of an operation node.'),
  v('Operation nodes', 'operation-fill', color, '#c1e4f7', 'Inside of the node.'),
  v('Operation nodes', 'operation-stroke', color, '#3aa6dd', 'Outline.'),
  v('Operation nodes', 'operation-stroke-width', num(0, 12), 2, 'Outline width.'),
  v('Operation nodes', 'operation-stroke-dash', dash, 'none', 'Outline dashes: `none`, or dash and gap lengths.'),
  v('Operation nodes', 'operation-radius', num(0, 60), 5, 'Corner radius (`hexagon`, `rectangle`).'),
  v('Operation nodes', 'operation-point', num(0, 100), 36, 'How far the ends of a `hexagon` reach out.'),
  v('Operation nodes', 'operation-text-color', color, '#333333', 'Color of the node text.'),
  v('Operation nodes', 'prep-fill', color, '#ffffff', 'Inside of a preparation step.'),
  v('Operation nodes', 'prep-text-color', color, '#333333', 'Color of a preparation step\'s text.'),
  v('Operation nodes', 'prep-dash', dash, '5 4', 'Dashes of a preparation step\'s outline.'),
  v('Operation nodes', 'operation-font-weight', weight, 700, 'Weight of the node text.'),
  v('Operation nodes', 'operation-padding-x', num(0, 100), 24, 'Space left and right of the text (beyond the shape\'s ends).'),
  v('Operation nodes', 'operation-padding-y', num(0, 100), 14, 'Space above and below the text.'),
  v('Operation nodes', 'operation-min-height', num(16, 300), 64, 'Smallest node height.'),
  v('Operation nodes', 'operation-min-width', num(40, 800), 200, 'Smallest node width. All nodes share one width.'),

  v('Edges', 'edge-style', oneOf('orthogonal', 'curved'), 'orthogonal', '`orthogonal`: straight runs with rounded corners. `curved`: the same routes, each bend a wide curve.'),
  v('Edges', 'edge-stroke', color, '#333333', 'Color of edges and arrowheads.'),
  v('Edges', 'edge-stroke-width', num(0.25, 12), 2.25, 'Edge width.'),
  v('Edges', 'edge-radius', num(0, 60), 8, 'Corner rounding of `orthogonal` edges; `0` gives square corners.'),
  v('Edges', 'join-edges', oneOf('bus', 'separate'), 'separate', 'Edges joining one node, and edges leaving one node for different nodes: `bus` runs edges that join one node down one shared lane, merging before the node, and lets edges that leave one node share its point of exit (the alternatives of a Choose also share one lane out of the step before it). `separate` gives every edge its own lane, each joining edge its own point of entry on the node, and each leaving edge its own point of exit, running out at its own height.'),
  v('Edges', 'arrow-length', num(0, 40), 11, 'Arrowhead length.'),
  v('Edges', 'arrow-width', num(0, 40), 9, 'Arrowhead width.'),
  v('Edges', 'edge-label-at', num(0, 1), 0.5, 'Where along a quantified reference\'s edge its amount is written, on an edge that joins neighboring boxes (see `edge-label-short`): `0` at the source, `1` at the arrowhead. The amount needs 5 units of room from every line, box, frame and text but its own edge: without it, it is tried on the other side of the line, then moves to the nearest place along the edge with room.'),
  v('Edges', 'edge-label-short', num(0, 2000), 300, 'An edge up to this long joins neighboring boxes, and its amount is written where `edge-label-at` says. `0`: no edge does.'),
  v('Edges', 'edge-label-within', num(0, 2000), 72, 'On a longer edge, the amount is written no farther than this from where the edge starts (or where `edge-label-at` says, if nearer), and before the edge leaves the frame it starts in when the amount fits there. `0`: no limit.'),

  v('Layout', 'ingredient-side', oneOf('left', 'right'), 'left', 'Which side the ingredient column is on. `right` mirrors the whole chart.'),
  v('Layout', 'row-gap', num(8, 200), 44, 'Space between rows.'),
  v('Layout', 'column-gap', num(16, 300), 64, 'Space between the ingredient column and the operations.'),
  v('Layout', 'channel-gap', num(16, 300), 56, 'Space between the two operation columns, where joining edges run.'),
  v('Layout', 'lane-gap', num(4, 60), 14, 'Space between edges running side by side.'),
  v('Layout', 'port-offset', num(0, 200), 36, 'How far from the center an edge leaves or enters a node\'s top or bottom when the end is taken.'),
  v('Layout', 'turn-depth', num(8, 100), 24, 'How far below the last row the spine turns into the third column.'),
  v('Layout', 'third-column', oneOf('auto', 'always', 'never'), 'auto', 'Whether steps that take no new ingredients may sit in a third column beside the spine. `auto`: whichever prints larger on the screen or sheet the chart is fitted to. `always`: the third column, as the hand-made charts have it. `never`: every step on the spine.'),
  v('Layout', 'columns', oneOf('auto', '1', '2', '3', '4', '5', '6'), 'auto', 'How many columns the chart is folded into, each read down, one after another across the page. `auto`: as many as print largest on the sheet; on the screen, one. A number: that many, or as many as the chart can be cut into.'),
  v('Layout', 'trailing-down-max', num(0, 20, true), 2, 'Up to this many closing steps without ingredients run *down* the third column; more run back *up* it.'),
  v('Layout', 'branch-max-steps', num(0, 20, true), 1, 'In a recipe made only of components, a side component with at most this many steps is drawn inline as a branch; a larger one gets a container. Beside top-level steps every component gets one.'),
  v('Layout', 'branch-gap', num(0, 100), 14, 'Extra space around an inline branch.'),
  v('Layout', 'branch-caption', num(0, 1, true), 1, '`1` names an inline branch over its first row; `0` leaves it unnamed.'),
  v('Layout', 'caption-font-size', num(6, 36), 11, 'Size of branch captions and Choose labels.'),
  v('Layout', 'caption-color', color, '#555555', 'Color of branch captions.'),
  v('Layout', 'prep-label', { type: 'label', max: 32 }, 'Before you start', 'Caption over the steps that join nothing (a preheat, a pan to line), drawn first in a row of their own.'),

  v('Components', 'component-fill', color, '#fbfbfb', 'Inside of a component container.'),
  v('Components', 'component-stroke', color, '#333333', 'Its outline, and its name pill\'s.'),
  v('Components', 'component-stroke-width', num(0, 12), 2, 'Outline width.'),
  v('Components', 'component-radius', num(0, 60), 14, 'Corner radius.'),
  v('Components', 'component-padding-x', num(0, 200), 24, 'Space inside, left and right.'),
  v('Components', 'component-padding-top', num(20, 200), 44, 'Space inside, above (the name sits on the top border).'),
  v('Components', 'component-padding-bottom', num(0, 200), 30, 'Space inside, below.'),
  v('Components', 'component-gap', num(0, 200), 34, 'Space between containers.'),
  v('Components', 'component-title-font-size', num(6, 48), 15, 'Size of a container\'s name.'),
  v('Components', 'component-title-fill', color, '#ffffff', 'Inside of the name pill.'),
  v('Components', 'component-title-stroke-width', num(0, 12), 3, 'Outline width of the name pill.'),

  v('Choose and Checkpoint marks', 'choose-label', { type: 'label', max: 24 }, 'Choose', 'Word before a Choose group\'s name (the callout\'s own name by default).'),
  v('Choose and Checkpoint marks', 'choose-stroke', color, '#333333', 'Dashed outline and rules of a Choose group.'),
  v('Choose and Checkpoint marks', 'choose-stroke-width', num(0, 12), 1.5, 'Their width.'),
  v('Choose and Checkpoint marks', 'choose-dash', dash, '6 5', 'Their dashes.'),
  v('Choose and Checkpoint marks', 'checkpoint-fill', color, '#ffffff', 'Inside of the Checkpoint check mark.'),
  v('Choose and Checkpoint marks', 'checkpoint-stroke', color, '#333333', 'Circle and check mark.'),
  v('Choose and Checkpoint marks', 'checkpoint-stroke-width', num(0, 12), 2, 'Their width.'),
  v('Choose and Checkpoint marks', 'checkpoint-radius', num(3, 30), 9, 'Size of the mark.'),
  v('Choose and Checkpoint marks', 'optional-label', { type: 'label', max: 24 }, 'optional', 'Word that marks a component or step the recipe says may be left out, in parentheses and at the caption size: after a frame\'s or a branch\'s name, and under a step\'s text.'),
];

export const SPECS: ReadonlyMap<string, ValueSpec> = new Map(SCHEMA.map((s) => [s.key, s]));

// ------------------------------------------------------------------ validation

const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood ' +
    'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray ' +
    'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue ' +
    'firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew ' +
    'hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue ' +
    'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred ' +
    'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
    'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue ' +
    'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white ' +
    'whitesmoke yellow yellowgreen none transparent'
  ).split(' '),
);

export const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

/**
 * Text that may never appear in a theme value, whatever its type: markup, entity and escape
 * characters, CSS block and statement breaks, comments, and URL or script schemes.
 */
const FORBIDDEN = /[<>&\\{};`\u0000-\u001f\u007f]|\/\*|url\s*\(|javascript\s*:|vbscript\s*:|data\s*:|expression\s*\(|@import/i;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?)\(\s*-?[0-9.]+%?(?:\s*[,\s/]\s*-?[0-9.]+%?){2,3}\s*\)$/i;
const BARE_FAMILY = /^[A-Za-z][A-Za-z0-9 -]{0,39}$/;
const QUOTED_FAMILY = /^(["'])([A-Za-z0-9][A-Za-z0-9 -]{0,39})\1$/;
const DASH = /^\d{1,3}(?:\.\d+)?(?:(?:\s*,\s*|\s+)\d{1,3}(?:\.\d+)?){0,7}$/;
const LABEL = /^[\p{L}\p{N} .,:!?()+·–—/-]+$/u;

/** The family names of a font stack, unquoted. */
export function fontFamilies(stack: string): string[] {
  return stack.split(',').map((f) => f.trim().replace(/^(["'])(.*)\1$/, '$2'));
}

/**
 * A value checked against its spec: the value to use (numbers as numbers, enums as strings),
 * or the reason it is refused.
 */
export function validateValue(spec: ValueSpec, raw: unknown): { value: string | number } | { error: string } {
  const s = spec.spec;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { error: `must be ${describeType(s)}, got ${raw === null ? 'nothing' : Array.isArray(raw) ? 'a list' : typeof raw}` };
  }
  if (typeof raw === 'string' && FORBIDDEN.test(raw)) {
    return { error: `contains characters or text a theme value may not hold (markup, quotes out of place, \`url(\`, a script scheme…): "${printable(raw)}"` };
  }
  if (typeof raw === 'number' && !Number.isFinite(raw)) return { error: 'must be a finite number' };
  switch (s.type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return { error: `must be a number, got "${printable(String(raw))}"` };
      if (s.integer && !Number.isInteger(n)) return { error: `must be a whole number, got ${n}` };
      if (n < s.min || n > s.max) return { error: `must be between ${s.min} and ${s.max}, got ${n}` };
      return { value: n };
    }
    case 'enum': {
      const text = String(raw);
      if (!s.options.includes(text)) return { error: `must be one of ${s.options.map((o) => `\`${o}\``).join(', ')}, got "${printable(text)}"` };
      return { value: text };
    }
    case 'color': {
      if (typeof raw !== 'string') return { error: `must be a color (\`#rrggbb\`, \`rgb(…)\` or a CSS color name), got ${raw}` };
      const text = raw.trim();
      if (HEX.test(text) || FUNCTIONAL.test(text) || NAMED_COLORS.has(text.toLowerCase())) return { value: text };
      return { error: `must be a color (\`#rrggbb\`, \`rgb(…)\`, \`hsl(…)\` or a CSS color name), got "${printable(text)}"` };
    }
    case 'font': {
      if (typeof raw !== 'string') return { error: 'must be a font stack, such as `Georgia, serif`' };
      const parts = raw.split(',').map((p) => p.trim());
      if (parts.length > 10 || raw.length > 300) return { error: 'is too long: at most 10 families' };
      for (const part of parts) {
        if (!(BARE_FAMILY.test(part) || QUOTED_FAMILY.test(part))) {
          return { error: `"${printable(part)}" is not a font family name (letters, digits, spaces and hyphens; quote a name with spaces)` };
        }
      }
      return { value: parts.join(', ') };
    }
    case 'dash': {
      const text = String(raw).trim();
      if (text === 'none' || DASH.test(text)) return { value: text };
      return { error: `must be \`none\` or up to 8 dash and gap lengths (\`6 5\`), got "${printable(text)}"` };
    }
    case 'label': {
      const text = String(raw).trim();
      if (text.length === 0 || text.length > s.max) return { error: `must be 1 to ${s.max} characters` };
      if (!LABEL.test(text)) return { error: `may hold letters, digits, spaces and . , : ! ? ( ) + - / only, got "${printable(text)}"` };
      return { value: text };
    }
  }
}

export function describeType(s: ValueType): string {
  switch (s.type) {
    case 'number':
      return `${s.integer ? 'a whole number' : 'a number'} from ${s.min} to ${s.max}`;
    case 'enum':
      return `one of ${s.options.map((o) => `\`${o}\``).join(', ')}`;
    case 'color':
      return 'a color';
    case 'font':
      return 'a font stack';
    case 'dash':
      return '`none` or dash lengths';
    case 'label':
      return `text, up to ${s.max} characters`;
  }
}

const printable = (text: string): string => {
  const shown = text.replace(/[\u0000-\u001f\u007f]/g, '?');
  return shown.length > 60 ? shown.slice(0, 57) + '…' : shown;
};

/** The documentation table of every value, grouped, as Markdown (themes/README.md). */
export function valuesTable(): string {
  const out: string[] = [];
  const cell = (text: string): string => text.replace(/\|/g, '\\|');
  for (const group of GROUPS) {
    out.push(`**${group}**`, '', '| Value | Type | Default | Effect |', '|-------|------|---------|--------|');
    for (const s of SCHEMA.filter((x) => x.group === group)) {
      const type = s.spec.type === 'number' ? `${s.spec.min}–${s.spec.max}` : s.spec.type === 'enum' ? s.spec.options.join(' \\| ') : describeType(s.spec);
      out.push(`| \`${s.key}\` | ${cell(type)} | \`${cell(String(s.default))}\` | ${cell(s.effect)} |`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}
