import { describe, expect, it } from 'vitest';

import {
  describeSettings,
  importSettings,
  loadSettings,
  MAX_SOURCES,
  parseSettings,
  parseSettingsText,
  saveSettings,
  serializeSettings,
  SETTINGS_KEY,
  setIn,
  type Settings,
  type SettingsStore,
} from '../../src/web/settings.ts';
import { chartShape } from '../../src/dag/sheet.ts';

/** A localStorage stand-in over a map; `broken` makes every call throw, as a refusing browser does. */
function store(initial: Record<string, string> = {}, broken = false): SettingsStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (broken) throw new Error('SecurityError');
  };
  return {
    data,
    getItem: (k) => (guard(), data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => (guard(), void data.set(k, String(v))),
  };
}

describe('parseSettings', () => {
  it('takes the whole etna.json shape', () => {
    const raw = {
      'etna-settings': 1,
      sources: ['example-cook/recipe-collection', { repo: 'example-cook/etna', path: 'cookbook', ref: 'main', label: 'Recipes' }],
      hide: ['desserts'],
      order: ['example-cook/recipe-collection', 'recipe-collection'],
      appearance: { palette: 'linen', scheme: 'dark', corners: 'round' },
      cards: { theme: 'builtin:mise', paper: 'a4', size: '10.5pt', parts: 'sections', notes: true, palette: 'own' },
      chart: { theme: 'builtin:plain', 'join-edges': 'bus', shape: 'landscape', margin: '0.75in', palette: 'own', fonts: 'own' },
      shopping: { theme: 'owner/name:list', paper: 'letter', size: 'auto', uses: true },
      'screen-on': true,
      'settings-repo': 'example-cook/etna-settings',
      welcome: 'short',
    };
    const r = parseSettings(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.ignored).toEqual([]);
    expect(r.value.settings).toEqual({ ...raw, 'etna-settings': undefined, sources: raw.sources });
  });

  it('ignores unknown keys and values the app does not make, and says which', () => {
    const r = parseSettings({
      'etna-settings': 1,
      color: 'red',
      appearance: { palette: 'neon', corners: 'soft', extra: 1 },
      cards: { paper: 'A4!', size: '200pt', parts: 'both', notes: 'yes', theme: '<script>', palette: 'theme' },
      chart: { theme: '<script>', text: 'all', 'join-edges': 'merged', shape: 'square', margin: '2in', palette: 'theme', fonts: 'app', mystery: 1 },
      shopping: { uses: 'on', mystery: true },
      'screen-on': 'on',
      welcome: 'full',
      sources: ['ok/repo', '../evil', 42, { repo: 'a/b', path: '../up' }, 'ok/repo'],
      hide: 'all',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.settings).toEqual({ sources: ['ok/repo'], appearance: { corners: 'soft' }, cards: {}, chart: {}, shopping: {} });
    expect(r.value.ignored).toEqual(
      expect.arrayContaining(['color', 'appearance.palette', 'appearance.extra', 'cards.paper', 'cards.size', 'cards.parts', 'cards.notes', 'cards.theme', 'cards.palette', 'chart.theme', 'chart.text', 'chart.join-edges', 'chart.shape', 'chart.margin', 'chart.palette', 'chart.fonts', 'chart.mystery', 'shopping.uses', 'shopping.mystery', 'screen-on', 'welcome', 'hide']),
    );
    expect(r.value.ignored.some((i) => i.includes('not a GitHub repository'))).toBe(true);
  });

  it('ignores keys the cards section does not have, and says which', () => {
    const r = parseSettings({ 'etna-settings': 1, cards: { paper: 'a4', text: 'blanks', margin: '1in', mystery: 'own' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.settings).toEqual({ cards: { paper: 'a4' } });
    expect(r.value.ignored).toEqual(['cards.text', 'cards.margin', 'cards.mystery']);
  });

  it('ignores a chart section that is not an object', () => {
    const r = parseSettings({ 'etna-settings': 1, chart: 'flow' });
    expect(r.ok && r.value.settings).toEqual({});
    expect(r.ok && r.value.ignored).toEqual(['chart']);
  });

  it('refuses what is not a settings object, and says why', () => {
    for (const raw of [null, 3, 'text', [], { sources: [] }, { 'etna-settings': 'one' }, { 'etna-settings': 0 }, { 'etna-settings': 1.5 }]) {
      const r = parseSettings(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it('reads a newer version as far as it is understood', () => {
    const r = parseSettings({ 'etna-settings': 7, appearance: { palette: 'slate' }, 'future-thing': {} });
    expect(r.ok && r.value.version).toBe(7);
    expect(r.ok && r.value.settings).toEqual({ appearance: { palette: 'slate' } });
  });

  it('keeps at most 20 sources, without duplicates', () => {
    const many = Array.from({ length: 25 }, (_, i) => `owner/repo-${i % 22}`);
    const r = parseSettings({ 'etna-settings': 1, sources: many });
    expect(r.ok && r.value.settings.sources).toHaveLength(MAX_SOURCES);
    expect(r.ok && r.value.ignored.some((i) => i.includes('past the first 20'))).toBe(true);
  });

  it('reads partial objects', () => {
    expect(parseSettingsText('{"etna-settings":1}')).toEqual({ ok: true, value: { settings: {}, ignored: [], version: 1 } });
    const r = parseSettingsText('{"etna-settings":1,"cards":{"notes":false}}');
    expect(r.ok && r.value.settings).toEqual({ cards: { notes: false } });
  });

  it('turns garbage text into a reason', () => {
    for (const text of ['', '{', 'undefined', '<html>']) expect(parseSettingsText(text).ok).toBe(false);
  });
});

describe('the welcome setting', () => {
  it('takes short only, keeps it last, and says so after loading a file', () => {
    for (const welcome of ['full', 'hidden', true, false, 1, null, ['short'], 'Short']) {
      const r = parseSettings({ 'etna-settings': 1, welcome });
      expect(r.ok && r.value.settings).toEqual({});
      expect(r.ok && r.value.ignored).toEqual(['welcome']);
    }
    expect(serializeSettings({ welcome: 'short', 'screen-on': true })).toBe('{"etna-settings":1,"screen-on":true,"welcome":"short"}');
    expect(describeSettings({ welcome: 'short' })).toBe('the welcome hidden');
  });
});

describe('serializeSettings', () => {
  it('writes the version first and leaves out empty groups', () => {
    const text = serializeSettings({ cards: {}, shopping: { uses: true }, sources: [], appearance: { palette: 'linen' } });
    expect(text).toBe('{"etna-settings":1,"appearance":{"palette":"linen"},"shopping":{"uses":true}}');
  });

  it('round-trips through import', () => {
    const s: Settings = {
      sources: ['a/b', { repo: 'c/d', ref: 'main' }],
      hide: ['desserts'],
      order: ['c/d', 'a/b'],
      appearance: { palette: 'nord', scheme: 'light', corners: 'square' },
      cards: { paper: 'a4', notes: false, palette: 'own' },
      chart: { theme: 'builtin:ink', 'join-edges': 'separate', shape: 'portrait', margin: '1in', palette: 'app' },
      shopping: { size: '11pt' },
      'screen-on': false,
      welcome: 'short',
    };
    const back = importSettings(serializeSettings(s, true));
    expect(back).toEqual({ ok: true, value: { settings: s, notes: [] } });
  });

  it('takes chart.shape as screen, auto, portrait or landscape only; anything else is ignored, so the chart is fitted to the screen', () => {
    for (const shape of ['screen', 'auto', 'portrait', 'landscape'] as const) {
      const r = parseSettings({ 'etna-settings': 1, chart: { shape } });
      expect(r.ok && r.value.settings.chart).toEqual({ shape });
      expect(r.ok && r.value.ignored).toEqual([]);
      expect(r.ok && chartShape(r.value.settings.chart?.shape)).toBe(shape);
    }
    for (const shape of ['square', 'Portrait', 'Screen', 'sheet', 'down', '', 1, null, true, ['landscape']]) {
      const r = parseSettings({ 'etna-settings': 1, chart: { shape } });
      expect(r.ok && r.value.settings.chart).toEqual({});
      expect(r.ok && r.value.ignored).toEqual(['chart.shape']);
      expect(r.ok && chartShape(r.value.settings.chart?.shape)).toBe('screen');
    }
    // Unset reads as the screen too; the setting is written as chosen, and cleared to unset.
    expect(chartShape(undefined)).toBe('screen');
    expect(setIn(setIn({}, 'chart', 'shape', 'landscape'), 'chart', 'shape', undefined)).toEqual({ chart: {} });
    expect(serializeSettings(setIn({}, 'chart', 'shape', 'portrait'))).toBe('{"etna-settings":1,"chart":{"shape":"portrait"}}');
    const s = store();
    expect(saveSettings(s, { chart: { shape: 'landscape' } })).toBe(true);
    expect(loadSettings(s).settings).toEqual({ chart: { shape: 'landscape' } });
  });

  it('keeps the chart section after cards and leaves it out when empty', () => {
    expect(serializeSettings({ chart: { margin: '1in' }, cards: { palette: 'own' } })).toBe('{"etna-settings":1,"cards":{"palette":"own"},"chart":{"margin":"1in"}}');
    expect(serializeSettings({ chart: {} })).toBe('{"etna-settings":1}');
  });

  it('round-trips the chart section through storage', () => {
    const s = store();
    const chart = { theme: 'builtin:dense', 'join-edges': 'bus', shape: 'auto', margin: '0.75in', palette: 'own' } as const;
    expect(saveSettings(s, { chart })).toBe(true);
    expect(JSON.parse(s.data.get(SETTINGS_KEY)!)).toEqual({ 'etna-settings': 1, chart });
    expect(loadSettings(s).settings).toEqual({ chart });
  });

  it('ignores the node text an older app stored: a chart box has one way to be filled', () => {
    const s = store();
    s.setItem(SETTINGS_KEY, JSON.stringify({ 'etna-settings': 1, chart: { text: 'blanks', shape: 'auto' } }));
    expect(loadSettings(s).settings).toEqual({ chart: { shape: 'auto' } });
  });
});

describe('importSettings', () => {
  it('rejects a bad file with a reason', () => {
    const notJson = importSettings('not json');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.error).toMatch(/not JSON/);
    const other = importSettings('{"name":"package.json"}');
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).toMatch(/etna-settings/);
    const big = importSettings('{"etna-settings":1}', 10 * 1024 * 1024);
    expect(big.ok).toBe(false);
  });

  it('notes a newer version and what it left out', () => {
    const r = importSettings('{"etna-settings":2,"appearance":{"palette":"slate"},"cloud":true}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.settings).toEqual({ appearance: { palette: 'slate' } });
    expect(r.value.notes.join(' ')).toMatch(/newer Etna/);
    expect(r.value.notes.join(' ')).toMatch(/cloud/);
  });
});

describe('loadSettings and saveSettings', () => {
  it('gives nothing to a new visitor and writes nothing', () => {
    const s = store();
    expect(loadSettings(s)).toEqual({ settings: {}, readOnly: false, problem: null, available: true });
    expect(s.data.size).toBe(0);
  });

  it('survives garbage in storage, and says so', () => {
    for (const junk of ['{', '[]', '"text"', '{"etna-settings":"x"}']) {
      const r = loadSettings(store({ [SETTINGS_KEY]: junk }));
      expect(r.settings).toEqual({});
      expect(r.problem).toMatch(/could not be read/);
    }
  });

  it('reads settings from a newer Etna without writing over them', () => {
    const r = loadSettings(store({ [SETTINGS_KEY]: '{"etna-settings":3,"appearance":{"palette":"nord"},"new":1}' }));
    expect(r.readOnly).toBe(true);
    expect(r.settings).toEqual({ appearance: { palette: 'nord' } });
  });

  it('copes with a browser that refuses storage', () => {
    const broken = store({}, true);
    expect(loadSettings(broken).available).toBe(false);
    expect(saveSettings(broken, { 'screen-on': true })).toBe(false);
    expect(loadSettings(null).available).toBe(false);
  });

  it('saves what it loads', () => {
    const s = store();
    expect(saveSettings(s, setIn({}, 'appearance', 'palette', 'linen'))).toBe(true);
    expect(loadSettings(s).settings).toEqual({ appearance: { palette: 'linen' } });
  });
});

describe('setIn', () => {
  it('sets and clears one key of a group', () => {
    const a = setIn({}, 'cards', 'paper', 'a4');
    expect(a).toEqual({ cards: { paper: 'a4' } });
    expect(setIn(a, 'cards', 'paper', undefined)).toEqual({ cards: {} });
    const b = setIn(a, 'chart', 'join-edges', 'bus');
    expect(b).toEqual({ cards: { paper: 'a4' }, chart: { 'join-edges': 'bus' } });
    expect(setIn(b, 'chart', 'join-edges', undefined)).toEqual({ cards: { paper: 'a4' }, chart: {} });
  });
});

describe('describeSettings', () => {
  it('counts the chart choices with the card and list ones', () => {
    expect(describeSettings({ cards: { paper: 'a4' }, chart: { shape: 'auto', margin: '1in' } })).toBe('3 card and list choices');
    expect(describeSettings({ chart: { palette: 'own' } })).toBe('1 card and list choice');
  });
});

describe('chart.fonts', () => {
  const fonts = (value: unknown) => {
    const r = parseSettings({ 'etna-settings': 1, chart: { fonts: value } });
    return r.ok ? { kept: r.value.settings.chart?.fonts, ignored: r.value.ignored } : null;
  };

  it('is card (follow the card style in use), own, or a card style\'s id as cards.theme holds it', () => {
    expect(fonts('card')).toEqual({ kept: 'card', ignored: [] });
    expect(fonts('own')).toEqual({ kept: 'own', ignored: [] });
    expect(fonts('builtin:folio')).toEqual({ kept: 'builtin:folio', ignored: [] });
    expect(fonts('owner/name:harbor')).toEqual({ kept: 'owner/name:harbor', ignored: [] });
    // An id that names no card style is a well-formed id: kept, and the chart follows the card style in use (engine chartFonts).
    expect(fonts('builtin:gone')).toEqual({ kept: 'builtin:gone', ignored: [] });
  });

  it('refuses anything else, as the theme ids are refused', () => {
    for (const bad of ['folio', 'Folio', 'builtin:Folio', '<script>', 'builtin:', 7, null, { id: 'builtin:folio' }]) expect(fonts(bad)).toEqual({ kept: undefined, ignored: ['chart.fonts'] });
  });

  it('is kept and read back unchanged', () => {
    const s = setIn({}, 'chart', 'fonts', 'builtin:folio');
    const back = parseSettingsText(serializeSettings(s));
    expect(back.ok && back.value.settings.chart).toEqual({ fonts: 'builtin:folio' });
  });
});

describe('removed: the site’s own sources the reader removed', () => {
  it('is read as a list of source ids, kept after order, and written only when it holds one', () => {
    const parsed = parseSettings({ 'etna-settings': 1, order: ['me/recipes'], removed: ['cookbook', 'cookbook', 42] });
    expect(parsed.ok && parsed.value.settings.removed).toEqual(['cookbook']);
    expect(parsed.ok && parsed.value.ignored).toEqual(['removed (some entries)']);
    expect(serializeSettings({ removed: ['cookbook'], order: ['me/recipes'], hide: ['x'] })).toBe('{"etna-settings":1,"hide":["x"],"order":["me/recipes"],"removed":["cookbook"]}');
    expect(serializeSettings({ removed: [] })).toBe('{"etna-settings":1}');
  });

  it('ignores a removed that is not a list, and says so', () => {
    const parsed = parseSettings({ 'etna-settings': 1, removed: 'cookbook' });
    expect(parsed.ok && parsed.value.settings.removed).toBeUndefined();
    expect(parsed.ok && parsed.value.ignored).toEqual(['removed']);
  });
});
