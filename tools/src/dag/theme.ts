// Flow-chart themes: reading one (with the defaults filling the gaps), parsing a theme folder,
// and checking it. Every value is typed in schema.ts.
//
// `defaultDagTheme` is the `flow` theme, built from the schema's defaults; it mirrors
// `themes/flow/theme.yaml` exactly (a test checks it), so the chart renders the same in a
// browser, where the YAML file is not read.

import { parse as parseYaml } from 'yaml';

import { menuNameWarning } from '../core/menu-name.ts';
import { MEASURED_FAMILIES } from './metrics.ts';
import { measurer, metricWeights, type Measure, type TextMeasure } from './measure.ts';
import { fontFamilies, GENERIC_FAMILIES, SCHEMA, SPECS, validateValue } from './schema.ts';
import type { ChartMargin, ChartPaper, ChartShape } from './sheet.ts';

export interface DagTheme {
  name: string;
  /** Colors, stroke widths, corner radii, fonts, spacing, shapes — see schema.ts. */
  values: Record<string, string | number>;
}

export interface DagOptions {
  theme?: DagTheme;
  /** `false` leaves the title out, whatever the theme's `title-position`. */
  title?: boolean;
  /**
   * The theme's free fonts (`chartFontFamilies`) as @font-face rules with data: URLs, which the
   * caller reads from the font cache (Node: `chartFontCss`) or its bundle: `embedded` puts
   * `css` in the SVG, so it shows the same font anywhere with no request; `none` leaves it out.
   * `mode` goes over the theme's `font-embedding`. Without `css`, nothing is embedded.
   */
  fonts?: { mode?: 'embedded' | 'none'; css?: string };
  /** What the chart is fitted to (sheet.ts): the screen, or a sheet. Left out: letter, the half-inch margin, the screen. */
  sheet?: { paper?: ChartPaper; margin?: ChartMargin; shape?: ChartShape };
}

/** The chart theme contract version this renderer reads (`etna-theme:` in theme.yaml). */
export const DAG_THEME_CONTRACT = 1;

export const defaultDagTheme: DagTheme = {
  name: 'Flow',
  // Flow says `palette: app` and `fonts: card`; the schema's defaults stay `own`, so a theme
  // that says nothing keeps its own colors and fonts (palette.ts and card-type.ts read the
  // values from the theme itself, never from here).
  values: { ...Object.fromEntries(SCHEMA.map((s) => [s.key, s.default])), palette: 'app', fonts: 'card' },
};

/** Typed access to theme values, with the defaults filling anything a theme leaves out. */
export interface ThemeReader {
  name: string;
  num(key: string): number;
  str(key: string): string;
  /**
   * The width measure for text in the main font (`title` for the title font) at `weight`: the
   * first family's own widths when it has metrics, else `text-measure` (measure.ts).
   */
  measure(weight: number, which?: 'text' | 'title'): Measure;
}

/**
 * A reader over a theme. Every value is checked against the schema first: a value that is
 * the wrong type, out of range, or could break out of the SVG throws, naming the value, so
 * nothing unchecked ever reaches the markup. Keys the schema does not know are ignored.
 */
export function readTheme(theme: DagTheme | undefined): ThemeReader {
  const values: Record<string, string | number> = { ...defaultDagTheme.values };
  const name = theme?.name ?? defaultDagTheme.name;
  for (const [key, raw] of Object.entries(theme?.values ?? {})) {
    const spec = SPECS.get(key);
    if (!spec) continue;
    const checked = validateValue(spec, raw);
    if ('error' in checked) throw new Error(`Flow-chart theme "${name}": "${key}" ${checked.error}`);
    values[key] = checked.value;
  }
  const get = (key: string): string | number => {
    const v = values[key];
    if (v === undefined) throw new Error(`Flow-chart theme: unknown value "${key}"`);
    return v;
  };
  const num = (key: string): number => {
    const v = get(key);
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`Flow-chart theme: "${key}" must be a number, got "${v}"`);
    return n;
  };
  const str = (key: string): string => String(get(key));
  return {
    name,
    num,
    str,
    measure(weight, which = 'text') {
      const title = which === 'title';
      const family = fontFamilies(str(title ? 'title-font-family' : 'font-family'))[0];
      return measurer(str(title ? 'title-text-measure' : 'text-measure') as TextMeasure, weight, num('char-width'), family);
    },
  };
}

// ------------------------------------------------------------------ theme folders

export interface DagThemeProblem {
  level: 'error' | 'warning';
  /** The value concerned, when there is one. */
  key?: string;
  message: string;
}

const MANIFEST_KEYS = new Set(['etna-theme', 'kind', 'name', 'description', 'values']);
const NAME = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;

/**
 * A chart theme from its folder's files (file name → text; only `theme.yaml` is read).
 *
 * Never throws. The theme returned is always safe to render: a value that is refused is left
 * out (the default is used instead) and reported. Errors mean the theme will not look as its
 * author meant — a caller showing third-party themes should refuse a theme with errors, as the
 * card side does; warnings (an unknown key, a missing version) are worth fixing but harmless.
 */
export function parseDagTheme(files: Record<string, string>): { theme: DagTheme; problems: DagThemeProblem[] } {
  const problems: DagThemeProblem[] = [];
  const error = (message: string, key?: string) => problems.push({ level: 'error', key, message });
  const warning = (message: string, key?: string) => problems.push({ level: 'warning', key, message });
  const theme: DagTheme = { name: 'custom', values: {} };

  const text = files['theme.yaml'];
  if (text === undefined) {
    error('theme.yaml is missing');
    return { theme, problems };
  }
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (e) {
    error(`theme.yaml is not valid YAML: ${(e as Error).message.split('\n')[0]}`);
    return { theme, problems };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    error('theme.yaml must be a map of keys (etna-theme, kind, name, description, values)');
    return { theme, problems };
  }
  const m = data as Record<string, unknown>;

  for (const key of Object.keys(m)) if (!MANIFEST_KEYS.has(key)) warning(`theme.yaml: unknown key "${key}" is ignored`);

  const version = m['etna-theme'];
  if (version === undefined) warning(`theme.yaml: no \`etna-theme:\` version; assuming ${DAG_THEME_CONTRACT}`);
  else if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) error('theme.yaml: `etna-theme` must be a whole number');
  else if (version > DAG_THEME_CONTRACT) error(`theme.yaml: written for chart theme contract ${version}; this renderer knows ${DAG_THEME_CONTRACT}`);

  if (m.kind === undefined) warning('theme.yaml: no `kind:`; a chart theme says `kind: chart`');
  else if (m.kind !== 'chart') error(`theme.yaml: kind is "${String(m.kind)}", not "chart": this is not a flow-chart theme`);

  if (typeof m.name === 'string' && NAME.test(m.name)) {
    theme.name = m.name;
    const long = menuNameWarning(m.name);
    if (long) warning(`theme.yaml: ${long}`);
  } else if (m.name === undefined) error('theme.yaml: `name` is missing');
  else error('theme.yaml: `name` must be up to 40 letters, digits, spaces and hyphens');

  if (m.description !== undefined && (typeof m.description !== 'string' || m.description.length > 200)) {
    warning('theme.yaml: `description` should be one line of text (up to 200 characters)');
  }

  const raw = m.values;
  if (raw === undefined || raw === null) {
    warning('theme.yaml: no `values`: the theme is the default, flow');
  } else if (typeof raw !== 'object' || Array.isArray(raw)) {
    error('theme.yaml: `values` must be a map of value name → value');
  } else {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const spec = SPECS.get(key);
      if (!spec) {
        const near = nearest(key);
        warning(`unknown value "${key}" is ignored${near ? ` (did you mean "${near}"?)` : ''}`, key);
        continue;
      }
      const checked = validateValue(spec, value);
      if ('error' in checked) error(`"${key}" ${checked.error}`, key);
      else theme.values[key] = checked.value;
    }
  }

  // Fonts the width tables were not measured for. A stack led by a family with metrics is
  // measured by them; the rest of it is only a fallback.
  const all = { ...defaultDagTheme.values, ...theme.values };
  for (const [fontKey, measureKey] of [
    ['font-family', 'text-measure'],
    ['title-font-family', 'title-text-measure'],
  ] as const) {
    const families = fontFamilies(String(all[fontKey]));
    const last = families[families.length - 1];
    if (!GENERIC_FAMILIES.has(last)) warning(`"${fontKey}" should end with a generic family (sans-serif, serif, monospace)`, fontKey);
    const kind = String(all[measureKey]);
    if (metricWeights(families[0]).length > 0) continue;
    if (kind === 'sans' || kind === 'serif') {
      const known = MEASURED_FAMILIES[kind];
      const other = families.filter((f) => !GENERIC_FAMILIES.has(f) && !known.includes(f));
      if (other.length > 0) {
        warning(
          `"${fontKey}" names ${other.map((f) => `"${f}"`).join(', ')}, which the ${kind} width table was not measured for: text may run out of its box (measured: ${known.join(', ')})`,
          fontKey,
        );
      }
    } else if (!families.includes('monospace') && !families.includes('ui-monospace')) {
      warning(`"${measureKey}" is \`mono\` but "${fontKey}" is not a monospace stack: use \`sans\` or \`serif\``, measureKey);
    }
  }
  return { theme, problems };
}

/** `etna dag --check-theme`, and what `etna theme check` can use for a chart theme. */
export function checkDagTheme(files: Record<string, string>): { errors: string[]; warnings: string[]; theme: DagTheme | null } {
  const { theme, problems } = parseDagTheme(files);
  const errors = problems.filter((p) => p.level === 'error').map((p) => p.message);
  const warnings = problems.filter((p) => p.level === 'warning').map((p) => p.message);
  return { errors, warnings, theme: errors.length > 0 ? null : theme };
}

function nearest(key: string): string | null {
  let best: string | null = null;
  let bestDistance = 4;
  for (const s of SCHEMA) {
    const d = distance(key, s.key);
    if (d < bestDistance) {
      bestDistance = d;
      best = s.key;
    }
  }
  return best;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
