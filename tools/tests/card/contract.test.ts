// The theme contract: the page shell, the core stylesheet, labels, layouts, contract
// versions, what a theme may not contain, and the checker.

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import {
  CARD_CSP,
  CARD_CSP_WEB,
  CARD_ICON,
  checkTheme,
  CORE_CSS,
  DEFAULT_LABELS,
  parseTheme,
  renderCard,
  renderCardParts,
  THEME_CONTRACT,
} from '../../src/card/index.ts';
import { listThemes, loadTheme, readThemeFiles, THEMES_DIR } from '../../src/card/node.ts';
import { loadUnits } from '../../src/node/files.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { vi } from 'vitest';
import { run } from '../../src/card/theme-cli.ts';

const units = loadUnits();
const count = (text: string, needle: string) => text.split(needle).length - 1;

const RECIPE = parseRecipe(
  '---\netna: 1\nform: traditional\nyield: 4 bowls\n---\n\n# Soup\n\n## Ingredients\n\n- 1 g salt\n\n## Directions\n\n1. Stir.\n\n## Notes\n\nKeeps.\n',
  { units },
);

const SKELETON =
  '<article class="card">{{title}}{{#ingredients}}<div class="ingredients">{{ingredients}}</div>{{/ingredients}}' +
  '{{#directions}}<div class="directions">{{directions}}</div>{{/directions}}{{#components}}{{components}}{{/components}}</article>';

/** A minimal, valid theme; `change` edits its files. */
function files(change: Record<string, string> = {}): Record<string, string> {
  return {
    'theme.yaml': 'etna-theme: 1\nkind: card\nname: Test\ndescription: A test.\n',
    'card.html': SKELETON,
    'card.css': '.theme-rule { color: red; }',
    'README.md': '# Test\n',
    ...change,
  };
}

describe('the page shell', () => {
  const theme = parseTheme(files());
  const doc = renderCard(RECIPE, theme);

  it('wraps the fragment once, in a document the renderer writes', () => {
    expect(doc).toMatch(/^<!doctype html>\n<html lang="en"[ >]/);
    expect(count(doc, '<!doctype')).toBe(1);
    expect(count(doc, '<html')).toBe(1);
    expect(count(doc, '<body class="card-page">')).toBe(1);
    expect(count(doc, '<article class="card">')).toBe(1);
    expect(count(doc, '<style>')).toBe(1);
    expect(doc).toContain('<meta charset="utf-8">');
    expect(doc).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(doc).toContain('<title>Soup</title>');
    expect(doc.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('carries the Content-Security-Policy', () => {
    expect(CARD_CSP).toBe("default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:");
    expect(CARD_CSP_WEB).toBe(
      "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src data: https://fonts.gstatic.com; img-src data:",
    );
    // A paged card admits exactly one script: the paging script, by the hash of its text.
    const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256').update(scripts[0]).digest('base64');
    const policy = CARD_CSP.replace("default-src 'none';", `default-src 'none'; script-src 'sha256-${hash}';`);
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${policy}">`);
    expect(count(doc, 'script-src')).toBe(1);
    expect(doc).not.toMatch(/unsafe-eval|'unsafe-inline' 'sha|script-src[^;]*(https?:|\*|'self')/);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<style>'));
    // Without paging: no script, and the policy runs none.
    const plain = renderCard(RECIPE, theme, { paging: false });
    expect(plain).toContain(`<meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">`);
    expect(plain).not.toContain('<script');
  });

  it('names an empty data: icon, so a card opened as a tab asks for no /favicon.ico', () => {
    for (const options of [{}, { paging: false }, { paging: false, webfonts: { mode: 'web' as const } }]) {
      const card = renderCard(RECIPE, theme, options);
      expect(count(card, 'rel="icon"')).toBe(1);
      expect(card).toContain(`${CARD_ICON}\n`);
      expect(CARD_ICON).toBe('<link rel="icon" href="data:,">');
      // After the policy, so the policy governs it; and the policy admits data: images, nothing else.
      expect(card.indexOf('rel="icon"')).toBeGreaterThan(card.indexOf('Content-Security-Policy'));
      const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(card)![1];
      expect(policy).toMatch(/(^|; )img-src data:(;|$)/);
    }
  });

  it('allows Google Fonts only when the fonts come from the web', () => {
    for (const mode of ['none', 'embedded'] as const) {
      const local = renderCard(RECIPE, theme, { paging: false, webfonts: { mode, css: '' } });
      expect(local).toContain(`content="${CARD_CSP}"`);
      expect(local).not.toContain('googleapis');
    }
    expect(renderCard(RECIPE, theme, { paging: false, webfonts: { mode: 'web' } })).toContain(`content="${CARD_CSP_WEB}"`);
  });

  it('takes the page language from theme.yaml', () => {
    expect(renderCard(RECIPE, parseTheme(files({ 'theme.yaml': 'name: T\nlang: fr\n' })))).toContain('<html lang="fr" ');
    expect(renderCard(RECIPE, parseTheme(files({ 'theme.yaml': 'name: T\nlang: "x\\"y"\n' })))).toContain('<html lang="en" ');
  });

  it('renderCardParts gives the fragment alone, and the CSS', () => {
    const { html, css } = renderCardParts(RECIPE, theme);
    expect(html.startsWith('<article class="card">')).toBe(true);
    expect(html).not.toMatch(/<html|<head|<body|<style|<meta|doctype/i);
    expect(css).toContain('.theme-rule');
  });
});

describe('the core stylesheet', () => {
  it('is emitted once, after the renderer settings and before the theme css', () => {
    const { css } = renderCardParts(RECIPE, parseTheme(files()));
    expect(count(css, CORE_CSS)).toBe(1);
    expect(css.indexOf('--card-font-body')).toBeLessThan(css.indexOf(CORE_CSS));
    expect(css.indexOf(CORE_CSS)).toBeLessThan(css.indexOf('.theme-rule'));
    const doc = renderCard(RECIPE, parseTheme(files()));
    expect(count(doc, 'etna card core')).toBe(1);
  });

  it('is not part of the theme, and every bundled theme gets it', () => {
    for (const name of listThemes()) {
      const theme = loadTheme(name);
      expect(theme.css).not.toContain('etna card core');
      expect(count(renderCardParts(RECIPE, theme).css, 'etna card core')).toBe(1);
    }
  });

  it('is plain CSS a theme could carry itself', () => {
    expect(CORE_CSS).not.toMatch(/<|@import|url\(/);
  });
});

describe('labels', () => {
  const skeleton = '<article class="card"><h1>{{title}}</h1><h2>{{label.ingredients}}</h2>{{ingredients}}<h2>{{label.directions}}</h2>{{directions}}<p>{{label.serves}}</p>{{meta}}</article>';

  it('have English defaults for every word the renderer prints', () => {
    for (const name of ['ingredients', 'directions', 'notes', 'yield', 'source', 'version', 'license', 'choose', 'option', 'see', 'from', 'above', 'below']) {
      expect(DEFAULT_LABELS[name], name).toBeTruthy();
    }
    const { html } = renderCardParts(RECIPE, parseTheme(files({ 'card.html': skeleton })), { slots: { yield: true } });
    expect(html).toContain('<h2>Ingredients</h2>');
    expect(html).toContain('<h2>Directions</h2>');
    expect(html).toContain('<span class="meta-label">Yield</span> 4 bowls');
    expect(html).toContain('<p></p>'); // a label nobody defined is empty
  });

  it('are overridden by theme.yaml, then by the caller, and escaped', () => {
    const theme = parseTheme(
      files({
        'card.html': skeleton,
        'theme.yaml': 'name: T\nlabels:\n  directions: Method\n  yield: Makes\n  serves: "Serves <4>"\n',
      }),
    );
    const { html } = renderCardParts(RECIPE, theme, { slots: { yield: true } });
    expect(html).toContain('<h2>Method</h2>');
    expect(html).toContain('<span class="meta-label">Makes</span>');
    expect(html).toContain('<p>Serves &lt;4&gt;</p>');
    expect(renderCardParts(RECIPE, theme, { labels: { directions: 'Méthode' } }).html).toContain('<h2>Méthode</h2>');
  });

  it('leave no printed words in the bundled skeletons', () => {
    for (const name of listThemes()) {
      const words = loadTheme(name)
        .skeleton.replace(/<[^>]*>/g, ' ')
        .replace(/\{\{[^}]*\}\}/g, ' ')
        .match(/\p{L}+/gu);
      expect(words, name).toBeNull();
    }
  });
});

describe('contract version and kind', () => {
  it('reads a missing version as 1', () => {
    expect(parseTheme(files({ 'theme.yaml': 'name: T\n' })).contract).toBe(1);
    expect(parseTheme(files()).contract).toBe(1);
  });

  it('refuses a theme written for a newer contract', () => {
    const newer = files({ 'theme.yaml': `etna-theme: ${THEME_CONTRACT + 1}\nname: Future\n` });
    expect(() => parseTheme(newer)).toThrow(/theme "Future": was written for theme contract 3, and this renderer knows contract 2 at most/);
    expect(() => parseTheme(files({ 'theme.yaml': 'etna-theme: one\nname: T\n' }))).toThrow(/whole number/);
  });

  it('refuses a chart theme', () => {
    expect(() => parseTheme(files({ 'theme.yaml': 'kind: chart\nname: flow\n' }))).toThrow(/chart theme/);
    expect(() => parseTheme(readThemeFiles(join(THEMES_DIR, 'flow')))).toThrow(/chart theme/);
    expect(listThemes()).not.toContain('flow');
  });
});

describe('what a theme may not contain', () => {
  const skeleton = (inner: string) => files({ 'card.html': SKELETON.replace('</article>', `${inner}</article>`) });

  it.each([
    ['<script>alert(1)</script>', /card\.html contains a <script> element/],
    ['<SCRIPT src=x>', /<script> element/],
    ['<iframe src="https://example.com">', /<iframe> element/],
    ['<object data=x>', /<object> element/],
    ['<embed src=x>', /<embed> element/],
    ['<link rel="stylesheet" href="https://example.com/x.css">', /<link> element/],
    ['<meta http-equiv="refresh" content="0;url=https://example.com">', /<meta> element/],
    ['<base href="https://example.com/">', /<base> element/],
    ['<style>body{}</style>', /<style> element/],
    ['<form action="https://example.com"><input></form>', /<form> element/],
    ['<img src=x onerror="alert(1)">', /event-handler attribute \(onerror=\)/],
    ['<div class="x"onclick="go()">', /event-handler attribute \(onclick=\)/],
    ['<a href="javascript:alert(1)">x</a>', /javascript: URL/],
    ['<a href="java&#115;cript:alert(1)">x</a>', /javascript: URL/],
    ['<a href=" JAVA\tSCRIPT:alert(1)">x</a>', /javascript: URL/],
    // Markup that would load a remote resource (the security review's eight forms, and kin).
    ['<img src="http://example.com/img">', /<img> element/],
    ['<IMG srcset="http://example.com/srcset 1x">', /<img> element/],
    ['<picture><source srcset="http://example.com/s"></picture>', /<picture> element/],
    ['<video src="http://example.com/video" autoplay muted></video>', /<video> element/],
    ['<audio src="http://example.com/a"></audio>', /<audio> element/],
    ['<svg><image href="http://example.com/svgimage"/></svg>', /<image> element/],
    ['<svg><filter><feImage href="http://example.com/feimage"/></filter></svg>', /<feimage> element/],
    ['<input type="image" src="http://example.com/inputimg">', /<input type="image">/],
    ['<input type=IMAGE>', /<input type="image">/],
    ['<div srcset="http://example.com/x 1x"></div>', /srcset= attribute/],
    ['<svg><use href="http://example.com/s.svg#x"/></svg>', /href= attribute/],
    ['<svg><use xlink:href="//example.com/s.svg#x"/></svg>', /xlink:href= attribute/],
    ['<div background="http://example.com/b"></div>', /background= attribute/],
    ['<table><td background=x></td></table>', /background= attribute/],
    ['<div style="background:url(http://example.com/styleattr)"></div>', /style= attribute that contains url\(/],
    ["<div style='background-image:image-set(\"http://example.com/i\" 1x)'></div>", /style= attribute that contains image-set/],
    ['<div style="background:&#117;rl(http://example.com/x)"></div>', /style= attribute that contains url\(/],
    ['<div style="@import \'x.css\'"></div>', /style= attribute that contains @import/],
  ])('refuses a skeleton with %s', (inner, reason) => {
    expect(() => parseTheme(skeleton(inner))).toThrow(reason);
    expect(() => parseTheme(skeleton(inner))).toThrow(/theme "Test": card\.html/);
  });

  it('refuses a whole document: the renderer writes the page', () => {
    expect(() => parseTheme(files({ 'card.html': `<!doctype html><html><body>${SKELETON}</body></html>` }))).toThrow(/fragment/);
  });

  it.each([
    ['@import "https://example.com/x.css";', /card\.css contains @import/],
    ['@\\69mport "x.css";', /@import/],
    ['.x { width: expression(alert(1)); }', /expression\(\)/],
    ['.x { behavior: url(x.htc); }', /behavior/],
    ['.x { -moz-binding: url(x.xml#x); }', /-moz-binding/],
    ['.x { background: url(https://example.com/a.png); }', /url\(https:\/\/example\.com\/a\.png\)/],
    ['.x { background: url( "//example.com/a.png" ); }', /data: URLs/],
    ['.x { background: \\75 rl(https://example.com/a.png); }', /data: URLs/],
    ['@font-face { font-family: X; src: url(x.woff2); }', /data: URLs/],
    ['.x { background: image-set("https://example.com/a.png" 1x); }', /image-set/],
  ])('refuses a stylesheet with %s', (css, reason) => {
    expect(() => parseTheme(files({ 'card.css': css }))).toThrow(reason);
  });

  it('accepts in card.html what loads nothing: data: URLs, #fragment links, data- attributes, plain inline styles', () => {
    for (const inner of [
      '<div data-role="x" style="color: red; background: url(data:image/png;base64,AAAA)"></div>',
      '<svg><use href="#mark"/><use xlink:href="#mark"/></svg>',
      '<div class="src href">srcset is a word here</div>',
    ]) {
      expect(() => parseTheme(skeleton(inner)), inner).not.toThrow();
    }
  });

  it('accepts data: URLs', () => {
    const css = '/* a comment */\n.x { background: url("data:image/png;base64,AAAA"); }\n@font-face { font-family: X; src: url(data:font/woff2;base64,AAAA) format("woff2"); }';
    expect(() => parseTheme(files({ 'card.css': css }))).not.toThrow();
  });

  it('does not let a comment hide live CSS: what is refused is refused inside a comment too', () => {
    // A string that looks like a comment opening, and an escaped slash, are not comments.
    for (const css of [
      '.a{content:"/*";background:url(https://example.com/x.png)}.b{content:"*/"}',
      '\\/* ; background-image:url(https://example.com/x.png) */',
      '/* url(https://example.com) */ .x { color: red; }',
      '/* @import "x.css"; */',
    ]) {
      expect(() => parseTheme(files({ 'card.css': css })), css).toThrow(/url\(|@import/);
    }
  });

  it('finds an event handler after a ">" inside a quoted value, and refuses named elements and links', () => {
    const skeleton = (extra: string) => `<article class="card" ${extra}>{{title}}{{ingredients}}{{directions}}{{components}}</article>`;
    expect(() => parseTheme(files({ 'card.html': skeleton('title=">" onmouseover="alert(1)"') }))).toThrow(/event-handler attribute \(onmouseover=\)/);
    expect(() => parseTheme(files({ 'card.html': skeleton('') + '<img name="createElement" src="data:,">' }))).toThrow(/name= attribute/);
    expect(() => parseTheme(files({ 'card.html': skeleton('') + '<a href="https://example.com">x</a>' }))).toThrow(/<a> element/);
  });

  it('accepts every bundled theme', () => {
    for (const name of listThemes()) expect(() => loadTheme(name), name).not.toThrow();
  });
});

describe('checkTheme', () => {
  it('warns, and does not refuse, when a name is longer than a toolbar menu shows', () => {
    const files = readThemeFiles(join(THEMES_DIR, 'mise'));
    const named = (name: string) => checkTheme({ ...files, 'theme.yaml': files['theme.yaml'].replace(/^name: Mise$/m, `name: ${name}`) }, { units });
    const long = named('Long Weekend Kitchen Sheet Two');
    expect(long.errors).toEqual([]);
    expect(long.theme?.name).toBe('Long Weekend Kitchen Sheet Two');
    expect(long.warnings).toEqual([
      'theme.yaml: name: "Long Weekend Kitchen Sheet Two" is 30 characters; toolbar menus show 13 and will cut it to "Long Weekend…" (Settings shows it whole). Keep it to a word or two',
    ]);
    // Exactly the limit: no warning.
    expect(named('Thirteen char').warnings).toEqual([]);
  });

  it('passes every bundled card theme with no errors and no warnings', () => {
    for (const name of listThemes()) {
      const report = checkTheme(readThemeFiles(join(THEMES_DIR, name)), { units });
      expect(report.errors, name).toEqual([]);
      expect(report.warnings, name).toEqual([]);
      expect(report.theme?.name.toLowerCase().startsWith(name), name).toBe(true); // "Shopping list" lives in shopping/
    }
  });

  it('maps only a keyword to a label: an aside prints its own label (SPEC §5.1)', () => {
    const yaml = 'etna-theme: 1\nkind: card\nname: Test\ndescription: A test.\nlabels:\n  callouts:\n    Checkpoint: Check\n    Note: Remarque\n';
    const report = checkTheme(files({ 'theme.yaml': yaml }), { units });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      'theme.yaml: labels.callouts.Note is never used: only a keyword (Checkpoint, Choose) takes a theme\'s label; any other callout prints its own',
    ]);
    const source = '---\netna: 1\n---\n\n# Soup\n\n## Cook\n\nStir.\n\n> **Checkpoint** — if thick, add water.\n\n> **Note** — keeps well.\n';
    const { html } = renderCardParts(parseRecipe(source, { units }), parseTheme(files({ 'theme.yaml': yaml })));
    expect(html).toContain('<span class="callout-label">Check</span> if thick, add water.');
    expect(html).toContain('<span class="callout-label">Note</span> keeps well.');
    expect(html).not.toContain('Remarque');
  });

  it('passes the minimal theme', () => {
    expect(checkTheme(files(), { units })).toMatchObject({ errors: [], warnings: [] });
  });

  it('lets a theme read and set the color roles', () => {
    const css =
      ':root { --card-paper: #fdfcf8; --card-desk: #ddd; --card-ink: #222; --card-ink-soft: #555; }\n' +
      '.card-title { border-bottom: 1pt solid var(--card-ink); color: var(--card-ink); }\n.intro { color: var(--card-ink-soft); border-top: 0.5pt solid var(--card-ink); }';
    expect(checkTheme(files({ 'card.css': css }), { units })).toMatchObject({ errors: [], warnings: [] });
    // Set after the renderer's defaults, so the theme's own values win.
    const out = renderCardParts(RECIPE, parseTheme(files({ 'card.css': css }))).css;
    expect(out.indexOf('--card-ink: #000;')).toBeLessThan(out.indexOf('--card-ink: #222;'));
  });

  it('reports everything wrong with a broken theme', () => {
    const broken = {
      'theme.yaml': [
        'name: Broken',
        'color: red',
        'page:',
        '  size: tabloid',
        '  margin: wide',
        'options:',
        '  steps: paired',
        '  layout: sideways',
        '  font-size: big',
        '  fonts:',
        '    body: Helvetica, Arial',
        '  slots:',
        '    intro: yes',
        '    footer: true',
        '  display:',
        '    units: furlongs',
        'labels:',
        '  callouts: nope',
      ].join('\n'),
      'card.html': '<article class="card"><h1>{{title}}</h1><h2>Ingredients</h2>{{ingredients}}{{css}}{{nonsense}}{{label.nothing}}{{#notes}}<script>x</script></article>',
      'card.css': '@import "x.css";',
      'old.css': '',
    };
    const { errors, warnings, theme } = checkTheme(broken, { units });
    expect(theme).toBeNull();
    const all = errors.join('\n');
    for (const expected of [
      'theme.yaml: unknown key "color"',
      'theme.yaml: page.size must be letter, a4, half-letter, index-4x6, index-5x7, legal or a5',
      'theme.yaml: page.margin must be one to four lengths',
      'theme.yaml: unknown key "options.steps"',
      'theme.yaml: options.layout "sideways" is not a known layout (hoisted, paired, list)',
      'theme.yaml: options.font-size must be a size',
      'theme.yaml: options.fonts.body must end in a generic family',
      'theme.yaml: options.slots.intro must be true or false',
      'theme.yaml: unknown slot switch "options.slots.footer"',
      'theme.yaml: options.display.units must be long or symbol',
      'theme.yaml: labels.callouts must be a map of keys',
      'card.css: contains @import',
      'card.html: contains a <script> element',
      'card.html: {{css}}: the renderer writes the <style> element itself',
      'card.html: {{nonsense}}: no such slot',
      'card.html: {{label.nothing}}: no such label',
      'card.html: {{directions}} is missing',
      'card.html: {{#notes}} and {{/notes}} do not pair up',
    ]) {
      expect(all).toContain(expected);
    }
    const allWarnings = warnings.join('\n');
    expect(allWarnings).toContain('theme.yaml: no etna-theme: version; read as contract 1');
    expect(allWarnings).toContain('theme.yaml: no kind:');
    expect(allWarnings).toContain('README.md: missing');
    expect(allWarnings).toContain('old.css: not used by theme.yaml');
    expect(allWarnings).toContain('card.html: prints the words "Ingredients"');
    expect(allWarnings).toContain('card.html: no {{components}} slot');
  });

  it('requires card.css beside card.html', () => {
    const { 'card.css': _css, ...without } = files();
    expect(checkTheme(without).errors).toContain('card.css: missing');
  });

  it('takes a title weight in hundreds, and refuses anything else', () => {
    const manifest = (weight: string) => `etna-theme: 1\nkind: card\nname: Test\ndescription: A test.\noptions:\n  fonts:\n    title-weight: ${weight}\n`;
    expect(checkTheme(files({ 'theme.yaml': manifest('300') })).errors).toEqual([]);
    for (const bad of ['350', '1000', 'bold', '0']) {
      expect(checkTheme(files({ 'theme.yaml': manifest(bad) })).errors.join('\n'), bad).toMatch(/options\.fonts\.title-weight must be a weight from 100 to 900 in hundreds/);
    }
  });

  it('refuses a newer contract and a chart theme', () => {
    expect(checkTheme(files({ 'theme.yaml': 'etna-theme: 9\nkind: card\nname: T\ndescription: d\n' })).errors).toEqual([
      'theme.yaml: etna-theme 9 is newer than this renderer (it knows contract 2)',
    ]);
    expect(checkTheme(readThemeFiles(join(THEMES_DIR, 'flow'))).errors[0]).toMatch(/flow-chart theme/);
  });

  it('renders the samples, and reports a theme that drops ingredients', () => {
    // A theme that prints the ingredients only for recipes with components: legal syntax, wrong card.
    const sly = files({ 'card.html': SKELETON.replace('{{#ingredients}}<div class="ingredients">{{ingredients}}</div>{{/ingredients}}', '{{#components}}{{ingredients}}{{/components}}') });
    const { errors } = checkTheme(sly, { units });
    expect(errors.join('\n')).toMatch(/sample traditional recipe prints 0 of its 5 ingredients/);
  });

  it('accepts custom labels a skeleton uses', () => {
    const custom = files({
      'theme.yaml': 'etna-theme: 1\nkind: card\nname: T\ndescription: d\nlabels:\n  serves: Serves\n',
      'card.html': SKELETON.replace('</article>', '<p>{{label.serves}}</p></article>'),
    });
    expect(checkTheme(custom, { units })).toMatchObject({ errors: [], warnings: [] });
  });
});

describe('etna theme', () => {
  const capture = async (argv: string[]) => {
    const out: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    const err = vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
    try {
      return { code: await run(argv), text: out.join('\n') };
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  };

  it('lists the card themes with their layout', async () => {
    const { code, text } = await capture(['list']);
    expect(code).toBe(0);
    expect(text).toMatch(/^binder\s+hoisted\s+Letter-size/m);
    expect(text).toMatch(/^mise\s+paired\s+/m);
    // A chart theme is not listed among the card themes; it comes in its own table below.
    expect(text.split('Chart themes')[0]).not.toMatch(/^flow/m);
    expect(text.split('Chart themes')[1]).toMatch(/^flow/m);
  });

  it('checks themes by name and by directory, failing on errors only', async () => {
    expect((await capture(['check', 'binder', 'mise', 'folio', 'grid', 'countertop', 'galley', 'shopping'])).code).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), 'etna-theme-'));
    try {
      for (const [name, text] of Object.entries(files())) writeFileSync(join(dir, name), text);
      writeFileSync(join(dir, 'theme.yaml'), 'name: Mine\n');
      const warned = await capture(['check', dir]);
      expect(warned.code).toBe(0);
      expect(warned.text).toContain('ok, with warnings');
      writeFileSync(join(dir, 'card.html'), '<article class="card">{{title}}</article>');
      const failed = await capture(['check', dir]);
      expect(failed.code).toBe(1);
      expect(failed.text).toContain('{{ingredients}} is missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Chart themes are listed after the card themes, and checked by the chart checker.
    const listed = await capture(['list']);
    expect(listed.text).toMatch(/Chart themes[\s\S]*\bink\b[\s\S]*\bstation\b/);
    const chart = await capture(['check', 'ink', 'flow']);
    expect(chart.code).toBe(0);
    expect(chart.text).toMatch(/ink: ok/);
    const bad = mkdtempSync(join(tmpdir(), 'etna-chart-theme-'));
    try {
      writeFileSync(join(bad, 'theme.yaml'), 'etna-theme: 1\nkind: chart\nname: Bad\nvalues:\n  background: "url(https://example.com/x)"\n');
      expect((await capture(['check', bad])).code).toBe(1);
    } finally {
      rmSync(bad, { recursive: true, force: true });
    }
    expect((await capture(['check', 'no-such-theme'])).code).toBe(1);
    expect((await capture(['check'])).code).toBe(2);
    expect((await capture(['frobnicate'])).code).toBe(2);
    expect((await capture(['--help'])).text).toContain('Usage: etna theme list');
  });
});

describe('fit sizes stay within what a card can be printed at', () => {
  it('the checker refuses sizes outside the range, and the limits are clamped whatever a theme says', async () => {
    const { fitLimits, pagingProblems, FIT_SIZE_RANGE } = await import('../../src/card/paper.ts');
    expect(pagingProblems({ fit: { max: '900000000pt' } })).toEqual([`fit.max must be between ${FIT_SIZE_RANGE.min}pt and ${FIT_SIZE_RANGE.max}pt`]);
    expect(pagingProblems({ fit: { min: '0.1pt' } })).toEqual([`fit.min must be between ${FIT_SIZE_RANGE.min}pt and ${FIT_SIZE_RANGE.max}pt`]);
    expect(pagingProblems({ fit: { min: '9pt', max: '12pt' } })).toEqual([]);
    // parseTheme does not run the checker, so the limits themselves are bounded too.
    const wild = fitLimits('11pt', { min: 0.0001, max: 900000000 })!;
    expect(wild.min).toBe(FIT_SIZE_RANGE.min);
    expect(wild.max).toBe(FIT_SIZE_RANGE.max);
    const inf = fitLimits('11pt', { max: Infinity })!;
    expect(Number.isFinite(inf.max)).toBe(true);
    expect((inf.max - inf.min) / inf.step).toBeLessThan(1000);
  });
});
