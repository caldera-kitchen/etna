// How Etna itself looks: the palette, light or dark, and the corners. The mark (Contour) and
// the wordmark (24 px) are Etna's identity, not choices.
// The values and their names live here; app.css and palettes.css key on the attributes that
// `rootAttributes` puts on <html>. Pure and browser-safe, with no imports, so the small script
// that runs before the first paint (boot.ts) can carry it.

export const PALETTE_IDS = ['plain', 'slate', 'linen', 'pistachio', 'catppuccin', 'nord', 'solarized'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];
export const SCHEME_IDS = ['system', 'light', 'dark'] as const;
export type SchemeChoice = (typeof SCHEME_IDS)[number];
export const CORNER_IDS = ['square', 'soft', 'round'] as const;
export type Corners = (typeof CORNER_IDS)[number];

/** The appearance as stored: every key optional. */
export interface Appearance {
  palette?: PaletteId;
  scheme?: SchemeChoice;
  corners?: Corners;
}

/** Every key filled in. */
export type FullAppearance = Required<Appearance>;

/** Today's look: the Plain colors, following the device, Soft corners. */
export const DEFAULT_APPEARANCE: FullAppearance = { palette: 'plain', scheme: 'system', corners: 'soft' };

interface Swatch {
  ground: string;
  paper: string;
  ink: string;
  accent: string;
  rule: string;
}

/**
 * The palettes in the order Settings shows them (Plain, Slate, Linen, Pistachio, then the
 * standard schemes by name), with the few values a swatch and the favicon need, from palettes.css.
 */
export const PALETTES: { id: PaletteId; label: string; note: string; light: Swatch; dark: Swatch }[] = [
  { id: 'plain', label: 'Plain', note: 'Today’s colors', light: { ground: '#fbfaf7', paper: '#ffffff', ink: '#1d1c1a', accent: '#1f5f8b', rule: '#8f897d' }, dark: { ground: '#181817', paper: '#222220', ink: '#ecebe7', accent: '#7db7dd', rule: '#86827a' } },
  { id: 'slate', label: 'Slate', note: 'Cool blue-gray', light: { ground: '#f5f7f9', paper: '#ffffff', ink: '#1a2129', accent: '#2c5c9a', rule: '#7b8692' }, dark: { ground: '#12171c', paper: '#1a2128', ink: '#e6ebf0', accent: '#8cb8f0', rule: '#76828e' } },
  { id: 'linen', label: 'Linen', note: 'Cream with a teal accent', light: { ground: '#f6f1e7', paper: '#fcf9f2', ink: '#2a241c', accent: '#187d61', rule: '#8c806d' }, dark: { ground: '#1d1a15', paper: '#26221c', ink: '#efe7d8', accent: '#66c2a5', rule: '#8c816f' } },
  { id: 'pistachio', label: 'Pistachio', note: 'Green with a lavender accent', light: { ground: '#f2f6e8', paper: '#fbfdf6', ink: '#21261a', accent: '#6d68a6', rule: '#7f886a' }, dark: { ground: '#151912', paper: '#1d2219', ink: '#e9eedf', accent: '#8da0cb', rule: '#7f8a72' } },
  { id: 'catppuccin', label: 'Catppuccin', note: 'Latte and Mocha', light: { ground: '#e6e9ef', paper: '#eff1f5', ink: '#4c4f69', accent: '#8538ea', rule: '#808395' }, dark: { ground: '#181825', paper: '#1e1e2e', ink: '#cdd6f4', accent: '#cba6f7', rule: '#6c7086' } },
  { id: 'nord', label: 'Nord', note: 'Arctic blues', light: { ground: '#e5e9f0', paper: '#eceff4', ink: '#2e3440', accent: '#4a6b8e', rule: '#7d8492' }, dark: { ground: '#2e3440', paper: '#3b4252', ink: '#eceff4', accent: '#88c0d0', rule: '#888d9a' } },
  { id: 'solarized', label: 'Solarized', note: 'Cream and deep teal', light: { ground: '#eee8d5', paper: '#fdf6e3', ink: '#073642', accent: '#196ca2', rule: '#798686' }, dark: { ground: '#002b36', paper: '#073642', ink: '#97a5a5', accent: '#4e9fdc', rule: '#6a8086' } },
];

export const SCHEMES: { id: SchemeChoice; label: string }[] = [
  { id: 'system', label: 'Match this device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export const CORNERS: { id: Corners; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'soft', label: 'Soft' },
  { id: 'round', label: 'Round' },
];

/**
 * Etna's mark, Contour, on a 24-unit grid, drawn in `currentColor`. Trusted constant markup,
 * never user text.
 */
export const MARK_SVG =
  '<g fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 15.5C2.2 10.5 6 4.6 12.2 4.2c6.2-.4 10.2 5.4 8.8 10.8-1.2 4.6-6.4 6-10.6 5.4-4-.6-6.8-1.8-7.4-4.9Z"/><path d="M7 14.6c-.4-3.4 2-6.4 5.6-6.6 3.6-.2 5.6 2.6 4.8 5.6-.7 2.8-3.6 3.6-6 3.4-2.4-.2-4.1-.8-4.4-2.4Z"/></g><circle cx="12.4" cy="12.4" r="1.9"/>';

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);

/**
 * The appearance from what a file or storage holds (anything): known keys with known values only.
 * `ignored` collects the names of what was dropped (prefixed with `prefix`).
 */
export function parseAppearance(raw: unknown, ignored: string[] = [], prefix = 'appearance.'): Appearance {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    if (raw !== undefined) ignored.push(prefix.replace(/\.$/, ''));
    return {};
  }
  const r = raw as Record<string, unknown>;
  const out: Appearance = {};
  const take = <K extends keyof Appearance>(key: K, list: readonly string[]) => {
    if (!(key in r)) return;
    if (isOneOf(list, r[key])) (out as Record<string, unknown>)[key] = r[key];
    else ignored.push(prefix + key);
  };
  take('palette', PALETTE_IDS);
  take('scheme', SCHEME_IDS);
  take('corners', CORNER_IDS);
  for (const key of Object.keys(r)) if (!['palette', 'scheme', 'corners'].includes(key)) ignored.push(prefix + key);
  return out;
}

export function fullAppearance(a: Appearance | undefined): FullAppearance {
  return { ...DEFAULT_APPEARANCE, ...(a ?? {}) };
}

/** Light or dark as shown: the choice, or the device's when the choice is to match it. */
export function resolveScheme(scheme: SchemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return scheme === 'system' ? (prefersDark ? 'dark' : 'light') : scheme;
}

/** The attributes for <html>; palettes.css and app.css key on them. */
export function rootAttributes(a: Appearance | undefined, prefersDark: boolean): Record<string, string> {
  const f = fullAppearance(a);
  return {
    'data-palette': f.palette,
    'data-scheme': resolveScheme(f.scheme, prefersDark),
    'data-radius': f.corners,
  };
}

/**
 * The attributes that give the light scheme of the chosen palette, whatever the screen shows:
 * a chart PDF is ink on paper, drawn in these colors on a white page (main.tsx reads them from a
 * hidden probe element carrying them; palettes.css keys on the attributes, not on <html> alone).
 */
export function printAttributes(a: Appearance | undefined): Record<string, string> {
  return { 'data-palette': fullAppearance(a).palette, 'data-scheme': 'light' };
}

/** The favicon: the mark in the palette's accent, for light and for dark. */
export function faviconHref(a: Appearance | undefined): string {
  const f = fullAppearance(a);
  const palette = PALETTES.find((t) => t.id === f.palette) ?? PALETTES[0];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>svg{color:${palette.light.accent};fill:currentColor}` +
    `@media (prefers-color-scheme:dark){svg{color:${palette.dark.accent}}}</style>${MARK_SVG}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * A screen-only style for the card frame's document that rounds and shadows the page for the
 * chosen corners; null for Soft, which leaves the card exactly as the renderer draws it.
 */
export function framePageCss(corners: Corners, scheme: 'light' | 'dark'): string | null {
  if (corners === 'soft') return null;
  const shadow =
    corners === 'square'
      ? scheme === 'dark'
        ? '0 0 0 1px rgba(255,255,255,.12),4px 4px 0 rgba(0,0,0,.6)'
        : '0 0 0 1px rgba(29,28,26,.16),4px 4px 0 rgba(29,28,26,.10)'
      : scheme === 'dark'
        ? '0 2px 4px rgba(0,0,0,.4),0 10px 32px rgba(0,0,0,.5)'
        : '0 2px 6px rgba(29,28,26,.08),0 14px 40px rgba(29,28,26,.16)';
  const radius = corners === 'round' ? '14px' : '0';
  return `@media screen{.sheet,.card-flow{border-radius:${radius};box-shadow:${shadow}}}`;
}

/** Put the attributes on the root element and the favicon in the head. */
export function applyAppearance(doc: Document, a: Appearance | undefined, prefersDark: boolean): void {
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(rootAttributes(a, prefersDark))) root.setAttribute(name, value);
  const href = faviconHref(a);
  const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link && link.getAttribute('href') !== href) link.setAttribute('href', href);
}
