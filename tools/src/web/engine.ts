// Everything the GUI does with a recipe runs here, in the browser, on the same code the
// command line uses: parse, lint, format, card, chart.

import { parse as parseYaml } from 'yaml';
// A namespace import, so the font data (added to the bundle separately) may be absent.
import * as etnaData from 'virtual:etna-data';

import { cardType, checkTheme, DEFAULT_THEME, pageSetup, parseTheme, renderCard, renderListCard, themePapers, type CardOptions, type Theme } from '../card/index.ts';
import { createUnitRegistry, cutName, isMenuNameWarning, isValidSlug, MENU_NAME_LIMIT, parseRecipe, type Recipe } from '../core/index.ts';
import type { ChartMargin, ChartPaper, ChartShape } from '../dag/sheet.ts';
import { appColors, cardTypeValues, chartCanUse, chartHasCardFonts, checkDagTheme, defaultDagTheme, renderDag, themeFonts, themePalette, type AppPalette, type CardType, type DagTheme } from '../dag/index.ts';
import { mergeTables, parseDensities, type DensityTable } from '../density/index.ts';
import { formatRecipe, type FormatResult } from '../fmt/index.ts';
import { lintRecipe, type Finding } from '../lint/index.ts';
import { consolidate, type ListSource, type ShoppingList } from '../list/index.ts';
import { readAbout, type AboutData } from './about.ts';
import type { RepoSource } from './sources.ts';
import { readOrder } from './listorder.ts';
import { readSiteWelcome, type SiteWelcome } from './welcome.ts';

const units = createUnitRegistry(parseYaml(etnaData.unitsYaml));

/** A result that may have failed: the GUI shows the message instead of crashing a view. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

function attempt<T>(fn: () => T): Outcome<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface Analysis {
  source: string;
  recipe: Outcome<Recipe>;
  findings: Outcome<Finding[]>;
}

export function analyze(source: string): Analysis {
  const recipe = attempt(() => parseRecipe(source, { units }));
  const findings: Outcome<Finding[]> = recipe.ok ? attempt(() => lintRecipe(recipe.value)) : { ok: false, error: recipe.error };
  return { source, recipe, findings };
}

// ------------------------------------------------------------- theme registry
//
// Trust model. Built-in themes come from the bundle and are trusted like the app's own code.
// A source theme is someone else's text: it is accepted only when `checkTheme` finds no errors
// (no scripts, frames, links, event handlers or remote URLs), and is otherwise listed as
// unavailable and never rendered. Its text — its name and the checker's messages included —
// reaches the GUI only as Preact text nodes, never as HTML; nothing is evaluated. A card, from
// any theme, is shown only inside the sandboxed iframe as a document whose Content-Security-Policy
// the renderer writes: it blocks every load (but Google Fonts, for a built-in theme in a bundle
// built with web fonts), and every script but the renderer's
// own paging script, admitted by its hash (see the sandbox in main.tsx).

export type Webfonts = { mode: 'none' | 'web' | 'embedded'; css?: string };

export interface ThemeEntry {
  /** `builtin:<name>`, or `<sourceId>:<name>` for a theme from a source. */
  id: string;
  /** The theme's folder name. */
  name: string;
  /** What the picker shows: the theme's display name, or its folder name when it was not read. */
  label: string;
  /** The source the theme comes from; null for a built-in theme. */
  source: { id: string; label: string } | null;
  /** The parsed theme; null when it is unavailable. */
  theme: Theme | null;
  /** The checker's errors (or why the theme could not be fetched). Non-empty means unavailable. */
  errors: string[];
  warnings: string[];
  webfonts: Webfonts;
  /**
   * The layout the theme's manifest asks for (`options.layout`), read even when the theme is
   * unavailable, so an unusable list theme is still kept out of the Card tab. Absent: not known.
   */
  layout?: string | null;
}

export const isAvailable = (entry: ThemeEntry): boolean => entry.theme !== null && entry.errors.length === 0;

const MAX_LABEL = 60;
const shortLabel = (text: string) => (text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text);

/** A style as a toolbar menu entry: the text it shows, and its full name for the tooltip. */
export interface MenuName {
  text: string;
  title: string;
}

/** A style's full name: a source's with the source in parentheses, as Settings shows it. */
export const fullStyleName = (e: { label: string; source: { label: string } | null }): string => (e.source ? `${e.label} (${e.source.label})` : e.label);

/**
 * The styles of one toolbar menu (card Style, chart Style and Font, shopping-list Style), as the
 * menu shows them: each name cut to `limit` characters (MENU_NAME_LIMIT), with no "(Source)".
 * Where two entries would show the same text, a source's style takes as much of its source as
 * fits, in parentheses ("Mise (Kitchen)"; "Long We… (Kitc…)" when both are long), so the two can be
 * told apart. The title is always the full name. Settings shows names whole (fullStyleName).
 */
export function toolbarNames(entries: { id: string; label: string; source: { label: string } | null }[], limit = MENU_NAME_LIMIT): Map<string, MenuName> {
  const short = entries.map((e) => cutName(e.label, limit));
  const seen = new Map<string, number>();
  for (const text of short) seen.set(text, (seen.get(text) ?? 0) + 1);
  const names = new Map<string, MenuName>();
  entries.forEach((e, i) => {
    let text = short[i];
    if (e.source && (seen.get(text) ?? 0) > 1) text = withSource(e.label, e.source.label, limit);
    names.set(e.id, { text, title: fullStyleName(e) });
  });
  return names;
}

/** "Name (Source)" in at most `limit` characters: whole when it fits, else the name keeps at least half. */
function withSource(name: string, source: string, limit: number): string {
  const whole = `${name} (${source})`;
  if (whole.length <= limit) return whole;
  const room = limit - 3; // the space and the parentheses
  const nameRoom = Math.min(name.length, Math.max(room - source.length, Math.ceil(room / 2)));
  return `${cutName(name, nameRoom)} (${cutName(source, room - nameRoom)})`;
}

/** How a built-in theme's fonts are delivered, from the bundle's font data. */
export function builtinWebfonts(name: string, fontMode: unknown, fontCss: unknown): Webfonts {
  const css = fontCss !== null && typeof fontCss === 'object' ? (fontCss as Record<string, unknown>)[name] : undefined;
  if (fontMode === 'embedded' && typeof css === 'string') return { mode: 'embedded', css };
  if (fontMode === 'web') return { mode: 'web' };
  return { mode: 'none' };
}

/** The bundled themes, as registry entries, sorted by name. */
export function builtinEntries(themes: Record<string, Record<string, string>>, fontMode?: unknown, fontCss?: unknown): ThemeEntry[] {
  return Object.keys(themes)
    .sort()
    .map((name) => {
      const parsed = attempt(() => parseTheme(themes[name]));
      return {
        id: `builtin:${name}`,
        name,
        label: parsed.ok ? parsed.value.name : name,
        source: null,
        theme: parsed.ok ? parsed.value : null,
        errors: parsed.ok ? [] : [parsed.error],
        warnings: [],
        webfonts: builtinWebfonts(name, fontMode, fontCss),
      };
    });
}

/** A source theme's files, checked: available when the checker finds no errors. */
export function sourceThemeEntry(source: { id: string; label: string }, name: string, files: Record<string, string>): ThemeEntry {
  const report = attempt(() => checkTheme(files, { units }));
  const errors = report.ok ? report.value.errors : [report.error];
  const theme = report.ok && errors.length === 0 ? report.value.theme : null;
  return {
    id: `${source.id}:${name}`,
    name,
    label: theme ? shortLabel(theme.name) : name,
    source: { id: source.id, label: source.label },
    theme,
    errors: theme ? [] : errors.length > 0 ? errors : ['the theme could not be read'],
    // Not the long-name warning: the menu shows the cut itself, and the notes would only add a button to the toolbar.
    warnings: report.ok ? report.value.warnings.filter((w) => !isMenuNameWarning(w)) : [],
    // Someone else's theme does not make the reader's browser contact Google: its cards use the
    // installed fonts, and their page policy then allows no font host at all.
    webfonts: { mode: 'none' },
    layout: theme ? theme.layout : manifestLayout(files),
  };
}

/**
 * Every theme a source carries, fetched and checked, sorted into card themes and chart themes
 * (`kind: chart`). Never rejects: a failure is an unavailable entry (a theme that could not be
 * fetched is listed with the card themes, its kind being unknown).
 */
export async function loadSourceThemeSets(
  source: Pick<RepoSource, 'id' | 'label' | 'themes' | 'themeFiles'>,
): Promise<{ cards: ThemeEntry[]; charts: ChartThemeEntry[] }> {
  let names: string[];
  try {
    names = (await source.themes()).filter(isValidSlug);
  } catch {
    return { cards: [], charts: [] };
  }
  // In the order the source lists them.
  const loaded = await Promise.all(
    names.map(async (name): Promise<{ card: ThemeEntry } | { chart: ChartThemeEntry }> => {
      try {
        const files = await source.themeFiles(name);
        return isChartTheme(files) ? { chart: chartThemeEntry(source, name, files) } : { card: sourceThemeEntry(source, name, files) };
      } catch (e) {
        const entry = sourceThemeEntry(source, name, {});
        return { card: { ...entry, errors: [`could not be fetched: ${e instanceof Error ? e.message : String(e)}`], warnings: [] } };
      }
    }),
  );
  return {
    cards: loaded.flatMap((x) => ('card' in x ? [x.card] : [])),
    charts: loaded.flatMap((x) => ('chart' in x ? [x.chart] : [])),
  };
}

// ------------------------------------------------------------- chart themes
//
// A chart theme is a table of values (colors, shapes, spacing). Every value is validated by
// `checkDagTheme` and escaped again when the chart is drawn, and the chart is shown as an
// image, so a source's chart theme can change how the chart looks and nothing else.

export interface ChartThemeEntry {
  /** `builtin:<name>`, or `<sourceId>:<name>` for a theme from a source. */
  id: string;
  name: string;
  label: string;
  source: { id: string; label: string } | null;
  /** The checked theme; null when it is unavailable. */
  theme: DagTheme | null;
  errors: string[];
  warnings: string[];
}

export const DEFAULT_CHART_THEME = 'flow';

/** What a theme's theme.yaml gives as `options.layout`, as text; null when it gives none or cannot be read. */
function manifestLayout(files: Record<string, string>): string | null {
  const manifest = attempt(() => parseYaml(files['theme.yaml'] ?? '') as unknown);
  if (!manifest.ok || manifest.value === null || typeof manifest.value !== 'object') return null;
  const options = (manifest.value as Record<string, unknown>).options;
  if (options === null || typeof options !== 'object') return null;
  const layout = (options as Record<string, unknown>).layout;
  return typeof layout === 'string' ? layout : null;
}

/** True when the files' theme.yaml says `kind: chart`. */
export function isChartTheme(files: Record<string, string>): boolean {
  const manifest = attempt(() => parseYaml(files['theme.yaml'] ?? '') as unknown);
  return manifest.ok && manifest.value !== null && typeof manifest.value === 'object' && (manifest.value as Record<string, unknown>).kind === 'chart';
}

/** A chart theme's files, checked: available when the checker finds no errors. */
export function chartThemeEntry(source: { id: string; label: string } | null, name: string, files: Record<string, string>): ChartThemeEntry {
  const report = attempt(() => checkDagTheme(files));
  const errors = report.ok ? report.value.errors : [report.error];
  const theme = report.ok && errors.length === 0 ? report.value.theme : null;
  return {
    id: `${source ? source.id : 'builtin'}:${name}`,
    name,
    // Chart themes are named in lower case (`flow`); the picker shows them like the card themes (`Flow`).
    label: theme ? shortLabel(theme.name) : name,
    source: source ? { id: source.id, label: source.label } : null,
    theme,
    errors: theme ? [] : errors.length > 0 ? errors : ['the theme could not be read'],
    warnings: report.ok ? report.value.warnings.filter((w) => !isMenuNameWarning(w)) : [],
  };
}

/** The bundled chart themes, as entries, sorted by name. */
export function builtinChartEntries(themes: Record<string, Record<string, string>>): ChartThemeEntry[] {
  return Object.keys(themes)
    .sort()
    .map((name) => chartThemeEntry(null, name, themes[name]));
}

/** The chart theme to draw with: the remembered one when usable, else the default, else the first usable. */
export function pickChartTheme(entries: ChartThemeEntry[], remembered: string | null | undefined): ChartThemeEntry | null {
  const usable = entries.filter((e) => e.theme !== null);
  return (
    (remembered ? usable.find((e) => e.id === remembered) : undefined) ??
    usable.find((e) => e.id === `builtin:${DEFAULT_CHART_THEME}`) ??
    usable[0] ??
    null
  );
}

export const builtinChartThemes: ChartThemeEntry[] = builtinChartEntries(
  ((etnaData as Record<string, unknown>).chartThemes as Record<string, Record<string, string>> | undefined) ?? {},
);

/** False in a static build (`etna build-web`): there is no `etna serve` to ask for this computer's folders. */
export const localServer: boolean = (etnaData as Record<string, unknown>).localServer !== false;

/**
 * The recipes this site carries as its default source (`etna build-web --default-source`): their
 * id and label, or null. A bundle without one has no such entry at all (build.ts).
 */
export const defaultSource: { id: string; label: string; welcome: SiteWelcome | null; order: string[] } | null = readDefaultSource('defaultSource' in etnaData ? (etnaData as Record<string, unknown>).defaultSource : null);

function readDefaultSource(raw: unknown): { id: string; label: string; welcome: SiteWelcome | null; order: string[] } | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.label === 'string' ? { id: r.id, label: r.label, welcome: readSiteWelcome(r.welcome), order: readOrder(r.order) } : null;
}

/** What Settings › About says of this build (about.ts); empty where the bundle carries none. */
export const aboutBuild: AboutData = readAbout((etnaData as Record<string, unknown>).about);

/** How this bundle delivers the built-in card styles' fonts (build.ts `WebFontMode`). */
export const fontMode: string = String((etnaData as Record<string, unknown>).fontMode ?? 'none');

export const builtinThemes: ThemeEntry[] = builtinEntries(
  etnaData.themes,
  (etnaData as Record<string, unknown>).fontMode,
  (etnaData as Record<string, unknown>).fontCss,
);

/** The id a card opens in when nothing (usable) was chosen: the toolchain's default, else the first available. */
export function defaultThemeId(entries: ThemeEntry[]): string | null {
  const preferred = entries.find((e) => e.id === `builtin:${DEFAULT_THEME}` && isAvailable(e));
  return (preferred ?? entries.find(isAvailable))?.id ?? null;
}

/** The theme to show: the remembered choice when it still exists and is usable, else the default. */
export function pickTheme(entries: ThemeEntry[], remembered: string | null | undefined): ThemeEntry | null {
  const chosen = remembered ? entries.find((e) => e.id === remembered && isAvailable(e)) : undefined;
  if (chosen) return chosen;
  const id = defaultThemeId(entries);
  return entries.find((e) => e.id === id) ?? null;
}

/** How to print a card: the paper (null: the theme's own), and the text size (`auto`: fitted). */
export interface PrintChoice {
  paper: string | null;
  size: 'auto' | string;
  /** How a traditional recipe's parts are arranged; absent or null: as the theme does. */
  parts?: 'sections' | 'paired' | null;
  /** True prints the recipe's notes on the card; absent or false leaves them off. */
  notes?: boolean;
}

/**
 * True when the card can be shown both ways: the theme pairs each part's ingredients with its
 * steps (so it styles both arrangements), and the recipe is a traditional one with named
 * parts in both sections for that to make a difference.
 */
export function offersPartsChoice(entry: ThemeEntry, recipe: Recipe): boolean {
  if (entry.theme?.parts !== 'paired') return false;
  const t = recipe.traditional;
  if (!t) return false;
  return (t.ingredients?.items ?? []).some((g) => g.label !== null) && (t.directions?.parts ?? []).some((p) => p.label !== null);
}

/** The papers a theme supports, its default first among them, and the sizes the size control offers on a paper. */
export function printChoices(entry: ThemeEntry, paper: string | null): { papers: string[]; paper: string; base: number | null; sizes: number[] } {
  if (!entry.theme) return { papers: [], paper: '', base: null, sizes: [] };
  const { papers, default: fallback } = themePapers(entry.theme);
  const chosen = paper !== null && papers.includes(paper) ? paper : fallback;
  const setup = pageSetup(entry.theme, chosen);
  const sizes: number[] = [];
  if (setup.fit) for (let s = Math.ceil(setup.fit.min * 2) / 2; s <= setup.fit.max + 1e-9; s += 0.5) sizes.push(s);
  return { papers, paper: chosen, base: setup.fit?.base ?? null, sizes };
}

/**
 * A card for a registry entry. An unavailable theme is refused, never rendered. A list theme
 * (Shopping) prints the recipe's shopping list totaled as the shopping list view totals it:
 * through `densities` (absent: the reference table; `densityTable(own)` for a recipe from a
 * collection with its own densities.md), a converted total marked `≈` with its parts.
 */
export function card(
  recipe: Recipe,
  entry: ThemeEntry,
  print: PrintChoice = { paper: null, size: 'auto' },
  densities?: DensityTable | null,
): Outcome<string> {
  if (!isAvailable(entry)) return { ok: false, error: `The style "${entry.name}" is unavailable: ${entry.errors.join('; ')}` };
  const paper = print.paper !== null && themePapers(entry.theme!).papers.includes(print.paper) ? print.paper : undefined;
  const size = print.size === 'auto' ? undefined : print.size;
  const parts = print.parts === 'sections' || print.parts === 'paired' ? print.parts : undefined;
  // `notes` is CardOptions.notes (true prints the notes). Typed loosely until that option lands in
  // card/render.ts; renderCard ignores a key it does not know.
  const options: CardOptions & { notes?: boolean } = { webfonts: entry.webfonts, paper, size, fit: size === undefined ? 'auto' : 'off', parts, notes: print.notes === true };
  // Only a list theme totals amounts; the table is looked up for it alone.
  if (entry.theme!.layout === 'list') options.shopping = { densities: densities === undefined ? referenceDensities() : densities, units };
  return attempt(() => renderCard(recipe, entry.theme!, options));
}

/** How edges joining one node come in: each in its own lane (the default), or down one shared lane. */
export type ChartJoinEdges = 'separate' | 'bus';

/** The chart theme's own `join-edges` (`separate` unless it pins `bus`). */
export function themeJoinEdges(entry?: ChartThemeEntry | null): ChartJoinEdges {
  return entry?.theme?.values['join-edges'] === 'bus' ? 'bus' : 'separate';
}

/** What a chart is fitted to (sheet.ts): the screen, or a sheet with its paper, page margin and way up; a PDF of a screen chart prints on `auto`. */
export type ChartSheetChoice = { paper?: ChartPaper; margin?: ChartMargin; shape?: ChartShape };

/** What a chart is rendered with: the options `renderDag` and `renderDagPdf` take, less the fonts. */
export type ChartRender = { theme?: DagTheme; sheet?: ChartSheetChoice };

/**
 * The flow chart, drawn with a chart theme entry (the default theme when none is given). An
 * unavailable theme is refused. `joinEdges`,
 * when given, overrides the theme's `join-edges`. `sheet` is the sheet the chart
 * is laid out for, so the chart on screen is the one that prints. `fontCss`: the theme's free fonts as @font-face rules
 * (chart-fonts.ts loads them on first use), embedded unless the theme's `font-embedding` is
 * `none`; without it the chart draws with the stack's fallbacks, at the same layout.
 */
export function chart(
  recipe: Recipe,
  entry?: ChartThemeEntry | null,
  options: { joinEdges?: ChartJoinEdges; sheet?: ChartSheetChoice; fontCss?: string; appPalette?: AppPalette | null; cardType?: CardType | null } = {},
): Outcome<string> {
  const render = chartRenderOptions(entry, options);
  if (!render.ok) return render;
  return attempt(() => renderDag(recipe, { ...render.value, fonts: { css: options.fontCss ?? '' } }));
}

/**
 * What `chart` renders with: the theme entry's theme, with `joinEdges` over its own, the
 * the sheet, when given (and with `cardType`, the card style's fonts). With `appPalette` (the app's colors, palette.ts; the GUI passes it when Colors is
 * "match the app"), a theme that says `palette: app` is drawn in colors made from it; a theme
 * that says `own` ignores it. Saving the SVG keeps these, the colors on screen; the PDF takes
 * `chartPdfRenderOptions`, which prints in the light scheme on a white page.
 */
export function chartRenderOptions(
  entry?: ChartThemeEntry | null,
  options: { joinEdges?: ChartJoinEdges; sheet?: ChartSheetChoice; appPalette?: AppPalette | null; cardType?: CardType | null } = {},
): Outcome<ChartRender> {
  if (entry && entry.theme === null) return { ok: false, error: `The chart style "${entry.name}" is unavailable: ${entry.errors.join('; ')}` };
  const joinEdges = options.joinEdges === 'bus' || options.joinEdges === 'separate' ? options.joinEdges : undefined;
  let theme: DagTheme | null = entry?.theme ?? null;
  if (joinEdges) theme = { name: theme?.name ?? defaultDagTheme.name, values: { ...(theme?.values ?? {}), 'join-edges': joinEdges } };
  // No entry draws the default theme, flow, which says `palette: app`.
  if (options.appPalette && themePalette(entry?.theme ?? defaultDagTheme) === 'app') {
    theme = { name: theme?.name ?? defaultDagTheme.name, values: { ...(theme?.values ?? {}), ...appColors(options.appPalette) } };
  }
  // With `cardType` (the card style the Font menu names: the one in use, or one pinned; see
  // chartFonts), a theme that says `fonts: card` is set in the card's fonts (card-type.ts);
  // `own` ignores it.
  if (options.cardType && chartCanUse(options.cardType) && themeFonts(entry?.theme ?? defaultDagTheme) === 'card') {
    theme = { name: theme?.name ?? defaultDagTheme.name, values: { ...(theme?.values ?? {}), ...cardTypeValues(theme ?? defaultDagTheme, options.cardType) } };
  }
  return { ok: true, value: { ...(theme ? { theme } : {}), ...(options.sheet ? { sheet: options.sheet } : {}) } };
}

// ------------------------------------------------------------------------------ chart fonts
//
// Settings > Cards and printing > Flow chart > Fonts, and the chart toolbar's Font menu, hold
// one of three kinds of value (`chart.fonts`): `card`, follow the card style in use (the
// default); `own`, the chart style's own fonts; or a card style's id (`builtin:folio`), the
// chart pinned to that card style's fonts whatever card style is in use. Whether a chart style
// lets its fonts change at all is its theme's to say (`fonts: card` or `own`), never the code's.

/** The value the Font menu shows for following the card style in use. */
export const CHART_FONTS_ACTIVE = 'card';
/** The value the Font menu shows for the chart style's own fonts. */
export const CHART_FONTS_OWN = 'own';

/**
 * The card styles a chart can take its fonts from, in the order given (the card Style menu's):
 * the usable recipe styles (no `layout: list`; the shopping list shares Mise's fonts) whose
 * fonts a chart can draw (chartHasCardFonts).
 */
export function chartFontCards(entries: ThemeEntry[]): ThemeEntry[] {
  return recipeThemes(entries).filter((e) => isAvailable(e) && chartHasCardFonts(cardType(e.theme!)));
}

/** True when the chart style keeps its own fonts (its theme says `fonts: own`, or nothing): the Font menu is then disabled. */
export function chartKeepsOwnFonts(entry?: ChartThemeEntry | null): boolean {
  return themeFonts(entry?.theme ?? defaultDagTheme) !== 'card';
}

/**
 * What a `chart.fonts` value comes to: the value the menu shows (`card`, `own`, or the id of a
 * card style in `cards`), and the card style whose fonts the chart takes (null: its own).
 * Nothing stored follows the card style in use, `active`; so does an id that names no card
 * style in `cards` (gone, unavailable, or one a chart cannot take fonts from), silently.
 */
export function chartFonts(choice: string | null | undefined, cards: ThemeEntry[], active: ThemeEntry | null): { value: string; card: ThemeEntry | null } {
  if (choice === CHART_FONTS_OWN) return { value: CHART_FONTS_OWN, card: null };
  const pinned = choice && choice !== CHART_FONTS_ACTIVE ? cards.find((e) => e.id === choice) : undefined;
  if (pinned) return { value: pinned.id, card: pinned };
  return { value: CHART_FONTS_ACTIVE, card: active && isAvailable(active) ? active : null };
}

/** The card type of `chartFonts`'s card style, for chartRenderOptions; null: the chart style's own fonts. */
export function chartFontsType(fonts: { card: ThemeEntry | null }): CardType | null {
  return fonts.card?.theme ? cardType(fonts.card.theme) : null;
}

/** The Font menu as the GUI draws it: the value it shows, and its entries in order. */
export interface ChartFontMenu {
  value: string;
  options: ChartFontOption[];
}

/** A Font menu entry: its value, its text, and in the toolbar a longer description for its tooltip. */
export interface ChartFontOption {
  value: string;
  label: string;
  title?: string;
}

/**
 * The Font menu's entries in Settings, in order: follow the card style in use (named in
 * parentheses), the chart style's own ("Style’s own"; the toolbar, short of room, says "Style"),
 * then every card style in `cards` a chart can take fonts from, by label
 * (a source's style with its source's name). Settings > Flow chart > Fonts lists these.
 */
export function chartFontOptions(cards: ThemeEntry[], active: ThemeEntry | null): ChartFontOption[] {
  return [
    { value: CHART_FONTS_ACTIVE, label: active ? `Match active card (${active.label})` : 'Match active card' },
    { value: CHART_FONTS_OWN, label: 'Style’s own' },
    ...cards.map((e) => ({ value: e.id, label: chartFontCardLabel(e) })),
  ];
}

const chartFontCardLabel = fullStyleName;

/**
 * The chart toolbar's Font menu: "Style" (the chart style's own), then every card style by name,
 * as toolbarNames shows it (cut, without its source unless two would read the same).
 * It has no entry for following the card in use: it shows what the chart is set in. With
 * `fonts` following the card in use, that card style is selected (and added at the end, should
 * it be one `cards` leaves out); with no card style, "Style". Each entry's tooltip says it in
 * full. A pick goes back to the setting through chartToolbarFontChoice.
 */
export function chartToolbarFontMenu(fonts: { value: string; card: ThemeEntry | null }, cards: ThemeEntry[], active: ThemeEntry | null): ChartFontMenu {
  const offered = fonts.card && !cards.some((e) => e.id === fonts.card!.id) ? [...cards, fonts.card] : cards;
  const names = toolbarNames(offered);
  const entry = (e: ThemeEntry): ChartFontOption => ({
    value: e.id,
    label: names.get(e.id)!.text,
    title: e.id === active?.id ? `${chartFontCardLabel(e)}: the card style in use, followed as it changes` : `${chartFontCardLabel(e)}’s fonts, whichever card is in use`,
  });
  const options: ChartFontOption[] = [{ value: CHART_FONTS_OWN, label: 'Style', title: 'The chart style’s own fonts' }, ...cards.map(entry)];
  if (fonts.value !== CHART_FONTS_ACTIVE) return { value: fonts.value, options };
  if (!fonts.card) return { value: CHART_FONTS_OWN, options };
  if (!options.some((o) => o.value === fonts.card!.id)) options.push(entry(fonts.card));
  return { value: fonts.card.id, options };
}

/**
 * The `chart.fonts` a pick in the chart toolbar's Font menu stores: the card style in use,
 * `active`, follows it (`card`), whether it was followed or pinned before; any other card style
 * is pinned; "Style" is `own`. Pinning the card style in use itself is done in Settings.
 */
export function chartToolbarFontChoice(picked: string, active: ThemeEntry | null): string {
  return active && picked === active.id ? CHART_FONTS_ACTIVE : picked;
}

/** The page a chart PDF prints on when it takes the app's palette: plain white paper. */
export const CHART_PDF_PAGE = '#ffffff';

/**
 * What the PDF (chart-pdf.ts) renders with. A PDF is ink on paper: with "match the app" it is
 * drawn in `lightPalette`, the light scheme of the palette in use (Slate dark on screen, Slate
 * light on the page), whatever the screen shows, and its background is white
 * (`CHART_PDF_PAGE`), not the palette's ground. Without `lightPalette` it falls back to
 * `appPalette`. A theme that says `own`, or no palette (Colors: "Style’s own"), is drawn as
 * `chartRenderOptions` draws it.
 */
export function chartPdfRenderOptions(
  entry?: ChartThemeEntry | null,
  options: { joinEdges?: ChartJoinEdges; sheet?: ChartSheetChoice; appPalette?: AppPalette | null; lightPalette?: AppPalette | null; cardType?: CardType | null } = {},
): Outcome<ChartRender> {
  const { lightPalette, ...rest } = options;
  const palette = rest.appPalette ? (lightPalette ?? rest.appPalette) : null;
  return chartRenderOptions(entry, { ...rest, appPalette: palette ? { ...palette, ground: CHART_PDF_PAGE } : null });
}

export function format(source: string): Outcome<FormatResult> {
  return attempt(() => formatRecipe(source, { units }));
}

// ------------------------------------------------------------- shopping list
//
// Several recipes as one list, totaled as `etna list` totals them: the same consolidate, the
// same units registry, and the same density table — registries/densities.md, bundled into the
// app, overlaid by a collection's own densities.md when there is one to apply. A density is
// only ever taken from that table; a total made through one is marked approximate; ounces of a
// liquid are never added to a volume (all in ../list).

/** The bundled reference table, parsed once. Empty (no rows) when the bundle has no text for it. */
let referenceTable: DensityTable | null = null;
export function referenceDensities(): DensityTable {
  const text = (etnaData as Record<string, unknown>).densitiesMd;
  referenceTable ??= parseDensities(typeof text === 'string' ? text : '', units);
  return referenceTable;
}

const overlaid = new Map<string, DensityTable>();

/**
 * The density table to total with: the reference table, overlaid by `own` (the text of a
 * collection's densities.md) when given. A collection's file without a Reference section, or
 * one that cannot be read, changes nothing. Parsed once per text.
 */
export function densityTable(own: string | null = null): DensityTable {
  const base = referenceDensities();
  if (own === null || own.trim() === '') return base;
  let table = overlaid.get(own);
  if (!table) {
    const parsed = attempt(() => parseDensities(own, units));
    table = parsed.ok && parsed.value.rows.length > 0 ? mergeTables(base, parsed.value) : base;
    if (overlaid.size > 20) overlaid.clear();
    overlaid.set(own, table);
  }
  return table;
}

/** One recipe going into a combined list, as far as it got: read and parsed, or why not. */
export interface ListMember {
  /** Unique on the list: `<source id>/<slug>`. */
  id: string;
  title: string;
  recipe: Outcome<Recipe>;
}

/** A combined list, and the recipes that could not go into it (by title, with why). */
export interface CombinedList {
  list: ShoppingList;
  failed: { id: string; title: string; error: string }[];
}

/**
 * The shopping list for several recipes. A recipe that could not be read or parsed is left out
 * and named in `failed`; the others still total. `densities: null` totals without converting
 * a weight and a volume (amounts of one kind in different units are always totaled).
 */
export function combinedList(members: ListMember[], densities: DensityTable | null = referenceDensities()): CombinedList {
  const sources: ListSource[] = [];
  const failed: CombinedList['failed'] = [];
  for (const m of members) {
    if (m.recipe.ok) sources.push({ id: m.id, title: m.title, recipe: m.recipe.value });
    else failed.push({ id: m.id, title: m.title, error: m.recipe.error });
  }
  try {
    return { list: consolidate(sources, { densities, units }), failed };
  } catch (e) {
    // Should not happen; if one recipe trips consolidate, find it and list the rest.
    const kept: ListSource[] = [];
    for (const s of sources) {
      try {
        consolidate([...kept, s], { densities, units });
        kept.push(s);
      } catch (err) {
        failed.push({ id: s.id, title: s.title, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { list: consolidate(kept, { densities, units }), failed };
  }
}

/** True for a usable theme that prints shopping lists (`layout: list`). */
export const isListTheme = (entry: ThemeEntry): boolean => isAvailable(entry) && entry.theme!.layout === 'list';

/**
 * True for a theme the Card tab offers: anything but a list theme. Themes come in two kinds: a
 * `layout: list` theme prints shopping lists and is offered only in the shopping list view; every
 * other theme prints recipes. An unavailable theme whose manifest asks for the list layout is a
 * list theme too.
 */
export const isRecipeTheme = (entry: ThemeEntry): boolean => (entry.theme ? entry.theme.layout : entry.layout) !== 'list';

/** The themes the Card tab offers, in order: `entries` without the list themes. */
export function recipeThemes(entries: ThemeEntry[]): ThemeEntry[] {
  return entries.filter(isRecipeTheme);
}

/**
 * The theme the Card tab shows: the remembered one when it is a usable recipe theme, else the
 * default. A remembered list theme (from before the two kinds were kept apart) falls back too.
 */
export function pickRecipeTheme(entries: ThemeEntry[], remembered: string | null | undefined): ThemeEntry | null {
  return pickTheme(recipeThemes(entries), remembered);
}

/** The list theme to show: the remembered one when usable, else `shopping`, else the first list theme. */
export function pickListTheme(entries: ThemeEntry[], remembered: string | null | undefined): ThemeEntry | null {
  const usable = entries.filter(isListTheme);
  return (remembered ? usable.find((e) => e.id === remembered) : undefined) ?? usable.find((e) => e.id === 'builtin:shopping') ?? usable[0] ?? null;
}

/** A combined list as a card from a list theme. `uses`: say which recipe (and step) each item is for. */
export function listCard(
  list: ShoppingList,
  entry: ThemeEntry,
  print: PrintChoice = { paper: null, size: 'auto' },
  uses = false,
): Outcome<string> {
  if (!isAvailable(entry)) return { ok: false, error: `The style "${entry.name}" is unavailable: ${entry.errors.join('; ')}` };
  const paper = print.paper !== null && themePapers(entry.theme!).papers.includes(print.paper) ? print.paper : undefined;
  const size = print.size === 'auto' ? undefined : print.size;
  return attempt(() =>
    renderListCard(list, entry.theme!, { webfonts: entry.webfonts, paper, size, fit: size === undefined ? 'auto' : 'off', slots: { uses } }),
  );
}

// ------------------------------------------------------------------------------ chart print

/** A data URL for an SVG document, as the chart pane shows it (an image, so nothing inside can run). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// The chart's sheet lives in dag/sheet.ts, where the PDF (and Node) can use it without this
// module's bundled data.
export { CHART_MARGINS, CHART_SHAPES, chartBackground, chartBox, chartMargin, chartPaper, chartShape, chartSheet, chartSheetFor, chartViewBox, type ChartMargin, type ChartPaper, type ChartShape, type ChartSheet } from '../dag/sheet.ts';
