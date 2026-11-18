// Web fonts: the free fonts a theme declares (`webfonts:` in theme.yaml), and the two ways the
// renderer delivers them — a Google Fonts stylesheet link (`web`), or ready-made @font-face
// rules with data: URLs that the caller supplies (`embedded`). A theme never loads a font
// itself: its files may not contain <link>, @import or a remote url() (see contract.ts).
//
// Pure and browser-safe. Fetching and caching the font files is Node's job (fonts.ts).

/** One font family a theme uses, as served by Google Fonts. */
export interface WebFont {
  /** The family name, as it appears in the theme's font stacks: `Nunito Sans`. */
  family: string;
  /** The css2 API's `family=` value: `Nunito+Sans:ital,wght@0,400;1,400`. */
  google: string;
}

/** How the renderer delivers a theme's web fonts (`CardOptions.webfonts`). */
export type WebfontMode = 'none' | 'web' | 'embedded';

/** Where the Google Fonts css2 API lives. The page's Content-Security-Policy allows exactly this host. */
export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';
/** Where Google Fonts serves the font files. */
export const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

/** A family name: letters, digits and single spaces. */
const FAMILY_RE = /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/;
/**
 * A css2 `family=` value: the family name with `+` for spaces, then optionally `:` axis tags
 * (four letters, comma-separated) `@` and the tuples (digits, `.`, `..`, `,`, `;`, `-`).
 * Nothing else: no `&`, `=`, `/`, `%`, quotes or spaces, so the value cannot carry a URL, a
 * second query parameter or markup.
 */
const GOOGLE_RE = /^([A-Za-z0-9]+(?:\+[A-Za-z0-9]+)*)(?::([A-Za-z]{4}(?:,[A-Za-z]{4})*)@([0-9.,;-]+))?$/;
const MAX_FONTS = 8;
const MAX_SPEC = 200;

/** The family a css2 spec names, or null when the spec is not acceptable. */
export function specFamily(spec: string): string | null {
  if (spec.length > MAX_SPEC) return null;
  const m = GOOGLE_RE.exec(spec);
  if (!m) return null;
  if (m[3] !== undefined) {
    const axes = m[2].split(',').length;
    // Every tuple has one value per axis; a value is a number or a range a..b.
    const value = /^-?\d+(\.\d+)?(\.\.-?\d+(\.\d+)?)?$/;
    for (const tuple of m[3].split(';')) {
      const values = tuple.split(',');
      if (values.length !== axes || !values.every((v) => value.test(v))) return null;
    }
  }
  return m[1].replace(/\+/g, ' ');
}

/** The font styles a valid spec asks for: `normal`, `italic` or both. */
export function specStyles(spec: string): string[] {
  const m = GOOGLE_RE.exec(spec);
  if (!m || m[3] === undefined) return ['normal'];
  const at = m[2].split(',').indexOf('ital');
  if (at === -1) return ['normal'];
  const styles = new Set<string>(m[3].split(';').map((t) => (t.split(',')[at] === '1' ? 'italic' : 'normal')));
  return ['normal', 'italic'].filter((s) => styles.has(s));
}

/**
 * Problems with a `webfonts:` value; empty when it is acceptable. Each problem names the
 * entry (`webfonts[1].google …`). Used by parseTheme (which refuses the theme) and checkTheme.
 */
export function webfontProblems(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return ['webfonts must be a list of { family, google } entries'];
  const problems: string[] = [];
  if (value.length > MAX_FONTS) problems.push(`webfonts lists ${value.length} families; at most ${MAX_FONTS}`);
  const seen = new Set<string>();
  value.forEach((entry, i) => {
    const where = `webfonts[${i}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where} must be a map with family: and google:`);
      return;
    }
    const e = entry as Record<string, unknown>;
    for (const key of Object.keys(e)) if (key !== 'family' && key !== 'google') problems.push(`${where}: unknown key "${key}" (family, google)`);
    const family = e.family;
    const google = e.google;
    if (typeof family !== 'string' || !FAMILY_RE.test(family)) {
      problems.push(`${where}.family must be a font family name: letters, digits and spaces`);
      return;
    }
    if (typeof google !== 'string') {
      problems.push(`${where}.google must be the css2 family= value, such as ${family.replace(/ /g, '+')}:wght@400;700`);
      return;
    }
    const named = specFamily(google);
    if (named === null) {
      problems.push(
        `${where}.google "${google.slice(0, 60)}" is not a css2 family= value (Family+Name, optionally :axis,axis@values — such as ${family.replace(/ /g, '+')}:ital,wght@0,400;1,400)`,
      );
    } else if (named !== family) {
      problems.push(`${where}.google names the family "${named}", not "${family}"`);
    }
    if (seen.has(family)) problems.push(`${where}: ${family} is listed twice`);
    seen.add(family);
  });
  return problems;
}

/** A theme's `webfonts:` value as a list. Call webfontProblems first; this only reads. */
export function readWebfonts(value: unknown): WebFont[] {
  if (!Array.isArray(value)) return [];
  return value.map((e) => ({ family: String((e as WebFont).family), google: String((e as WebFont).google) }));
}

/**
 * The one Google Fonts stylesheet URL that loads all of the fonts: one `family=` per font, and
 * `display=swap` (text shows in the fallback font until the web font arrives). Null when there
 * are none. The specs are validated, so they go into the query as they are.
 */
export function googleFontsHref(fonts: readonly WebFont[]): string | null {
  const specs = [...new Set(fonts.map((f) => f.google).filter((spec) => specFamily(spec) !== null))];
  if (specs.length === 0) return null;
  return `${GOOGLE_FONTS_CSS}?${specs.map((s) => `family=${s}`).join('&')}&display=swap`;
}

// ------------------------------------------------------------ Google's CSS

/** One @font-face rule of a Google Fonts stylesheet. */
export interface FontFace {
  family: string;
  /** `normal` or `italic`. */
  style: string;
  /** `400`, or a range `100 700` for a variable font. */
  weight: string;
  /** `100%`, when Google gives one. */
  stretch: string | null;
  /** The unicode-range as Google gives it. */
  unicodeRange: string | null;
  /** The subset named in the comment before the rule: `latin`, `latin-ext`, `cyrillic`… */
  subset: string | null;
  /** The font file's URL. */
  url: string;
}

/**
 * The @font-face rules of a Google Fonts css2 response, each with the subset its comment
 * names (`/* latin *\/`). Rules without an https URL of the format asked for (WOFF2 unless
 * `ttf`, the TrueType files Google sends a client that is not a browser) are skipped.
 */
export function parseGoogleCss(css: string, format: 'woff2' | 'ttf' = 'woff2'): FontFace[] {
  const faces: FontFace[] = [];
  const re = /(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi;
  for (const m of css.matchAll(re)) {
    const body = m[2];
    const prop = (name: string) => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(body)?.[1].trim() ?? null;
    const url = (format === 'ttf' ? /url\(\s*['"]?(https:\/\/[^'")\s]+\.ttf)['"]?\s*\)/i : /url\(\s*['"]?(https:\/\/[^'")\s]+\.woff2)['"]?\s*\)/i).exec(prop('src') ?? '')?.[1];
    const family = prop('font-family')?.replace(/^['"]|['"]$/g, '');
    if (!url || !family) continue;
    faces.push({
      family,
      style: prop('font-style') ?? 'normal',
      weight: prop('font-weight') ?? '400',
      stretch: prop('font-stretch'),
      unicodeRange: prop('unicode-range'),
      subset: m[1] ?? null,
      url,
    });
  }
  return faces;
}

/** The subsets kept in the local cache: enough for English and the Latin-script languages. */
export const KEPT_SUBSETS: readonly string[] = ['latin', 'latin-ext'];

/**
 * @font-face rules for the `embedded` mode: one per face, its src a data: URL of the WOFF2
 * file (given as base64), `font-display: swap`, and the original unicode-range so the browser
 * picks the right subset per character.
 */
export function fontFaceRule(face: Omit<FontFace, 'url' | 'subset'>, base64: string): string {
  const safe = (v: string) => v.replace(/[^A-Za-z0-9 %+,.-]/g, '');
  return (
    '@font-face {\n' +
    `  font-family: "${face.family.replace(/[^A-Za-z0-9 ]/g, '')}";\n` +
    `  font-style: ${safe(face.style)};\n` +
    `  font-weight: ${safe(face.weight)};\n` +
    (face.stretch ? `  font-stretch: ${safe(face.stretch)};\n` : '') +
    '  font-display: swap;\n' +
    `  src: url(data:font/woff2;base64,${base64.replace(/[^A-Za-z0-9+/=]/g, '')}) format("woff2");\n` +
    (face.unicodeRange ? `  unicode-range: ${face.unicodeRange.replace(/[^A-Fa-f0-9U+?, -]/g, '')};\n` : '') +
    '}\n'
  );
}
