// The kinds of a mark (SPEC §5.3, "Kinds"; ADR 0022): what the words a step marks
// for its chart box are — a time, a temperature, a setting, a tool, a cue or an action.
//
// A kind is read from the mark's own words and nothing else: never from the sentence around
// it, the heading or another mark. Every word it knows comes from the registries (data, passed
// in); the code holds only the shape of a number and how the registries' words combine. A
// mark nothing matches is untyped, which is not an error. A kind never changes a chart or a
// card. Pure: no file system, so it runs the same in a browser.

/** The kinds, in the order that decides between two readings of the same words. */
export const MARK_KINDS = ['duration', 'temperature', 'setting', 'tool', 'cue', 'action'] as const;
export type MarkKindName = (typeof MARK_KINDS)[number];

/** What a temperature is, when its own words say: the oven's (`at 350°F`) or the food's (`to 190°F`). */
export type TemperatureRole = 'set' | 'reach' | 'unknown';

/** One thing a mark says. */
export interface MarkKind {
  kind: MarkKindName;
  /** The mark's own words for it, as written (`15-25 minutes`, `medium heat`, `Vitamix`). */
  words: string;
  /** Where those words are in the mark: `mark.slice(start, end) === words`. */
  start: number;
  end: number;
  /** A temperature's role. */
  role?: TemperatureRole;
  /** A tool's registry entry: its canonical name and its kind (machine, appliance, …). */
  tool?: { name: string; kind: string };
  /** An action's canonical operation (`whirl` is `blend`). */
  operation?: string;
}

/** The registries a mark is read with, compiled once by `createKindRegistries`. */
export interface KindRegistries {
  /** Time units with their spellings, a word for a number (`a few`), a time on its own (`overnight`). */
  duration: { units: string[]; counts: string[]; between: string[]; words: string[] };
  temperature: { units: string[]; reach: string[]; set: string[]; otherwiseReach: string[]; otherwiseSet: string[] };
  cue: { opens: string[] };
  setting: { levels: string[]; dials: string[]; numberDials: string[]; modes: string[]; before: string[] };
  /** Every tool spelling, lower case, with its entry. */
  tools: Map<string, { name: string; kind: string }>;
  /** Every operation spelling, lower case, with its canonical name. */
  operations: Map<string, string>;
  /** Words a mark may open with ahead of its operation (`let`). */
  operationsBefore: string[];
  /** The compiled patterns (built from the lists above). */
  patterns: Patterns;
}

/** The parsed YAML of the four registries a kind is read from. */
export interface KindRegistryData {
  operations: unknown;
  tools: unknown;
  modifiers: unknown;
  stopConditions: unknown;
}

// ------------------------------------------------------------------ building

const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String).filter((s) => s.trim() !== '') : []);
const list = (value: unknown, key: string, file: string): Record<string, unknown>[] => {
  const items = record(value)[key];
  if (!Array.isArray(items)) throw new Error(`${file}: expected a top-level "${key}" list`);
  return items.map(record);
};

/** A unit's spellings: its name and aliases. */
const spellings = (entry: Record<string, unknown>): string[] => [String(entry.name ?? ''), ...strings(entry.aliases)].filter((s) => s !== '');

/** Build the registries a mark is read with from the parsed content of the four files. */
export function createKindRegistries(data: KindRegistryData): KindRegistries {
  const categories = list(data.stopConditions, 'categories', 'stop-conditions registry');
  const category = (kind: string) => categories.find((c) => c.kind === kind) ?? {};
  const duration = category('duration');
  const temperature = category('temperature');
  const roles = record(temperature.roles);
  const otherwise = record(roles.otherwise);
  const cue = category('cue');

  const modifiers = list(data.modifiers, 'modifiers', 'modifiers registry');
  const ofKind = (kind: string, test: (m: Record<string, unknown>) => boolean = () => true) => modifiers.filter((m) => m.kind === kind && test(m)).flatMap(spellings);

  const tools = new Map<string, { name: string; kind: string }>();
  for (const entry of list(data.tools, 'tools', 'tools registry')) {
    const name = String(entry.name ?? '');
    if (name === '') throw new Error('tools registry: an entry has no name');
    for (const spelling of spellings(entry)) tools.set(spelling.toLowerCase(), { name, kind: String(entry.kind ?? '') });
  }
  const operations = new Map<string, string>();
  for (const entry of list(data.operations, 'operations', 'operations registry')) {
    const name = String(entry.name ?? '');
    if (name === '') throw new Error('operations registry: an entry has no name');
    for (const spelling of spellings(entry)) operations.set(spelling.toLowerCase(), name);
  }

  const built: Omit<KindRegistries, 'patterns'> = {
    duration: {
      units: list(duration, 'units', 'stop-conditions registry (duration)').flatMap(spellings),
      counts: strings(duration.counts),
      between: strings(duration.between),
      words: strings(duration.words),
    },
    temperature: {
      units: list(temperature, 'units', 'stop-conditions registry (temperature)').flatMap(spellings),
      reach: strings(roles.reach),
      set: strings(roles.set),
      otherwiseReach: strings(otherwise.reach),
      otherwiseSet: strings(otherwise.set),
    },
    cue: { opens: strings(cue.opens) },
    setting: {
      levels: ofKind('level'),
      dials: ofKind('dial'),
      numberDials: ofKind('dial', (m) => m.number === true),
      modes: ofKind('mode'),
      before: strings(record(data.modifiers).before),
    },
    tools,
    operations,
    operationsBefore: strings(record(data.operations).before),
  };
  return { ...built, patterns: compile(built) };
}

// ------------------------------------------------------------------ patterns

/** A letter or digit: what a word is made of. */
const WORD_CHAR = '[\\p{L}\\p{N}]';
/** A whole registry word: not inside a longer word, and not part of a hyphenated one (`high` is not in `high-speed`). */
const OPEN = `(?<![\\p{L}\\p{N}-])`;
const CLOSE = `(?![\\p{L}\\p{N}]|-${WORD_CHAR})`;

// The shape of a number, as ingredient quantities write it (quantity.ts): 1 1/2, 1/2, 2.5, 1½, ½, 15.
const GLYPHS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';
const NUMBER = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+(?:\\s?[${GLYPHS}])?|[${GLYPHS}])`;
/** A number or a range of two (`15-25`, `2 to 4`, `2 or 3`): the joiners of a range, as quantity.ts reads them, and `or`. */
const RANGE = `${NUMBER}(?:\\s*[-–—]\\s*${NUMBER}|\\s+(?:to|or)\\s+${NUMBER})?`;

interface Patterns {
  duration: RegExp;
  temperature: RegExp | null;
  level: RegExp | null;
  dialAfter: RegExp | null;
  numberDial: RegExp | null;
  mode: RegExp | null;
  before: RegExp | null;
  tool: RegExp | null;
  cue: RegExp | null;
  operation: RegExp | null;
  reach: RegExp | null;
  set: RegExp | null;
  otherwiseReach: RegExp | null;
  otherwiseSet: RegExp | null;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Phrases as an alternation, longest first, a space matching any run of white space. */
const alternation = (phrases: string[]): string | null => {
  const unique = [...new Set(phrases.map((p) => p.trim()).filter((p) => p !== ''))].sort((a, b) => b.length - a.length);
  return unique.length === 0 ? null : `(?:${unique.map((p) => escape(p).replace(/\s+/g, '\\s+')).join('|')})`;
};
/** A registry phrase as a whole word (or words), in any case. */
const wordsRe = (phrases: string[], flags = 'giu', suffix = ''): RegExp | null => {
  const alt = alternation(phrases);
  return alt === null ? null : new RegExp(`${OPEN}${alt}${suffix}${CLOSE}`, flags);
};

function compile(r: Omit<KindRegistries, 'patterns'>): Patterns {
  // A time: a number or a word for one, then a unit (also with an s); or a time word alone.
  const units = alternation(r.duration.units);
  const counts = alternation(r.duration.counts);
  const amount = counts ? `(?:${RANGE}|${OPEN}${counts})` : RANGE;
  const between = alternation(r.duration.between);
  const gap = between ? `[\\s-]*(?:${between}\\s+)?` : '[\\s-]*';
  const timed = units ? `(?<![\\p{L}\\p{N}.,/])${amount}${gap}${units}s?${CLOSE}` : null;
  const alone = alternation(r.duration.words);
  const durationAlts = [timed, alone ? `${OPEN}${alone}${CLOSE}` : null].filter((s): s is string => s !== null);
  const duration = new RegExp(durationAlts.length > 0 ? durationAlts.join('|') : '(?!)', 'giu');

  // A temperature: a number or range, then a unit; the same temperature in the other unit may
  // follow in parentheses or after a slash (`210°C (410°F)`, `100-110°F/ 38-43°C`).
  const tUnits = alternation(r.temperature.units);
  const one = tUnits ? `${RANGE}\\s*${tUnits}(?!\\p{L})` : null;
  const temperature = one ? new RegExp(`(?<![\\p{L}\\p{N}.,/])${one}(?:\\s*\\(\\s*${one}\\s*\\)|\\s*/\\s*${one})?`, 'giu') : null;

  const dials = alternation(r.setting.dials);
  const numberDials = alternation(r.setting.numberDials);
  const before = alternation(r.setting.before);

  // Tools: a plural is read too (`bowls`, `dishes`).
  const tool = wordsRe([...r.tools.keys()], 'giu', '(?:e?s)?');

  return {
    duration,
    temperature,
    level: wordsRe(r.setting.levels),
    dialAfter: dials ? new RegExp(`^\\s+${dials}${CLOSE}`, 'iu') : null,
    numberDial: numberDials ? new RegExp(`${OPEN}${numberDials}\\s+${NUMBER}(?![\\p{L}\\p{N}])`, 'giu') : null,
    mode: wordsRe(r.setting.modes),
    before: before ? new RegExp(`${OPEN}${before}\\s+$`, 'iu') : null,
    tool,
    cue: wordsRe(r.cue.opens),
    // An action opens the mark, perhaps after one of the registry's `before` words (`let rest`).
    operation: (() => {
      const alt = alternation([...r.operations.keys()]);
      const lead = alternation(r.operationsBefore);
      return alt ? new RegExp(`^${lead ? `(?:${lead}\\s+)?` : ''}(${alt})${CLOSE}`, 'iu') : null;
    })(),
    reach: wordsRe(r.temperature.reach),
    set: wordsRe(r.temperature.set),
    otherwiseReach: wordsRe(r.temperature.otherwiseReach),
    otherwiseSet: wordsRe(r.temperature.otherwiseSet),
  };
}

// ------------------------------------------------------------------ reading

interface Candidate extends MarkKind {
  /** Recognized by its shape (a number and a unit): wins over any word. */
  shape: boolean;
}

const rank = (kind: MarkKindName): number => MARK_KINDS.indexOf(kind);

function* matches(re: RegExp | null, text: string): Generator<RegExpExecArray> {
  if (re === null) return;
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    yield m;
  }
}

/**
 * The kinds one mark holds, in the order its words come, each with its words. A mark may hold
 * more than one (`speed 6 for 6-8 minutes` is a setting and a duration) or none (untyped).
 *
 * How the words are read, in order:
 * 1. **Shapes first.** A number with a time unit (or a time word: `overnight`) is a duration;
 *    a number with a temperature unit is a temperature. Their words are never read as
 *    anything else.
 * 2. **Then registry words.** A level (`medium-low`) is a setting when it is the whole mark,
 *    comes just after one of the modifiers registry's `before` words (`on high`), or has a
 *    dial after it (`medium heat`); a number dial with its number (`speed 6`) and a mode
 *    (`fan`) are settings anywhere. A tool's name or alias is a tool. A cue opens with one
 *    of the stop-conditions registry's `opens` words (`until`) and runs to the next comma,
 *    semicolon or shape. An operation at the very start of the mark, or after one of the
 *    operations registry's `before` words (`let rest`), is an action.
 * 3. **When two readings share words**, the longer wins, then the earlier kind in
 *    `MARK_KINDS`; except that a word that is both an operation and a tool (`whisk`) is the
 *    action when it opens the mark.
 * 4. **A cue that runs into a temperature** (`until it registers 160°F`) is that
 *    temperature's own words: the temperature is kept, the cue is not.
 * 5. **A temperature's role** comes from the words before it in the mark, back to the previous
 *    temperature: the nearest of the registry's reach or set words decides; failing those, a
 *    reach or set word right after it (`190°F internal`); failing those, the `otherwise` words
 *    before it (`to`); failing those, the role is unknown. Nothing outside the mark is read.
 */
export function kindsOf(mark: string, registries: KindRegistries): MarkKind[] {
  const p = registries.patterns;
  const shapes: Candidate[] = [];
  const add = (into: Candidate[], kind: MarkKindName, start: number, end: number, extra: Partial<Candidate> = {}) =>
    into.push({ kind, words: mark.slice(start, end), start, end, shape: false, ...extra });

  for (const m of matches(p.duration, mark)) add(shapes, 'duration', m.index, m.index + m[0].length, { shape: true });
  for (const m of matches(p.temperature, mark)) add(shapes, 'temperature', m.index, m.index + m[0].length, { shape: true });
  const accepted = accept(shapes, []);

  const words: Candidate[] = [];
  for (const m of matches(p.level, mark)) {
    const start = m.index;
    let end = start + m[0].length;
    const dial = p.dialAfter?.exec(mark.slice(end));
    if (dial) end += dial[0].length;
    const whole = mark.slice(0, start).trim() === '' && mark.slice(end).trim() === '';
    const after = p.before?.test(mark.slice(0, start)) ?? false;
    if (dial || whole || after) add(words, 'setting', start, end);
  }
  for (const m of matches(p.numberDial, mark)) add(words, 'setting', m.index, m.index + m[0].length);
  for (const m of matches(p.mode, mark)) add(words, 'setting', m.index, m.index + m[0].length);
  for (const m of matches(p.tool, mark)) {
    const entry = registries.tools.get(m[0].toLowerCase()) ?? registries.tools.get(m[0].toLowerCase().replace(/e?s$/, '')) ?? registries.tools.get(m[0].toLowerCase().replace(/s$/, ''));
    if (entry) add(words, 'tool', m.index, m.index + m[0].length, { tool: { ...entry } });
  }
  const op = p.operation?.exec(mark);
  if (op) add(words, 'action', 0, op[0].length, { operation: registries.operations.get(op[1].toLowerCase().replace(/\s+/g, ' ')) });

  // Cues run to the next comma or semicolon, or to the next shape. One that a temperature
  // ends is that temperature's words.
  const cues: Candidate[] = [];
  for (const m of matches(p.cue, mark)) {
    const start = m.index;
    let end = mark.length;
    const stop = /[,;]/.exec(mark.slice(start));
    if (stop) end = start + stop.index;
    const next = accepted.filter((s) => s.start >= start + m[0].length && s.start < end).sort((a, b) => a.start - b.start)[0];
    if (next) {
      if (next.kind === 'temperature') continue;
      end = next.start;
    }
    while (end > start && /\s/.test(mark[end - 1])) end--;
    if (end > start + m[0].length) add(cues, 'cue', start, end);
  }

  const all = accept([...words, ...cues], accepted).sort((a, b) => a.start - b.start);
  const temperatures = all.filter((k) => k.kind === 'temperature');
  temperatures.forEach((t, i) => {
    const from = i > 0 ? temperatures[i - 1].end : 0;
    const to = i + 1 < temperatures.length ? temperatures[i + 1].start : mark.length;
    t.role = roleOf(mark.slice(from, t.start), mark.slice(t.end, to), p);
  });
  return all.map(({ shape: _shape, ...kind }) => kind);
}

/** Add the candidates that share no words with those already taken, best first (rule 3). */
function accept(candidates: Candidate[], taken: Candidate[]): Candidate[] {
  const out = [...taken];
  const better = (a: Candidate, b: Candidate): number => {
    if (a.shape !== b.shape) return a.shape ? -1 : 1;
    const length = b.end - b.start - (a.end - a.start);
    if (length !== 0) return length;
    const opening = (c: Candidate) => c.kind === 'action' && c.start === 0;
    if (opening(a) !== opening(b) && a.start === b.start) return opening(a) ? -1 : 1;
    return rank(a.kind) - rank(b.kind) || a.start - b.start;
  };
  for (const c of [...candidates].sort(better)) {
    if (out.every((t) => c.end <= t.start || c.start >= t.end)) out.push(c);
  }
  return out;
}

/** Rule 5: the role a temperature's own words give: those before it, else the word right after it (`190°F internal`). */
function roleOf(before: string, after: string, p: Patterns): TemperatureRole {
  // The nearest match, as where it ends; of two that end together, the longer (`stop at` over `at`).
  const last = (re: RegExp | null): number => {
    let at = -1;
    for (const m of matches(re, before)) at = Math.max(at, m.index + m[0].length + m[0].length / 1000);
    return at;
  };
  const pick = (reach: number, set: number): TemperatureRole | null => (reach < 0 && set < 0 ? null : reach > set ? 'reach' : 'set');
  const next = (re: RegExp | null): number => {
    for (const m of matches(re, after)) return after.slice(0, m.index).trim() === '' ? 1 : -1;
    return -1;
  };
  return pick(last(p.reach), last(p.set)) ?? pick(next(p.reach), next(p.set)) ?? pick(last(p.otherwiseReach), last(p.otherwiseSet)) ?? 'unknown';
}
