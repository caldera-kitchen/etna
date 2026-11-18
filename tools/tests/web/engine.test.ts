import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { cardType } from '../../src/card/index.ts';

// The bundle's data, as build.ts compiles it, without esbuild.
vi.mock('virtual:etna-data', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { listThemes, readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');
  const { ETNA_ROOT: root } = await import('../../src/node/files.ts');
  const themes: Record<string, Record<string, string>> = {};
  for (const name of listThemes()) themes[name] = readThemeFiles(j(THEMES_DIR, name));
  const { dagThemeDir, listDagThemes, readDagThemeFiles } = await import('../../src/dag/node.ts');
  const chartThemes: Record<string, Record<string, string>> = {};
  for (const name of listDagThemes()) chartThemes[name] = readDagThemeFiles(dagThemeDir(name));
  return { unitsYaml: read(j(root, 'registries', 'units.yaml'), 'utf8'), themes, chartThemes, fontMode: 'web', fontCss: {}, localServer: true, about: null };
});

const { DEFAULT_THEME } = await import('../../src/card/index.ts');
const { ETNA_ROOT } = await import('../../src/node/files.ts');
const engine = await import('../../src/web/engine.ts');
const await_core = await import('../../src/core/index.ts');
const { analyze, builtinEntries, builtinThemes, builtinWebfonts, card, isAvailable, isRecipeTheme, loadSourceThemeSets, pickRecipeTheme, pickTheme, recipeThemes, sourceThemeEntry } = engine;
const { readThemeFiles, THEMES_DIR } = await import('../../src/card/node.ts');

const SOURCE = { id: 'demo', label: 'Demo collection' };

const POSTCARD = {
  'theme.yaml': 'etna-theme: 1\nkind: card\nname: Postcard\ndescription: A test theme.\n',
  'card.html': '<article class="card"><h1>{{title}}</h1>{{ingredients}}{{directions}}{{components}}</article>',
  'card.css': '.card { color: #1d3f7a; }',
};

const TROJAN = {
  'theme.yaml': 'etna-theme: 1\nkind: card\nname: Trojan\ndescription: Hostile.\n',
  'card.html': "<article class=\"card\">{{title}}{{ingredients}}{{directions}}<script>fetch('https://tracker.example.com/')</script></article>",
  'card.css': '.card-title { background: url(https://tracker.example.com/pixel.png); }',
};

const recipe = () => {
  const a = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', 'malted-chocolate', 'recipe.md'), 'utf8'));
  if (!a.recipe.ok) throw new Error(a.recipe.error);
  return a.recipe.value;
};

describe('theme registry: built-in themes', () => {
  it('lists every bundled card theme with a builtin: id, available', () => {
    expect(builtinThemes.length).toBeGreaterThan(1);
    expect(builtinThemes.map((t) => t.id)).toContain(`builtin:${DEFAULT_THEME}`);
    for (const t of builtinThemes) {
      expect(t.id).toBe(`builtin:${t.name}`);
      expect(t.source).toBeNull();
      expect(isAvailable(t)).toBe(true);
      expect(t.webfonts).toEqual({ mode: 'web' });
    }
    expect(builtinThemes.map((t) => t.name)).toEqual([...builtinThemes.map((t) => t.name)].sort());
  });

  it('chooses font delivery from the bundle', () => {
    expect(builtinWebfonts('mise', 'embedded', { mise: '@font-face{}' })).toEqual({ mode: 'embedded', css: '@font-face{}' });
    expect(builtinWebfonts('grid', 'embedded', { mise: '@font-face{}' })).toEqual({ mode: 'none' });
    expect(builtinWebfonts('grid', 'web', {})).toEqual({ mode: 'web' });
    expect(builtinWebfonts('grid', undefined, undefined)).toEqual({ mode: 'none' });
    expect(builtinEntries({ postcard: POSTCARD }, 'web', {})[0].webfonts).toEqual({ mode: 'web' });
  });

  it('keeps a bundled theme that fails to parse as unavailable instead of throwing', () => {
    const [broken] = builtinEntries({ broken: { 'theme.yaml': 'name: Broken' } });
    expect(isAvailable(broken)).toBe(false);
    expect(broken.errors[0]).toMatch(/card\.html/);
  });
});

describe('theme registry: source themes', () => {
  it('a valid theme becomes available, with a source id and the installed fonts', () => {
    const t = sourceThemeEntry(SOURCE, 'postcard', POSTCARD);
    expect(t.id).toBe('demo:postcard');
    expect(t.label).toBe('Postcard');
    expect(t.source).toEqual(SOURCE);
    expect(isAvailable(t)).toBe(true);
    expect(t.errors).toEqual([]);
    // Never Google Fonts for someone else's theme: the card's policy names no font host.
    expect(t.webfonts).toEqual({ mode: 'none' });
    const html = card(recipe(), t);
    expect(html.ok && html.value).toContain('#1d3f7a');
    expect(html.ok && html.value).not.toContain('googleapis');
  });

  it('the trojan theme is unavailable, with the reasons, and is never rendered', () => {
    const t = sourceThemeEntry(SOURCE, 'trojan', TROJAN);
    expect(isAvailable(t)).toBe(false);
    expect(t.theme).toBeNull();
    expect(t.label).toBe('trojan');
    expect(t.errors.some((e) => /card\.html: .*<script>/.test(e))).toBe(true);
    expect(t.errors.some((e) => /card\.css: .*url\(https:\/\/tracker/.test(e))).toBe(true);
    const html = card(recipe(), t);
    expect(html.ok).toBe(false);
    expect(!html.ok && html.error).toMatch(/unavailable/);
  });

  it('loads every theme a source lists; a fetch failure becomes an unavailable entry', async () => {
    const source = {
      ...SOURCE,
      themes: async () => ['postcard', 'trojan', 'gone', '../evil'],
      themeFiles: async (name: string) => {
        if (name === 'postcard') return POSTCARD;
        if (name === 'trojan') return TROJAN;
        throw new Error('404 Not Found');
      },
    };
    const entries = (await loadSourceThemeSets(source)).cards;
    expect(entries.map((e) => [e.id, isAvailable(e)])).toEqual([
      ['demo:postcard', true],
      ['demo:trojan', false],
      ['demo:gone', false],
    ]);
    expect(entries[2].errors[0]).toMatch(/could not be fetched: 404/);
    // A source whose theme list cannot be read simply has none.
    expect((await loadSourceThemeSets({ ...source, themes: async () => Promise.reject(new Error('offline')) })).cards).toEqual([]);
  });

  it('keeps an overlong display name short', () => {
    const files = { ...POSTCARD, 'theme.yaml': POSTCARD['theme.yaml'].replace('Postcard', 'P'.repeat(200)) };
    expect(sourceThemeEntry(SOURCE, 'long', files).label.length).toBeLessThanOrEqual(60);
  });
});

describe('pickTheme', () => {
  const entries = [...builtinThemes, sourceThemeEntry(SOURCE, 'postcard', POSTCARD), sourceThemeEntry(SOURCE, 'trojan', TROJAN)];

  it('uses the remembered theme when it exists and is available', () => {
    expect(pickTheme(entries, 'demo:postcard')?.id).toBe('demo:postcard');
    expect(pickTheme(entries, 'builtin:grid')?.id).toBe('builtin:grid');
  });

  it('falls back to the default when the remembered theme is gone, unavailable, or nothing was chosen', () => {
    for (const remembered of [null, undefined, '', 'demo:gone', 'other:postcard', 'demo:trojan']) {
      expect(pickTheme(entries, remembered)?.id, String(remembered)).toBe(`builtin:${DEFAULT_THEME}`);
    }
  });

  it('falls back to the first available theme when the default is not bundled', () => {
    const rest = entries.filter((e) => e.id !== `builtin:${DEFAULT_THEME}`);
    expect(pickTheme(rest, 'demo:gone')?.id).toBe(rest[0].id);
    expect(pickTheme([sourceThemeEntry(SOURCE, 'trojan', TROJAN)], null)).toBeNull();
  });
});

describe('two kinds of theme: recipe themes for the Card tab, list themes for the shopping view', () => {
  const shoppingFiles = readThemeFiles(join(THEMES_DIR, 'shopping'));
  const sourceList = sourceThemeEntry(SOURCE, 'my-list', shoppingFiles);
  // A list theme that fails the checker: its manifest still says it is one.
  const brokenList = sourceThemeEntry(SOURCE, 'broken-list', { ...shoppingFiles, 'card.html': `${shoppingFiles['card.html']}<script>x()</script>` });
  const entries = [...builtinThemes, sourceThemeEntry(SOURCE, 'postcard', POSTCARD), sourceThemeEntry(SOURCE, 'trojan', TROJAN), sourceList, brokenList];

  it('keeps every list theme out of the Card tab, bundled or from a source, usable or not', () => {
    expect(isAvailable(sourceList)).toBe(true);
    expect(isAvailable(brokenList)).toBe(false);
    expect(brokenList.layout).toBe('list');
    const ids = recipeThemes(entries).map((e) => e.id);
    expect(ids).not.toContain('builtin:shopping');
    expect(ids).not.toContain('demo:my-list');
    expect(ids).not.toContain('demo:broken-list');
    expect(ids).toContain(`builtin:${DEFAULT_THEME}`);
    expect(ids).toContain('demo:postcard');
    // An unusable theme that is not a list theme is still listed (as unavailable).
    expect(ids).toContain('demo:trojan');
    expect(recipeThemes(entries).every((e) => e.theme?.layout !== 'list')).toBe(true);
    // Everything else is kept, in order.
    expect(ids).toEqual(entries.filter((e) => !['builtin:shopping', 'demo:my-list', 'demo:broken-list'].includes(e.id)).map((e) => e.id));
  });

  it('isRecipeTheme reads the layout from the parsed theme, else from the manifest', () => {
    expect(isRecipeTheme(builtinThemes.find((e) => e.name === 'shopping')!)).toBe(false);
    expect(isRecipeTheme(builtinThemes.find((e) => e.name === DEFAULT_THEME)!)).toBe(true);
    expect(isRecipeTheme(sourceThemeEntry(SOURCE, 'nothing', {}))).toBe(true);
  });

  it('a remembered list theme falls back to the default, silently', () => {
    for (const remembered of ['builtin:shopping', 'demo:my-list', 'demo:broken-list']) {
      expect(pickRecipeTheme(entries, remembered)?.id, remembered).toBe(`builtin:${DEFAULT_THEME}`);
    }
    expect(pickRecipeTheme(entries, 'demo:postcard')?.id).toBe('demo:postcard');
    expect(pickRecipeTheme(entries, null)?.id).toBe(`builtin:${DEFAULT_THEME}`);
    // With only list themes there is nothing for the Card tab.
    expect(pickRecipeTheme([sourceList], null)).toBeNull();
  });
});

describe('paper and size', () => {
  const mise = () => builtinThemes.find((e) => e.id === 'builtin:mise')!;

  it('offers the papers the theme supports, and the sizes within its limits', () => {
    const choices = engine.printChoices(mise(), null);
    expect(choices.papers).toEqual(['letter', 'a4', 'half-letter', 'index-5x7', 'index-4x6']);
    expect(choices.paper).toBe('letter');
    expect(choices.base).toBe(10.5);
    expect(choices.sizes[0]).toBe(9);
    expect(choices.sizes.at(-1)).toBe(11.5);
    // A remembered paper the theme does not support falls back to its own.
    const galley = builtinThemes.find((e) => e.id === 'builtin:galley')!;
    expect(engine.printChoices(galley, 'index-4x6')).toMatchObject({ papers: ['letter', 'a4'], paper: 'letter' });
  });

  it('renders the card paged, on the paper and at the size chosen', () => {
    const auto = card(recipe(), mise());
    expect(auto.ok && auto.value).toMatch(/data-paper="letter" data-fit="auto"/);
    const fixed = card(recipe(), mise(), { paper: 'half-letter', size: '9pt' });
    expect(fixed.ok && fixed.value).toMatch(/data-paper="half-letter" data-fit="off" data-size="9pt"/);
    // A paper the theme does not support is not an error in the GUI: the theme's own is used.
    const galley = builtinThemes.find((e) => e.id === 'builtin:galley')!;
    const fallback = card(recipe(), galley, { paper: 'index-4x6', size: 'auto' });
    expect(fallback.ok && fallback.value).toContain('data-paper="letter"');
  });

  it('a source theme pages like a built-in one', () => {
    const entry = sourceThemeEntry(SOURCE, 'postcard', POSTCARD);
    const result = card(recipe(), entry);
    expect(result.ok && (result.value.match(/<script>/g) ?? []).length).toBe(1);
    expect(result.ok && result.value).toContain("script-src 'sha256-");
  });
});

describe('chart themes', () => {
  const { builtinChartThemes, chart, chartThemeEntry, isChartTheme, loadSourceThemeSets, pickChartTheme } = engine;
  const structured = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', 'malted-chocolate', 'recipe.md'), 'utf8'));
  const recipe = structured.recipe.ok ? structured.recipe.value : null;
  const INK = { 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: Night\nvalues:\n  background: "#101010"\n  text-color: "#f0f0f0"\n' };
  const BAD = { 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: Bad\nvalues:\n  background: "url(https://example.com/x)"\n' };

  it('lists every bundled chart theme, all usable, and none among the card themes', () => {
    expect(builtinChartThemes.map((t) => t.name)).toEqual(['dense', 'flow', 'ink', 'station']);
    expect(builtinChartThemes.every((t) => t.theme !== null && t.errors.length === 0)).toBe(true);
    expect(builtinThemes.some((t) => builtinChartThemes.some((c) => c.name === t.name))).toBe(false);
  });

  it('draws with the chosen theme, and with the default when none is given', () => {
    expect(recipe).not.toBeNull();
    const plain = chart(recipe!);
    const flow = chart(recipe!, pickChartTheme(builtinChartThemes, null));
    const ink = chart(recipe!, pickChartTheme(builtinChartThemes, 'builtin:ink'));
    expect(plain.ok && flow.ok && ink.ok).toBe(true);
    if (plain.ok && flow.ok && ink.ok) {
      expect(flow.value).toBe(plain.value);
      expect(ink.value).not.toBe(plain.value);
    }
  });

  it('draws each step as its heading and the words its instruction marks', () => {
    const source = (prose: string) => `---\netna: 1\n---\n\n# Soup\n\n## Simmer\n\n- 1 l stock\n\n${prose}\n`;
    const marked = analyze(source('Simmer on *medium-low* until *thick*.')).recipe;
    const plain = analyze(source('Simmer on medium-low until thick.')).recipe;
    expect(marked.ok && plain.ok).toBe(true);
    if (!marked.ok || !plain.ok) return;
    const a = chart(marked.value);
    const b = chart(plain.value);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).toContain('>medium-low<');
      expect(a.value).toContain('>thick<');
      expect(b.value).not.toContain('medium-low');
    }
  });

  it('joins edges separately by default, down one lane with joinEdges: bus, over any theme', () => {
    const rolls = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', 'next-day-soft-cinnamon-rolls', 'recipe.md'), 'utf8'));
    expect(rolls.recipe.ok).toBe(true);
    if (!rolls.recipe.ok) return;
    const r = rolls.recipe.value;
    const flow = pickChartTheme(builtinChartThemes, null);
    const ink = pickChartTheme(builtinChartThemes, 'builtin:ink');
    expect(engine.themeJoinEdges(flow)).toBe('separate');
    expect(engine.themeJoinEdges(null)).toBe('separate');
    const draws = [chart(r), chart(r, null, { joinEdges: 'separate' }), chart(r, flow, { joinEdges: 'separate' }), chart(r, null, { joinEdges: 'bus' }), chart(r, flow, { joinEdges: 'bus' })];
    expect(draws.every((d) => d.ok)).toBe(true);
    const [plain, separate, flowSeparate, bus, flowBus] = draws.map((d) => (d.ok ? d.value : ''));
    expect(separate).toBe(plain);
    expect(flowSeparate).toBe(plain);
    expect(bus).not.toBe(plain);
    expect(flowBus).toBe(bus);
    // The override keeps the rest of the theme.
    const inkBus = chart(r, ink, { joinEdges: 'bus' });
    const inkPlain = chart(r, ink);
    expect(inkBus.ok && inkPlain.ok).toBe(true);
    if (inkBus.ok && inkPlain.ok) {
      expect(inkBus.value).not.toBe(inkPlain.value);
      expect(inkBus.value).not.toBe(bus);
    }
    // A theme that pins bus says so.
    const pinned = chartThemeEntry(SOURCE, 'pinned', { 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: Pinned\nvalues:\n  join-edges: bus\n' });
    expect(engine.themeJoinEdges(pinned)).toBe('bus');
  });

  it('leaves the theme\'s values as they are when nothing is set over them', () => {
    const flow = pickChartTheme(builtinChartThemes, null);
    const unset = engine.chartRenderOptions(flow);
    expect(unset.ok && unset.value.theme?.values).toEqual(flow!.theme!.values);
  });

  it('fits the chart to the screen with no sheet, whatever the paper and margin, and lays it out for any sheet', () => {
    const flow = pickChartTheme(builtinChartThemes, null);
    const plain = chart(recipe!, flow);
    expect(plain.ok).toBe(true);
    // On the screen the narrowest layout is the largest, whatever the paper and margin.
    for (const paper of ['letter', 'a4'] as const) {
      for (const margin of engine.CHART_MARGINS) {
        const screen = chart(recipe!, flow, { sheet: { paper, margin, shape: 'screen' } });
        expect(screen.ok && screen.value, `${paper} ${margin}`).toBe(plain.ok && plain.value);
      }
    }
    // Every sheet draws a chart too: the layout is chosen for that sheet.
    for (const paper of ['letter', 'a4'] as const) {
      for (const margin of engine.CHART_MARGINS) {
        for (const shape of ['auto', 'portrait', 'landscape'] as const) {
          const drawn = chart(recipe!, flow, { sheet: { paper, margin, shape } });
          expect(drawn.ok, `${paper} ${margin} ${shape}`).toBe(true);
        }
      }
    }
  });

  it('falls back to flow when the remembered theme is gone or unusable', () => {
    const bad = chartThemeEntry(SOURCE, 'bad', BAD);
    expect(pickChartTheme([...builtinChartThemes, bad], 'demo:bad')?.id).toBe('builtin:flow');
    expect(pickChartTheme(builtinChartThemes, 'demo:gone')?.id).toBe('builtin:flow');
    expect(pickChartTheme([], null)).toBeNull();
  });

  it('a source chart theme is checked: a bad value makes it unavailable and it is never drawn', () => {
    const good = chartThemeEntry(SOURCE, 'night', INK);
    expect(good.theme).not.toBeNull();
    expect(good.id).toBe('demo:night');
    const bad = chartThemeEntry(SOURCE, 'bad', BAD);
    expect(bad.theme).toBeNull();
    expect(bad.errors.length).toBeGreaterThan(0);
    const drawn = chart(recipe!, bad);
    expect(drawn.ok).toBe(false);
  });

  it('sorts a source’s themes into card themes and chart themes', async () => {
    expect(isChartTheme(INK)).toBe(true);
    expect(isChartTheme(POSTCARD)).toBe(false);
    const files: Record<string, Record<string, string>> = { postcard: POSTCARD, night: INK };
    const sets = await loadSourceThemeSets({
      ...SOURCE,
      themes: async () => ['night', 'postcard', 'missing'],
      themeFiles: async (name: string) => {
        if (!files[name]) throw new Error('404');
        return files[name];
      },
    });
    expect(sets.charts.map((t) => t.name)).toEqual(['night']);
    expect(sets.cards.map((t) => t.name)).toEqual(['postcard', 'missing']);
    expect(sets.cards.find((t) => t.name === 'missing')?.errors[0]).toContain('could not be fetched');
  });
});

describe('parts: with each part, or in one list', () => {
  const { offersPartsChoice } = engine;
  const theme = (name: string) => builtinThemes.find((e) => e.id === `builtin:${name}`)!;
  const parted = analyze('---\netna: 1\nform: traditional\n---\n\n# Stew\n\n## Ingredients\n\n### Beans\n\n- 1 cup beans\n\n### Sauce\n\n- 1 cup stock\n\n## Directions\n\n### Beans\n\n1. Soak.\n2. Cook.\n\n### Sauce\n\n1. Simmer.\n');
  const plain = analyze('---\netna: 1\nform: traditional\n---\n\n# Toast\n\n## Ingredients\n\n- 1 slice bread\n\n## Directions\n\n1. Toast.\n');

  it('is offered only where it changes something: a theme that pairs parts, and a recipe with parts in both sections', () => {
    if (!parted.recipe.ok || !plain.recipe.ok) throw new Error('fixtures must parse');
    expect(offersPartsChoice(theme('mise'), parted.recipe.value)).toBe(true);
    expect(offersPartsChoice(theme('folio'), parted.recipe.value)).toBe(true);
    expect(offersPartsChoice(theme('binder'), parted.recipe.value)).toBe(false);
    expect(offersPartsChoice(theme('mise'), plain.recipe.value)).toBe(false);
    const structured = analyze(readFileSync(join(ETNA_ROOT, 'cookbook', 'malted-chocolate', 'recipe.md'), 'utf8'));
    expect(structured.recipe.ok && offersPartsChoice(theme('mise'), structured.recipe.value)).toBe(false);
  });

  it('renders the arrangement asked for, and the theme\'s own when none is', () => {
    if (!parted.recipe.ok) throw new Error('fixture must parse');
    const own = card(parted.recipe.value, theme('mise'));
    const paired = card(parted.recipe.value, theme('mise'), { paper: null, size: 'auto', parts: 'paired' });
    const sections = card(parted.recipe.value, theme('mise'), { paper: null, size: 'auto', parts: 'sections' });
    expect(own.ok && paired.ok && sections.ok).toBe(true);
    if (own.ok && paired.ok && sections.ok) {
      expect(paired.value).toBe(own.value);
      // In the markup, not the stylesheet (which names the class either way).
      expect(own.value).toMatch(/<section class="part part-paired/);
      expect(sections.value).not.toMatch(/<section class="part part-paired/);
    }
  });
});

describe('chart sheet', () => {
  it('is re-exported for the GUI: landscape for a chart wider than tall, A4 when asked, a wider margin', async () => {
    const { chartSheet } = await import('../../src/web/engine.ts');
    const wide = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"></svg>';
    const tall = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1200"></svg>';
    expect(chartSheet(wide, 'letter')).toMatchObject({ landscape: true, width: '11in', height: '8.5in', imgWidth: '9.75in', imgHeight: '7.25in' });
    expect(chartSheet(tall, 'letter')).toMatchObject({ landscape: false, width: '8.5in', height: '11in' });
    expect(chartSheet(tall, 'a4')).toMatchObject({ imgWidth: '178.2mm', imgHeight: '265.2mm', size: 'A4' });
    expect(chartSheet(tall, 'letter', '1in')).toMatchObject({ margin: '1in', imgWidth: '6.25in', imgHeight: '8.75in' });
  });
});

// Slate light and dark, as palettes.css gives them.
const slateDark = { ground: '#12171c', paper: '#1a2128', ink: '#e6ebf0', inkSoft: '#9ca8b4', hairline: '#2d3741', accent: '#8cb8f0', onAccent: '#12171c', mark: '#5c5214' };
const slateLight = { ground: '#f5f7f9', paper: '#ffffff', ink: '#1a2129', inkSoft: '#55606c', hairline: '#d9dfe5', rule: '#7b8692', accent: '#2c5c9a', onAccent: '#ffffff', accentSoft: '#e3ebf6' };

describe('chart colors: match the app', () => {
  const { builtinChartThemes, chart, chartPdfRenderOptions, chartRenderOptions, pickChartTheme } = engine;

  it('draws a palette: app theme in the app’s colors on screen', () => {
    const flow = pickChartTheme(builtinChartThemes, 'builtin:flow');
    const svg = chart(recipe(), flow, { appPalette: slateDark });
    expect(svg.ok).toBe(true);
    if (!svg.ok) return;
    expect(svg.value).toContain(`.dag-background{fill:${slateDark.ground}}`);
    expect(svg.value).not.toContain('#c1e4f7');
    const render = chartRenderOptions(flow, { joinEdges: 'bus', appPalette: slateDark });
    expect(render.ok && render.value.theme?.values).toMatchObject({ background: slateDark.ground, 'operation-stroke': slateDark.accent, 'join-edges': 'bus' });
    // No palette: the theme's own colors.
    const own = chart(recipe(), flow, { appPalette: null });
    expect(own.ok && own.value).toContain('#c1e4f7');
    // No entry: the default, flow, which says app.
    expect(chartRenderOptions(null, { appPalette: slateDark }).ok && chartRenderOptions(null, { appPalette: slateDark })).toMatchObject({ value: { theme: { values: { background: slateDark.ground } } } });
  });

  it('leaves a palette: own theme as it is', () => {
    const ink = pickChartTheme(builtinChartThemes, 'builtin:ink');
    expect(chart(recipe(), ink, { appPalette: slateDark })).toEqual(chart(recipe(), ink));
    expect(chartRenderOptions(ink, { appPalette: slateDark })).toEqual(chartRenderOptions(ink));
    expect(chartPdfRenderOptions(ink, { appPalette: slateDark, lightPalette: slateLight })).toEqual(chartRenderOptions(ink));
  });
});

describe('chart fonts: match the card', () => {
  const { builtinChartThemes, builtinThemes, chart, chartPdfRenderOptions, chartRenderOptions, pickChartTheme } = engine;
  const folio = cardType(builtinThemes.find((e) => e.name === 'folio')!.theme!);

  it('sets a fonts: card theme in the card style’s fonts, on screen and in the PDF', () => {
    const flow = pickChartTheme(builtinChartThemes, 'builtin:flow');
    const render = chartRenderOptions(flow, { cardType: folio, appPalette: slateDark });
    expect(render.ok && render.value.theme?.values).toMatchObject({ 'font-family': 'Spectral, "Spectral SC", serif', 'title-font-weight': 400, background: slateDark.ground });
    expect(chartPdfRenderOptions(flow, { cardType: folio }).ok && chartPdfRenderOptions(flow, { cardType: folio })).toMatchObject({ value: { theme: { values: { 'title-font-family': 'Spectral, serif' } } } });
    const svg = chart(recipe(), flow, { cardType: folio });
    expect(svg.ok && svg.value).toContain('font-family:Spectral');
    // No card type: the theme's own fonts, byte for byte.
    expect(chart(recipe(), flow, { cardType: null })).toEqual(chart(recipe(), flow));
    // No entry: the default, flow, which says card.
    expect(chartRenderOptions(null, { cardType: folio })).toMatchObject({ ok: true, value: { theme: { values: { 'font-family': 'Spectral, "Spectral SC", serif' } } } });
  });

  it('leaves a fonts: own theme as it is', () => {
    const station = pickChartTheme(builtinChartThemes, 'builtin:station');
    expect(chartRenderOptions(station, { cardType: folio })).toEqual(chartRenderOptions(station));
  });
});

describe('chart fonts: the Font menu and chart.fonts', () => {
  const { builtinChartThemes, builtinThemes, chartFontCards, chartFontOptions, chartFonts, chartFontsType, chartKeepsOwnFonts, chartRenderOptions, chartThemeEntry, chartToolbarFontChoice, chartToolbarFontMenu, pickChartTheme, sourceThemeEntry } = engine;
  const byName = (name: string) => builtinThemes.find((e) => e.name === name)!;
  const cards = chartFontCards(builtinThemes);
  const values = (r: ReturnType<typeof chartRenderOptions>) => (r.ok ? r.value.theme?.values : undefined);
  const withFonts = (name: string, body: string) =>
    sourceThemeEntry(SOURCE, name, { ...POSTCARD, 'theme.yaml': `etna-theme: 1\nkind: card\nname: ${name}\ndescription: A test theme.\noptions:\n  fonts:\n    body: '${body}'\n    title: '${body}'\n` });

  it('offers the card styles of the card Style menu a chart can take fonts from, by label, in its order', () => {
    expect(cards.map((e) => e.label)).toEqual(['Binder', 'Countertop', 'Folio', 'Galley', 'Grid', 'Mise']);
    // Not the shopping list (layout: list), which shares Mise's fonts.
    expect(cards.some((e) => e.theme!.layout === 'list')).toBe(false);
    // A card style whose fonts the chart has no widths for (not in the font cache) is left out; one in cached fonts is offered.
    const uncached = withFonts('Uncached', 'Lora, serif');
    const cached = withFonts('Cached', 'Inter, sans-serif');
    expect(uncached.errors).toEqual([]);
    expect(chartFontCards([uncached, cached]).map((e) => e.name)).toEqual(['Cached']);
  });

  it('lists its entries in order: the card in use, named; the style\'s own; every card style', () => {
    const options = chartFontOptions(cards, byName('mise'));
    expect(options.map((o) => o.label)).toEqual(['Match active card (Mise)', 'Style’s own', 'Binder', 'Countertop', 'Folio', 'Galley', 'Grid', 'Mise']);
    expect(options.map((o) => o.value)).toEqual(['card', 'own', 'builtin:binder', 'builtin:countertop', 'builtin:folio', 'builtin:galley', 'builtin:grid', 'builtin:mise']);
    expect(chartFontOptions(cards, byName('folio'))[0].label).toBe('Match active card (Folio)');
    // A source's card style is named with its source.
    expect(chartFontOptions([withFonts('Cached', 'Inter, sans-serif')], null).map((o) => o.label)).toEqual(['Match active card', 'Style’s own', 'Cached (Demo collection)']);
  });

  it('shows in the toolbar what the chart is set in: Style or a card style, never "Card"', () => {
    const mise = byName('mise');
    const toolbar = (choice: string | undefined) => chartToolbarFontMenu(chartFonts(choice, cards, mise), cards, mise);
    expect(toolbar('card').options.map((o) => o.label)).toEqual(['Style', 'Binder', 'Countertop', 'Folio', 'Galley', 'Grid', 'Mise']);
    expect(toolbar('card').options.map((o) => o.value)).toEqual(['own', 'builtin:binder', 'builtin:countertop', 'builtin:folio', 'builtin:galley', 'builtin:grid', 'builtin:mise']);
    // Following the card in use (also when nothing is stored, or the stored id is gone): that card is selected.
    for (const choice of [undefined, 'card', 'builtin:gone']) expect(toolbar(choice).value).toBe('builtin:mise');
    expect(chartToolbarFontMenu(chartFonts('card', cards, byName('folio')), cards, byName('folio')).value).toBe('builtin:folio');
    expect(toolbar('own').value).toBe('own');
    expect(toolbar('builtin:countertop').value).toBe('builtin:countertop');
    // Following with no card style in use: the chart is in its own fonts.
    expect(chartToolbarFontMenu(chartFonts('card', cards, null), cards, null).value).toBe('own');
    // The tooltips say each in full; the card in use says it is followed.
    const titles = Object.fromEntries(toolbar('card').options.map((o) => [o.label, o.title]));
    expect(titles.Style).toBe('The chart style’s own fonts');
    expect(titles.Mise).toBe('Mise: the card style in use, followed as it changes');
    expect(titles.Folio).toBe('Folio’s fonts, whichever card is in use');
    // A source's card style is named without its source (the tooltip has it), unless two would read the same.
    const cached = withFonts('Cached', 'Inter, sans-serif');
    const sourced = chartToolbarFontMenu(chartFonts('card', [cached], null), [cached], null).options;
    expect(sourced.map((o) => o.label)).toEqual(['Style', 'Cached']);
    expect(sourced[1].title).toBe('Cached (Demo collection)’s fonts, whichever card is in use');
    const otherMise = withFonts('Mise', 'Inter, sans-serif');
    expect(chartToolbarFontMenu(chartFonts('own', [...cards, otherMise], mise), [...cards, otherMise], mise).options.map((o) => o.label).slice(-2)).toEqual(['Mise', 'Mise (Demo…)']);
    // A long name is cut, in the toolbar only.
    const long = withFonts('Long Weekend Kitchen Sheet Two', 'Inter, sans-serif');
    expect(chartToolbarFontMenu(chartFonts('card', [long], long), [long], long).options[1]).toEqual({
      value: 'demo:Long Weekend Kitchen Sheet Two',
      label: 'Long Weekend…',
      title: 'Long Weekend Kitchen Sheet Two (Demo collection): the card style in use, followed as it changes',
    });
    expect(chartFontOptions([long], null)[2].label).toBe('Long Weekend Kitchen Sheet Two (Demo collection)');
  });

  it('stores a toolbar pick: the card in use follows it, another card is pinned, Style is own', () => {
    const mise = byName('mise');
    expect(chartToolbarFontChoice('builtin:mise', mise)).toBe('card');
    expect(chartToolbarFontChoice('builtin:folio', mise)).toBe('builtin:folio');
    expect(chartToolbarFontChoice('own', mise)).toBe('own');
    expect(chartToolbarFontChoice('builtin:mise', null)).toBe('builtin:mise');
  });

  it('comes to the card style in use, the style\'s own, or a pinned card style', () => {
    const mise = byName('mise');
    expect(chartFonts(undefined, cards, mise)).toEqual({ value: 'card', card: mise });
    expect(chartFonts('card', cards, mise)).toEqual({ value: 'card', card: mise });
    expect(chartFonts('own', cards, mise)).toEqual({ value: 'own', card: null });
    expect(chartFonts('builtin:folio', cards, mise)).toEqual({ value: 'builtin:folio', card: byName('folio') });
    expect(chartFontsType(chartFonts('own', cards, mise))).toBeNull();
  });

  it('follows the card style in use, silently, for an id that names no card style it offers', () => {
    const grid = byName('grid');
    for (const id of ['builtin:gone', 'demo:folio', 'builtin:shopping']) expect(chartFonts(id, cards, grid)).toEqual({ value: 'card', card: grid });
  });

  it('keeps a pinned card style when the card style in use changes', () => {
    const flow = pickChartTheme(builtinChartThemes, 'builtin:flow');
    const folio = cardType(byName('folio').theme!);
    for (const active of ['mise', 'grid', 'countertop']) {
      const type = chartFontsType(chartFonts('builtin:folio', cards, byName(active)));
      expect(type).toEqual(folio);
      expect(values(chartRenderOptions(flow, { cardType: type }))).toMatchObject({ 'font-family': 'Spectral, "Spectral SC", serif' });
    }
    // Following the card in use, it changes with it.
    expect(values(chartRenderOptions(flow, { cardType: chartFontsType(chartFonts('card', cards, byName('grid'))) }))).toMatchObject({ 'font-family': 'Inter, sans-serif' });
  });

  it('is disabled by the chart theme\'s own fonts value, never by its name', () => {
    const made = (fonts: string | null) =>
      chartThemeEntry(SOURCE, 'made-up', { 'theme.yaml': `etna-theme: 1\nkind: chart\nname: Made Up\nvalues:\n${fonts ? `  fonts: ${fonts}\n` : ''}  font-size: 12\n` });
    expect(chartKeepsOwnFonts(made('own'))).toBe(true);
    expect(chartKeepsOwnFonts(made(null))).toBe(true);
    expect(chartKeepsOwnFonts(made('card'))).toBe(false);
    // The same theme under another value: the value decides.
    const folio = cardType(byName('folio').theme!);
    expect(chartRenderOptions(made('own'), { cardType: folio })).toEqual(chartRenderOptions(made('own')));
    expect(values(chartRenderOptions(made('card'), { cardType: folio }))).toMatchObject({ 'font-family': 'Spectral, "Spectral SC", serif' });
    // The bundled styles, by what their themes say.
    expect(Object.fromEntries(builtinChartThemes.map((e) => [e.name, chartKeepsOwnFonts(e)]))).toEqual({ dense: false, flow: false, ink: false, station: true });
    // No entry: the default, flow.
    expect(chartKeepsOwnFonts(null)).toBe(false);
  });

  it('sets ink in a card style\'s fonts, and its own without one', () => {
    const ink = pickChartTheme(builtinChartThemes, 'builtin:ink');
    const mise = chartFontsType(chartFonts('card', cards, byName('mise')));
    expect(values(chartRenderOptions(ink, { cardType: mise }))).toMatchObject({ 'font-family': 'Figtree, sans-serif', 'title-font-weight': 300, 'text-color': '#000000' });
    expect(values(chartRenderOptions(ink, { cardType: null }))?.['font-family']).toMatch(/^Arimo/);
  });
});

describe('chart colors: a PDF is ink on paper', () => {
  const { builtinChartThemes, CHART_PDF_PAGE, chartPdfRenderOptions, chartRenderOptions, pickChartTheme } = engine;
  const flow = pickChartTheme(builtinChartThemes, 'builtin:flow');
  const values = (r: ReturnType<typeof chartRenderOptions>) => (r.ok ? r.value.theme?.values : undefined);

  it('draws the PDF in the light scheme on a white page when the screen is dark, and leaves the screen as it is', () => {
    expect(CHART_PDF_PAGE).toBe('#ffffff');
    const screen = values(chartRenderOptions(flow, { joinEdges: 'bus', appPalette: slateDark }));
    const pdf = values(chartPdfRenderOptions(flow, { joinEdges: 'bus', appPalette: slateDark, lightPalette: slateLight }));
    expect(screen).toMatchObject({ background: slateDark.ground, 'operation-fill': slateDark.accent, 'title-fill': slateDark.paper });
    expect(pdf).toMatchObject({ background: '#ffffff', 'operation-fill': slateLight.accent, 'title-fill': slateLight.paper, 'text-color': slateLight.ink, 'join-edges': 'bus' });
    // Everything but the background is the light scheme's.
    expect(pdf).toEqual({ ...values(chartRenderOptions(flow, { joinEdges: 'bus', appPalette: slateLight })), background: '#ffffff' });
  });

  it('carries the sheet (paper, margin, page shape) into the screen’s and the PDF’s render options', () => {
    const sheet = { paper: 'a4', margin: '0.75in', shape: 'landscape' } as const;
    const screen = chartRenderOptions(flow, { sheet, appPalette: slateDark });
    const pdf = chartPdfRenderOptions(flow, { sheet, appPalette: slateDark, lightPalette: slateLight });
    expect(screen.ok && screen.value.sheet).toEqual(sheet);
    expect(pdf.ok && pdf.value.sheet).toEqual(sheet);
    // The sheet changes nothing else: the theme is as without it.
    expect(values(chartPdfRenderOptions(flow, { sheet, appPalette: slateDark, lightPalette: slateLight }))).toEqual(values(chartPdfRenderOptions(flow, { appPalette: slateDark, lightPalette: slateLight })));
    // Not given, no sheet key is added.
    const plain = chartRenderOptions(flow);
    expect(plain.ok && 'sheet' in plain.value).toBe(false);
    // The screen passes through to the PDF as chosen: the PDF itself makes it the auto sheet (sheet.ts `pageShape`).
    const fitted = { paper: 'letter', margin: '0.5in', shape: 'screen' } as const;
    const printed = chartPdfRenderOptions(flow, { sheet: fitted });
    expect(printed.ok && printed.value.sheet).toEqual(fitted);
  });

  it('gives the screen’s colors on a white page when the screen is light', () => {
    expect(values(chartPdfRenderOptions(flow, { appPalette: slateLight, lightPalette: slateLight }))).toEqual({ ...values(chartRenderOptions(flow, { appPalette: slateLight })), background: '#ffffff' });
    // Without the light scheme read, the PDF keeps the screen's colors, still on white.
    expect(values(chartPdfRenderOptions(flow, { appPalette: slateDark }))).toEqual({ ...values(chartRenderOptions(flow, { appPalette: slateDark })), background: '#ffffff' });
  });

  it('draws the theme’s own colors when Colors is the theme’s own, or the theme says own', () => {
    expect(chartPdfRenderOptions(flow, { appPalette: null, lightPalette: slateLight })).toEqual(chartRenderOptions(flow));
    const ink = pickChartTheme(builtinChartThemes, 'builtin:ink');
    expect(chartPdfRenderOptions(ink, { appPalette: slateDark, lightPalette: slateLight })).toEqual(chartRenderOptions(ink));
  });
});

describe('toolbar menus: style names cut to fit', () => {
  const { MENU_NAME_LIMIT } = await_core;
  const { toolbarNames, fullStyleName } = engine;
  const builtin = (name: string) => ({ id: `builtin:${name.toLowerCase()}`, label: name, source: null });
  const sourced = (name: string, source = 'Demo collection', id = 'demo') => ({ id: `${id}:${name.toLowerCase().replace(/ /g, '-')}`, label: name, source: { label: source } });
  const texts = (entries: Parameters<typeof toolbarNames>[0]) => [...toolbarNames(entries).values()].map((n) => n.text);

  it('cuts a name to MENU_NAME_LIMIT characters, the last an ellipsis, and gives the full name as the title', () => {
    expect(MENU_NAME_LIMIT).toBe(13);
    const names = toolbarNames([builtin('Countertop'), sourced('Long Weekend Kitchen Sheet Two')]);
    expect(names.get('builtin:countertop')).toEqual({ text: 'Countertop', title: 'Countertop' });
    const long = names.get('demo:long-weekend-kitchen-sheet-two')!;
    expect(long).toEqual({ text: 'Long Weekend…', title: 'Long Weekend Kitchen Sheet Two (Demo collection)' });
    expect(long.text.length).toBeLessThanOrEqual(MENU_NAME_LIMIT);
    // Exactly the limit is not cut; one more is. A space before the cut is dropped.
    expect(texts([builtin('Thirteen char'), builtin('Fourteen chars')])).toEqual(['Thirteen char', 'Fourteen cha…']);
    expect(texts([builtin('Sunday Market Flow')])).toEqual(['Sunday Marke…']);
    expect(texts([builtin('Kitchen and Garden')])).toEqual(['Kitchen and…']);
  });

  it('drops a source from the name, unless two entries would read the same', () => {
    expect(texts([builtin('Mise'), sourced('Postcard')])).toEqual(['Mise', 'Postcard']);
    // A clash with a bundled style: the source's style takes its source; the bundled one stays as it is.
    expect(texts([builtin('Mise'), sourced('Mise', 'Kitchen')])).toEqual(['Mise', 'Mise (Kitch…)']);
    expect(texts([builtin('Grid'), sourced('Grid', 'Pantry')])).toEqual(['Grid', 'Grid (Pantry)']);
    // Two sources' long names that cut the same: each keeps half the room for its name, the rest for its source.
    expect(texts([sourced('Long Weekend Kitchen', 'Alpha', 'a'), sourced('Long Weekend Kitchens', 'Beta', 'b')])).toEqual(['Long… (Alpha)', 'Long… (Beta)']);
    for (const t of texts([sourced('Long Weekend Kitchen', 'Alpha', 'a'), sourced('Long Weekend Kitchens', 'Beta', 'b')])) expect(t.length).toBeLessThanOrEqual(MENU_NAME_LIMIT);
    // Settings keeps the full "Name (Source)".
    expect(fullStyleName(sourced('Mise', 'Kitchen'))).toBe('Mise (Kitchen)');
  });

  it('leaves the bundled styles whole', () => {
    const all = [...engine.builtinThemes, ...engine.builtinChartThemes];
    for (const e of all) expect(toolbarNames([e]).get(e.id)!.text, e.name).toBe(e.label);
  });

  it('leaves the long-name warning out of a source style\'s notes in the app', () => {
    const long = engine.sourceThemeEntry(SOURCE, 'long', { ...POSTCARD, 'theme.yaml': POSTCARD['theme.yaml'].replace('name: Postcard', 'name: Long Weekend Kitchen Sheet Two') });
    expect(long.errors).toEqual([]);
    expect(long.warnings.some((w) => w.includes('toolbar menus'))).toBe(false);
  });
});


describe('the shopping list the GUI shows prints the remarks', () => {
  it('in the list card and in the copied text', async () => {
    const { formatListText } = await import('../../src/list/index.ts');
    const md = '---\netna: 1\n---\n\n# Roast\n\n## Cut\n\n- 500 g carrots, peeled — or parsnips\n- 1 tsp thyme — optional, for the top\n\nCut.\n';
    const recipe = await_core.parseRecipe(md, { units: (await import('../../src/node/files.ts')).loadUnits() });
    const { list } = engine.combinedList([{ id: 'a/roast', title: 'Roast', recipe: { ok: true, value: recipe } }], null);
    const card = engine.listCard(list, builtinThemes.find((e) => e.name === 'shopping')!);
    expect(card.ok).toBe(true);
    if (card.ok) {
      expect(card.value).toContain('carrots<span class="ingr-note">, peeled</span><span class="ingr-remark list-remark"> — or parsnips</span>');
      expect(card.value).toContain('thyme<span class="ingr-note list-optional"> (optional)</span><span class="ingr-remark list-remark"> — for the top</span>');
    }
    expect(formatListText(list)).toContain('carrots, peeled — or parsnips\n');
  });
});
