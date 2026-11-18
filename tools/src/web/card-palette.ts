// A card on screen in the app's colors (Settings > Cards and printing > Card > Colors).
//
// The card document in the frame gets one more screen-only style, which sets the card's four
// color roles (core-css.ts CARD_COLOR_ROLES) from the app's roles of the same name. Printing never sees it: it is
// inside `@media screen`, and the Print tab is the card document as the renderer wrote it.
// Pure: the values come in as text, the CSS goes out as text.

/** Whether a card on screen takes the app's colors (the default) or keeps the style's own. */
export type CardPaletteChoice = 'app' | 'own';

/** The app's colors a card on screen is drawn in, as the page has them (palettes.css). */
export interface CardColors {
  paper: string;
  ink: string;
  inkSoft: string;
  desk: string;
  /** The app's highlight, behind a search hit in the card. */
  mark: string;
}

/** The app's variables, by the key they are read into. */
const VARIABLES: Record<keyof CardColors, string> = {
  paper: '--paper',
  ink: '--ink',
  inkSoft: '--ink-soft',
  desk: '--desk',
  mark: '--mark',
};

/**
 * A color as CSS writes it: a hex color, a color function (`rgb(…)`, `oklch(…)`, …) or a
 * color keyword. Nothing that could end the declaration or the rule it goes into.
 */
function isColor(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z-]+\([0-9a-z.,%\s/+-]*\)$/i.test(value) || /^[a-z]+$/i.test(value);
}

/**
 * The app's colors, read from a computed style (`getComputedStyle(document.documentElement)`),
 * or null when one of them is missing or is not a color.
 */
export function readCardColors(style: { getPropertyValue(name: string): string }): CardColors | null {
  const out: Partial<CardColors> = {};
  for (const [key, variable] of Object.entries(VARIABLES) as [keyof CardColors, string][]) {
    const value = style.getPropertyValue(variable).trim();
    if (!isColor(value)) return null;
    out[key] = value;
  }
  return out as CardColors;
}

/**
 * The screen-only style that puts a card in the frame on the app's desk and, with `app`, in the
 * app's colors: each card role from the app role of the same name, the paper from `paper`, the
 * ink from `ink`, the soft ink from `ink-soft`. A card draws its lines in ink, so they take the
 * app's `ink` too. `html:root` outranks the `:root` of the renderer and of a theme that sets a
 * role itself, whichever comes last. The desk is the app's in either case: it is not part of the
 * card but the surface the frame shows it on.
 *
 * `--etna-hit` is the color behind a search hit (main.tsx highlightDocument), the app's `mark`:
 * the screen's with `app`; with `own` the card is a white sheet whatever the scheme, so it takes
 * `light`, the same palette's light colors, and is left unset without them.
 */
export function cardPaletteCss(colors: CardColors, choice: CardPaletteChoice, light?: CardColors | null): string {
  const roles: [string, string][] = [['--card-desk', colors.desk]];
  if (choice === 'app') {
    roles.push(
      ['--card-paper', colors.paper],
      ['--card-ink', colors.ink],
      ['--card-ink-soft', colors.inkSoft],
    );
  }
  const hit = choice === 'app' ? colors.mark : light?.mark;
  if (hit) roles.push(['--etna-hit', hit]);
  return `@media screen{html:root{${roles.map(([name, value]) => `${name}:${value}`).join(';')}}}`;
}
