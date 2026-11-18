// Temperature notation: the one thing the formatter rewrites inside prose.
//
// Canonical: `350°F`, `180°C` — no space, the degree sign, a capital letter. Only the
// notation after the number is replaced; the number itself is never rewritten, so a range
// keeps its separator (`78–80 °F` → `78–80°F`).
//
// A bare capital F after the number (`350 F`, `325F`) is Fahrenheit.
// A temperature written without its scale (`350 degrees`, `350°`) gets one when the recipe
// or the value decides it — see `scanTemperatures` — and is reported otherwise.

import type { Edit } from './edits.ts';

// Horizontal white space only: a temperature is never joined across a line break.
const HS = '[ \\t\\u00a0\\u2009\\u202f]';
// The degree sign, and two glyphs commonly typed in its place (º ordinal indicator, ˚ ring above).
const SIGN = '[°º˚]';
const SCALE_WORD = 'fahrenheit|celsius';
const NOT_WORD = '(?![A-Za-z0-9])';

const TEMPERATURE_RE = new RegExp(
  '(\\d)(?:' +
    `${HS}*${SIGN}${HS}*([fc])${NOT_WORD}` + // 2  350 °F, 350° F, 350ºF, 350°f
    `|${HS}*([℉℃])` + // 3  350℉, 350 ℃
    `|${HS}*-?${HS}*degrees?${HS}+(${SCALE_WORD}|[fc])${NOT_WORD}` + // 4  350 degrees F, 350 degrees Celsius
    `|(${HS}*-?${HS}*degrees?)(?![A-Za-z])` + // 5  350 degrees — no scale
    `|(${HS}*${SIGN})` + // 6  350° — no scale
    `|(${HS}*F)(?![A-Za-z0-9-])` + // 7  350 F, 325F — a bare capital F (checked case-sensitively below; `c` would be a cup; `F-clamps` is not)
    ')',
  'gi',
);

// After a bare `350°` or `350 degrees`: the scale may be carried by the other end of a range
// (`350° to 375°F`, `160 to 165 degrees F` is handled by the main pattern already).
const RANGE_TAIL_RE = new RegExp(
  `^${HS}*(?:-|–|—|to|and|or)${HS}*\\d+(?:\\.\\d+)?(?:${HS}*${SIGN}${HS}*[fc]${NOT_WORD}|${HS}*[℉℃]|${HS}*-?${HS}*degrees?${HS}+(?:${SCALE_WORD}|[fc])${NOT_WORD})`,
  'i',
);
// A scale we recognize but do not rewrite, so it is not reported as missing either.
const OTHER_SCALE_RE = new RegExp(`^${HS}*(?:centigrade|kelvin|k${NOT_WORD})`, 'i');

// `turn 90 degrees` is an angle, not a temperature with its scale missing. A verb that only
// ever means an angle (rotate, tilt) decides for any number; `turn` and `flip` also apply to
// an oven dial, so they count only with the usual angles — and never across a word that
// names the heat (`turn the oven down to 180 degrees`).
const ANGLES = new Set(['45', '90', '180', '270', '360']);
const ANGLE_STRONG_RE = /\b(?:rotat\w*|tilt\w*|pivot\w*|angle[ds]?|bias|slant\w*|diagonal\w*|knife|blade)\b([^.!?;]*)$/i;
const ANGLE_WEAK_RE = /\b(?:turn|turns|turned|turning|flip\w*|quarter)\b([^.!?;]*)$/i;
const HEAT_WORD_RE = /\b(?:oven|heat|temperature|temp|thermometer|burner|flame|grill|broiler|stove|fryer|oil)\b/i;
const ANGLE_AFTER_RE = /^[\s,]*(?:turn|angle|rotation|clockwise|counter)/i;
// What follows names an angle whatever the number: `a 30-degree bias`, `at a 60° angle`.
const ANGLE_NOUN_AFTER_RE = /^[\s,-]*(?:angle|bias|slant|tilt|wedge|arc|incline|rotation)/i;

// A difference, not a reading: `lower the oven by 25 degrees`, `5 degrees cooler`. It has no
// scale to add (25°F would read as a temperature), so it is left as written.
const DIFFERENCE_BEFORE_RE = /\b(?:by|another|additional|extra|a few|within)\s+(?:about\s+|around\s+|roughly\s+|approximately\s+)?$/i;
const DIFFERENCE_AFTER_RE = /^[\s,]*(?:cooler|warmer|hotter|colder|lower|higher|more|less|below|above|under|over|shy)\b/i;

// The other end of a range around a bare temperature: `350 to 375 degrees`, `350° - 375°`.
const RANGE_BEFORE_RE = new RegExp(`(\\d+(?:\\.\\d+)?)(?:${HS}*${SIGN})?${HS}*(?:-|–|—|to|and|or)${HS}*$`, 'i');
const RANGE_AFTER_RE = new RegExp(`^${HS}*(?:-|–|—|to|and|or)${HS}*(\\d+(?:\\.\\d+)?)(?:${HS}*${SIGN}|${HS}*-?${HS}*degrees?(?![A-Za-z]))`, 'i');

export type Scale = 'F' | 'C';

/**
 * What the rest of the recipe says about its temperature scale:
 *  - a scale: every temperature that states one states this one, so a bare `200 degrees` means it too;
 *  - `mixed`: the recipe states both °F and °C, so it gives no lead;
 *  - `none`: no temperature in the recipe states a scale.
 */
export type ScaleContext = Scale | 'mixed' | 'none';

/** From this value up, a bare temperature is Fahrenheit: no home cooking or baking is that hot in Celsius. */
export const FAHRENHEIT_FROM = 300;

/** Every note about a temperature whose scale could not be decided starts with this. */
export const UNDECIDED_TEMPERATURE = 'temperature undecided';

export interface BareDegrees {
  /** Offset of the number within the scanned text. */
  index: number;
  /** Offset just past the expression. */
  end: number;
  /** The expression as written, e.g. `350 degrees` or `350°`. */
  text: string;
  /** Why the scale could not be decided. */
  reason: string;
}

export interface TemperatureEdit extends Edit {
  /** Offset where the whole expression starts (its number), for locating it. */
  from: number;
  /** How a bare temperature got its scale; absent when the scale was written. */
  decidedBy?: 'context' | 'value';
}

export interface TemperatureScan {
  /** Replacements, with offsets relative to the scanned text. */
  edits: TemperatureEdit[];
  /** Temperatures whose scale is neither stated nor decidable: left alone, to be reported. */
  bare: BareDegrees[];
  /** The scale of every temperature that states one, in order. */
  stated: Scale[];
}

/** The message of the note for an undecided temperature. */
export function undecidedMessage(b: BareDegrees): string {
  return `${UNDECIDED_TEMPERATURE}: ${b.text}: ${b.reason}`;
}

/** Sum up the scales a recipe states. */
export function scaleContext(stated: Iterable<Scale>): ScaleContext {
  const seen = new Set(stated);
  if (seen.size === 0) return 'none';
  return seen.size === 1 ? [...seen][0] : 'mixed';
}

function isAngle(number: string, before: string, rest: string): boolean {
  if (ANGLE_NOUN_AFTER_RE.test(rest)) return true;
  const strong = ANGLE_STRONG_RE.exec(before);
  if (strong && !HEAT_WORD_RE.test(strong[1])) return true;
  if (!ANGLES.has(number)) return false;
  const weak = ANGLE_WEAK_RE.exec(before);
  return (weak !== null && !HEAT_WORD_RE.test(weak[1])) || ANGLE_AFTER_RE.test(rest);
}

/**
 * Find the temperatures in `text`. A temperature that states its scale is brought to the
 * canonical notation. One that does not is given the scale the recipe uses everywhere else
 * (`context`), or °F when its value leaves no doubt; failing both it is reported.
 */
export function scanTemperatures(text: string, context: ScaleContext = 'none'): TemperatureScan {
  const edits: TemperatureEdit[] = [];
  const bare: BareDegrees[] = [];
  const stated: Scale[] = [];
  TEMPERATURE_RE.lastIndex = 0;
  for (let m = TEMPERATURE_RE.exec(text); m; m = TEMPERATURE_RE.exec(text)) {
    const after = m.index + 1; // just past the digit
    const end = m.index + m[0].length;
    const number = /\d+(?:\.\d+)?$/.exec(text.slice(0, after))?.[0] ?? m[1];
    const start = after - number.length;
    if (m[7] !== undefined) {
      // Only a capital F counts: `2 f` or `1 c` is a measure, not a scale, and `C` alone is too often a cup.
      if (!m[7].endsWith('F')) continue;
      stated.push('F');
      edits.push({ from: start, start: after, end, text: '°F' });
      continue;
    }
    const written = m[2] ?? m[4];
    if (written !== undefined || m[3] !== undefined) {
      const scale: Scale = written !== undefined ? (written[0].toUpperCase() as Scale) : m[3] === '℉' ? 'F' : 'C';
      stated.push(scale);
      edits.push({ from: start, start: after, end, text: `°${scale}` });
      continue;
    }
    const rest = text.slice(end);
    if (RANGE_TAIL_RE.test(rest)) continue; // the other end of the range states the scale
    const other = OTHER_SCALE_RE.exec(rest);
    if (other) {
      if (/^\s*c/i.test(other[0])) stated.push('C'); // centigrade
      continue;
    }
    const before = text.slice(Math.max(0, start - 80), start);
    if (isAngle(number, before, rest)) continue;
    if (DIFFERENCE_BEFORE_RE.test(before) || DIFFERENCE_AFTER_RE.test(rest)) continue;

    const shown = number + (m[5] !== undefined ? ' degrees' : '°');
    // Rule 1: the scale every other temperature in the recipe states.
    // Rule 2: from 300 up it is Fahrenheit; in a range both ends must be.
    const ends = [number, RANGE_BEFORE_RE.exec(text.slice(0, start))?.[1], RANGE_AFTER_RE.exec(rest)?.[1]].filter((v) => v !== undefined).map(Number);
    const high = ends.every((v) => v >= FAHRENHEIT_FROM);
    if (context === 'F' || (context === 'C' && !high)) {
      edits.push({ from: start, start: after, end, text: `°${context}`, decidedBy: 'context' });
    } else if (high && context !== 'C') {
      edits.push({ from: start, start: after, end, text: '°F', decidedBy: 'value' });
    } else {
      const reason =
        context === 'C'
          ? `scale not stated; the recipe uses °C, but ${number} is too high to be Celsius`
          : context === 'mixed'
            ? 'scale not stated, and the recipe uses both °F and °C'
            : 'scale not stated, and the recipe gives no other temperature';
      bare.push({ index: start, end, text: shown, reason });
    }
  }
  return { edits: edits.filter((e) => text.slice(e.start, e.end) !== e.text), bare, stated };
}

/** `text` with every temperature in canonical notation, bare ones included where `context` or their value decides. */
export function rewriteTemperatures(text: string, context: ScaleContext = 'none'): string {
  const { edits } = scanTemperatures(text, context);
  let out = '';
  let at = 0;
  for (const e of edits) {
    out += text.slice(at, e.start) + e.text;
    at = e.end;
  }
  return out + text.slice(at);
}
