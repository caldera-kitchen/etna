// The Etna web GUI: point it at one or more recipe sources, then browse, search, view,
// print, and preview formatting. Read-only — nothing here writes to a repository.

import { diffLines, diffWordsWithSpace } from 'diff';
import { Fragment, render, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { createSearch, matchRanges, type CatalogEntry, type SearchHit } from '../catalog/index.ts';
import { etnaPicture, type PictureBytes } from '../core/index.ts';
import type { Finding } from '../lint/index.ts';
import {
  analyze,
  builtinChartThemes,
  builtinThemes,
  card,
  combinedList,
  densityTable,
  format,
  isAvailable,
  offersPartsChoice,
  offersPicture,
  isListTheme,
  listCard,
  loadSourceThemeSets,
  pickChartTheme,
  pickListTheme,
  pickRecipeTheme,
  printChoices,
  chartMargin,
  chartPaper,
  chartBackground,
  chartSheet,
  chartShape,
  chartViewBox,
  chartPdfRenderOptions,
  chartRenderOptions,
  chartFontCards,
  chartFontOptions,
  chartToolbarFontChoice,
  chartToolbarFontMenu,
  toolbarNames,
  chartFonts,
  chartFontsType,
  chartKeepsOwnFonts,
  CHART_FONTS_OWN,
  svgDataUrl,
  recipeThemes,
  referenceDensities,
  localServer,
  defaultSource,
  aboutBuild,
  fontMode,
  type Analysis,
  type ChartJoinEdges,
  themeJoinEdges,
  type ChartMargin,
  type ChartPaper,
  type ChartShape,
  type ChartFontMenu,
  type ChartThemeEntry,
  type ListMember,
  type Outcome,
  type PrintChoice,
  type ThemeEntry,
} from './engine.ts';
import { formatListMarkdown, formatListText } from '../list/index.ts';
import { chartFontFamilies, readAppPalette, type AppPalette, type CardType } from '../dag/index.ts';
import { chartFontsLoaded, loadChartFonts, loadedChartFontCss } from './chart-fonts.ts';
import { DENSE_CHART_THEME, denseAsk } from './dense-hint.ts';
import { pointsText, type DenseHint } from '../dag/small-print.ts';
import { ABANDONED, pdfLane, useChart, useDenseHint } from './chart-lane.ts';
import { applyAppearance, framePageCss, fullAppearance, MARK_SVG, PALETTES, printAttributes, resolveScheme } from './appearance.ts';
import { Brand, MarkIcon } from './brand.tsx';
import { fitSheets } from './fit.ts';
import { cardPaletteCss, readCardColors, type CardColors } from './card-palette.ts';
import { checkBadge, splitFindings } from './findings.ts';
import { moveIndex, moveTab, tabStopIndex } from './listkeys.ts';
import { hasRecipeNotes } from './prefs.ts';
import { filterOnList, hitDetail, rowDetail, segments, sourceTags } from './rows.ts';
import { browserStore, compact, loadSettings, saveSettings, setIn, type CardSettings, type ChartSettings, type Settings, type ShoppingSettings } from './settings.ts';
import {
  isSectionId,
  PAPER_LABELS,
  SettingsNav,
  SettingsPanel,
  type ChartThemeGroup,
  type LoadedSource,
  type SectionId,
  type SourceActions,
  type ThemeGroup,
} from './settings-view.tsx';
import { formatListRefs, hasRef, LIST_KEY, parseListRefs, refKey, removeRef, toggleRef, type ListRef } from './shopping.ts';
import { addSource, linkRepos, moveSource, removeSiteSource, removeSource, restoreSiteSource, searchWithout, setHidden, sourceEntries, type SourceEntry } from './sourcelist.ts';
import { ETNA_IS, requestHosts } from './about.ts';
import { listOrder } from './listorder.ts';
import { welcomeForm, type SiteWelcome } from './welcome.ts';
import { discoverLocalSources, GitHubSource, readImageFolder, SiteSource, type LocalSource, type RepoSource } from './sources.ts';

// ---------------------------------------------------------------------- state

interface Selection {
  sourceId: string;
  slug: string;
}

type Tab = 'card' | 'chart' | 'format' | 'check' | 'source';
/** The recipe's tabs: the views of it (`view`), then the tools for keeping its file tidy (`tool`). */
const TABS: { id: Tab; label: string; group: 'view' | 'tool' }[] = [
  { id: 'card', label: 'Card', group: 'view' },
  { id: 'chart', label: 'Flow chart', group: 'view' },
  { id: 'format', label: 'Format', group: 'tool' },
  { id: 'check', label: 'Check', group: 'tool' },
  { id: 'source', label: 'Source', group: 'tool' },
];

/** The three top-level views: the recipes, the shopping list, and Settings. */
type View = 'recipes' | 'list' | 'settings';

// Recipe files, each fetched once per session (and parsed once), shared by the recipe view and
// the shopping list. A failed fetch is forgotten, so opening the recipe again tries again.
const recipeTexts = new Map<string, Promise<string>>();
const analyses = new Map<string, Analysis>();

function readRecipeText(source: RepoSource, path: string): Promise<string> {
  const key = `${source.id}\u0000${path}`;
  let text = recipeTexts.get(key);
  if (!text) {
    text = source.read(path);
    text.catch(() => recipeTexts.delete(key));
    recipeTexts.set(key, text);
  }
  return text;
}

// Each recipe's picture files (its image/ folder), fetched once per session when its page opens.
// A folder that could not be seen is forgotten, so opening the recipe again tries again.
const imageFolders = new Map<string, Promise<PictureBytes[] | null>>();

function readPictures(source: RepoSource, path: string): Promise<PictureBytes[] | null> {
  const key = `${source.id}\u0000${path}`;
  let folder = imageFolders.get(key);
  if (!folder) {
    folder = readImageFolder(source, path).catch(() => null);
    folder.then((files) => files === null && imageFolders.delete(key));
    imageFolders.set(key, folder);
  }
  return folder;
}

/** A recipe's page: its text checked with its picture files, and the picture its card shows (null: none). */
interface RecipePage {
  analysis: Analysis;
  picture: { src: string } | null;
}

const recipePages = new Map<string, { text: string; files: PictureBytes[] | null; page: RecipePage }>();

async function readRecipePage(source: RepoSource, path: string): Promise<RecipePage> {
  const key = `${source.id}\u0000${path}`;
  const [text, files] = await Promise.all([readRecipeText(source, path), readPictures(source, path)]);
  const known = recipePages.get(key);
  if (known && known.text === text && known.files === files) return known.page;
  // A picture Etna cannot show (too large, not what its ending says) is left off; the Check tab says why.
  const found = files === null ? null : etnaPicture(files);
  const page = { analysis: analyze(text, files ?? undefined), picture: found !== null && 'src' in found ? found : null };
  recipePages.set(key, { text, files, page });
  return page;
}

async function readAnalysis(source: RepoSource, path: string): Promise<Analysis> {
  const key = `${source.id}\u0000${path}`;
  const text = await readRecipeText(source, path);
  let analysis = analyses.get(key);
  if (!analysis || analysis.source !== text) {
    analysis = analyze(text);
    analyses.set(key, analysis);
  }
  return analysis;
}

/** A remembered setting; null when there is none or storage is unavailable. */
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
}

/** What the paging script reported for the card on show. */
interface Paged {
  pages: number | null;
  size: string | null;
  failed: boolean;
}

/**
 * The hash: `#/<source>/<slug>/<tab>` for a recipe, `#/list` for the shopping list,
 * `#/settings/<section>` for Settings.
 */
function readHash(): { selection: Selection | null; tab: Tab; view: View; section: SectionId } {
  const none = { selection: null, tab: 'card' as Tab, view: 'recipes' as View, section: 'sources' as SectionId };
  let parts: string[];
  try {
    parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  } catch {
    return none; // a mangled link opens the app, not a blank page
  }
  if (parts.length === 1 && parts[0] === 'list') return { ...none, view: 'list' };
  if (parts[0] === 'settings' && (parts.length === 1 || (parts.length === 2 && (parts[1] === '' || isSectionId(parts[1]))))) {
    return { ...none, view: 'settings', section: isSectionId(parts[1]) ? parts[1] : 'sources' };
  }
  if (parts.length < 2 || !parts[0] || !parts[1]) return none;
  const tab = TABS.some((t) => t.id === parts[2]) ? (parts[2] as Tab) : 'card';
  return { ...none, selection: { sourceId: parts[0], slug: parts[1] }, tab };
}

function writeHash(selection: Selection | null, tab: Tab, view: View, section: SectionId): void {
  const hash =
    view === 'list'
      ? '#/list'
      : view === 'settings'
        ? `#/settings/${section}`
        : selection
          ? `#/${encodeURIComponent(selection.sourceId)}/${encodeURIComponent(selection.slug)}/${tab}`
          : '';
  if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
}

/** Folders on this computer, as `etna serve` offers them. */
interface LocalFolder {
  id: string;
  label: string;
  source: LocalSource;
}

const STORE = browserStore();

/** The recipes this site carries as its default source (a static build's, or none): listed for every visitor until removed. */
const SITE: readonly { id: string; label: string; welcome: SiteWelcome | null; order: string[] }[] = defaultSource ? [defaultSource] : [];

// ------------------------------------------------------------------------ app

function App() {
  // This browser's settings (settings.ts): read once.
  const boot = useMemo(() => loadSettings(STORE), []);
  const [settings, setSettingsState] = useState<Settings>(boot.settings);
  const settingsNow = useRef(settings);
  const [storageOk, setStorageOk] = useState(boot.available);
  /** Change the settings: applied at once and kept (unless they belong to a newer Etna). */
  const change = (fn: (s: Settings) => Settings) => {
    const next = compact(fn(settingsNow.current));
    settingsNow.current = next;
    setSettingsState(next);
    if (!boot.readOnly) setStorageOk(saveSettings(STORE, next));
  };
  const cards = settings.cards ?? {};
  const chart = settings.chart ?? {};
  const shopping = settings.shopping ?? {};

  // The look (appearance.ts), kept on <html>; boot.ts set it before the first paint.
  const [prefersDark, setPrefersDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  // The app's colors as the page now has them (palettes.css), read once the attributes are on
  // <html>: a flow chart with `palette: app` is drawn in them (Settings > Flow chart > Colors).
  // A chart PDF is ink on paper: it is drawn in the light scheme of the same palette on a white
  // page, read from a hidden probe that carries the palette's attributes with the light scheme
  // (printAttributes).
  const [appPalette, setAppPalette] = useState<AppPalette | null>(null);
  const [lightPalette, setLightPalette] = useState<AppPalette | null>(null);
  useEffect(() => {
    applyAppearance(document, settings.appearance, prefersDark);
    setAppPalette(readAppPalette(getComputedStyle(document.documentElement)));
    let probe = document.getElementById('print-palette-probe');
    if (!probe) {
      probe = document.createElement('div');
      probe.id = 'print-palette-probe';
      probe.hidden = true;
      probe.setAttribute('aria-hidden', 'true');
      document.body.append(probe);
    }
    for (const [name, value] of Object.entries(printAttributes(settings.appearance))) probe.setAttribute(name, value);
    setLightPalette(readAppPalette(getComputedStyle(probe)));
  }, [settings.appearance, prefersDark]);
  const look = fullAppearance(settings.appearance);
  const pageCss = framePageCss(look.corners, resolveScheme(look.scheme, prefersDark));

  const [loadedList, setSources] = useState<LoadedSource[]>([]);
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<string>('');
  const initial = useMemo(readHash, []);
  const [selection, setSelectionState] = useState<Selection | null>(initial.selection);
  const [tab, setTab] = useState<Tab>(initial.tab);
  // The three views, shown as tabs: Recipes, the Shopping list, Settings.
  const [view, setView] = useState<View>(initial.view);
  const [section, setSection] = useState<SectionId>(initial.section);
  const listOpen = view === 'list';
  const settingsOpen = view === 'settings';
  // The shopping view stays mounted once it has been opened, so leaving it and coming back keeps
  // its place (scroll position, the recipes read, the card).
  const listSeen = useRef(listOpen);
  if (listOpen) listSeen.current = true;
  const recipesPanel = useRef<HTMLDivElement>(null);
  const listPanel = useRef<HTMLDivElement>(null);
  const settingsPanel = useRef<HTMLDivElement>(null);
  const listNav = useRef<HTMLElement>(null);
  const [listRefs, setListRefs] = useState<ListRef[]>(() => parseListRefs(recall(LIST_KEY)));
  const changeList = (next: ListRef[]) => {
    setListRefs(next);
    remember(LIST_KEY, formatListRefs(next));
  };
  // What a screen reader hears after a recipe goes on the list or comes off it, and after a change in Settings.
  const [announcement, setAnnouncement] = useState('');
  const toggleOnList = (ref: ListRef, title: string) => {
    const next = toggleRef(listRefs, ref);
    changeList(next);
    const on = hasRef(next, ref);
    setAnnouncement(`${title} ${on ? 'added to' : 'taken off'} the shopping list (${next.length} ${next.length === 1 ? 'recipe' : 'recipes'}).`);
  };
  // The recipe list is one Tab stop: the row that holds it (by key), moved with the arrow keys.
  const [stopKey, setStopKey] = useState<string | null>(null);
  // Opening a recipe leaves the list view.
  const setSelection = (next: Selection | null) => {
    setSelectionState(next);
    if (next) setView('recipes');
  };
  // True once the local sources are known.
  const [discovered, setDiscovered] = useState(false);
  // The search terms that led to the open recipe, highlighted in it until cleared.
  const [marks, setMarks] = useState<string[]>([]);
  // Card themes carried by the sources, by source id; loaded once a source is ready.
  const [sourceThemes, setSourceThemes] = useState<Record<string, ThemeEntry[]>>({});
  // The order each source states for its recipes (listorder.ts), by source id; asked for once it is ready.
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  // The card theme last chosen, remembered across recipes and reloads.
  const themeChoice = cards.theme ?? null;
  const chooseTheme = (id: string) => change((s) => setIn(s, 'cards', 'theme', id));
  // Chart themes carried by the sources, and the one last chosen.
  const [sourceChartThemes, setSourceChartThemes] = useState<Record<string, ChartThemeEntry[]>>({});
  const chartThemeChoice = chart.theme ?? null;
  const chooseChartTheme = (id: string) => change((s) => setIn(s, 'chart', 'theme', id));
  // How edges joining one node come in, remembered; null: as the chart theme has it.
  const joinEdges: ChartJoinEdges | null = chart['join-edges'] ?? null;
  const chooseJoinEdges = (value: ChartJoinEdges) => change((s) => setIn(s, 'chart', 'join-edges', value));
  // What the chart is fitted to, the screen or a sheet, remembered; unset is the screen.
  const shape: ChartShape = chartShape(chart.shape);
  const chooseShape = (value: ChartShape) => change((s) => setIn(s, 'chart', 'shape', value));
  // The chart's fonts (`card`, `own` or a card style's id), remembered.
  const chooseChartFonts = (value: string) => change((s) => setIn(s, 'chart', 'fonts', value));
  // The colors a chart theme with `palette: app` is drawn in: the app's (the default), or null for the theme's own.
  const chartPalette: AppPalette | null = chart.palette === 'own' ? null : appPalette;
  const chartLightPalette: AppPalette | null = chart.palette === 'own' ? null : lightPalette;
  // On the Shopping list tab: show only the recipes on the list.
  const [onlyOnList, setOnlyOnList] = useState(false);
  const searchBox = useRef<HTMLInputElement>(null);
  // "Screen stays on": the remembered wish (the browser's support is WAKE_SUPPORTED).
  const wakeOn = settings['screen-on'] === true;
  // A card on screen (and the shopping list) in the app's colors, or in the style's own
  // (Settings > Card > Colors); either way on the app's desk. Read once the appearance is on
  // <html>; added to the screen-only style of the card's page, so printing never sees it.
  const [cardColors, setCardColors] = useState<CardColors | null>(null);
  // The same palette's light colors (the probe the chart PDF reads): a card in its own colors
  // is a white sheet, and a search hit on it takes the light highlight.
  const [lightCardColors, setLightCardColors] = useState<CardColors | null>(null);
  useEffect(() => {
    setCardColors(readCardColors(getComputedStyle(document.documentElement)));
    const probe = document.getElementById('print-palette-probe');
    setLightCardColors(probe ? readCardColors(getComputedStyle(probe)) : null);
  }, [settings.appearance, prefersDark]);
  const cardPageCss = [pageCss, cardColors && cardPaletteCss(cardColors, cards.palette ?? 'app', lightCardColors)].filter(Boolean).join('') || null;

  // ---- sources: this computer's folders, the site's own, the kept repositories, and a link's for this visit
  const [locals, setLocals] = useState<LocalFolder[]>([]);
  const [link, setLink] = useState<string[]>(() => linkRepos(location.search));
  const entries = useMemo(() => sourceEntries(locals, settings, link, SITE), [locals, settings, link]);
  const loadedById = useMemo(() => new Map(loadedList.map((s) => [s.source.id, s])), [loadedList]);
  // The sources in use, in the order of the list: the ones not hidden that are loading or loaded.
  const sources: LoadedSource[] = useMemo(
    () => entries.filter((e) => !e.hidden).flatMap((e) => (loadedById.has(e.id) ? [loadedById.get(e.id)!] : [])),
    [entries, loadedById],
  );

  const load = (source: RepoSource, again = false) => {
    setSources((list) =>
      !again && list.some((s) => s.source.id === source.id)
        ? list
        : [...list.filter((s) => s.source.id !== source.id), { source, status: 'loading', entries: [], nameOnly: false, error: null }],
    );
    source.catalog().then(
      ({ catalog, nameOnly }) => {
        setSources((list) => list.map((s) => (s.source === source ? { ...s, status: 'ready', entries: catalog.recipes, nameOnly } : s)));
        source.order?.().then((order) => {
          if (order.length > 0) setOrders((m) => ({ ...m, [source.id]: order }));
        });
        loadSourceThemeSets(source).then(({ cards, charts }) => {
          if (cards.length > 0) setSourceThemes((m) => ({ ...m, [source.id]: cards }));
          if (charts.length > 0) setSourceChartThemes((m) => ({ ...m, [source.id]: charts }));
        });
      },
      (e) => setSources((list) => list.map((s) => (s.source === source ? { ...s, status: 'error', error: String(e?.message ?? e) } : s))),
    );
  };
  const makeSource = (e: SourceEntry): RepoSource | null => {
    if (e.kind === 'local') return locals.find((l) => l.id === e.id)?.source ?? null;
    if (e.kind === 'site') {
      const d = SITE.find((x) => x.id === e.id);
      return d ? new SiteSource(d.id, d.label, d.order) : null;
    }
    const spec = e.spec;
    if (spec === null) return null;
    if (typeof spec === 'string') return new GitHubSource(spec);
    if (spec.path) return null; // a folder inside a repository: not read yet (shown in Settings)
    return new GitHubSource(spec.repo, spec.ref);
  };
  // Load what is listed and shown and not loaded yet; forget what left the list.
  useEffect(() => {
    if (!discovered) return;
    for (const e of entries) {
      if (e.hidden || loadedById.has(e.id)) continue;
      const source = makeSource(e);
      if (source) load(source);
    }
    const listed = new Set(entries.map((e) => e.id));
    if (loadedList.some((s) => !listed.has(s.source.id))) setSources((list) => list.filter((s) => listed.has(s.source.id)));
  }, [entries, discovered]);

  useEffect(() => {
    (localServer ? discoverLocalSources() : Promise.resolve([])).then((found) => {
      setLocals(found.map((s) => ({ id: s.id, label: s.label, source: s })));
      setDiscovered(true);
    });
    const onPop = () => {
      const h = readHash();
      setSelectionState(h.selection);
      setTab(h.tab);
      setView(h.view);
      setSection(h.section);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => writeHash(selection, tab, view, section), [selection, tab, view, section]);

  // A source that is hidden or gone no longer filters the list or holds the open recipe.
  useEffect(() => {
    if (only && !sources.some((s) => s.source.id === only)) setOnly('');
  }, [sources, only]);

  const sourceActions: SourceActions = {
    onAdd: (repo) => {
      const added = addSource(settingsNow.current, repo);
      if (!added.ok) return added.error;
      change(() => added.value);
      return null;
    },
    onRemove: (id) => {
      const entry = entries.find((e) => e.id === id);
      if (entry?.origin === 'link') {
        // Dismiss: gone for this visit, and from the address so a reload does not bring it back.
        setLink((l) => l.filter((r) => r !== id));
        history.replaceState(null, '', `${location.pathname}${searchWithout(location.search, id)}${location.hash}`);
      } else if (entry?.origin === 'site') change((s) => removeSiteSource(s, id));
      else change((s) => removeSource(s, id));
      if (selection?.sourceId === id) setSelectionState(null);
    },
    onKeep: (id) => {
      const added = addSource(settingsNow.current, id);
      if (added.ok) change(() => added.value);
    },
    onHide: (id, hidden) => {
      change((s) => setHidden(s, id, hidden));
      if (hidden && selection?.sourceId === id) setSelectionState(null);
    },
    onMove: (id, delta) => change((s) => moveSource(s, entries, id, delta)),
    onRetry: (id) => {
      const e = entries.find((x) => x.id === id);
      // A repository or the site's own is read afresh; a folder of `etna serve` keeps its reader.
      const source = e && e.kind !== 'local' ? makeSource(e) : (loadedById.get(id)?.source ?? null);
      if (source) load(source, true);
    },
    onRestore: (id) => change((s) => restoreSiteSource(s, id)),
  };

  const ready = sources.filter((s) => s.status === 'ready');
  const search = useMemo(() => createSearch(ready.map((s) => ({ source: s.source.id, catalog: { version: 1, recipes: s.entries } }))), [sources]);
  // Every recipe on show when nothing is searched: alphabetical, or in the order the one source
  // the list shows alone states for itself (listorder.ts).
  const all = useMemo(() => {
    const rows = ready.flatMap((s) => s.entries.map((entry) => ({ sourceId: s.source.id, slug: entry.slug, entry }))).filter((r) => !only || r.sourceId === only);
    const alone = only || (ready.length === 1 ? ready[0].source.id : '');
    return listOrder(rows, alone ? (orders[alone] ?? null) : null);
  }, [sources, only, orders]);
  const hits: SearchHit[] | null = useMemo(
    () => (query.trim() ? search.search(query, { limit: 60, source: only || undefined }) : null),
    [query, search, only],
  );

  const labelOf = (id: string) =>
    sources.find((s) => s.source.id === id)?.source.label ?? locals.find((l) => l.id === id)?.label ?? SITE.find((d) => d.id === id)?.label ?? id;
  const selectedSource = selection ? sources.find((s) => s.source.id === selection.sourceId) : undefined;
  const selectedEntry = selectedSource?.entries.find((e) => e.slug === selection?.slug);
  const themeGroups: ThemeGroup[] = useMemo(
    () => [
      { label: 'Built-in', entries: builtinThemes },
      ...ready.filter((s) => sourceThemes[s.source.id]?.length).map((s) => ({ label: s.source.label, entries: sourceThemes[s.source.id] })),
    ],
    [sources, sourceThemes],
  );
  // The Card tab offers recipe themes only; list themes are for the shopping view (which filters
  // the whole set for them itself).
  const recipeThemeGroups: ThemeGroup[] = useMemo(
    () => themeGroups.map((g) => ({ ...g, entries: recipeThemes(g.entries) })).filter((g) => g.entries.length > 0),
    [themeGroups],
  );
  // The type a chart theme with `fonts: card` is set in (the Font menu, Settings > Flow chart >
  // Fonts): the card style in use (the default), a card style pinned by id, or null for the
  // chart theme's own. The card styles offered are the card Style menu's (chartFontCards).
  const cardStyle = pickRecipeTheme(recipeThemeGroups.flatMap((g) => g.entries), themeChoice);
  const fontCards = useMemo(() => chartFontCards(recipeThemeGroups.flatMap((g) => g.entries)), [recipeThemeGroups]);
  const fonts = chartFonts(chart.fonts, fontCards, cardStyle);
  const chartCardType: CardType | null = useMemo(() => chartFontsType(fonts), [fonts.card?.theme]);
  const chartFontMenu = { value: fonts.value, options: chartFontOptions(fontCards, cardStyle) };
  // The toolbar's Font menu shows the font the chart is set in (the card style in use, when
  // following it); a pick of the card style in use goes back to following it.
  const chartToolbarFonts = chartToolbarFontMenu(fonts, fontCards, cardStyle);
  const chooseToolbarFonts = (value: string) => chooseChartFonts(chartToolbarFontChoice(value, cardStyle));
  const listThemeGroups: ThemeGroup[] = useMemo(
    () => themeGroups.map((g) => ({ ...g, entries: g.entries.filter(isListTheme) })).filter((g) => g.entries.length > 0),
    [themeGroups],
  );
  const chartThemeGroups: ChartThemeGroup[] = useMemo(
    () => [
      { label: 'Built-in', entries: builtinChartThemes },
      ...ready.filter((s) => sourceChartThemes[s.source.id]?.length).map((s) => ({ label: s.source.label, entries: sourceChartThemes[s.source.id] })),
    ],
    [sources, sourceChartThemes],
  );

  // Every recipe's catalog entry, by refKey, for the second line of a search result.
  const catalogEntries = useMemo(() => new Map(ready.flatMap((s) => s.entries.map((e) => [refKey({ source: s.source.id, slug: e.slug }), e] as const))), [sources]);
  // The rows on show, in order: the search results or every recipe, narrowed on the Shopping
  // list tab to what is on the list when asked.
  const filtering = listOpen && onlyOnList;
  const rows = filterOnList<RowData>(
    hits
      ? hits.map((h) => ({ ref: { source: h.source, slug: h.slug }, title: h.title, entry: catalogEntries.get(refKey({ source: h.source, slug: h.slug })), hit: h }))
      : all.map((r) => ({ ref: { source: r.sourceId, slug: r.entry.slug }, title: r.entry.title, entry: r.entry, hit: null })),
    (r) => r.ref,
    listRefs,
    filtering,
  );
  const tags = sourceTags(
    rows.map((r) => ({ source: r.ref.source, title: r.title })),
    only ? 1 : ready.length,
    hits !== null,
  );
  const rowKeys = rows.map((r) => refKey(r.ref));
  const openKey = selection ? refKey({ source: selection.sourceId, slug: selection.slug }) : null;
  const stop = tabStopIndex(rowKeys, stopKey, openKey);
  const focusRow = (index: number) => {
    const item = listNav.current?.querySelector<HTMLElement>(`.item-row[data-row="${index}"] .item`);
    if (!item) return;
    item.focus({ preventScroll: true });
    item.scrollIntoView({ block: 'nearest' });
  };
  const openRow = (r: RowData) => {
    setMarks(r.hit?.terms ?? []);
    setSelection({ sourceId: r.ref.source, slug: r.ref.slug });
  };
  // Put a row's recipe on the list or take it off. When only the list is shown, the row goes
  // with it: keep the focus on the row that takes its place (or the filter, when none is left).
  const toggleRow = (index: number) => {
    const r = rows[index];
    if (!r) return;
    const leaving = filtering && hasRef(listRefs, r.ref);
    toggleOnList(r.ref, r.title);
    if (!leaving) return;
    const hadFocus = listNav.current?.contains(document.activeElement);
    const remaining = rows.length - 1;
    const next = Math.min(index, remaining - 1);
    setStopKey(remaining > 0 ? rowKeys[index < remaining ? index + 1 : index - 1] : null);
    if (hadFocus) requestAnimationFrame(() => (remaining > 0 ? focusRow(next) : document.getElementById('list-filter')?.focus()));
  };
  const clearSearch = () => {
    setQuery('');
    searchBox.current?.focus();
  };
  const onListKeyDown = (e: KeyboardEvent) => {
    const row = (e.target as Element).closest?.<HTMLElement>('.item-row');
    if (!row || e.altKey || e.ctrlKey || e.metaKey) return;
    const index = Number(row.dataset.row);
    // On the Shopping list tab, Space puts the row's recipe on the list or takes it off, and
    // Enter opens it (a click toggles there, so Enter must not become one).
    if (listOpen && e.key === ' ') {
      e.preventDefault();
      toggleRow(index);
      return;
    }
    if (listOpen && e.key === 'Enter') {
      e.preventDefault();
      const r = rows[index];
      if (r) openRow(r);
      return;
    }
    // Escape clears a search and goes back to the search box; so does Up from the first result.
    if (query && (e.key === 'Escape' || (e.key === 'ArrowUp' && index === 0))) {
      e.preventDefault();
      if (e.key === 'Escape') clearSearch();
      else searchBox.current?.focus();
      return;
    }
    const height = row.offsetHeight || 1;
    const page = Math.max(1, Math.floor((listNav.current?.clientHeight ?? height) / height) - 1);
    const next = moveIndex(e.key, index, rowKeys.length, page);
    if (next === null) return;
    e.preventDefault();
    setStopKey(rowKeys[next]);
    focusRow(next);
  };
  // A button is pressed when Space comes up; on the Shopping list tab Space already did its work.
  const onListKeyUp = (e: KeyboardEvent) => {
    if (listOpen && e.key === ' ' && (e.target as Element).closest?.('.item-row')) e.preventDefault();
  };
  // In the search box: Down moves into the results, Escape clears the search.
  const onSearchKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && rows.length > 0 && !settingsOpen) {
      e.preventDefault();
      setStopKey(rowKeys[0]);
      focusRow(0);
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      setQuery('');
    }
  };
  // `/` anywhere but a field goes to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      e.preventDefault();
      searchBox.current?.focus();
      searchBox.current?.select();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Keep the screen awake while a recipe is open and on show, when that was asked for.
  const wake = useWakeLock(WAKE_SUPPORTED && wakeOn && view === 'recipes' && !!selectedEntry);
  const toggleWake = () => {
    const on = !wakeOn;
    change((s) => ({ ...s, 'screen-on': on }));
    setAnnouncement(on ? 'The screen stays on while a recipe is open.' : 'The screen may dim again as usual.');
  };

  // Bring the open recipe's row into view in the list once (a link or the shopping list may open
  // a recipe far down the list).
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (view !== 'recipes' || !openKey || scrolledTo.current === openKey) return;
    const item = listNav.current?.querySelector('.item.active');
    if (!item) return;
    scrolledTo.current = openKey;
    item.scrollIntoView({ block: 'nearest' });
  });
  // The recipe list keeps its place while Settings has the left column.
  const listScroll = useRef(0);
  const wasSettings = useRef(settingsOpen);
  useEffect(() => {
    if (settingsOpen === wasSettings.current) return;
    wasSettings.current = settingsOpen;
    const nav = listNav.current;
    if (!nav) return;
    if (settingsOpen) nav.scrollTop = 0;
    else nav.scrollTop = listScroll.current;
  }, [settingsOpen]);
  const chooseView = (next: View) => {
    if (next === 'settings' && !settingsOpen && listNav.current) listScroll.current = listNav.current.scrollTop;
    setView(next);
  };
  const openSettings = (at: SectionId) => {
    if (!settingsOpen && listNav.current) listScroll.current = listNav.current.scrollTop;
    setSection(at);
    setView('settings');
  };

  const skipToMain = (e: Event) => {
    e.preventDefault();
    (listOpen ? listPanel : settingsOpen ? settingsPanel : recipesPanel).current?.focus();
  };

  // The landing page's form (welcome.ts), and where the site's own recipes stand.
  const [askedWelcome, setAskedWelcome] = useState(false);
  const form = welcomeForm({ localServer, kept: settings.sources, hidden: settings.welcome === 'short', asked: askedWelcome });
  // Hide the full welcome, for good in this browser (settings.ts `welcome`); "Show the welcome"
  // brings it back for the visit without changing that.
  const hideWelcome = () => {
    setAskedWelcome(false);
    change((s) => ({ ...s, welcome: 'short' }));
    setAnnouncement('The welcome is hidden. Show the welcome brings it back.');
    requestAnimationFrame(() => recipesPanel.current?.focus({ preventScroll: true }));
  };
  const siteEntry = SITE[0] ? entries.find((e) => e.origin === 'site' && e.id === SITE[0].id) : undefined;
  const siteState: SiteState = !SITE[0] ? 'none' : !siteEntry ? 'removed' : siteEntry.hidden ? 'hidden' : 'shown';
  // On a narrow screen the full welcome comes before the recipe list (app.css `.body.welcoming`).
  const welcoming = view === 'recipes' && !selection && form === 'full';

  const viewTabs = <ViewTabs view={view} count={listRefs.length} onView={chooseView} />;
  const failed = sources.filter((s) => s.status === 'error');
  const summaries: Record<SectionId, string> = {
    sources: String(entries.length),
    appearance: PALETTES.find((t) => t.id === look.palette)?.label ?? '',
    cards: '',
    shopping: '',
    data: storageOk ? 'This browser' : 'Not kept',
    about: aboutBuild.version,
  };

  return (
    <div class="app">
      <a class="skip" href={listOpen ? '#panel-list' : settingsOpen ? '#panel-settings' : '#panel-recipes'} onClick={skipToMain}>
        {listOpen ? 'Skip to shopping list' : settingsOpen ? 'Skip to settings' : 'Skip to recipe'}
      </a>
      <div class="visually-hidden" role="status">
        {announcement}
      </div>
      <header class="top">
        <Brand
          href={`${location.pathname}${location.search}`}
          onHome={() => {
            // Home: the landing page, from any view. writeHash pushes the plain address, so Back
            // returns to where the reader was.
            setSelectionState(null);
            setView('recipes');
            requestAnimationFrame(() => {
              // Focus first (for a screen reader, the page it went to), then the top of it.
              recipesPanel.current?.focus({ preventScroll: true });
              recipesPanel.current?.scrollTo(0, 0);
              document.querySelector('.body')?.scrollTo(0, 0);
            });
          }}
        />
        <div class="search-box">
          <input
            ref={searchBox}
            class="search"
            type="search"
            placeholder="Search by name, ingredient, or words in the method"
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              // Searching is for recipes: typing in Settings goes back to them.
              if (settingsOpen) chooseView('recipes');
            }}
            onKeyDown={onSearchKeyDown}
            aria-label="Search recipes"
            aria-describedby="search-keys"
          />
          <kbd aria-hidden="true">/</kbd>
          <span class="visually-hidden" id="search-keys">
            Press slash to come here from anywhere. Down arrow moves into the results, Enter opens one, Escape clears the search.
          </span>
        </div>
      </header>
      <div class={`body${welcoming ? ' welcoming' : ''}`}>
        <nav
          class={`list${listOpen ? ' shopping-mode' : ''}${settingsOpen ? ' settings-mode' : ''}`}
          aria-label={settingsOpen ? 'Settings' : 'Recipe list'}
          ref={listNav}
          onKeyDown={settingsOpen ? undefined : onListKeyDown}
          onKeyUp={settingsOpen ? undefined : onListKeyUp}
        >
          <div class="list-top">
            <div class="list-views">{viewTabs}</div>
            {!settingsOpen && (
              <ListHeader
                hits={hits}
                shown={rows.length}
                total={all.length}
                sources={sources}
                shopping={listOpen}
                listCount={listRefs.length}
                filtering={filtering}
                onFilter={() => setOnlyOnList(!onlyOnList)}
                only={only}
                onOnly={setOnly}
                failed={failed.length}
                onSettings={() => openSettings('sources')}
              />
            )}
          </div>
          {settingsOpen ? (
            <SettingsNav section={section} onSection={setSection} summaries={summaries} />
          ) : (
            <>
              {rows.map((r, i) => (
                <Fragment key={rowKeys[i]}>
                  {r.hit && !r.hit.full && (i === 0 || rows[i - 1].hit?.full) && (
                    <div class="list-divider" key="partial">
                      {i === 0 ? 'No recipe has every word. These match some:' : 'Matching only some of the words'}
                    </div>
                  )}
                  <ListItem
                    key={rowKeys[i]}
                    index={i}
                    tabStop={i === stop}
                    onFocusRow={() => setStopKey(rowKeys[i])}
                    title={r.title}
                    detail={r.hit ? hitDetail(r.entry, r.hit) : rowDetail(r.entry)}
                    terms={r.hit?.terms ?? []}
                    sourceLabel={tags[i] ? labelOf(r.ref.source) : ''}
                    active={view === 'recipes' && rowKeys[i] === openKey}
                    shopping={listOpen}
                    onList={hasRef(listRefs, r.ref)}
                    onToggleList={() => toggleRow(i)}
                    onOpen={() => openRow(r)}
                  />
                </Fragment>
              ))}
              {filtering && rows.length === 0 && (
                <div class="list-empty">{listRefs.length === 0 ? 'Nothing is on the list yet.' : 'None of the recipes on the list matches the search.'}</div>
              )}
            </>
          )}
        </nav>
        <main class="view">
          {/* The views stay laid out; the ones not shown are hidden (and so out of the tab order and
              the accessibility tree), which keeps their scroll position and lets a card page itself. */}
          <div
            class={`panel${view === 'recipes' ? '' : ' off'}`}
            id="panel-recipes"
            role="tabpanel"
            aria-labelledby="view-recipes"
            aria-hidden={view === 'recipes' ? undefined : 'true'}
            tabIndex={-1}
            ref={recipesPanel}
          >
          {selection && selectedSource && selectedSource.status === 'loading' ? (
            // A link straight to a recipe arrives before its source's catalog; the catalog
            // says where the recipe file is, so wait for it instead of guessing the path.
            <div class="empty">Loading…</div>
          ) : selection && selectedSource && selectedSource.status === 'ready' && !selectedEntry ? (
            <div class="problem">
              <strong>Recipe not found</strong>
              <div>
                There is no recipe “{selection.slug}” in {selectedSource.source.label}.
              </div>
            </div>
          ) : selection && selectedSource && selectedEntry ? (
            <RecipeView
              key={`${selection.sourceId}/${selection.slug}`}
              source={selectedSource.source}
              path={selectedEntry.path}
              title={selectedEntry.title}
              tab={tab}
              onTab={setTab}
              marks={marks}
              onClearMarks={() => setMarks([])}
              themes={recipeThemeGroups}
              themeChoice={themeChoice}
              onTheme={chooseTheme}
              chartThemes={chartThemeGroups}
              chartThemeChoice={chartThemeChoice}
              onChartTheme={chooseChartTheme}
              joinEdges={joinEdges}
              onJoinEdges={chooseJoinEdges}
              shape={shape}
              onShape={chooseShape}
              appPalette={chartPalette}
              lightPalette={chartLightPalette}
              cardType={chartCardType}
              fontMenu={chartToolbarFonts}
              onFonts={chooseToolbarFonts}
              wake={WAKE_SUPPORTED ? { on: wakeOn, held: wake.held, failed: wake.failed, onToggle: toggleWake } : null}
              prefs={cards}
              onPref={(key, value) => change((s) => setIn(s, 'cards', key, value))}
              chartPrefs={chart}
              pageCss={cardPageCss}
            />
          ) : (
            <Welcome
              form={form}
              sources={sources}
              discovered={discovered}
              site={siteState}
              siteSource={SITE[0] ?? null}
              sourceUrl={aboutBuild.sourceUrl}
              remembered={storageOk && !boot.readOnly}
              onShow={() => setAskedWelcome(true)}
              onHide={hideWelcome}
              onSources={() => openSettings('sources')}
              onOpen={(sourceId, slug, at) => {
                setMarks([]);
                setTab(at);
                setSelection({ sourceId, slug });
                requestAnimationFrame(() => recipesPanel.current?.focus());
              }}
            />
          )}
          </div>
          {listSeen.current && (
            <div
              class={`panel${listOpen ? '' : ' off'}`}
              id="panel-list"
              role="tabpanel"
              aria-labelledby="view-list"
              aria-hidden={listOpen ? undefined : 'true'}
              tabIndex={-1}
              ref={listPanel}
            >
              <ListView
                refs={listRefs}
                sources={sources}
                discovered={discovered}
                onRemove={(ref) => changeList(removeRef(listRefs, ref))}
                onClear={() => changeList([])}
                onOpen={(ref) => {
                  setMarks([]);
                  setTab('card');
                  setSelection({ sourceId: ref.source, slug: ref.slug });
                  // The button just pressed is now hidden: carry focus to the recipe it opened.
                  requestAnimationFrame(() => recipesPanel.current?.focus());
                }}
                suggestion={selection && selectedEntry ? { ref: { source: selection.sourceId, slug: selection.slug }, title: selectedEntry.title } : null}
                onAdd={(ref, title) => toggleOnList(ref, title)}
                listThemes={listThemeGroups}
                prefs={shopping}
                onPref={(key, value) => change((s) => setIn(s, 'shopping', key, value))}
                pageCss={cardPageCss}
              />
            </div>
          )}
          {settingsOpen && (
            <div class="panel" id="panel-settings" role="tabpanel" aria-labelledby="view-settings" tabIndex={-1} ref={settingsPanel}>
              <SettingsPanel
                section={section}
                settings={settings}
                change={change}
                entries={entries}
                loaded={loadedById}
                labelOf={labelOf}
                actions={sourceActions}
                prefersDark={prefersDark}
                recipeThemes={recipeThemeGroups}
                listThemes={listThemeGroups}
                chartThemes={chartThemeGroups}
                chartFonts={chartFontMenu}
                defaultTheme={{
                  card: pickRecipeTheme(recipeThemeGroups.flatMap((g) => g.entries), null)?.id ?? '',
                  list: pickListTheme(listThemeGroups.flatMap((g) => g.entries), null)?.id ?? '',
                  chart: pickChartTheme(chartThemeGroups.flatMap((g) => g.entries), null)?.id ?? '',
                }}
                wakeSupported={WAKE_SUPPORTED}
                storage={{ available: storageOk, readOnly: boot.readOnly, problem: boot.problem }}
                listCount={listRefs.length}
                onAnnounce={setAnnouncement}
                build={BUILD}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** One row of the recipe list. */
interface RowData {
  ref: ListRef;
  title: string;
  entry: CatalogEntry | undefined;
  /** The search result the row stands for; null when browsing. */
  hit: SearchHit | null;
}

/** What Settings › About and Data say of this build. */
const BUILD = { about: aboutBuild, hosts: requestHosts({ localServer, fontMode }), localServer, site: SITE };

const WAKE_SUPPORTED = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * Hold a screen wake lock while `active`: asked for when it becomes active and again each time
 * the page comes back into view (the browser lets go of it when the page is hidden), let go of
 * when it stops being active. `held`: the browser keeps the screen on now; `failed`: it refused.
 */
function useWakeLock(active: boolean): { held: boolean; failed: boolean } {
  const [held, setHeld] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const got = await navigator.wakeLock.request('screen');
        if (!live) {
          got.release().catch(() => {});
          return;
        }
        lock = got;
        setHeld(true);
        setFailed(false);
        got.addEventListener('release', () => live && setHeld(false));
      } catch {
        if (live) {
          setHeld(false);
          setFailed(true);
        }
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
      setHeld(false);
      setFailed(false);
    };
  }, [active]);
  return { held, failed };
}

// -------------------------------------------------------------------- sources

function ListHeader(props: {
  hits: SearchHit[] | null;
  /** Rows on show (after the shopping-list filter). */
  shown: number;
  total: number;
  sources: LoadedSource[];
  shopping: boolean;
  listCount: number;
  filtering: boolean;
  onFilter: () => void;
  /** The source the list is narrowed to ('' for all), and how to change it. */
  only: string;
  onOnly: (id: string) => void;
  /** How many sources could not be loaded. */
  failed: number;
  onSettings: () => void;
}) {
  const loading = props.sources.some((s) => s.status === 'loading');
  const nameOnly = props.sources.filter((s) => s.nameOnly).map((s) => s.source.label);
  const count = props.filtering
    ? props.hits
      ? `${props.shown} of the ${props.listCount} on the list ${props.shown === 1 ? 'matches' : 'match'}`
      : `${props.shown} on the list`
    : props.hits
      ? `${props.hits.length} match${props.hits.length === 1 ? '' : 'es'}`
      : `${props.total} recipes`;
  return (
    <div class="list-head">
      <div class="list-head-line">
        {/* The count is announced as it changes (a search, a source filter, the list filter). */}
        <span aria-live="polite">
          {count}
          {props.shopping && !props.filtering && ' · click to add or remove'}
          {loading && ' · loading…'}
        </span>
        {/* With two or more sources, the count line narrows the list to one of them. */}
        {props.sources.length > 1 && !props.filtering && (
          <label class="source-filter">
            <span aria-hidden="true">in</span>
            <select value={props.only} aria-label="Show recipes from" onChange={(e) => props.onOnly((e.target as HTMLSelectElement).value)}>
              <option value="">All sources</option>
              {props.sources.map((s) => (
                <option key={s.source.id} value={s.source.id} disabled={s.status !== 'ready' && props.only !== s.source.id}>
                  {s.source.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {props.shopping && (props.listCount > 0 || props.filtering) && (
          <button id="list-filter" class="list-filter" aria-pressed={props.filtering} onClick={props.onFilter}>
            {props.filtering ? 'Show all' : `Only the ${props.listCount} on the list`}
          </button>
        )}
        {!props.shopping && props.hits && (
          <span class="esc-hint" aria-hidden="true">
            Esc clears
          </span>
        )}
      </div>
      {props.hits && nameOnly.length > 0 && <div class="hint">Names only for {nameOnly.join(', ')} (no catalog.json).</div>}
      {props.failed > 0 && (
        <div class="hint failed-hint">
          {props.failed} {props.failed === 1 ? 'source' : 'sources'} could not load ·{' '}
          <button class="list-filter" onClick={props.onSettings}>
            Settings
          </button>
        </div>
      )}
      {/* Shown while a row has the keyboard focus on the Shopping list tab; every row points to it. */}
      {props.shopping && (
        <div class="hint key-hint" id="cart-key-hint">
          Space puts the recipe on the shopping list or takes it off; Enter opens it.
        </div>
      )}
    </div>
  );
}

/** The three top-level views. Real tabs: arrow keys, Home and End move between them (and open them). */
function ViewTabs(props: { view: View; count: number; onView: (view: View) => void }) {
  const order: View[] = ['recipes', 'list', 'settings'];
  const ids: Record<View, string> = { recipes: 'view-recipes', list: 'view-list', settings: 'view-settings' };
  const panels: Record<View, string> = { recipes: 'panel-recipes', list: 'panel-list', settings: 'panel-settings' };
  const onKeyDown = (e: KeyboardEvent) => {
    const i = order.indexOf(props.view);
    const next =
      e.key === 'ArrowRight' ? order[(i + 1) % 3] : e.key === 'ArrowLeft' ? order[(i + 2) % 3] : e.key === 'Home' ? order[0] : e.key === 'End' ? order[2] : null;
    if (next === null) return;
    e.preventDefault();
    props.onView(next);
    document.getElementById(ids[next])?.focus();
  };
  const tab = (view: View, label: ComponentChildren) => (
    <button
      id={ids[view]}
      role="tab"
      aria-selected={props.view === view}
      aria-controls={panels[view]}
      tabIndex={props.view === view ? 0 : -1}
      class={`${props.view === view ? 'on' : ''} view-${view}`}
      onClick={() => props.onView(view)}
      onKeyDown={onKeyDown}
    >
      {label}
    </button>
  );
  return (
    <div class="views" role="tablist" aria-label="View">
      {tab('recipes', 'Recipes')}
      {tab(
        'list',
        <>
          <CartIcon on={false} size={15} />
          Shopping list
          {/* Always shown; 0 is a quiet outlined pill. Read out as words. */}
          <span class={`count${props.count === 0 ? ' zero' : ''}`} aria-hidden="true">
            {props.count}
          </span>
          <span class="visually-hidden">
            , {props.count} {props.count === 1 ? 'recipe' : 'recipes'}
          </span>
        </>,
      )}
      {tab('settings', 'Settings')}
    </div>
  );
}

/** A shopping cart, drawn; filled and checked when the recipe is on the list. */
function CartIcon(props: { on: boolean; size?: number }) {
  const size = props.size ?? 18;
  return (
    <svg class="cart-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M2.5 3.5h2.6l2.4 11.2h10.4l2.1-7.9H6.3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      {props.on && <path d="M6.6 7.6h13l-1.7 6.3H7.9z" fill="currentColor" />}
      {props.on && <path class="cart-check" d="M10 10.6l1.8 1.8 3.4-3.4" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />}
      <circle cx="9" cy="19.2" r="1.6" fill="currentColor" />
      <circle cx="16.6" cy="19.2" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** `text` with the words matching `terms` in <mark>. */
function Highlighted(props: { text: string; terms: string[] }) {
  return <>{segments(props.text, props.terms).map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : s.text))}</>;
}

function ListItem(props: {
  /** The row's place in the list, for the arrow keys. */
  index: number;
  /** True for the one row the Tab key stops at. */
  tabStop: boolean;
  onFocusRow: () => void;
  title: string;
  detail: string;
  /** The search terms to highlight in the title and the second line. */
  terms: string[];
  sourceLabel: string;
  active: boolean;
  /** True on the Shopping list tab: the row puts its recipe on the list or takes it off, and has its own Open. */
  shopping: boolean;
  onList: boolean;
  onToggleList: () => void;
  onOpen: () => void;
}) {
  return (
    <div class={`item-row${props.shopping ? ' with-cart' : ''}${props.onList ? ' listed' : ''}`} data-row={props.index}>
      <button
        class={`item${props.active ? ' active' : ''}`}
        tabIndex={props.tabStop ? 0 : -1}
        aria-current={props.active ? 'true' : undefined}
        // On the Shopping list tab the row is a switch: pressed when its recipe is on the list.
        aria-pressed={props.shopping ? props.onList : undefined}
        aria-describedby={props.shopping ? 'cart-key-hint' : undefined}
        onFocus={props.onFocusRow}
        onClick={props.shopping ? props.onToggleList : props.onOpen}
      >
        {props.shopping && (
          <span class="item-check">
            <CartIcon on={props.onList} size={16} />
          </span>
        )}
        <span class="item-text">
          <span class="item-title">
            <Highlighted text={props.title} terms={props.terms} />
          </span>
          {(props.detail || props.sourceLabel) && (
            <span class="item-detail">
              {props.sourceLabel && <span class="item-source">{props.sourceLabel}</span>}
              <Highlighted text={props.detail} terms={props.terms} />
            </span>
          )}
        </span>
        {!props.shopping && props.onList && (
          // Not a control: a mark that the recipe is on the list (the Shopping list tab changes that).
          <span class="item-mark" title="On the shopping list">
            <CartIcon on={true} size={15} />
            <span class="visually-hidden">, on the shopping list</span>
          </span>
        )}
      </button>
      {props.shopping && (
        // Not a Tab stop of its own: from the keyboard, Enter on the row does the same.
        <button class="item-open" tabIndex={-1} aria-label={`Open ${props.title}`} onClick={props.onOpen}>
          Open
        </button>
      )}
    </div>
  );
}

/** Where the site's own recipes stand for this reader: none (no default), listed, hidden, or removed. */
type SiteState = 'none' | 'shown' | 'hidden' | 'removed';

const ON_THIS_COMPUTER = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/**
 * The landing page (welcome.ts decides which form). The full welcome says what Etna is, shows it
 * on one of the site's own recipes, names a few of them in the source's own order, and says how
 * to add recipes and host a viewer. The short form is the mark, one line, and a way back to it.
 */
function Welcome(props: {
  form: 'full' | 'short';
  sources: LoadedSource[];
  discovered: boolean;
  site: SiteState;
  /** The site's default source, with what the build read of it. */
  siteSource: { id: string; label: string; welcome: SiteWelcome | null } | null;
  sourceUrl: string | null;
  /** False when this browser keeps nothing: hiding the welcome then lasts for the visit. */
  remembered: boolean;
  onShow: () => void;
  onHide: () => void;
  onSources: () => void;
  onOpen: (sourceId: string, slug: string, tab: Tab) => void;
}) {
  const site = props.siteSource;
  const welcome = props.site === 'shown' && site ? site.welcome : null;
  /** A link to one of the site's recipes, on one of its tabs: a real address, opened in place. */
  const recipeLink = (slug: string, tab: Tab, children: ComponentChildren) => (
    <a
      href={`#/${encodeURIComponent(site!.id)}/${encodeURIComponent(slug)}/${tab}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        props.onOpen(site!.id, slug, tab);
      }}
    >
      {children}
    </a>
  );
  const sourcesButton = (
    <button class="link inline" onClick={props.onSources}>
      Settings › Sources
    </button>
  );

  if (props.form === 'short') {
    const none = props.sources.length === 0 && props.discovered;
    return (
      <div class="empty welcome short">
        <MarkIcon svg={MARK_SVG} size={48} class="welcome-mark" />
        {none ? (
          <>
            <h2>No recipe source yet</h2>
            <p>
              Add a public GitHub repository of Etna recipes in {sourcesButton}
              {ON_THIS_COMPUTER() ? (
                <>
                  , or run <code>etna serve &lt;folder&gt;</code> to browse a collection on this computer
                </>
              ) : null}
              .
            </p>
          </>
        ) : (
          <>
            <h2 class="visually-hidden">Pick a recipe</h2>
            <p>Pick a recipe from the list, or search by name, by an ingredient you have on hand, or by a word from the method.</p>
          </>
        )}
        <p>
          <button class="link" onClick={props.onShow}>
            Show the welcome
          </button>
        </p>
      </div>
    );
  }

  const example = welcome?.example ?? null;
  const samples = welcome?.samples ?? [];
  const others = welcome ? welcome.count - samples.length : 0;
  const see = (tab: Tab, label: string) =>
    example && (
      <>
        {' '}
        See it in {recipeLink(example.slug, tab, `${example.title}’s ${label} tab`)}.
      </>
    );
  const Samples = welcome?.ordered ? 'ol' : 'ul';
  return (
    <div class="empty welcome full">
      <div class="welcome-head">
        <MarkIcon svg={MARK_SVG} size={88} class="welcome-mark" />
        <h2>Welcome to Etna</h2>
      </div>
      <p class="welcome-lead">{ETNA_IS}</p>

      <h3>One recipe, three ways</h3>
      <ul class="welcome-ways">
        <li>
          A recipe is one Markdown file, plain text that any editor opens.{see('source', 'Source')}
        </li>
        <li>
          It prints as a card, in a style you choose.{see('card', 'Card')}
        </li>
        <li>
          When each ingredient is listed at the step that uses it, it is drawn as a flow chart.{see('chart', 'Flow chart')}
        </li>
      </ul>

      {samples.length > 0 && (
        <>
          <h3>Example recipes bundled with Etna</h3>
          <Samples class="welcome-samples">
            {samples.map((r) => (
              <li key={r.slug}>
                {recipeLink(r.slug, 'card', r.title)}
                {r.line && <span class="welcome-line">{codeSpans(r.line)}</span>}
              </li>
            ))}
          </Samples>
          {others > 0 && <p>Plus {others} more in the recipe list.</p>}
        </>
      )}

      <h3>Your own recipes</h3>
      <p>
        Add a public GitHub repository of Etna recipes in {sourcesButton}, and its recipes join the list. This browser remembers it.
        {props.site === 'shown' && ' The recipes this site comes with can be hidden or removed in Settings.'}
        {props.site === 'hidden' && ' The recipes this site comes with are hidden; you can show them again there.'}
        {props.site === 'removed' && ' You removed the recipes this site comes with; you can put them back there.'}
        {ON_THIS_COMPUTER() && (
          <>
            {' '}
            On this computer, <code>etna serve &lt;folder&gt;</code> lists a collection of your own.
          </>
        )}
      </p>

      {props.sourceUrl && (
        <>
          <h3>Your own viewer</h3>
          <p>
            To host a viewer like this one, with your own recipes as the ones it comes with, see the{' '}
            <a href={readmeUrl(props.sourceUrl)}>project’s README</a>.
          </p>
        </>
      )}

      <p class="welcome-hide">
        <button class="link" onClick={props.onHide}>
          Hide this welcome
        </button>
        {props.remembered && ' & your browser will remember.'}
      </p>
    </div>
  );
}

/** Text with `code` in backticks, as the build keeps it from a README (site-source.ts), shown as code. */
function codeSpans(text: string): ComponentChildren {
  return text.split(/(`[^`]*`)/).map((part, i) => (i % 2 === 1 ? <code key={i}>{part.slice(1, -1)}</code> : part));
}

/** The project's README: on GitHub, the file on the default branch (as About's links have it); elsewhere the repository's address. */
function readmeUrl(sourceUrl: string): string {
  return new URL(sourceUrl).hostname === 'github.com' ? `${sourceUrl}/blob/main/README.md` : sourceUrl;
}

// --------------------------------------------------------------------- recipe

function RecipeView(props: {
  source: RepoSource;
  path: string;
  title: string;
  tab: Tab;
  onTab: (t: Tab) => void;
  marks: string[];
  onClearMarks: () => void;
  themes: ThemeGroup[];
  themeChoice: string | null;
  onTheme: (id: string) => void;
  chartThemes: ChartThemeGroup[];
  chartThemeChoice: string | null;
  onChartTheme: (id: string) => void;
  joinEdges: ChartJoinEdges | null;
  onJoinEdges: (value: ChartJoinEdges) => void;
  shape: ChartShape;
  onShape: (value: ChartShape) => void;
  /** The app's colors for a chart theme with `palette: app`; null: the theme's own. */
  appPalette: AppPalette | null;
  /** The same palette's light scheme, which a chart PDF is drawn in; null: the theme's own. */
  lightPalette: AppPalette | null;
  /** The card style's type for a chart theme with `fonts: card`; null: the theme's own. */
  cardType: CardType | null;
  /** The chart toolbar's Font menu: the value it shows and its entries, in order. */
  fontMenu: ChartFontMenu;
  onFonts: (value: string) => void;
  /** "Screen stays on"; null where the browser cannot keep the screen on. */
  wake: { on: boolean; held: boolean; failed: boolean; onToggle: () => void } | null;
  /** The card's remembered print choices, and how to change one. */
  prefs: CardSettings;
  onPref: (key: keyof CardSettings, value: unknown) => void;
  /** The flow chart's remembered choices (its print margin is read from here). */
  chartPrefs: ChartSettings;
  /** The screen-only style for the card's page (corners, colors), or null. */
  pageCss: string | null;
}) {
  const [page, setPage] = useState<RecipePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The line a Check finding sent the reader to, marked on the Source tab until they leave it.
  const [lineTarget, setLineTarget] = useState<number | null>(null);
  useEffect(() => {
    if (props.tab !== 'source') setLineTarget(null);
  }, [props.tab]);

  useEffect(() => {
    let live = true;
    readRecipePage(props.source, props.path).then(
      (p) => live && setPage(p),
      (e) => live && setError(String(e?.message ?? e)),
    );
    return () => {
      live = false;
    };
  }, [props.source, props.path]);
  if (error) return <Problem title="This recipe could not be loaded" detail={error} />;
  if (!page) return <div class="empty">Loading…</div>;
  const analysis = page.analysis;

  const findings = analysis.findings.ok ? analysis.findings.value : [];
  const badge = checkBadge(findings);
  const structured = analysis.recipe.ok && analysis.recipe.value.form === 'structured';
  const link = props.source.link(props.path);
  const wake = props.wake;

  return (
    <article class="recipe">
      <div class="recipe-head">
        <h2>{props.title}</h2>
        {link && (
          <a href={link} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        )}
        {wake && (
          <button
            class="wake"
            aria-pressed={wake.on}
            onClick={wake.onToggle}
            title={
              wake.on
                ? wake.failed
                  ? 'The browser did not keep the screen on just now; it will try again when you come back to this tab'
                  : 'The screen stays on while a recipe is open. Click to let it dim as usual.'
                : 'Keep the screen from dimming while a recipe is open'
            }
          >
            <SunIcon />
            Screen stays on
            {wake.on && wake.failed && <span class="wake-note"> (not now)</span>}
          </button>
        )}
      </div>
      {/* Real tabs: one Tab stop; Left, Right, Home and End move between them (and open them).
          The views of the recipe come first; the file tools sit apart at the end, quieter. */}
      <div
        class="tabs"
        role="tablist"
        aria-label="Recipe views"
        onKeyDown={(e) => {
          const next = moveTab(
            e.key,
            TABS.findIndex((t) => t.id === props.tab),
            TABS.length,
          );
          if (next === null) return;
          e.preventDefault();
          props.onTab(TABS[next].id);
          document.getElementById(`recipe-tab-${TABS[next].id}`)?.focus();
        }}
      >
        {TABS.map((t, i) => (
          <Fragment key={t.id}>
            {t.group === 'tool' && TABS[i - 1]?.group === 'view' && <span class="tabs-gap" aria-hidden="true" />}
            <button
              id={`recipe-tab-${t.id}`}
              role="tab"
              aria-selected={props.tab === t.id}
              aria-controls="recipe-pane"
              tabIndex={props.tab === t.id ? 0 : -1}
              class={`${props.tab === t.id ? 'on' : ''}${t.group === 'tool' ? ' tool' : ''}`}
              onClick={() => props.onTab(t.id)}
            >
              {t.label}
              {t.id === 'check' && badge && <Badge kind={badge.kind} count={badge.count} />}
            </button>
          </Fragment>
        ))}
      </div>
      <div class="pane" id="recipe-pane" role="tabpanel" aria-labelledby={`recipe-tab-${props.tab}`}>
        {props.tab === 'card' && (
          <CardPane
            analysis={analysis}
            picture={page.picture}
            marks={props.marks}
            onClearMarks={props.onClearMarks}
            themes={props.themes}
            themeChoice={props.themeChoice}
            onTheme={props.onTheme}
            prefs={props.prefs}
            onPref={props.onPref}
            pageCss={props.pageCss}
          />
        )}
        {props.tab === 'chart' && (
          <ChartPane
            analysis={analysis}
            structured={structured}
            themes={props.chartThemes}
            themeChoice={props.chartThemeChoice}
            onTheme={props.onChartTheme}
            joinEdges={props.joinEdges}
            onJoinEdges={props.onJoinEdges}
            shape={props.shape}
            onShape={props.onShape}
            appPalette={props.appPalette}
            lightPalette={props.lightPalette}
            cardType={props.cardType}
            fontMenu={props.fontMenu}
            onFonts={props.onFonts}
            paper={props.prefs.paper ?? null}
            margin={props.chartPrefs.margin ?? null}
          />
        )}
        {props.tab === 'format' && <FormatPane source={analysis.source} />}
        {props.tab === 'check' && (
          <CheckPane
            analysis={analysis}
            onLine={(line) => {
              setLineTarget(line);
              props.onTab('source');
            }}
          />
        )}
        {props.tab === 'source' && <SourcePane source={analysis.source} marks={props.marks} target={lineTarget} />}
      </div>
    </article>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
      </g>
    </svg>
  );
}

/** The recipe file as written, line by line; `target` (1-based) is marked, scrolled to and given the focus. */
function SourcePane(props: { source: string; marks: string[]; target: number | null }) {
  const lines = useMemo(() => props.source.split('\n'), [props.source]);
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (props.target === null) return;
    const line = pre.current?.querySelector<HTMLElement>(`[data-line="${props.target}"]`);
    if (!line) return;
    line.scrollIntoView({ block: 'center' });
    line.focus({ preventScroll: true });
  }, [props.target]);
  return (
    <pre class="source" ref={pre}>
      {lines.map((text, i) => {
        const n = i + 1;
        const target = n === props.target;
        return (
          <span key={n} class={`src-line${target ? ' target' : ''}`} data-line={n} tabIndex={target ? -1 : undefined}>
            {target && <span class="visually-hidden">Line {n}: </span>}
            {marked(text, props.marks)}
            {/* The marked line is a block of its own, which ends the line. */}
            {!target && i < lines.length - 1 ? '\n' : ''}
          </span>
        );
      })}
    </pre>
  );
}

/** The number of problems on the Check tab; read out as words ("Check, 1 warning"), not run into the tab's name. */
function Badge(props: { kind: 'error' | 'warning'; count: number }) {
  return (
    <>
      <span class={`badge ${props.kind}`} aria-hidden="true">
        {props.count}
      </span>
      <span class="visually-hidden">
        , {props.count} {props.kind}
        {props.count === 1 ? '' : 's'}
      </span>
    </>
  );
}

function Problem(props: { title: string; detail: string }) {
  return (
    <div class="problem">
      <strong>{props.title}</strong>
      <div>{props.detail}</div>
    </div>
  );
}

/** `text` with the words matching `terms` wrapped in <mark>. */
function marked(text: string, terms: string[]): ComponentChildren {
  const ranges = matchRanges(text, terms);
  if (ranges.length === 0) return text;
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) out.push(text.slice(at, r.start));
    out.push(<mark>{text.slice(r.start, r.end)}</mark>);
    at = r.end;
  }
  out.push(text.slice(at));
  return out;
}

/** Remove earlier highlights from a card document, then mark the words matching `terms`. */
/** True for the card document this page wrote into the frame (not a page the frame was sent to). */
function isCardDocument(doc: Document): boolean {
  try {
    return doc.location.href === 'about:srcdoc';
  } catch {
    return false;
  }
}

/**
 * Links inside the card never navigate its frame. A link to another place on the card scrolls
 * there; a web link opens in a new tab, opened by this page (the frame may not open windows);
 * anything else does nothing.
 */
function guardLinks(doc: Document): void {
  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const link = target?.closest?.('a[href], area[href]');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      doc.getElementById(decodeURIComponentSafe(href.slice(1)))?.scrollIntoView();
      return;
    }
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return; // relative: there is nothing for it to be relative to
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') window.open(url.href, '_blank', 'noopener,noreferrer');
  };
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('auxclick', onClick, true);
}

function decodeURIComponentSafe(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The screen-only style of the card's page: the corners chosen in Settings (Square, Round) and
 * the colors (card-palette.ts). Null adds nothing, so the card is as the renderer drew it. The
 * style is added to the document in the frame, which the card's Content-Security-Policy allows
 * (`style-src 'unsafe-inline'`). Printing is never touched: every rule is inside `@media screen`,
 * and Print opens the card document as the renderer wrote it.
 */
function shapePage(doc: Document, css: string | null): void {
  if (!doc.head) return;
  let style = doc.getElementById('etna-page-style');
  if (css === null) {
    style?.remove();
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = 'etna-page-style';
    doc.head.append(style);
  }
  if (style.textContent !== css) style.textContent = css;
}

/** Show a focus ring on the frame while the card inside it has the focus (a frame never matches :focus itself). */
function ringWhileFocused(doc: Document, frame: HTMLIFrameElement): void {
  const win = doc.defaultView;
  if (!win) return;
  frame.classList.toggle('has-focus', doc.hasFocus());
  win.addEventListener('focus', () => frame.classList.add('has-focus'));
  win.addEventListener('blur', () => frame.classList.remove('has-focus'));
}

function highlightDocument(doc: Document, terms: string[]): number {
  for (const m of [...doc.querySelectorAll('mark.etna-hit')]) m.replaceWith(doc.createTextNode(m.textContent ?? ''));
  doc.body.normalize();
  if (terms.length === 0) return 0;
  if (!doc.getElementById('etna-hit-style')) {
    const style = doc.createElement('style');
    style.id = 'etna-hit-style';
    // Highlights are for the screen only; a printed card never shows them. No padding: the card
    // is already cut into pages, and a highlight must not move a line.
    // The color is the app's `mark` (card-palette.ts sets --etna-hit), under the card's own ink,
    // as in the rest of the app; without it, the browser's own mark color.
    style.textContent = 'mark.etna-hit{background:var(--etna-hit,Mark);color:inherit;padding:0;box-shadow:0 0 0 1px var(--etna-hit,Mark);border-radius:1px}@media print{mark.etna-hit{background:none;box-shadow:none}}';
    doc.head.append(style);
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let count = 0;
  for (const node of nodes) {
    const text = node.data;
    const ranges = matchRanges(text, terms);
    if (ranges.length === 0) continue;
    const pieces: (string | Node)[] = [];
    let at = 0;
    for (const r of ranges) {
      if (r.start > at) pieces.push(text.slice(at, r.start));
      const mark = doc.createElement('mark');
      mark.className = 'etna-hit';
      mark.textContent = text.slice(r.start, r.end);
      pieces.push(mark);
      at = r.end;
      count++;
    }
    pieces.push(text.slice(at));
    node.replaceWith(...pieces);
  }
  return count;
}

function CardPane(props: {
  analysis: Analysis;
  /** The recipe's picture, null when it has none the app can show. */
  picture: { src: string } | null;
  marks: string[];
  onClearMarks: () => void;
  themes: ThemeGroup[];
  themeChoice: string | null;
  onTheme: (id: string) => void;
  prefs: CardSettings;
  onPref: (key: keyof CardSettings, value: unknown) => void;
  pageCss: string | null;
}) {
  // A remembered theme that is gone (or not loaded yet), or a list theme, falls back to the default, silently.
  const entry = pickRecipeTheme(
    props.themes.flatMap((g) => g.entries),
    props.themeChoice,
  );
  if (!props.analysis.recipe.ok) return <Problem title="This recipe could not be read" detail={props.analysis.recipe.error} />;
  if (!entry) return <Problem title="No card style is available" detail="None of the card styles could be read." />;
  const recipe = props.analysis.recipe.value;
  return (
    <PagedCard
      themes={props.themes}
      entry={entry}
      onTheme={props.onTheme}
      render={(e, print) => card(recipe, e, { ...print, picture: props.prefs.picture === false ? null : props.picture })}
      prefs={props.prefs}
      onPref={(key, value) => props.onPref(key, value)}
      offerParts={offersPartsChoice(entry, recipe)}
      offerNotes={hasRecipeNotes(recipe)}
      offerPicture={offersPicture(entry, props.picture)}
      pageCss={props.pageCss}
      frameTitle="Recipe card"
      marks={props.marks}
      onClearMarks={props.onClearMarks}
    />
  );
}

/**
 * A card in its frame, with the controls to print it: theme, style, paper, size, Print, and
 * the page count the paging script reports. Shared by the Card tab and the shopping list.
 * `render` makes the card document for the chosen theme, style and print settings; the paper,
 * size, parts and notes are the remembered `prefs` (settings.ts), changed through `onPref`.
 */
function PagedCard(props: {
  themes: ThemeGroup[];
  entry: ThemeEntry;
  onTheme: (id: string) => void;
  render: (entry: ThemeEntry, print: PrintChoice) => Outcome<string>;
  prefs: { paper?: string; size?: string; parts?: 'paired' | 'sections'; notes?: boolean; picture?: boolean };
  onPref: (key: 'paper' | 'size' | 'parts' | 'notes' | 'picture', value: unknown) => void;
  /** True when the card can be shown both ways (parts with their steps, or in one list). */
  offerParts?: boolean;
  /** True when the recipe has notes the card can print. */
  offerNotes?: boolean;
  /** True when the recipe has a picture and the style a place for it. */
  offerPicture?: boolean;
  /** A screen-only style for the page inside the frame (corners and colors), or null. */
  pageCss: string | null;
  frameTitle: string;
  marks?: string[];
  onClearMarks?: () => void;
}) {
  const all = props.themes.flatMap((g) => g.entries);
  // The menu's names: cut to fit the toolbar, the full name in each tooltip.
  const names = toolbarNames(all);
  const entry = props.entry;
  const marks = props.marks ?? [];
  const [found, setFound] = useState(0);
  // The theme notes ("why?") shown under the toolbar.
  const [aboutOpen, setAboutOpen] = useState(false);
  // Print the recipe's notes on the card: off unless asked for.
  const notes = props.offerNotes ? props.prefs.notes === true : false;
  // Paper and size, remembered like the theme. The paper falls back to the theme's own when the
  // theme does not support it; the size is `auto` (fitted) or a size such as `10.5pt`.
  const paperChoice = props.prefs.paper ?? null;
  const sizeChoice = props.prefs.size ?? 'auto';
  // Parts beside their steps (the theme's way) or in the two classic sections.
  const partsChoice = props.prefs.parts === 'sections' ? 'sections' : 'paired';
  const parts = props.offerParts ? partsChoice : null;
  const [paged, setPaged] = useState<Paged | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const printButton = useRef<HTMLButtonElement>(null);
  const choices = printChoices(entry, paperChoice);
  const highlight = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setFound(highlightDocument(doc, marks));
  };
  // The card pages itself after it loads; highlight once it has (and again for new marks), so
  // the marks are in the pages and not in the flow the script replaces.
  const pagingDone = (doc: Document) => {
    const state = doc.documentElement.getAttribute('data-paged');
    return state === 'done' || state === 'failed' || state === null;
  };
  const readPaged = (doc: Document) => {
    const root = doc.documentElement;
    setPaged({
      pages: root.hasAttribute('data-pages') ? Number(root.getAttribute('data-pages')) : null,
      size: root.getAttribute('data-size'),
      failed: root.getAttribute('data-paged') === 'failed',
    });
    shapePage(doc, pageCssNow.current);
    fitSheets(doc);
    if (frame.current) ringWhileFocused(doc, frame.current);
    highlight();
  };
  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    // The frame shows the card and nothing else. If it was navigated (a link in a recipe, or
    // anything else), put the card back: another page there would run with the frame's rights.
    if (!doc || !isCardDocument(doc)) {
      if (frame.current && html.ok) frame.current.srcdoc = html.value;
      return;
    }
    guardLinks(doc);
    // The colors before the card is paged, so it does not show in the style's own first.
    shapePage(doc, pageCssNow.current);
    setPaged(null);
    if (pagingDone(doc)) readPaged(doc);
    else doc.addEventListener('etna-paged', () => readPaged(doc), { once: true });
  };
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    // A frame still loading may have no document element yet.
    if (doc?.documentElement && pagingDone(doc)) highlight();
  }, [props.marks]);
  // The corners and colors chosen in Settings, on the page already shown (paged or not: neither
  // moves a line). The listeners above read the latest through pageCssNow.
  const pageCssNow = useRef(props.pageCss);
  pageCssNow.current = props.pageCss;
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.documentElement && isCardDocument(doc)) shapePage(doc, props.pageCss);
  }, [props.pageCss]);
  // Fitted again when the frame changes width (a phone turned, a window resized), once paged.
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      const doc = el.contentDocument;
      if (doc?.documentElement && isCardDocument(doc) && pagingDone(doc)) fitSheets(doc);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame.current]);
  const html = props.render(entry, { paper: choices.paper || null, size: sizeChoice, parts, notes });
  const failed = all.filter((e) => !isAvailable(e));
  const hasAbout = failed.length > 0 || entry.warnings.length > 0;
  const looks = all.length > 1 || hasAbout || !!props.offerParts || !!props.offerNotes || !!props.offerPicture;
  const prints = choices.papers.length > 1 || choices.sizes.length > 0;
  return (
    <div class="card-pane">
      <div class="toolbar card-toolbar">
        {looks && (
        <div class="tool-group" role="group" aria-label="How it looks">
        {all.length > 1 && (
          <label>
            Style{' '}
            <select value={entry.id} title={names.get(entry.id)?.title} onChange={(e) => props.onTheme((e.target as HTMLSelectElement).value)}>
              {props.themes.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.entries.map((t) => (
                    <option key={t.id} value={t.id} disabled={!isAvailable(t)} title={names.get(t.id)?.title}>
                      {isAvailable(t) ? names.get(t.id)?.text : `${names.get(t.id)?.text} (unavailable)`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {hasAbout && (
          <button class="why" aria-expanded={aboutOpen} onClick={() => setAboutOpen(!aboutOpen)} title="Why some styles cannot be used, and notes on this one">
            {failed.length > 0 ? 'why?' : 'notes'}
          </button>
        )}
        {props.offerParts && (
          <label title="Where each part's ingredients go: beside that part's steps, or all together in one list">
            Ingredients{' '}
            <select
              value={partsChoice}
              onChange={(e) => {
                props.onPref('parts', (e.target as HTMLSelectElement).value === 'sections' ? 'sections' : 'paired');
              }}
            >
              <option value="paired">With each part</option>
              <option value="sections">In one list</option>
            </select>
          </label>
        )}
        {props.offerNotes && (
          <label class="check" title="Print the recipe's notes on the card">
            <input
              type="checkbox"
              checked={notes}
              onChange={(e) => {
                props.onPref('notes', (e.target as HTMLInputElement).checked);
              }}
            />
            Notes
          </label>
        )}
        {props.offerPicture && (
          <label class="check" title="Show the recipe's picture on the card, and print it">
            <input
              type="checkbox"
              checked={props.prefs.picture !== false}
              onChange={(e) => {
                props.onPref('picture', (e.target as HTMLInputElement).checked);
              }}
            />
            Picture
          </label>
        )}
        </div>
        )}
        {prints && (
        <div class="tool-group" role="group" aria-label="How it prints">
        {choices.papers.length > 1 && (
          <label>
            Paper size{' '}
            <select
              value={choices.paper}
              onChange={(e) => {
                props.onPref('paper', (e.target as HTMLSelectElement).value);
              }}
            >
              {choices.papers.map((p) => (
                <option key={p} value={p}>
                  {PAPER_LABELS[p] ?? p}
                </option>
              ))}
            </select>
          </label>
        )}
        {choices.sizes.length > 0 && (
          <label>
            Text size{' '}
            <select
              value={sizeChoice}
              onChange={(e) => {
                props.onPref('size', (e.target as HTMLSelectElement).value);
              }}
            >
              <option value="auto">Auto</option>
              {(choices.sizes.includes(parseFloat(sizeChoice)) || sizeChoice === 'auto' ? choices.sizes : [...choices.sizes, parseFloat(sizeChoice)].sort((a, b) => a - b)).map((s) => (
                <option key={s} value={`${s}pt`}>
                  {s} pt{s === choices.base ? ' (style)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        </div>
        )}
        {marks.length > 0 && (
          <div class="tool-group marks">
            <mark>{found}</mark> search {found === 1 ? 'match' : 'matches'} highlighted{' '}
            <button
              aria-label="Clear the search highlights"
              onClick={() => {
                props.onClearMarks?.();
                // This button goes with the highlights: keep the focus in the toolbar.
                printButton.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
        )}
        <div class="tool-group end">
        <span class="paged" aria-live="polite">
          {paged === null
            ? 'paging…'
            : paged.failed
              ? 'not paged'
              : paged.pages !== null
                ? `${paged.pages} ${paged.pages === 1 ? 'page' : 'pages'}, ${(paged.size ?? '').replace('pt', ' pt')}`
                : ''}
        </span>
        <button
          ref={printButton}
          class="primary print"
          title="Open the card in a new tab, paged, and print it"
          onClick={() => {
            // A tab of its own, not the frame: Safari prints a frame with its top cut off and
            // no margin, and a tab also gives the reader a preview. The paging script runs again
            // in the tab; print once it has paged.
            if (!html.ok) return;
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.open();
            w.document.write(html.value);
            w.document.close();
            const doc = w.document;
            const go = () => w.print();
            // With web fonts (a hosted build) the card's font stylesheet holds up its scripts, so
            // the paging script may not have started yet: no `data-paged` until it is parsed.
            const whenPaged = () => {
              if (pagingDone(doc)) go();
              else doc.addEventListener('etna-paged', go, { once: true });
            };
            if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', whenPaged, { once: true });
            else whenPaged();
          }}
        >
          <PrintIcon />
          Print
        </button>
        </div>
      </div>
      {aboutOpen && hasAbout && <ThemeNotes failed={failed} current={entry} />}
      {html.ok ? (
        // The sandbox. allow-same-origin: this page reaches into the card to highlight search
        // matches and to print it. allow-modals: the print dialog. allow-scripts: the card's paging
        // script. Together allow-scripts and allow-same-origin would let a script in the frame
        // reach this page — which is why the only script that can run there is the renderer's
        // own: the card document's Content-Security-Policy (written by the renderer, before any
        // theme content) admits exactly one script, by the SHA-256 of its text, and nothing else
        // (no other inline script, no script file, no event handler, no eval). A theme cannot
        // carry a script (parseTheme and checkTheme refuse one) and recipe text is escaped. The
        // paging script treats the card as data: it clones nodes and sets text, and loads nothing.
        // Forms, popups, navigation of this page and downloads stay forbidden.
        <iframe ref={frame} class="card-frame" title={props.frameTitle} sandbox="allow-same-origin allow-modals allow-scripts" srcdoc={html.value} onLoad={onLoad} />
      ) : (
        <Problem title="The card could not be rendered" detail={html.error} />
      )}
    </div>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round">
        <path d="M7 9V3.5h10V9" />
        <rect x="3" y="9" width="18" height="8" rx="2" />
        <path d="M7 14h10v6.5H7z" />
      </g>
    </svg>
  );
}

/** The checker's messages, as plain text: why each failed theme is unavailable, and the current theme's warnings. */
function ThemeNotes(props: { failed: ThemeEntry[]; current: ThemeEntry }) {
  const from = (t: ThemeEntry) => (t.source ? ` from ${t.source.label}` : '');
  return (
    <div class="theme-notes">
      {props.failed.map((t) => (
        <div key={t.id} class="theme-note error">
          <strong>
            The style “{t.name}”{from(t)} cannot be used:
          </strong>
          <ul>
            {t.errors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      ))}
      {props.current.warnings.length > 0 && (
        <div class="theme-note warning">
          <strong>
            Notes on “{props.current.label}”{from(props.current)}:
          </strong>
          <ul>
            {props.current.warnings.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChartPane(props: {
  analysis: Analysis;
  structured: boolean;
  themes: ChartThemeGroup[];
  themeChoice: string | null;
  onTheme: (id: string) => void;
  /** The remembered choice; null: as the chart theme has it (`separate` unless it pins `bus`). */
  joinEdges: ChartJoinEdges | null;
  onJoinEdges: (value: ChartJoinEdges) => void;
  /** What the chart is fitted to: the screen (unless chosen) or a sheet; a PDF of a screen chart prints on `auto`. */
  shape: ChartShape;
  onShape: (value: ChartShape) => void;
  /** The app's colors for a chart theme with `palette: app` (Settings > Flow chart > Colors); null: the theme's own. */
  appPalette: AppPalette | null;
  /** The same palette's light scheme: a PDF is ink on paper, drawn on a light page. */
  lightPalette: AppPalette | null;
  /** The card style's type for a chart theme with `fonts: card` (the Font menu); null: the theme's own. */
  cardType: CardType | null;
  /** The Font menu: the value it shows (`own` or a card style's id) and its entries (chartToolbarFontMenu). */
  fontMenu: ChartFontMenu;
  onFonts: (value: string) => void;
  /** The card's remembered paper; the chart prints on the same sheet (letter unless it is A4). */
  paper: string | null;
  /** The remembered page margin for a printed chart (Settings > Cards and printing). */
  margin: string | null;
}) {
  // The theme's free fonts load on first use (chart-fonts.ts): the chart is made once they have
  // arrived (a moment: they are chunks of this build), or with the stack's fallbacks should they
  // not come, at the same layout either way.
  // The families are those of the chart as drawn: in the card's fonts when it matches the card.
  const shown = chartRenderOptions(pickChartTheme(props.themes.flatMap((g) => g.entries), props.themeChoice), { cardType: props.cardType });
  const fontFamilies = chartFontFamilies(shown.ok ? shown.value.theme : undefined);
  const fontKey = fontFamilies.join('|');
  const [, fontsArrived] = useState(0);
  const [fontsFailed, setFontsFailed] = useState<string | null>(null);
  const wantsFonts = props.analysis.recipe.ok && props.structured;
  useEffect(() => {
    if (!wantsFonts || chartFontsLoaded(fontFamilies)) return;
    let live = true;
    loadChartFonts(fontFamilies)
      .then((arrived) => {
        if (live && arrived) fontsArrived((n) => n + 1);
      })
      .catch(() => {
        // No font chunk (offline, a stale page): the chart is made with its fallback fonts.
        if (live) setFontsFailed(fontKey);
      });
    return () => {
      live = false;
    };
  }, [fontKey, wantsFonts]);
  const all = props.themes.flatMap((g) => g.entries);
  // A remembered theme that is gone (or not loaded yet) falls back to the default, silently.
  const entry = pickChartTheme(all, props.themeChoice);
  const joinEdges = props.joinEdges ?? themeJoinEdges(entry);
  // What the chart is laid out for: the screen, or the sheet it prints on, so the chart on
  // screen is then the chart on paper. The card's paper (letter unless A4), the chart's margin,
  // and the fit; a PDF of a screen chart is made for that paper either way up (sheet.ts `pageShape`).
  const sheet = { paper: chartPaper(props.paper), margin: chartMargin(props.margin), shape: props.shape };
  // The chart is made in a worker (chart-lane.ts), so a large one does not freeze the page: a new
  // choice, recipe or leaving the tab abandons the one in progress, whose result never shows.
  const render = chartRenderOptions(entry, { joinEdges, sheet, appPalette: props.appPalette, cardType: props.cardType });
  const recipe = props.analysis.recipe;
  const fontsComing = wantsFonts && !chartFontsLoaded(fontFamilies) && fontsFailed !== fontKey;
  const drawn = useChart(recipe.ok && props.structured && render.ok ? { kind: 'svg', recipe: recipe.value, render: render.value, fontCss: loadedChartFontCss(fontFamilies) } : null, fontsComing);
  // Text printing under 7 pt (SMALL_PRINT) on a page and Dense printing it larger: the line under
  // the page says so and offers Dense (dense-hint.ts). Laying Dense out is as slow as the chart, so
  // that is done in a worker too, once the chart is there.
  const madeSvg = render.ok && drawn.current?.ok ? drawn.current.value : null;
  const ask = madeSvg ? denseAsk(entry, all, madeSvg, { joinEdges: props.joinEdges, sheet, cardType: props.cardType }) : null;
  const hint = useDenseHint(recipe.ok ? recipe.value : null, ask, drawn.key);
  if (!props.analysis.recipe.ok) return <Problem title="This recipe could not be read" detail={props.analysis.recipe.error} />;
  if (!props.structured) {
    return (
      <div class="empty">
        <h3>No flow chart for this recipe yet</h3>
        <p>
          A flow chart needs the structured form, where each ingredient is listed at the step that uses it. This recipe is in the traditional form (one
          ingredient list, then directions).
        </p>
      </div>
    );
  }
  // The menu's names: cut to fit the toolbar, the full name in each tooltip.
  const names = toolbarNames(all);
  const failed = all.filter((t) => t.theme === null);
  const ownFonts = chartKeepsOwnFonts(entry);
  const fontValue = ownFonts ? CHART_FONTS_OWN : props.fontMenu.value;
  // The chart asked for (null while it is being made), and the one on screen meanwhile (for a moment).
  const svg: Outcome<string> | null = render.ok ? drawn.current : render;
  const onScreen = svg ?? drawn.last;
  const title = props.analysis.recipe.value.title?.text ?? 'Flow chart';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chart';
  // The toolbar's labels are short to fit one row at 1280 px; each button's tooltip says in full what it does.
  const edgeChoice = (value: ChartJoinEdges, label: string, title: string) => (
    <button aria-pressed={joinEdges === value} title={title} onClick={() => props.onJoinEdges(value)}>
      {label}
    </button>
  );
  // The PDF is always a page: with the screen chosen it is laid out for the page either way up.
  const paperName = chartPaper(props.paper) === 'a4' ? 'A4' : 'letter';
  const pdfTitle =
    props.shape === 'screen'
      ? `Make a PDF of the chart, laid out for one ${paperName} page whichever way up prints it larger, and open it in a new tab to print`
      : `Make a PDF of the chart as shown, one ${paperName} page, and open it in a new tab to print`;
  const shapeChoice = (value: ChartShape, name: string, title: string) => (
    <button aria-pressed={props.shape === value} aria-label={name} title={title} onClick={() => props.onShape(value)}>
      <ShapeIcon shape={value} />
    </button>
  );
  return (
    <div class="chart-pane">
      <div class="toolbar chart-toolbar">
        <div class="tool-group" role="group" aria-label="How it looks">
        {all.length > 1 && (
          <label>
            Style{' '}
            <select value={entry?.id ?? ''} title={entry ? names.get(entry.id)?.title : undefined} onChange={(e) => props.onTheme((e.target as HTMLSelectElement).value)}>
              {props.themes.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.entries.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.theme === null} title={names.get(t.id)?.title}>
                      {t.theme === null ? `${names.get(t.id)?.text} (unavailable)` : names.get(t.id)?.text}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {/* The fonts: the chart style's own, or a card style's (the one in use, when following it). A chart
            style that says `fonts: own` in its theme keeps its own, and the menu says so. */}
        <label title={ownFonts ? 'This style keeps its own fonts' : undefined}>
          Font{' '}
          <select
            value={fontValue}
            disabled={ownFonts}
            title={ownFonts ? 'This style keeps its own fonts' : props.fontMenu.options.find((o) => o.value === fontValue)?.title}
            onChange={(e) => props.onFonts((e.target as HTMLSelectElement).value)}
          >
            {props.fontMenu.options.map((o) => (
              <option key={o.value} value={o.value} title={o.title}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        </div>
        <div class="tool-group" role="group" aria-label="What it shows">
        {/* Edges joining one step: each in its own lane to its own point, or down one shared lane. */}
        <div class="segmented" role="group" aria-label="Joined edges">
          <span class="segmented-label" aria-hidden="true" title="Joined edges: how edges joining one step come in">
            Edges
          </span>
          {edgeChoice('separate', 'Separate', 'Joined edges: each edge joining a step comes in along its own lane')}
          {edgeChoice('bus', 'Bus', 'Joined edges: the edges joining a step come in down one shared lane')}
        </div>
        {/* What the chart is fitted to: small pictures of the screen and of the sheet. */}
        <div class="segmented shape" role="group" aria-label="Fit to">
          {shapeChoice('screen', 'Screen', 'Fit to the screen: one column, as large as the window allows; it scrolls')}
          {shapeChoice('auto', 'Page, either way up', 'Fit to a page, whichever way up prints the chart larger: the chart as it prints')}
          {shapeChoice('portrait', 'Portrait page', 'Fit to a portrait page, the sheet upright: the chart as it prints')}
          {shapeChoice('landscape', 'Landscape page', 'Fit to a landscape page, the sheet on its side: the chart as it prints')}
        </div>
        </div>
        {onScreen?.ok && (
          <div class="tool-group end">
            <button
              class="action"
              title="Save the chart as an SVG file"
              disabled={!svg?.ok}
              onClick={() => {
                if (!svg?.ok) return;
                // Saved from a blob and a link in the page, as the PDF and the settings file are:
                // iOS Safari did nothing with a data: link that was not in the page.
                const url = URL.createObjectURL(new Blob([svg.value], { type: 'image/svg+xml' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `${slug}-chart.svg`;
                document.body.append(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
              }}
            >
              Save SVG
            </button>
            <button
              class="primary pdf"
              title={pdfTitle}
              disabled={!svg?.ok}
              onClick={async (event) => {
                // The PDF is built here, from the chart's own layout, with its fonts embedded:
                // the same file in every browser (printing the SVG was not: Safari ignored the
                // sheet, added pages, cut the frame). pdf-lib and the fonts load on first use.
                const button = event.currentTarget as HTMLButtonElement;
                // The tab opens now, in the click itself: one opened after the PDF is ready
                // (an await later) is a pop-up the browser may block.
                const tab = window.open('', '_blank');
                button.disabled = true;
                try {
                  // Ink on paper: the light scheme of the palette on screen (the SVG keeps the screen's).
                  const render = chartPdfRenderOptions(entry, { joinEdges, sheet, appPalette: props.appPalette, lightPalette: props.lightPalette, cardType: props.cardType });
                  if (!render.ok) throw new Error(render.error);
                  if (!recipe.ok) throw new Error(recipe.error);
                  // Made in a worker as well (its own lane: a new chart on screen does not abandon it).
                  const made = await pdfLane.run({ kind: 'pdf', recipe: recipe.value, render: render.value });
                  if (made === ABANDONED) return void tab?.close();
                  if (!made.ok) throw new Error(made.error);
                  if (!('pdf' in made)) throw new Error('no PDF came back');
                  const url = URL.createObjectURL(new Blob([made.pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
                  if (tab && !tab.closed) tab.location.href = url;
                  else {
                    // Opening was blocked: save the file instead.
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${slug}-chart.pdf`;
                    document.body.append(a);
                    a.click();
                    a.remove();
                  }
                  // The tab has its own copy once loaded; free the blob a while later.
                  setTimeout(() => URL.revokeObjectURL(url), 60_000);
                } catch (error) {
                  tab?.close();
                  window.alert(`The PDF could not be made: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                  button.disabled = false;
                }
              }}
            >
              PDF
            </button>
          </div>
        )}
      </div>
      {failed.length > 0 && (
        <ul class="theme-notes">
          {failed.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong>
              {t.source ? ` (${t.source.label})` : ''} cannot be used: {t.errors.join('; ')}
            </li>
          ))}
        </ul>
      )}
      {/* While a chart is made the stage says so; the chart it had stays a moment (app.css, 150 ms), then hides. */}
      <div class="chart-stage" aria-busy={drawn.pending}>
        {drawn.pending && (
          <p class="chart-waiting" role="status">
            Drawing the flow chart…
          </p>
        )}
        {onScreen?.ok && props.shape !== 'screen' ? (
          <ChartPage
            svg={onScreen.value}
            paper={sheet.paper}
            margin={sheet.margin}
            shape={props.shape}
            hint={hint}
            onDense={() => props.onTheme(DENSE_CHART_THEME)}
          />
        ) : onScreen?.ok ? (
          // Shown as an image, so nothing inside the SVG can run.
          <img class="chart" alt="Flow chart of the recipe" src={svgDataUrl(onScreen.value)} />
        ) : onScreen ? (
          <Problem title="The flow chart could not be drawn" detail={onScreen.error} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * A chart fitted to a page, shown on its page: the sheet in its own proportions, turned the
 * way it prints, with the chart scaled into the printable box and centered there as the PDF
 * places it (pdf.ts `drawPdf`). So the page's shape shows even when two shapes give the same
 * chart. The whole sheet is kept in view, as a print preview is: at most the chart's natural
 * size (a chart unit a pixel, as a chart fitted to the screen is shown), the pane's width, and
 * the height the window has left.
 * The sheet takes the chart's own background, so it reads as one piece of paper.
 * Under the caption, when the text prints small and Dense prints it larger (`hint`), one line
 * says how large, with a button that switches to Dense as the Style menu does.
 */
function ChartPage(props: { svg: string; paper: ChartPaper; margin: ChartMargin; shape: ChartShape; hint?: DenseHint | null; onDense?: () => void }) {
  const sheet = chartSheet(props.svg, props.paper, props.margin, props.shape);
  const { width, height, box } = sheet.points;
  // Read from the root element and the style block only: the recipe's title, earlier in the
  // text, may hold the same words (dag/sheet.ts).
  const vb = chartViewBox(props.svg);
  const scale = vb ? Math.min(box.width / vb.width, box.height / vb.height) : 1;
  const background = chartBackground(props.svg);
  const name = `${props.paper === 'a4' ? 'A4' : 'Letter'}, ${sheet.landscape ? 'landscape' : 'portrait'}`;
  return (
    <figure class="chart-page">
      <div
        class="chart-sheet"
        style={{
          // At most its natural size, the pane's width, and what shows the whole sheet in the window.
          width: `min(100%, ${Math.round(width / scale)}px, max(320px, calc((100vh - 270px) * ${(width / height).toFixed(4)})))`,
          aspectRatio: `${width} / ${height}`,
          background,
        }}
      >
        {/* Shown as an image, so nothing inside the SVG can run. In the printable box, centered. */}
        <img
          class="chart"
          alt="Flow chart of the recipe, on its page"
          src={svgDataUrl(props.svg)}
          style={{ left: `${(box.x / width) * 100}%`, top: `${(box.y / height) * 100}%`, width: `${(box.width / width) * 100}%`, height: `${(box.height / height) * 100}%` }}
        />
      </div>
      <figcaption>
        <span>{name}</span>
        {props.hint && (
          <span class="chart-hint">
            Text prints at {pointsText(props.hint.now)} on this page. The Dense style prints it at {pointsText(props.hint.dense)}.{' '}
            <button class="link inline" onClick={props.onDense}>
              Use Dense
            </button>
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * A Fit button's picture: the screen, a narrow rounded window with a scroll bar (screen); the
 * sheet upright (portrait), on its side (landscape), or the two over each other from one
 * corner, the upright one shaded behind (auto: either way, whichever fits). Drawn in the
 * button's text color, so it follows the palette and the pressed state; the button carries
 * the words.
 */
function ShapeIcon(props: { shape: ChartShape }) {
  if (props.shape === 'screen') {
    return (
      <svg class="shape-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
        <rect x="4" y="0.75" width="8" height="14.5" rx="2.25" />
        <line class="thumb" x1="9.75" y1="3.5" x2="9.75" y2="7.5" />
      </svg>
    );
  }
  return (
    <svg class="shape-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      {props.shape !== 'landscape' && <rect class={props.shape === 'auto' ? 'behind' : undefined} x={props.shape === 'auto' ? 1.5 : 3.5} y="1.5" width="9" height="13" rx="1" />}
      {props.shape !== 'portrait' && <rect x="1.5" y={props.shape === 'auto' ? 5.5 : 3.5} width="13" height="9" rx="1" />}
    </svg>
  );
}

function CheckPane(props: { analysis: Analysis; onLine: (line: number) => void }) {
  if (!props.analysis.findings.ok) return <Problem title="This recipe could not be checked" detail={props.analysis.findings.error} />;
  // Info findings are notes for review, not problems: listed under their own heading, never counted on the badge.
  const { problems, notes } = splitFindings(props.analysis.findings.value);
  const lineCount = props.analysis.source.split('\n').length;
  return (
    <>
      {problems.length === 0 ? <div class="empty ok">No problems found.</div> : <FindingsTable findings={problems} lineCount={lineCount} onLine={props.onLine} />}
      {notes.length > 0 && (
        <section class="findings-notes" aria-labelledby="findings-notes-heading">
          <h2 id="findings-notes-heading" class="findings-heading">
            Notes <span class="findings-heading-hint">for review, not problems</span>
          </h2>
          <FindingsTable findings={notes} lineCount={lineCount} onLine={props.onLine} />
        </section>
      )}
    </>
  );
}

function FindingsTable(props: { findings: Finding[]; lineCount: number; onLine: (line: number) => void }) {
  // A finding with a line in the file opens the Source tab there (a click anywhere on its row, or its line button).
  const hasLine = (f: Finding) => Number.isInteger(f.line) && f.line >= 1 && f.line <= props.lineCount;
  return (
    <table class="findings">
      <thead>
        <tr>
          <th>Line</th>
          <th>Level</th>
          <th>Rule</th>
          <th>What</th>
        </tr>
      </thead>
      <tbody>
        {props.findings.map((f: Finding, i: number) => (
          <tr key={i} class={`${f.severity}${hasLine(f) ? ' jump' : ''}`} onClick={hasLine(f) ? () => props.onLine(f.line) : undefined}>
            <td>
              {hasLine(f) ? (
                <button class="link line-jump" aria-label={`Line ${f.line}: show it in the source`}>
                  {f.line}
                </button>
              ) : (
                f.line || ''
              )}
            </td>
            <td>{f.severity}</td>
            <td>
              <code>{f.rule}</code>
            </td>
            <td>{f.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------- format diff

interface DiffRow {
  left: ComponentChildren;
  right: ComponentChildren;
  kind: 'same' | 'changed' | 'removed' | 'added' | 'gap';
  leftNo: number | null;
  rightNo: number | null;
}

function splitLines(text: string): string[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Pair removed and added lines side by side, with the changed words marked. */
function sideBySide(before: string, after: string, context = 2): DiffRow[] {
  const rows: DiffRow[] = [];
  let l = 1;
  let r = 1;
  const parts = diffLines(before, after);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lines = splitLines(part.value);
    if (!part.added && !part.removed) {
      for (const line of lines) rows.push({ left: line, right: line, kind: 'same', leftNo: l++, rightNo: r++ });
      continue;
    }
    if (part.removed && parts[i + 1]?.added) {
      const added = splitLines(parts[i + 1].value);
      const n = Math.max(lines.length, added.length);
      for (let k = 0; k < n; k++) {
        const a = lines[k];
        const b = added[k];
        if (a !== undefined && b !== undefined) {
          const words = diffWordsWithSpace(a, b);
          rows.push({
            left: words.filter((w) => !w.added).map((w) => (w.removed ? <del>{w.value}</del> : w.value)),
            right: words.filter((w) => !w.removed).map((w) => (w.added ? <ins>{w.value}</ins> : w.value)),
            kind: 'changed',
            leftNo: l++,
            rightNo: r++,
          });
        } else if (a !== undefined) rows.push({ left: a, right: '', kind: 'removed', leftNo: l++, rightNo: null });
        else rows.push({ left: '', right: b, kind: 'added', leftNo: null, rightNo: r++ });
      }
      i++;
      continue;
    }
    for (const line of lines) {
      if (part.removed) rows.push({ left: line, right: '', kind: 'removed', leftNo: l++, rightNo: null });
      else rows.push({ left: '', right: line, kind: 'added', leftNo: null, rightNo: r++ });
    }
  }
  // Keep only the changes and a little context around them.
  const keep = rows.map(() => false);
  rows.forEach((row, i) => {
    if (row.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) keep[k] = true;
  });
  const out: DiffRow[] = [];
  rows.forEach((row, i) => {
    if (keep[i]) out.push(row);
    else if (out.length > 0 && out[out.length - 1].kind !== 'gap' && keep.slice(i).some(Boolean)) {
      out.push({ left: '', right: '', kind: 'gap', leftNo: null, rightNo: null });
    }
  });
  return out;
}

function FormatPane(props: { source: string }) {
  const result = useMemo(() => format(props.source), [props.source]);
  if (!result.ok) return <Problem title="This recipe could not be formatted" detail={result.error} />;
  const { output, changed, notes } = result.value;
  const rows = useMemo(() => (changed ? sideBySide(props.source, output) : []), [props.source, output, changed]);
  return (
    <div class="format">
      <p class="format-summary">
        {changed
          ? `The formatter would change ${rows.filter((r) => r.kind !== 'same' && r.kind !== 'gap').length} line(s). This is a preview: nothing is saved.`
          : 'This recipe is already in the canonical style.'}
      </p>
      {notes.length > 0 && (
        <ul class="format-notes">
          {notes.map((n, i) => (
            <li key={i}>
              Line {n.line}: {n.message}
            </li>
          ))}
        </ul>
      )}
      {changed && (
        <table class="diff">
          <thead>
            <tr>
              <th colSpan={2}>As written</th>
              <th colSpan={2}>Formatted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.kind === 'gap' ? (
                <tr key={i} class="gap">
                  <td colSpan={4}>⋯</td>
                </tr>
              ) : (
                <tr key={i} class={row.kind}>
                  <td class="no">{row.leftNo ?? ''}</td>
                  <td class="left">{row.left}</td>
                  <td class="no">{row.rightNo ?? ''}</td>
                  <td class="right">{row.right}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// -------------------------------------------------------------- shopping list

/** Where one recipe on the list stands. */
type MemberState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; why: string }
  | { kind: 'failed'; error: string }
  | { kind: 'ready'; source: RepoSource; analysis: Analysis };

function ListView(props: {
  refs: ListRef[];
  sources: LoadedSource[];
  discovered: boolean;
  onRemove: (ref: ListRef) => void;
  onClear: () => void;
  onOpen: (ref: ListRef) => void;
  /** The recipe that was open, offered when the list is empty. */
  suggestion: { ref: ListRef; title: string } | null;
  onAdd: (ref: ListRef, title: string) => void;
  /** The themes that print shopping lists. */
  listThemes: ThemeGroup[];
  /** The list's remembered print choices (settings.ts), and how to change one. */
  prefs: ShoppingSettings;
  onPref: (key: keyof ShoppingSettings, value: unknown) => void;
  pageCss: string | null;
}) {
  // Read recipes, by refKey. Each file is fetched once for the session (readAnalysis).
  const [read, setRead] = useState<Record<string, { analysis: Analysis; source: RepoSource } | { error: string }>>({});
  const uses = props.prefs.uses === true;
  const themeChoice = props.prefs.theme ?? null;
  const [copied, setCopied] = useState('');
  const [own, setOwn] = useState<Record<string, string | null>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const rows = useRef<HTMLUListElement>(null);
  const focusAfter = useRef<number | null>(null);

  const resolveRef = (ref: ListRef): { title: string; label: string; state: MemberState } => {
    const loaded = props.sources.find((s) => s.source.id === ref.source);
    const entry = loaded?.entries.find((e) => e.slug === ref.slug);
    const title = entry?.title ?? ref.slug;
    const label = loaded?.source.label ?? ref.source;
    if (!loaded) return { title, label, state: props.discovered ? { kind: 'unavailable', why: `its source, ${ref.source}, is not open` } : { kind: 'loading' } };
    if (loaded.status === 'loading') return { title, label, state: { kind: 'loading' } };
    if (loaded.status === 'error') return { title, label, state: { kind: 'unavailable', why: `its source, ${label}, could not be loaded` } };
    if (!entry) return { title, label, state: { kind: 'unavailable', why: `${label} has no recipe “${ref.slug}”` } };
    const got = read[refKey(ref)];
    if (!got) return { title, label, state: { kind: 'loading' } };
    if ('error' in got) return { title, label, state: { kind: 'failed', error: got.error } };
    return { title, label, state: { kind: 'ready', source: got.source, analysis: got.analysis } };
  };

  // Fetch what is on the list and not read yet.
  useEffect(() => {
    let live = true;
    for (const ref of props.refs) {
      const key = refKey(ref);
      if (read[key]) continue;
      const loaded = props.sources.find((s) => s.source.id === ref.source && s.status === 'ready');
      const entry = loaded?.entries.find((e) => e.slug === ref.slug);
      if (!loaded || !entry) continue;
      readAnalysis(loaded.source, entry.path).then(
        (analysis) => live && setRead((m) => (m[key] ? m : { ...m, [key]: { analysis, source: loaded.source } })),
        (e) => live && setRead((m) => (m[key] ? m : { ...m, [key]: { error: String(e?.message ?? e) } })),
      );
    }
    return () => {
      live = false;
    };
  }, [props.refs, props.sources]);

  // Keep focus in the list when a row goes: on the next row's Remove, else the previous, else the heading.
  useEffect(() => {
    const at = focusAfter.current;
    if (at === null) return;
    focusAfter.current = null;
    const buttons = rows.current ? [...rows.current.querySelectorAll<HTMLButtonElement>('button.list-remove')] : [];
    (buttons[at] ?? buttons[at - 1] ?? heading.current)?.focus();
  }, [props.refs]);

  const members = props.refs.map((ref) => ({ ref, ...resolveRef(ref) }));
  const ready = members.filter((m) => m.state.kind === 'ready' || m.state.kind === 'failed');
  const listSources = [...new Set(members.flatMap((m) => (m.state.kind === 'ready' ? [m.ref.source] : [])))];

  // A collection's own densities.md, asked for once per source on the list.
  useEffect(() => {
    let live = true;
    for (const id of listSources) {
      if (id in own) continue;
      const source = props.sources.find((s) => s.source.id === id)?.source;
      if (!source?.densities) {
        setOwn((m) => ({ ...m, [id]: null }));
        continue;
      }
      source.densities().then((text) => live && setOwn((m) => ({ ...m, [id]: text })));
    }
    return () => {
      live = false;
    };
  }, [listSources.join('\n')]);

  // The density rule: a collection's own table applies when every recipe on the list comes from
  // that collection; recipes from several sources are totaled with the reference table alone.
  const single = listSources.length === 1 ? listSources[0] : null;
  const ownText = single !== null ? (own[single] ?? null) : null;
  // A collection file counts only when it has entries of its own (a Reference densities section).
  const hasEntries = (text: string | null | undefined) => !!text && densityTable(text) !== referenceDensities();
  const ownApplied = hasEntries(ownText);
  const skipped = listSources.length > 1 ? listSources.filter((id) => hasEntries(own[id])) : [];
  const combined = useMemo(() => {
    const input: ListMember[] = ready.map((m) => ({
      id: refKey(m.ref),
      title: m.title,
      recipe: m.state.kind === 'ready' ? m.state.analysis.recipe : { ok: false, error: m.state.kind === 'failed' ? m.state.error : '' },
    }));
    return combinedList(input, densityTable(ownText));
  }, [ready.map((m) => `${refKey(m.ref)}:${m.state.kind}`).join('\n'), read, ownText]);

  const listThemes = props.listThemes;
  const entry = pickListTheme(
    listThemes.flatMap((g) => g.entries),
    themeChoice,
  );

  const copy = async (what: 'text' | 'checklist') => {
    const text = what === 'text' ? formatListText(combined.list, { uses }) : formatListMarkdown(combined.list, { uses });
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setCopied(what === 'text' ? 'Copied the list as text.' : 'Copied the list as a Markdown checklist.');
    } catch {
      setCopied('Could not copy: this browser did not allow access to the clipboard. Print the list, or copy it from the card.');
    }
  };

  const remove = (ref: ListRef, index: number) => {
    focusAfter.current = index;
    setCopied('');
    props.onRemove(ref);
  };

  const loading = members.filter((m) => m.state.kind === 'loading').length;
  const totaled = members.filter((m) => m.state.kind === 'ready' && m.state.analysis.recipe.ok).length;
  const failedIds = new Set(combined.failed.map((f) => f.id));

  return (
    <article class="recipe shopping">
      <div class="recipe-head">
        <h2 ref={heading} tabIndex={-1}>
          Shopping list
        </h2>
        {props.refs.length > 0 && (
          <button
            class="list-clear"
            onClick={() => {
              focusAfter.current = 0;
              setCopied('');
              props.onClear();
            }}
          >
            Clear
          </button>
        )}
      </div>
      {props.refs.length === 0 ? (
        <div class="empty shop-empty">
          <h3>Nothing on the list yet</h3>
          <ol>
            <li>Click recipes in the list on the left: each one you click goes on the list (click it again to take it off). Search works as usual.</li>
            <li>Their ingredients are totaled here into one list, grouped and converted where Etna can.</li>
            <li>Print it, or copy it as text or as a checklist.</li>
          </ol>
          {props.suggestion && (
            <button
              class="start-with"
              onClick={() => {
                focusAfter.current = 0;
                props.onAdd(props.suggestion!.ref, props.suggestion!.title);
              }}
            >
              <span aria-hidden="true">+</span> Add {props.suggestion.title}
            </button>
          )}
        </div>
      ) : (
        <>
          <ul class="list-members" ref={rows} aria-label="Recipes on the list">
            {members.map((m, i) => (
              <li key={refKey(m.ref)} class={`list-member ${m.state.kind}`}>
                {m.state.kind === 'unavailable' ? (
                  <span class="list-member-title">{m.title}</span>
                ) : (
                  <button class="list-member-title link" onClick={() => props.onOpen(m.ref)}>
                    {m.title}
                  </button>
                )}
                {props.sources.length > 1 && <span class="item-source">{m.label}</span>}
                <span class="list-member-status">
                  {m.state.kind === 'loading'
                    ? 'loading…'
                    : m.state.kind === 'unavailable'
                      ? `unavailable: ${m.state.why}`
                      : m.state.kind === 'failed'
                        ? `could not be read: ${m.state.error}`
                        : failedIds.has(refKey(m.ref))
                          ? `could not be read: ${combined.failed.find((f) => f.id === refKey(m.ref))?.error ?? ''}`
                          : ''}
                </span>
                <button class="list-remove" aria-label={`Remove ${m.title} from the list`} onClick={() => remove(m.ref, i)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div class="toolbar list-tools">
            <label>
              <input
                type="checkbox"
                checked={uses}
                onChange={(e) => {
                  props.onPref('uses', (e.target as HTMLInputElement).checked);
                }}
              />{' '}
              Show which recipe each item is for
            </label>
            <button onClick={() => copy('text')} disabled={totaled === 0}>
              Copy as text
            </button>
            <button onClick={() => copy('checklist')} disabled={totaled === 0}>
              Copy as checklist
            </button>
            <span class="copied" role="status">
              {copied}
            </span>
          </div>
          <p class="list-note">
            {loading > 0 && `Loading ${loading} ${loading === 1 ? 'recipe' : 'recipes'}… `}
            {combined.failed.length > 0 &&
              `Left out, could not be read: ${combined.failed.map((f) => f.title).join(', ')}. `}
            Weights and volumes of one ingredient are totaled only through the density table
            {ownApplied ? ` (the reference entries, with ${members.find((m) => m.ref.source === single)?.label ?? single}’s densities.md)` : ' (the reference entries)'}
            ; a converted total is marked ≈.
            {skipped.length > 0 && ` Recipes from several sources: the collections’ own densities.md files are not applied.`}
          </p>
          {totaled === 0 ? (
            loading > 0 ? (
              <div class="empty">Loading…</div>
            ) : (
              <div class="empty">None of the recipes on the list can be totaled.</div>
            )
          ) : !entry ? (
            <Problem title="No shopping-list style is available" detail="None of the card styles prints shopping lists (layout: list)." />
          ) : (
            <PagedCard
              themes={listThemes}
              entry={entry}
              onTheme={(id) => props.onPref('theme', id)}
              render={(e, print) => listCard(combined.list, e, print, uses)}
              prefs={props.prefs}
              onPref={(key, value) => props.onPref(key as keyof ShoppingSettings, value)}
              pageCss={props.pageCss}
              frameTitle="Shopping list card"
            />
          )}
        </>
      )}
    </article>
  );
}

render(<App />, document.getElementById('app')!);
