// Web fonts: the `webfonts:` manifest key, the three delivery modes, the local cache (with a
// fixture and a fake network — no test touches the network), and `etna fonts`.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as yamlParse } from 'yaml';

import { parseRecipe } from '../../src/core/index.ts';
import {
  checkTheme,
  googleFontsHref,
  parseGoogleCss,
  parseTheme,
  renderCard,
  renderCardParts,
  specFamily,
  webfontProblems,
} from '../../src/card/index.ts';
import { cachedPdfFaces, cachedSpec, fetchSpec, loadFontCss, pdfFontSpec, readFontIndex, TTF_USER_AGENT, type Fetch } from '../../src/card/fonts.ts';
import { run as cardRun } from '../../src/card/cli.ts';
import { CARD_ICON, cardType } from '../../src/card/index.ts';
import { cardPdfFaces, run, testing } from '../../src/card/fonts-cli.ts';
import { FONTS_DIR } from '../../src/card/fonts.ts';
import { listThemes, loadTheme, THEMES_DIR } from '../../src/card/node.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
// The card's own empty data: icon (contract.ts CARD_ICON) loads nothing; every other <link> would.
const withoutIcon = (doc: string) => doc.replace(CARD_ICON, '');
const RECIPE = parseRecipe('---\netna: 1\nform: traditional\n---\n\n# Soup\n\n## Ingredients\n\n- 1 g salt\n\n## Directions\n\n1. Stir.\n', { units });

const WEBFONTS = "webfonts:\n  - family: Arima\n    google: 'Arima:wght@300'\n  - family: Nunito Sans\n    google: 'Nunito+Sans:ital,wght@0,400..700;1,400'\n";

function files(yamlExtra = WEBFONTS, fonts = "options:\n  fonts:\n    body: '\"Nunito Sans\", sans-serif'\n    title: 'Arima, sans-serif'\n") {
  return {
    'theme.yaml': `etna-theme: 1\nkind: card\nname: Test\ndescription: A test.\n${yamlExtra}${fonts}`,
    'card.html': '<article class="card">{{title}}{{ingredients}}{{directions}}{{components}}</article>',
    'card.css': '',
    'README.md': '# Test\n',
  };
}

const capture = async (fn: (argv: string[]) => Promise<number>, argv: string[]) => {
  const out: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
  const write = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true));
  try {
    return { code: await fn(argv), text: out.join('\n') };
  } finally {
    log.mockRestore();
    err.mockRestore();
    write.mockRestore();
  }
};

// ----------------------------------------------------------------- the manifest

describe('webfonts: in theme.yaml', () => {
  it('is read into Theme.webfonts, and is empty when absent', () => {
    expect(parseTheme(files()).webfonts).toEqual([
      { family: 'Arima', google: 'Arima:wght@300' },
      { family: 'Nunito Sans', google: 'Nunito+Sans:ital,wght@0,400..700;1,400' },
    ]);
    expect(parseTheme(files('')).webfonts).toEqual([]);
  });

  it('accepts css2 family= values', () => {
    for (const spec of ['Inter', 'Arima:wght@300', 'Arima:wght@100..700', 'Source+Serif+4:ital,opsz,wght@0,8..60,400;1,8..60,400', 'Roboto+Flex:slnt,wght@-10,400']) {
      expect(specFamily(spec), spec).not.toBeNull();
    }
    expect(specFamily('Nunito+Sans:ital,wght@0,400')).toBe('Nunito Sans');
  });

  it('refuses anything that could carry a URL, a second parameter or markup', () => {
    const hostile = [
      'Arima&family=Evil',
      'Arima:wght@300&display=block',
      'https://evil.example/x.css',
      'Arima:wght@300?x=1',
      'Arima:wght@300#x',
      'Arima:wght@300%26text=a',
      'Arima wght',
      "Arima'><script>",
      'Arima:wght@300;',
      'Arima:wght@',
      'Arima:ital,wght@1',
      'Arima:wg@300',
      '../Arima',
      'Arima:wght@300\nX',
      'A'.repeat(300),
    ];
    for (const spec of hostile) expect(specFamily(spec), spec).toBeNull();
    for (const spec of hostile) {
      const yaml = `webfonts:\n  - family: Arima\n    google: ${JSON.stringify(spec)}\n`;
      expect(() => parseTheme(files(yaml)), spec).toThrow(/webfonts\[0\]\.google/);
    }
  });

  it('refuses a bad family, a mismatch, a duplicate, an unknown key and a non-list', () => {
    const bad = (yaml: string) => webfontProblems(yamlParse(yaml));
    expect(bad('[{ family: "Ar<i>ma", google: Arima }]')[0]).toMatch(/family must be a font family name/);
    expect(bad('[{ family: Arima, google: Inter }]')[0]).toMatch(/names the family "Inter", not "Arima"/);
    expect(bad('[{ family: Arima, google: Arima }, { family: Arima, google: "Arima:wght@300" }]')[0]).toMatch(/listed twice/);
    expect(bad('[{ family: Arima, google: Arima, url: "x" }]')[0]).toMatch(/unknown key "url"/);
    expect(bad('Arima')[0]).toMatch(/must be a list/);
    expect(bad('[{ family: Arima }]')[0]).toMatch(/google must be/);
    expect(() => parseTheme(files('webfonts: Arima\n'))).toThrow(/webfonts must be a list/);
  });

  it('is checked by checkTheme, which warns about a font in no stack', () => {
    expect(checkTheme(files()).errors).toEqual([]);
    expect(checkTheme(files()).warnings).toEqual([]);
    const unused = checkTheme(files(WEBFONTS, ''));
    expect(unused.warnings.join('\n')).toMatch(/Arima is in no font stack/);
    const hostile = checkTheme(files("webfonts:\n  - family: Arima\n    google: 'Arima&x=1'\n"));
    expect(hostile.errors.join('\n')).toMatch(/theme\.yaml: webfonts\[0\]\.google/);
  });

  it('is declared by every bundled theme, each family named in a stack', () => {
    for (const name of listThemes()) {
      const theme = loadTheme(name);
      expect(theme.webfonts.length, name).toBeGreaterThan(0);
      const fonts = (theme.manifest.options as { fonts: Record<string, string> }).fonts;
      for (const f of theme.webfonts) expect(`${fonts.body},${fonts.title}`, `${name} ${f.family}`).toContain(f.family);
    }
  });

  it('puts a free font first in every stack of every card theme: no system font, only a generic fallback', () => {
    const chosen: Record<string, { body: string; title: string; 'title-weight': number }> = {
      binder: { body: 'Jost, sans-serif', title: 'Quicksand, sans-serif', 'title-weight': 300 },
      mise: { body: 'Figtree, sans-serif', title: 'Figtree, sans-serif', 'title-weight': 300 },
      shopping: { body: 'Figtree, sans-serif', title: 'Figtree, sans-serif', 'title-weight': 300 },
      folio: { body: 'Spectral, "Spectral SC", serif', title: 'Spectral, serif', 'title-weight': 400 },
      grid: { body: 'Inter, sans-serif', title: 'Inter, sans-serif', 'title-weight': 700 },
      galley: { body: '"IBM Plex Sans Condensed", sans-serif', title: '"IBM Plex Sans Condensed", sans-serif', 'title-weight': 700 },
      countertop: { body: 'Merriweather, serif', title: 'Merriweather, serif', 'title-weight': 500 },
    };
    for (const [name, fonts] of Object.entries(chosen)) {
      const theme = loadTheme(name);
      expect((theme.manifest.options as { fonts: object }).fonts, name).toEqual(fonts);
      // Every family named in a stack, before the generic one, is delivered.
      const families = `${fonts.body},${fonts.title}`.split(',').map((f) => f.trim().replace(/"/g, '')).filter((f) => !/^(sans-)?serif$/.test(f));
      for (const family of families) expect(theme.webfonts.map((f) => f.family), `${name} ${family}`).toContain(family);
    }
    expect(loadTheme('binder').webfonts.map((f) => f.google)).toEqual(['Quicksand:wght@300', 'Jost:ital,wght@0,400;0,700;1,400']);
  });

  it('loads every weight and style a card theme\'s stylesheet asks for, so none is synthesized', () => {
    // What each css2 spec delivers: "normal 300..700", "italic 400" …
    const delivered = (spec: string): { style: string; min: number; max: number }[] => {
      const m = /:ital,wght@(.+)$/.exec(spec) ?? /:wght@(.+)$/.exec(spec);
      if (m === null) return [{ style: 'normal', min: 400, max: 400 }];
      const ital = spec.includes(':ital,');
      return m[1].split(';').map((tuple) => {
        const parts = tuple.split(',');
        const [a, b] = (ital ? parts[1] : parts[0]).split('..').map(Number);
        return { style: ital && parts[0] === '1' ? 'italic' : 'normal', min: a, max: b ?? a };
      });
    };
    for (const name of ['binder', 'mise', 'shopping', 'folio', 'grid', 'galley', 'countertop']) {
      const theme = loadTheme(name);
      const css = theme.css;
      const weights = new Set([400, 700]); // text, and <strong> in a recipe
      for (const m of css.matchAll(/font-weight:\s*(\d+|bold|normal)/g)) weights.add(m[1] === 'bold' ? 700 : m[1] === 'normal' ? 400 : Number(m[1]));
      // The title has its own stack; its weight is stated beside it, and .card-title reads it.
      const titleWeight = cardType(theme).title.weight;
      expect(/\.card-title\s*\{[^}]*font-weight:\s*var\(--card-font-title-weight\)/.test(css), `${name} .card-title`).toBe(true);
      const title = (theme.manifest.options as { fonts: { title: string } }).fonts.title.split(',')[0].replace(/"/g, '').trim();
      const body = (theme.manifest.options as { fonts: { body: string } }).fonts.body.split(',')[0].replace(/"/g, '').trim();
      const has = (family: string, style: string, weight: number) =>
        theme.webfonts.filter((f) => f.family === family).some((f) => delivered(f.google).some((d) => d.style === style && weight >= d.min && weight <= d.max));
      expect(has(title, 'normal', titleWeight), `${name} title ${title} ${titleWeight}`).toBe(true);
      for (const w of weights) if (w !== titleWeight || title === body) expect(has(body, 'normal', w), `${name} ${body} ${w}`).toBe(true);
      expect(has(body, 'italic', 400), `${name} ${body} italic`).toBe(true);
    }
  });
});


// -------------------------------------------------------------------- the modes

describe('delivery modes', () => {
  const theme = parseTheme(files());

  it('adds nothing by default, or with none', () => {
    const plain = renderCard(RECIPE, theme);
    expect(renderCard(RECIPE, theme, { webfonts: { mode: 'none', css: '@font-face{}' } })).toBe(plain);
    expect(withoutIcon(plain)).not.toContain('<link');
    expect(plain).not.toContain('@font-face');
    expect(renderCardParts(RECIPE, theme).links).toEqual([]);
  });

  it('web: one Google Fonts stylesheet with every family, and nothing else external', () => {
    const doc = renderCard(RECIPE, theme, { webfonts: { mode: 'web' } });
    const stylesheets = doc.match(/<link rel="stylesheet"[^>]*>/g) ?? [];
    expect(stylesheets).toEqual([
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Arima:wght@300&amp;family=Nunito+Sans:ital,wght@0,400..700;1,400&amp;display=swap">',
    ]);
    expect(doc).toContain('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    // Every URL in the page is one of the two hosts the CSP allows.
    const urls = (doc.match(/https?:\/\/[^\s"'<>;)]+/g) ?? []).map((u) => new URL(u.replace(/&amp;/g, '&')).host);
    expect(new Set(urls)).toEqual(new Set(['fonts.googleapis.com', 'fonts.gstatic.com']));
    expect(doc).not.toContain('@font-face');
    // The links come after the CSP, inside the head.
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<link'));
    expect(doc.indexOf('<link')).toBeLessThan(doc.indexOf('</head>'));
  });

  it('web: renderCardParts gives the stylesheet URL to a host page, and keeps html and css', () => {
    const parts = renderCardParts(RECIPE, theme, { webfonts: { mode: 'web' } });
    expect(parts.links).toEqual([googleFontsHref(theme.webfonts)]);
    const plain = renderCardParts(RECIPE, theme);
    expect(parts.html).toBe(plain.html);
    expect(parts.css).toBe(plain.css);
  });

  it('web: a theme without webfonts gets no link', () => {
    const doc = renderCard(RECIPE, parseTheme(files('')), { webfonts: { mode: 'web' } });
    expect(withoutIcon(doc)).not.toContain('<link');
  });

  it('embedded: the caller css goes first in the style, and nothing external is added', () => {
    const css = '@font-face { font-family: "Arima"; src: url(data:font/woff2;base64,AAAA) format("woff2"); }';
    const doc = renderCard(RECIPE, theme, { webfonts: { mode: 'embedded', css } });
    expect(doc).toContain(`<style>\n${css}\n\n@page`);
    expect(withoutIcon(doc)).not.toContain('<link');
    const parts = renderCardParts(RECIPE, theme, { webfonts: { mode: 'embedded', css } });
    expect(parts.css.startsWith(css)).toBe(true);
    expect(parts.links).toEqual([]);
    // Without css, embedded adds nothing.
    expect(renderCard(RECIPE, theme, { webfonts: { mode: 'embedded' } })).toBe(renderCard(RECIPE, theme));
  });

  it('refuses an unknown mode', () => {
    // @ts-expect-error -- not a mode
    expect(() => renderCard(RECIPE, theme, { webfonts: { mode: 'cdn' } })).toThrow(/unknown webfonts mode "cdn"/);
  });

  it('googleFontsHref writes each spec once', () => {
    expect(googleFontsHref([{ family: 'Arima', google: 'Arima:wght@300' }, { family: 'Arima', google: 'Arima:wght@300' }])).toBe(
      'https://fonts.googleapis.com/css2?family=Arima:wght@300&display=swap',
    );
    expect(googleFontsHref([])).toBeNull();
  });
});

// ------------------------------------------------------------------- the cache

const GOOGLE_CSS = `/* cyrillic */
@font-face {
  font-family: 'Arima';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/arima/v7/cyr.woff2) format('woff2');
  unicode-range: U+0400-045F;
}
/* latin-ext */
@font-face {
  font-family: 'Arima';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/arima/v7/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+A720-A7FF;
}
/* latin */
@font-face {
  font-family: 'Arima';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/arima/v7/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+2000-206F;
}
`;

/** A fake network: Google's stylesheet for Arima, and small "WOFF2" files. Counts requests. */
function fakeFetch(options: { offline?: boolean; status?: number } = {}) {
  const requests: string[] = [];
  const fetch: Fetch = async (url, init) => {
    requests.push(url);
    expect(init.headers['User-Agent']).toMatch(/Chrome\/\d+/);
    if (options.offline) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    const status = options.status ?? 200;
    const body = url.startsWith('https://fonts.googleapis.com/') ? GOOGLE_CSS : `wOF2${url.split('/').pop()}`;
    return {
      ok: status === 200,
      status,
      text: async () => body,
      arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
    };
  };
  return { fetch, requests };
}

describe('the font cache', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'etna-fonts-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('parses Google css: family, style, weight, range and subset per face', () => {
    const faces = parseGoogleCss(GOOGLE_CSS);
    expect(faces.map((f) => f.subset)).toEqual(['cyrillic', 'latin-ext', 'latin']);
    expect(faces[2]).toEqual({
      family: 'Arima',
      style: 'normal',
      weight: '300',
      stretch: null,
      unicodeRange: 'U+0000-00FF, U+2000-206F',
      subset: 'latin',
      url: 'https://fonts.gstatic.com/s/arima/v7/latin.woff2',
    });
    expect(parseGoogleCss('@font-face { font-family: X; src: url(http://evil/x.woff2); }')).toEqual([]);
  });

  it('fetches a spec: latin and latin-ext only, an index, and nothing again once cached', async () => {
    const net = fakeFetch();
    const result = await fetchSpec('Arima:wght@300', { dir, fetch: net.fetch });
    expect(result.faces.map((f) => f.subset)).toEqual(['latin-ext', 'latin']);
    expect(result.downloaded).toBe(2);
    expect(net.requests).toEqual([
      'https://fonts.googleapis.com/css2?family=Arima:wght@300&display=swap',
      'https://fonts.gstatic.com/s/arima/v7/ext.woff2',
      'https://fonts.gstatic.com/s/arima/v7/latin.woff2',
    ]);
    const index = readFontIndex(dir);
    expect(Object.keys(index.specs)).toEqual(['Arima:wght@300']);
    expect(index.specs['Arima:wght@300'].faces[1].file).toMatch(/^arima-latin-[0-9a-f]{10}\.woff2$/);
    const again = await fetchSpec('Arima:wght@300', { dir, fetch: net.fetch });
    expect(again.downloaded).toBe(0);
    expect(net.requests).toHaveLength(3);
    await fetchSpec('Arima:wght@300', { dir, fetch: net.fetch, force: true });
    expect(net.requests).toHaveLength(6);
  });

  it('fetches a chart PDF face as one static TrueType file, kept apart from the WOFF2 specs', async () => {
    const requests: { url: string; agent: string }[] = [];
    const css = "@font-face {\n  font-family: 'Arima';\n  font-style: normal;\n  font-weight: 700;\n  src: url(https://fonts.gstatic.com/s/arima/v7/bold.ttf) format('truetype');\n}\n";
    const fetch: Fetch = async (url, init) => {
      requests.push({ url, agent: init.headers['User-Agent'] });
      const body = url.startsWith('https://fonts.googleapis.com/') ? new TextEncoder().encode(css) : new Uint8Array([0, 1, 0, 0, 9, 9]);
      return { ok: true, status: 200, text: async () => new TextDecoder().decode(body), arrayBuffer: async () => body.buffer as ArrayBuffer };
    };
    const result = await fetchSpec(pdfFontSpec('Arima', 700), { dir, fetch, format: 'ttf' });
    expect(result.faces).toEqual([expect.objectContaining({ family: 'Arima', weight: '700', subset: 'all', unicodeRange: null })]);
    expect(result.faces[0].file).toMatch(/^arima-700-[0-9a-f]{10}\.ttf$/);
    // Asked as a plain client, which Google answers with TrueType; never as a browser.
    expect(requests.map((r) => r.url)).toEqual(['https://fonts.googleapis.com/css2?family=Arima:wght@700&display=swap', 'https://fonts.gstatic.com/s/arima/v7/bold.ttf']);
    expect(requests.every((r) => r.agent === TTF_USER_AGENT)).toBe(true);
    const index = readFontIndex(dir);
    expect(index.specs).toEqual({});
    expect(Object.keys(index.ttf!)).toEqual(['Arima:wght@700']);
    expect(cachedSpec('Arima:wght@700', dir)).toBeNull();
    expect(cachedSpec('Arima:wght@700', dir, index, 'ttf')).not.toBeNull();
    expect(cachedPdfFaces(dir)).toEqual([{ family: 'Arima', weight: 700, path: join(dir, result.faces[0].file) }]);
    // A file that is not TrueType is refused.
    const html: Fetch = async (url) => ({
      ok: true,
      status: 200,
      text: async () => css,
      arrayBuffer: async () => new TextEncoder().encode(url.endsWith('.ttf') ? '<html>' : css).buffer as ArrayBuffer,
    });
    await expect(fetchSpec(pdfFontSpec('Arima', 700), { dir, fetch: html, format: 'ttf', force: true })).rejects.toThrow(/is not TrueType/);
  });

  it('says plainly when offline, or when Google refuses the spec', async () => {
    await expect(fetchSpec('Arima:wght@300', { dir, fetch: fakeFetch({ offline: true }).fetch })).rejects.toThrow(
      /cannot reach fonts\.googleapis\.com \(ENOTFOUND\) — are you offline\?/,
    );
    await expect(fetchSpec('Arima:wght@300', { dir, fetch: fakeFetch({ status: 400 }).fetch })).rejects.toThrow(/does not serve "Arima:wght@300"/);
    await expect(fetchSpec('Arima&x', { dir, fetch: fakeFetch().fetch })).rejects.toThrow(/not a css2 family= value/);
  });

  it('builds embedded css from a fixture index, or null when a font is missing', () => {
    const latin = Buffer.from('wOF2-latin');
    writeFileSync(join(dir, 'arima-latin-0123456789.woff2'), latin);
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({
        version: 1,
        specs: {
          'Arima:wght@300': {
            family: 'Arima',
            fetched: '2026-11-05T00:00:00Z',
            faces: [{ family: 'Arima', style: 'normal', weight: '300', stretch: null, unicodeRange: 'U+0000-00FF', subset: 'latin', file: 'arima-latin-0123456789.woff2' }],
          },
          'Bad&spec': { family: 'X', faces: [] },
        },
      }),
    );
    expect(Object.keys(readFontIndex(dir).specs)).toEqual(['Arima:wght@300']);
    const arima = { webfonts: [{ family: 'Arima', google: 'Arima:wght@300' }] };
    const css = loadFontCss(arima, dir)!;
    expect(css).toBe(
      '@font-face {\n  font-family: "Arima";\n  font-style: normal;\n  font-weight: 300;\n  font-display: swap;\n' +
        `  src: url(data:font/woff2;base64,${latin.toString('base64')}) format("woff2");\n  unicode-range: U+0000-00FF;\n}\n`,
    );
    expect(loadFontCss({ webfonts: [] }, dir)).toBe('');
    const both = { webfonts: [...arima.webfonts, { family: 'Inter', google: 'Inter' }] };
    expect(loadFontCss(both, dir)).toBeNull();
    // A file gone from the folder makes the spec missing.
    rmSync(join(dir, 'arima-latin-0123456789.woff2'));
    expect(cachedSpec('Arima:wght@300', dir)).toBeNull();
    expect(loadFontCss(arima, dir)).toBeNull();
  });

  it('reads a missing or broken index as empty', () => {
    expect(readFontIndex(dir)).toEqual({ version: 1, specs: {} });
    writeFileSync(join(dir, 'index.json'), '{nope');
    expect(readFontIndex(dir)).toEqual({ version: 1, specs: {} });
  });

  it('is never a theme; git tracks it but ignores interrupted downloads', () => {
    expect(FONTS_DIR).toBe(join(THEMES_DIR, '.fonts'));
    mkdirSync(FONTS_DIR, { recursive: true });
    expect(listThemes()).not.toContain('.fonts');
    const gitignore = readFileSync(join(ETNA_ROOT, '.gitignore'), 'utf8');
    expect(gitignore).not.toMatch(/^\/?themes\/\.fonts\/?$/m);
    expect(gitignore).toMatch(/^themes\/\.fonts\/\*\.part$/m);
  });

  it('carries a README and an OFL license for every family the bundled themes declare', () => {
    const readme = readFileSync(join(FONTS_DIR, 'README.md'), 'utf8');
    const families = new Set(listThemes().flatMap((name) => loadTheme(name).webfonts.map((f) => f.family)));
    expect(families.size).toBeGreaterThan(0);
    for (const family of families) {
      const license = readFileSync(join(FONTS_DIR, 'LICENSES', `${family.replace(/ /g, '-')}.OFL.txt`), 'utf8');
      expect(license, family).toMatch(/^Copyright .+\n\nThis Font Software is licensed under the SIL Open Font License, Version 1\.1\./);
      expect(license, family).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
      expect(readme, family).toContain(`| ${family} |`);
    }
  });
});

// --------------------------------------------------------------------- the CLIs

describe('etna fonts', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'etna-fonts-cli-'));
    testing.dir = dir;
  });
  afterEach(() => {
    testing.dir = undefined;
    testing.fetch = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it('handles its arguments', async () => {
    expect((await capture(run, ['--help'])).text).toContain('Usage: etna fonts [fetch]');
    expect((await capture(run, ['--frob'])).code).toBe(2);
    expect((await capture(run, ['list', 'extra'])).code).toBe(2);
    expect((await capture(run, ['clean', '--force'])).code).toBe(2);
    expect((await capture(run, ['metrics', 'extra'])).code).toBe(2);
    expect((await capture(run, ['fetch', 'no-such-theme'])).code).toBe(2);
  });

  it('fetches a theme, lists it as cached, and cleans', async () => {
    testing.fetch = async (url, init) => {
      // Answer every spec with a stylesheet for its own family: WOFF2 to a browser, one static
      // TrueType face (at the weight asked for) to a plain client.
      const family = decodeURIComponent(/family=([^:&]+)/.exec(url)?.[1] ?? 'X').replace(/\+/g, ' ');
      const ttf = !/Chrome/.test(init.headers['User-Agent']);
      const weight = /wght@(\d+)$/.exec(url.split('&')[0])?.[1] ?? '400';
      const css = ttf
        ? `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  src: url(https://fonts.gstatic.com/s/x/${weight}.ttf) format('truetype');\n}\n`
        : GOOGLE_CSS.replace(/Arima/g, family);
      const italic = ttf ? '' : css.replace(/font-style: normal/g, 'font-style: italic').replace(/\.woff2/g, '-i.woff2');
      const body = url.includes('googleapis') ? css + italic : ttf ? '\u0000\u0001\u0000\u0000data' : 'wOF2data';
      return { ok: true, status: 200, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer };
    };
    const fetched = await capture(run, ['grid']);
    expect(fetched.code).toBe(0);
    expect(fetched.text).toMatch(/Inter\s+4 files .* latin-ext, latin\s+\(downloaded 4; grid\)/);
    // A card theme's body and title fonts as static TrueType too: Inter 400 and 700 (Grid's title is bold).
    expect(fetched.text).toMatch(/Inter 400 \(PDF\)\s+1 files .*\(downloaded 1; grid\)/);
    expect(fetched.text).toMatch(/Inter 700 \(PDF\)\s+1 files .*\(downloaded 1; grid\)/);
    const listed = await capture(run, ['list']);
    expect(listed.text).toMatch(/^grid\s+Inter\s+Inter:ital,wght@0,400\.\.700;1,400\s+cached/m);
    expect(listed.text).toMatch(/^grid\s+Inter \(PDF\)\s+Inter:wght@700\s+cached/m);
    expect(listed.text).toMatch(/^binder\s+Quicksand\s+Quicksand:wght@300\s+missing/m);
    expect(listed.text).toContain('Run "etna fonts" to download what is missing.');
    const cleaned = await capture(run, ['clean']);
    expect(cleaned.text).toMatch(/Removed \d+ cached files .*licenses kept/);
    expect((await capture(run, ['clean'])).text).toBe('No cached font files to remove.');
  });

  it('caches each card theme\'s body and title fonts as TrueType: 400, 700 and the title\'s stated weight', () => {
    const faces = (name: string) => cardPdfFaces(name).map((f) => `${f.family} ${f.weight}`);
    expect(faces('binder')).toEqual(['Jost 400', 'Jost 700', 'Quicksand 300', 'Quicksand 400', 'Quicksand 700']);
    expect(faces('countertop')).toEqual(['Merriweather 400', 'Merriweather 500', 'Merriweather 700']);
    expect(faces('folio')).toEqual(['Spectral 400', 'Spectral 700']);
    expect(faces('mise')).toEqual(['Figtree 300', 'Figtree 400', 'Figtree 700']);
    expect(faces('galley')).toEqual(['IBM Plex Sans Condensed 400', 'IBM Plex Sans Condensed 700']);
  });

  it('exits 1 when a font cannot be fetched, and says it is offline', async () => {
    testing.fetch = fakeFetch({ offline: true }).fetch;
    const result = await capture(run, ['binder']);
    expect(result.code).toBe(1);
    expect(result.text).toMatch(/Quicksand\s+FAILED: cannot reach fonts\.googleapis\.com/);
    expect(result.text).toMatch(/Jost\s+skipped \(offline\)/);
    expect(result.text).toContain('connect to the internet');
  });
});

describe('etna card --fonts', () => {
  const recipe = join(ETNA_ROOT, 'cookbook', 'malted-chocolate');

  it('refuses an unknown mode', async () => {
    const result = await capture(cardRun, [recipe, '--fonts', 'cdn']);
    expect(result.code).toBe(2);
    expect(result.text).toContain('--fonts must be embedded, web or none');
  });

  it('web links to Google Fonts; none adds nothing', async () => {
    const web = await capture(cardRun, [recipe, '--theme', 'grid', '--fonts=web']);
    expect(web.code).toBe(0);
    expect(web.text).toContain('href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400..700;1,400&amp;display=swap"');
    const none = await capture(cardRun, [recipe, '--theme', 'grid', '--fonts', 'none']);
    expect(withoutIcon(none.text)).not.toContain('<link');
    expect(none.text).not.toContain('@font-face');
  });

  it('delivers every card theme\'s fonts from the cache with the network cut off', async () => {
    const names = ['binder', 'mise', 'shopping', 'folio', 'grid', 'galley', 'countertop'];
    if (names.some((name) => loadFontCss(loadTheme(name)) === null)) return; // no cache here: nothing to prove
    const offline = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed: offline'));
    try {
      for (const name of names) {
        const result = await capture(cardRun, [recipe, '--theme', name]);
        expect(result.code, name).toBe(0);
        for (const font of loadTheme(name).webfonts) {
          expect(result.text, `${name} ${font.family}`).toMatch(new RegExp(`@font-face \\{[^}]*font-family: "${font.family}";[^}]*src: url\\(data:font/woff2;base64,`));
        }
        // Nothing to fetch: no stylesheet link, no font file by URL (the CSP still names the host).
        expect(withoutIcon(result.text), name).not.toMatch(/<link|url\(\s*["']?https?:/);
      }
      expect(offline).not.toHaveBeenCalled();
    } finally {
      offline.mockRestore();
    }
  });

  it('by default embeds the cached fonts, or hints at etna fonts', async () => {
    const cached = loadFontCss(loadTheme('grid')) !== null;
    const result = await capture(cardRun, [recipe, '--theme', 'grid']);
    expect(result.code).toBe(0);
    if (cached) expect(result.text).toContain('src: url(data:font/woff2;base64,');
    else expect(result.text).toContain('run "etna fonts" to download this theme\'s fonts');
  });
});
