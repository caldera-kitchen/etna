// This browser's settings: one object under `etna.settings`, in the `etna.json` shape.
// Every read and write of a setting goes through here.
// Pure and browser-safe: the functions take the text or the storage they work on.
//
// What storage or a file hands back is someone's text: it is read as data, only the keys below
// are taken, and a value that is not the shape the app makes is dropped (the default applies).

import { DEFAULT_APPEARANCE, parseAppearance, type Appearance } from './appearance.ts';
import { parseRepo } from './repo.ts';

/** The key this browser's settings are kept under. */
export const SETTINGS_KEY = 'etna.settings';
/** The version of the settings shape this Etna writes and fully understands. */
export const SETTINGS_VERSION = 1;
/** The file "Save settings to a file" writes. */
export const SETTINGS_FILE = 'etna-settings.json';
/** At most this many repositories are kept (the app has always loaded at most 20). */
export const MAX_SOURCES = 20;
/** A settings file larger than this is refused (real ones are well under 2 KB). */
export const MAX_FILE_BYTES = 256 * 1024;

/** A repository as the settings name it: `owner/name`, or with a branch, a folder and a label. */
export type SourceSpec = string | { repo: string; path?: string; ref?: string; label?: string };

export type PartsChoice = 'paired' | 'sections';
/** How edges joining one chart node come in: each in its own lane (the default), or down one shared lane. */
export type JoinEdgesChoice = 'separate' | 'bus';
/** What a flow chart is fitted to: the screen (the default), or a sheet: whichever way up prints it larger (`auto`), or fixed. */
export type ChartShapeChoice = 'screen' | 'auto' | 'portrait' | 'landscape';
/** A flow chart's colors: the app's appearance (the default) or the chart theme's own. */
export type ChartPaletteChoice = 'app' | 'own';
/**
 * A flow chart's fonts: `card`, the card style's in use (the default); `own`, the chart theme's
 * own; or a card style's id, as `cards.theme` holds it (`builtin:folio`), whatever card style
 * is in use. An id that names no card style the chart can take fonts from follows the card
 * style in use (engine.ts `chartFonts`).
 */
export type ChartFontsChoice = 'card' | 'own' | string;

export interface CardSettings {
  theme?: string;
  paper?: string;
  size?: string;
  parts?: PartsChoice;
  notes?: boolean;
  /** False leaves the recipe's picture off the card; absent or true shows it where the style has a place for one. */
  picture?: boolean;
  /** A card (and the shopping list) on screen in the app's colors (the default), or in the style's own. Print is always the style's own. */
  palette?: 'app' | 'own';
}

export interface ChartSettings {
  theme?: string;
  'join-edges'?: JoinEdgesChoice;
  /** What the chart is fitted to, the screen or a sheet; unset, the screen. A PDF of a screen chart prints on `auto`. */
  shape?: ChartShapeChoice;
  /** Page margin a flow chart prints with: `0.5in` unless the printer's border needs more. */
  margin?: '0.5in' | '0.75in' | '1in';
  /** A chart theme that says `palette: app` (flow, dense) in the app's colors (the default), or in its own. */
  palette?: ChartPaletteChoice;
  /** A chart theme that says `fonts: card` in the fonts of the card style in use (the default), of a named card style, or in its own. */
  fonts?: ChartFontsChoice;
}

export interface ShoppingSettings {
  theme?: string;
  paper?: string;
  size?: string;
  uses?: boolean;
}

export interface Settings {
  sources?: SourceSpec[];
  hide?: string[];
  order?: string[];
  /**
   * The site's own sources (a static build's default, `etna build-web --default-source`) that
   * the reader removed: never listed again in this browser. Kept by id, so on a site whose
   * default has another name, or under `etna serve`, it names nothing and changes nothing.
   */
  removed?: string[];
  appearance?: Appearance;
  cards?: CardSettings;
  chart?: ChartSettings;
  shopping?: ShoppingSettings;
  'screen-on'?: boolean;
  'settings-repo'?: string;
  /**
   * `short`: the reader hid the full welcome (main.tsx Welcome), and every visit opens on the
   * short form. Unset, the full welcome greets a stranger (welcome.ts `welcomeForm`). It says
   * the reader knows what Etna is, not something about one site, so a settings file loaded on
   * another Etna site hides that site's full welcome too; "Show the welcome" is there as ever.
   */
  welcome?: 'short';
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

// --------------------------------------------------------------- the shapes

/** A source id as the app makes them: a folder's name or `owner/name`. Bounded, printable. */
export function isSourceId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f\u007f]/.test(id);
}

/** A theme id as the app makes them: `builtin:name` or `<source id>:name`. */
export function isThemeId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 250 && /^[A-Za-z0-9._/-]{1,200}:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

/** A paper name as the themes give them (`letter`, `a4`, `index-4x6`, …). */
export function isPaper(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 40;
}

/** A type size: `auto` (fitted) or points such as `10.5pt`. */
export function isSize(value: unknown): value is string {
  return value === 'auto' || (typeof value === 'string' && /^(?:[4-9]|[1-3][0-9])(?:\.5)?pt$/.test(value));
}

const FOLDER_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){0,3}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

/** The repository a source names. */
export function specRepo(spec: SourceSpec): string {
  return typeof spec === 'string' ? spec : spec.repo;
}

/** The id the app gives a source: the repository for a plain one, `owner/name/path` for a folder inside one. */
export function specId(spec: SourceSpec): string {
  return typeof spec === 'string' ? spec : spec.path ? `${spec.repo}/${spec.path}` : spec.repo;
}

/** A source from a file or storage, or null with the reason it was left out. */
function parseSourceSpec(raw: unknown): SourceSpec | null {
  if (typeof raw === 'string') return parseRepo(raw);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const repo = typeof r.repo === 'string' ? parseRepo(r.repo) : null;
  if (!repo) return null;
  const out: { repo: string; path?: string; ref?: string; label?: string } = { repo };
  if (r.path !== undefined) {
    if (typeof r.path !== 'string' || !FOLDER_PATH_RE.test(r.path) || r.path.split('/').some((p) => /^\.+$/.test(p))) return null;
    out.path = r.path;
  }
  if (r.ref !== undefined) {
    if (typeof r.ref !== 'string' || !REF_RE.test(r.ref) || r.ref.includes('..')) return null;
    out.ref = r.ref;
  }
  if (r.label !== undefined) {
    if (typeof r.label !== 'string' || r.label.length > 80 || /[\u0000-\u001f\u007f]/.test(r.label)) return null;
    out.label = r.label;
  }
  // `{ repo }` alone is the plain form.
  return Object.keys(out).length === 1 ? repo : out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseIdList(raw: unknown, name: string, ignored: string[]): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    ignored.push(name);
    return undefined;
  }
  const out = [...new Set(raw.filter(isSourceId))].slice(0, 100);
  if (out.length !== raw.length) ignored.push(`${name} (some entries)`);
  return out;
}

function parseCards(raw: unknown, ignored: string[]): CardSettings | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    ignored.push('cards');
    return undefined;
  }
  const out: CardSettings = {};
  for (const [key, value] of Object.entries(raw)) {
    const ok =
      key === 'theme'
        ? isThemeId(value)
        : key === 'paper'
          ? isPaper(value)
          : key === 'size'
            ? isSize(value)
            : key === 'parts'
              ? value === 'paired' || value === 'sections'
              : key === 'notes' || key === 'picture'
                ? typeof value === 'boolean'
                : key === 'palette'
                  ? value === 'app' || value === 'own'
                  : false;
    if (ok) (out as Record<string, unknown>)[key] = value;
    else ignored.push(`cards.${key}`);
  }
  return out;
}

function parseChart(raw: unknown, ignored: string[]): ChartSettings | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    ignored.push('chart');
    return undefined;
  }
  const out: ChartSettings = {};
  for (const [key, value] of Object.entries(raw)) {
    const ok =
      key === 'theme'
        ? isThemeId(value)
        : key === 'join-edges'
          ? value === 'separate' || value === 'bus'
          : key === 'shape'
            ? value === 'screen' || value === 'auto' || value === 'portrait' || value === 'landscape'
            : key === 'margin'
              ? value === '0.5in' || value === '0.75in' || value === '1in'
              : key === 'palette'
                ? value === 'app' || value === 'own'
                : key === 'fonts'
                  ? value === 'card' || value === 'own' || isThemeId(value)
                  : false;
    if (ok) (out as Record<string, unknown>)[key] = value;
    else ignored.push(`chart.${key}`);
  }
  return out;
}

function parseShopping(raw: unknown, ignored: string[]): ShoppingSettings | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    ignored.push('shopping');
    return undefined;
  }
  const out: ShoppingSettings = {};
  for (const [key, value] of Object.entries(raw)) {
    const ok = key === 'theme' ? isThemeId(value) : key === 'paper' ? isPaper(value) : key === 'size' ? isSize(value) : key === 'uses' ? typeof value === 'boolean' : false;
    if (ok) (out as Record<string, unknown>)[key] = value;
    else ignored.push(`shopping.${key}`);
  }
  return out;
}

/** What parsing found besides the settings: what was dropped, and the version the data claims. */
export interface Parsed {
  settings: Settings;
  /** Names of keys or values that were not taken (unknown, or not a value the app makes). */
  ignored: string[];
  /** The `etna-settings` number of the data. */
  version: number;
}

/**
 * Settings from parsed JSON. Refused (with the reason) when it is not an object or has no
 * `etna-settings` version; otherwise every known key that holds a good value is taken, and the
 * rest is listed in `ignored`. A newer version is read the same way, as far as it is understood.
 */
export function parseSettings(raw: unknown): Outcome<Parsed> {
  if (!isPlainObject(raw)) return { ok: false, error: 'it is not a settings object (expected { "etna-settings": 1, … })' };
  const version = raw['etna-settings'];
  if (version === undefined) return { ok: false, error: 'it has no "etna-settings" version number, so it is not an Etna settings file' };
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: `its "etna-settings" version is not a whole number from 1 up` };
  const ignored: string[] = [];
  const s: Settings = {};
  for (const key of Object.keys(raw)) {
    if (!['etna-settings', 'sources', 'hide', 'order', 'removed', 'appearance', 'cards', 'chart', 'shopping', 'screen-on', 'settings-repo', 'welcome'].includes(key)) ignored.push(key);
  }
  if (raw.sources !== undefined) {
    if (!Array.isArray(raw.sources)) ignored.push('sources');
    else {
      const seen = new Set<string>();
      const list: SourceSpec[] = [];
      let dropped = 0;
      for (const item of raw.sources) {
        const spec = parseSourceSpec(item);
        if (!spec) {
          dropped++;
          continue;
        }
        if (seen.has(specId(spec))) continue;
        if (list.length >= MAX_SOURCES) {
          ignored.push(`sources past the first ${MAX_SOURCES}`);
          break;
        }
        seen.add(specId(spec));
        list.push(spec);
      }
      if (dropped > 0) ignored.push(`${dropped} ${dropped === 1 ? 'source that is' : 'sources that are'} not a GitHub repository`);
      s.sources = list;
    }
  }
  const hide = parseIdList(raw.hide, 'hide', ignored);
  if (hide) s.hide = hide;
  const order = parseIdList(raw.order, 'order', ignored);
  if (order) s.order = order;
  const removed = parseIdList(raw.removed, 'removed', ignored);
  if (removed) s.removed = removed;
  if (raw.appearance !== undefined) s.appearance = parseAppearance(raw.appearance, ignored);
  const cards = parseCards(raw.cards, ignored);
  if (cards) s.cards = cards;
  const chart = parseChart(raw.chart, ignored);
  if (chart) s.chart = chart;
  const shopping = parseShopping(raw.shopping, ignored);
  if (shopping) s.shopping = shopping;
  if (raw['screen-on'] !== undefined) {
    if (typeof raw['screen-on'] === 'boolean') s['screen-on'] = raw['screen-on'];
    else ignored.push('screen-on');
  }
  if (raw['settings-repo'] !== undefined) {
    const repo = typeof raw['settings-repo'] === 'string' ? parseRepo(raw['settings-repo']) : null;
    if (repo) s['settings-repo'] = repo;
    else ignored.push('settings-repo');
  }
  if (raw.welcome !== undefined) {
    if (raw.welcome === 'short') s.welcome = 'short';
    else ignored.push('welcome');
  }
  return { ok: true, value: { settings: s, ignored, version } };
}

/** Settings from text (storage or a file): JSON first, then `parseSettings`. */
export function parseSettingsText(text: string): Outcome<Parsed> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `it is not JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  return parseSettings(raw);
}

/** Drop empty groups so the stored text says only what was chosen. */
export function compact(s: Settings): Settings {
  const out: Settings = {};
  if (s.sources && s.sources.length > 0) out.sources = s.sources;
  if (s.hide && s.hide.length > 0) out.hide = s.hide;
  if (s.order && s.order.length > 0) out.order = s.order;
  if (s.removed && s.removed.length > 0) out.removed = s.removed;
  for (const key of ['appearance', 'cards', 'chart', 'shopping'] as const) {
    const group = s[key];
    if (group && Object.keys(group).length > 0) (out as Record<string, unknown>)[key] = group;
  }
  if (s['screen-on'] !== undefined) out['screen-on'] = s['screen-on'];
  if (s['settings-repo'] !== undefined) out['settings-repo'] = s['settings-repo'];
  if (s.welcome !== undefined) out.welcome = s.welcome;
  return out;
}

/** The text to keep or save: the version first, then the keys in a fixed order. `pretty` for a file. */
export function serializeSettings(s: Settings, pretty = false): string {
  const c = compact(s);
  const ordered: Record<string, unknown> = { 'etna-settings': SETTINGS_VERSION };
  for (const key of ['sources', 'hide', 'order', 'removed', 'appearance', 'cards', 'chart', 'shopping', 'screen-on', 'settings-repo', 'welcome'] as const) if (c[key] !== undefined) ordered[key] = c[key];
  return pretty ? `${JSON.stringify(ordered, null, 2)}\n` : JSON.stringify(ordered);
}

// ------------------------------------------------------------------ storage

/** The part of localStorage the settings use. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Loaded {
  settings: Settings;
  /**
   * True when the stored settings were written by a newer Etna: they are read as far as they are
   * understood, and not written back, so going forward again loses nothing.
   */
  readOnly: boolean;
  /** Why the stored settings could not be read (they are then replaced by the next change), or null. */
  problem: string | null;
  /** False when the browser refuses storage: choices last until the page is reloaded. */
  available: boolean;
}

/** This browser's settings, from `etna.settings`. */
export function loadSettings(store: SettingsStore | null): Loaded {
  const none: Loaded = { settings: {}, readOnly: false, problem: null, available: false };
  if (!store) return none;
  let text: string | null;
  try {
    text = store.getItem(SETTINGS_KEY);
  } catch {
    return none;
  }
  if (text === null) return { ...none, available: true };
  const parsed = parseSettingsText(text);
  if (!parsed.ok) return { settings: {}, readOnly: false, problem: `The settings kept in this browser could not be read: ${parsed.error}.`, available: true };
  return { settings: parsed.value.settings, readOnly: parsed.value.version > SETTINGS_VERSION, problem: null, available: true };
}

/** Keep the settings; false when storage refused them. */
export function saveSettings(store: SettingsStore | null, s: Settings): boolean {
  if (!store) return false;
  try {
    store.setItem(SETTINGS_KEY, serializeSettings(s));
    return true;
  } catch {
    return false;
  }
}

/** The browser's storage, or null where it is refused (some private windows). */
export function browserStore(): SettingsStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- import

/**
 * A settings file the user picked, checked before anything changes. `notes` says, in words,
 * what was left out. Refused files say why.
 */
export function importSettings(text: string, bytes = text.length): Outcome<{ settings: Settings; notes: string[] }> {
  if (bytes > MAX_FILE_BYTES) return { ok: false, error: `it is larger than ${MAX_FILE_BYTES / 1024} KB, and a settings file is a few hundred bytes` };
  const parsed = parseSettingsText(text);
  if (!parsed.ok) return parsed;
  const notes: string[] = [];
  if (parsed.value.version > SETTINGS_VERSION) notes.push(`It was made by a newer Etna (settings version ${parsed.value.version}); what this version knows was read.`);
  if (parsed.value.ignored.length > 0) notes.push(`Left out: ${parsed.value.ignored.join(', ')}.`);
  return { ok: true, value: { settings: compact(parsed.value.settings), notes } };
}

/** A short account of what a settings object holds, for the message after loading a file. */
export function describeSettings(s: Settings): string {
  const parts: string[] = [];
  const n = s.sources?.length ?? 0;
  if (n > 0) parts.push(`${n} ${n === 1 ? 'repository' : 'repositories'}`);
  const a = s.appearance ?? {};
  if (Object.keys(a).length > 0) parts.push(`appearance (${a.palette ?? DEFAULT_APPEARANCE.palette} palette)`);
  const c = Object.keys(s.cards ?? {}).length + Object.keys(s.chart ?? {}).length + Object.keys(s.shopping ?? {}).length + (s['screen-on'] === undefined ? 0 : 1);
  if (c > 0) parts.push(`${c} card and list ${c === 1 ? 'choice' : 'choices'}`);
  if (s.welcome === 'short') parts.push('the welcome hidden');
  return parts.length > 0 ? parts.join(', ') : 'nothing but the defaults';
}

// ------------------------------------------------------- changing settings

/** The settings with one group's key set, or removed when `value` is undefined. */
export function setIn<G extends 'appearance' | 'cards' | 'chart' | 'shopping'>(s: Settings, group: G, key: keyof NonNullable<Settings[G]>, value: unknown): Settings {
  const next = { ...((s[group] ?? {}) as Record<string, unknown>) };
  if (value === undefined) delete next[key as string];
  else next[key as string] = value;
  return { ...s, [group]: next };
}
