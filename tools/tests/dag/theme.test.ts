import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { parseRecipe, type Recipe } from '../../src/core/index.ts';
import { checkDagTheme, dagThemeValues, dagThemeValuesTable, defaultDagTheme, parseDagTheme, renderDag } from '../../src/dag/index.ts';
import { FONT_METRICS, FONT_X_HEIGHTS } from '../../src/dag/font-metrics.ts';
import { measurer, METRIC_FAMILIES, metricWeight, metricWeights, metricXHeight } from '../../src/dag/measure.ts';
import { faceMetrics, FONT_METRICS_FILE, fontMetricsModule } from '../../src/dag/metrics-node.ts';
import { CHARS } from '../../src/dag/metrics.ts';
import { readTheme } from '../../src/dag/theme.ts';
import { cachedPdfFaces } from '../../src/card/fonts.ts';
import { dagThemeDir, listDagThemes, readDagThemeFiles } from '../../src/dag/node.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const example = (slug: string): Recipe => parseRecipe(readFileSync(join(ETNA_ROOT, 'cookbook', slug, 'recipe.md'), 'utf8'), { units });

/** A theme.yaml with these values (each line `key: value`, written as YAML). */
const yamlTheme = (values: string, head = 'etna-theme: 1\nkind: chart\nname: test\n'): Record<string, string> => ({
  'theme.yaml': `${head}values:\n${values
    .trim()
    .split('\n')
    .map((l) => `  ${l.trim()}`)
    .join('\n')}\n`,
});

const messages = (files: Record<string, string>) => parseDagTheme(files).problems.map((p) => `${p.level}: ${p.message}`);

describe('parseDagTheme', () => {
  it('reads a valid theme, keeping only what it states', () => {
    const { theme, problems } = parseDagTheme(
      yamlTheme(`
        operation-shape: pill
        ingredient-fill: '#fff8e0'
        row-gap: 30
        columns: 2
        third-column: never
        choose-dash: '4 3'
      `),
    );
    expect(problems).toEqual([]);
    expect(theme).toEqual({
      name: 'test',
      values: { 'operation-shape': 'pill', 'ingredient-fill': '#fff8e0', 'row-gap': 30, columns: '2', 'third-column': 'never', 'choose-dash': '4 3' },
    });
  });

  it('reports unknown keys as warnings, with a suggestion', () => {
    expect(messages(yamlTheme('operation-fil: red'))).toEqual(['warning: unknown value "operation-fil" is ignored (did you mean "operation-fill"?)']);
  });

  it('reports wrong types, ranges and enum values as errors, and drops them', () => {
    const { theme, problems } = parseDagTheme(
      yamlTheme(`
        row-gap: wide
        font-size: 400
        trailing-down-max: 1.5
        operation-shape: star
        edge-stroke: notacolor
        choose-dash: dotted
        title-wrap: [1, 2]
        margin: 12
      `),
    );
    expect(problems.map((p) => [p.level, p.key])).toEqual([
      ['error', 'row-gap'],
      ['error', 'font-size'],
      ['error', 'trailing-down-max'],
      ['error', 'operation-shape'],
      ['error', 'edge-stroke'],
      ['error', 'choose-dash'],
      ['error', 'title-wrap'],
    ]);
    expect(problems[1].message).toBe('"font-size" must be between 6 and 48, got 400');
    expect(problems[3].message).toMatch(/one of `hexagon`, `rectangle`, `pill`/);
    expect(theme.values).toEqual({ margin: 12 });
  });

  it('checks the manifest', () => {
    expect(messages({})).toEqual(['error: theme.yaml is missing']);
    expect(messages({ 'theme.yaml': 'name: [' })[0]).toMatch(/^error: theme.yaml is not valid YAML/);
    expect(messages({ 'theme.yaml': 'etna-theme: 1\nkind: card\nname: x\n' })).toContain('error: theme.yaml: kind is "card", not "chart": this is not a flow-chart theme');
    expect(messages({ 'theme.yaml': 'etna-theme: 9\nkind: chart\nname: x\n' })[0]).toMatch(/contract 9/);
    expect(messages({ 'theme.yaml': 'name: x\nvalues: {}\n' })).toEqual([
      'warning: theme.yaml: no `etna-theme:` version; assuming 1',
      'warning: theme.yaml: no `kind:`; a chart theme says `kind: chart`',
    ]);
  });

  it('warns when the width table does not cover the fonts, or does not match them', () => {
    expect(messages(yamlTheme(`font-family: 'Comic Sans MS, sans-serif'\ntext-measure: sans`))).toEqual([
      expect.stringMatching(/^warning: "font-family" names "Comic Sans MS", which the sans width table was not measured for/),
    ]);
    expect(messages(yamlTheme(`font-family: 'Arial, sans-serif'`))).toEqual([
      'warning: "text-measure" is `mono` but "font-family" is not a monospace stack: use `sans` or `serif`',
    ]);
    expect(messages(yamlTheme(`font-family: 'Arial'\ntext-measure: sans`))).toEqual([
      'warning: "font-family" should end with a generic family (sans-serif, serif, monospace)',
    ]);
  });

  it('gives checkDagTheme errors and warnings, and no theme when there are errors', () => {
    expect(checkDagTheme(yamlTheme('row-gap: 30'))).toEqual({ errors: [], warnings: [], theme: { name: 'test', values: { 'row-gap': 30 } } });
    const bad = checkDagTheme(yamlTheme('row-gap: -1'));
    expect(bad.errors).toHaveLength(1);
    expect(bad.theme).toBeNull();
  });
});

describe('theme safety', () => {
  // Each of these tries to break out of the <style> block or an attribute, or to load something.
  const attacks: [string, string][] = [
    ['ingredient-fill', `'#fff"/><script>alert(1)</script>'`],
    ['ingredient-fill', `'red;}</style><script>alert(1)</script><style>'`],
    ['ingredient-fill', `'url(javascript:alert(1))'`],
    ['ingredient-fill', `'url(https://example.com/x.png)'`],
    ['ingredient-fill', `'&#60;script&#62;'`],
    ['ingredient-fill', `'red} svg{display:none'`],
    ['ingredient-fill', `'rgb(1,2,3) /* x */'`],
    ['background', `'expression(alert(1))'`],
    ['font-family', `'"Arial"; } .etna-dag{display:none'`],
    ['font-family', `'Arial</style><script>x()</script>'`],
    ['font-family', `'"Ari\\"al", sans-serif'`],
    ['font-family', `"'Arial\\" onload=\\"x', sans-serif"`],
    ['font-family', `'@import "evil.css"'`],
    ['font-family', `'Arial\\u003c/style'`],
    ['choose-label', `'<b>XOR</b>'`],
    ['choose-label', `'XOR" onload="alert(1)'`],
    ['choose-label', `'javascript:alert(1)'`],
    ['choose-dash', `'1 2" onload="x'`],
    ['choose-dash', `'1;2'`],
    ['row-gap', `'10" onload="x'`],
    ['columns', `'auto" x="'`],
    ['third-column', `'never" x="'`],
    ['operation-shape', `'hexagon<'`],
  ];

  it('refuses every value that could break out of the SVG', () => {
    for (const [key, value] of attacks) {
      const { theme, problems } = parseDagTheme(yamlTheme(`${key}: ${value}`));
      expect(problems.filter((p) => p.level === 'error').map((p) => p.key), `${key}: ${value}`).toEqual([key]);
      expect(theme.values[key], `${key}: ${value}`).toBeUndefined();
    }
  });

  it('refuses them when a theme object is passed to renderDag directly', () => {
    const recipe = example('malted-chocolate');
    for (const [key, quoted] of attacks) {
      const value = (parseYaml(`v: ${quoted}`) as { v: string }).v;
      expect(() => renderDag(recipe, { theme: { name: 'x', values: { [key]: value } } }), `${key}: ${value}`).toThrow(/Flow-chart theme "x"/);
    }
  });

  it('refuses a theme name that is not a plain name, and makes a safe class of a good one', () => {
    const { theme, problems } = parseDagTheme({ 'theme.yaml': 'etna-theme: 1\nkind: chart\nname: \'x" onload="y\'\n' });
    expect(problems.map((p) => p.message)).toContain('theme.yaml: `name` must be up to 40 letters, digits, spaces and hyphens');
    expect(theme.name).toBe('custom');
    const svg = renderDag(example('malted-chocolate'), { theme: { name: 'My Theme 2', values: {} } });
    expect(svg).toContain('class="etna-dag theme-my-theme-2"');
    // A name passed in directly is reduced to a class name too.
    expect(renderDag(example('malted-chocolate'), { theme: { name: '"><script>', values: {} } })).toContain('class="etna-dag theme-script"');
  });

  it('escapes recipe text on output', () => {
    const recipe = parseRecipe('# Fish & <Chips> "special"\n\n## Fry <it>\n\n- 1 kg fish & "chips"\n\nFry.\n', { units });
    const svg = renderDag(recipe);
    expect(svg).not.toMatch(/<(?!\/?(svg|title|style|rect|g|text|path|polygon|line|circle)[ >/])/);
    expect(svg).toContain('Fish &amp; &lt;Chips&gt; &quot;special&quot;');
    expect(svg).toContain('Fry &lt;it&gt;');
  });

  it('accepts the color, font and dash forms a theme needs', () => {
    const ok = `
      background: transparent
      ingredient-fill: '#FFF'
      ingredient-stroke: 'rgb(12, 124, 186)'
      operation-fill: 'hsl(200 70% 85%)'
      operation-stroke: steelblue
      font-family: '"Avenir Next", "Nunito Sans", Arial, sans-serif'
      choose-dash: '6, 5'
      choose-label: 'Choose one —'
    `;
    expect(parseDagTheme(yamlTheme(ok)).problems.filter((p) => p.level === 'error')).toEqual([]);
  });
});

describe('the schema', () => {
  it('gives every value a type, a group and a default that passes its own check', () => {
    for (const spec of dagThemeValues) {
      expect(spec.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(spec.effect.length).toBeGreaterThan(0);
      // Flow says `palette: app` and `fonts: card`; the schema's defaults are `own`, for themes that do not say.
      expect(defaultDagTheme.values[spec.key]).toBe(spec.key === 'palette' ? 'app' : spec.key === 'fonts' ? 'card' : spec.default);
    }
    expect(checkDagTheme({ 'theme.yaml': readFileSync(join(ETNA_ROOT, 'themes', 'flow', 'theme.yaml'), 'utf8') })).toEqual({
      errors: [],
      warnings: [],
      theme: defaultDagTheme,
    });
  });

  it('is documented in themes/README.md, word for word', () => {
    const readme = readFileSync(join(ETNA_ROOT, 'themes', 'README.md'), 'utf8');
    const start = readme.indexOf('<!-- chart-values:start -->');
    const end = readme.indexOf('<!-- chart-values:end -->');
    expect(start).toBeGreaterThan(-1);
    expect(readme.slice(start + '<!-- chart-values:start -->'.length, end).trim()).toBe(dagThemeValuesTable().trim());
  });

  it('warns, and does not refuse, when a name is longer than a toolbar menu shows; 40 is still the most', () => {
    const named = (name: string) => checkDagTheme(yamlTheme('row-gap: 30', `etna-theme: 1\nkind: chart\nname: ${name}\n`));
    const long = named('Sunday Market Flow Chart Large');
    expect(long.errors).toEqual([]);
    expect(long.theme?.name).toBe('Sunday Market Flow Chart Large');
    expect(long.warnings).toEqual([
      'theme.yaml: name: "Sunday Market Flow Chart Large" is 30 characters; toolbar menus show 13 and will cut it to "Sunday Marke…" (Settings shows it whole). Keep it to a word or two',
    ]);
    expect(named('Thirteen char').warnings).toEqual([]);
    expect(named('x'.repeat(41)).errors).toEqual(['theme.yaml: `name` must be up to 40 letters, digits, spaces and hyphens']);
  });

  it('keeps every bundled chart theme clean: no errors, no warnings, only values it changes', () => {
    for (const name of listDagThemes()) {
      const files = readDagThemeFiles(dagThemeDir(name));
      expect(checkDagTheme(files), name).toMatchObject({ errors: [], warnings: [] });
      expect(files['README.md'], `${name}/README.md`).toBeDefined();
      if (name === 'flow') continue;
      const { theme } = parseDagTheme(files);
      // `palette` and `fonts` are never inherited from flow (palette.ts and card-type.ts read the
      // theme's own), so dense states `app` and `card` too.
      for (const [key, value] of Object.entries(theme.values)) if (key !== 'palette' && key !== 'fonts') expect(value, `${name}: ${key}`).not.toBe(defaultDagTheme.values[key]);
    }
  });
});

describe('text measure', () => {
  it('counts characters with mono, and gives proportional widths in cells otherwise', () => {
    expect(measurer('mono', 700, 0.6)('240 g cream')).toBe(11);
    const sans = measurer('sans', 400, 0.5);
    expect(sans('iiii')).toBeLessThan(sans('MMMM'));
    // Arial's "i" is 0.222 em: the table is never narrower than the widest font it covers.
    expect(sans('i')).toBeGreaterThanOrEqual(0.222 / 0.5);
    // Heavier is wider; an unknown character counts as the widest.
    expect(measurer('sans', 700, 0.5)('cream')).toBeGreaterThan(sans('cream'));
    expect(sans('中')).toBe(Math.max(...[...'MW—%'].map((c) => sans(c))));
    // The same in every run: no font is consulted.
    expect(measurer('serif', 400, 0.55)('Pistachio')).toBe(measurer('serif', 400, 0.55)('Pistachio'));
  });
});

describe('generated font metrics', () => {
  it('is what `etna fonts metrics` writes from the cached TrueType files', () => {
    const faces = cachedPdfFaces();
    expect(fontMetricsModule(faces)).toBe(readFileSync(FONT_METRICS_FILE, 'utf8'));
    // The same files in any order give the same module.
    expect(fontMetricsModule([...faces].reverse())).toBe(fontMetricsModule(faces));
  });

  it('covers every bundled chart and card font, at the weights cached, one advance per character', () => {
    for (const family of ['Arimo', 'JetBrains Mono', 'Nunito Sans', 'Merriweather', 'Quicksand', 'Jost', 'Inter', 'IBM Plex Sans Condensed', 'Spectral', 'Figtree']) {
      expect(METRIC_FAMILIES, family).toContain(family);
    }
    expect(metricWeights('Merriweather')).toEqual([400, 500, 700]);
    expect(metricWeights('Nunito Sans')).toEqual([300, 500, 600]);
    for (const family of METRIC_FAMILIES) for (const w of metricWeights(family)) expect(FONT_METRICS[family][w]).toHaveLength([...CHARS].length);
  });

  it('gives every face its x-height, read from the TrueType file', () => {
    for (const family of METRIC_FAMILIES) expect(Object.keys(FONT_X_HEIGHTS[family]).map(Number), family).toEqual(metricWeights(family));
    // OS/2 sxHeight over unitsPerEm: JetBrains Mono 550/1000, Spectral 450 and 456/1000, Merriweather 1111/2000, Arimo 1082/2048.
    expect(FONT_X_HEIGHTS['JetBrains Mono']).toEqual({ 400: 550, 700: 550 });
    expect(FONT_X_HEIGHTS.Spectral).toEqual({ 400: 450, 700: 456 });
    expect(FONT_X_HEIGHTS.Merriweather[400]).toBe(555.5);
    expect(FONT_X_HEIGHTS.Arimo[400]).toBe(528.3);
    for (const face of cachedPdfFaces()) expect(faceMetrics(face).xHeight, face.path).toBe(FONT_X_HEIGHTS[face.family][face.weight]);
    expect(metricXHeight('Spectral', 600)).toBe(0.456);
    expect(metricXHeight('No Such Font', 400)).toBeNull();
  });
});

describe('text measure with font metrics', () => {
  it('measures a family with metrics by its own widths', () => {
    // Arimo is Arial-compatible: "i" is 0.222 em, "W" 0.944 em, where the sans table is wider.
    const arimo = measurer('sans', 400, 1, 'Arimo');
    expect(arimo('i')).toBe(0.222);
    expect(arimo('W')).toBe(0.944);
    expect(arimo('cream')).toBeLessThan(measurer('sans', 400, 1)('cream'));
    // In cells of char-width em.
    expect(measurer('sans', 400, 0.5, 'Arimo')('i')).toBeCloseTo(0.444, 10);
    // A character not in the table counts as the face's widest.
    expect(arimo('中')).toBe(Math.max(...FONT_METRICS.Arimo[400]) / 1000);
  });

  it('gives JetBrains Mono one cell per character at char-width 0.6, as mono does', () => {
    for (const w of [400, 700]) {
      const m = measurer('mono', w, 0.6, 'JetBrains Mono');
      // ⅓ ⅔ ⅛ are not in the font: they count as its widest, which is 0.6 em too.
      expect(m(CHARS)).toBe([...CHARS].length);
      expect(m('240 g cream')).toBe(measurer('mono', w, 0.6)('240 g cream'));
    }
  });

  it('takes the nearest weight the family has, the heavier on a tie', () => {
    expect(metricWeight('Nunito Sans', 300)).toBe(300);
    expect(metricWeight('Nunito Sans', 400)).toBe(500);
    expect(metricWeight('Nunito Sans', 900)).toBe(600);
    expect(metricWeight('Merriweather', 600)).toBe(700);
    expect(metricWeight('Spectral', 100)).toBe(400);
    expect(metricWeight('No Such Font', 400)).toBeNull();
    expect(measurer('sans', 400, 1, 'Nunito Sans')('cream')).toBe(measurer('sans', 500, 1, 'Nunito Sans')('cream'));
    expect(measurer('sans', 700, 1, 'Arimo')('cream')).toBeGreaterThan(measurer('sans', 400, 1, 'Arimo')('cream'));
  });

  it('falls back to text-measure for a family without metrics', () => {
    for (const family of ['Comic Sans MS', 'constructor', 'sans-serif', undefined]) {
      expect(measurer('sans', 400, 0.55, family)('Pistachio')).toBe(measurer('sans', 400, 0.55)('Pistachio'));
      expect(measurer('serif', 700, 0.55, family)('Pistachio')).toBe(measurer('serif', 700, 0.55)('Pistachio'));
      expect(measurer('mono', 400, 0.6, family)('Pistachio')).toBe(9);
    }
  });

  it('is what a theme measures with: the first family of its stack', () => {
    const ink = readTheme(parseDagTheme(readDagThemeFiles(dagThemeDir('ink'))).theme);
    expect(ink.measure(400)('cream')).toBe(measurer('sans', 400, 0.55, 'Arimo')('cream'));
    const own = readTheme({ name: 't', values: { 'font-family': '"Comic Neue", Arial, sans-serif', 'text-measure': 'sans', 'title-font-family': 'Spectral, serif', 'title-text-measure': 'serif' } });
    expect(own.measure(400)('cream')).toBe(measurer('sans', 400, 0.6)('cream'));
    expect(own.measure(700, 'title')('cream')).toBe(measurer('serif', 700, 0.6, 'Spectral')('cream'));
  });

  it('does not warn about the rest of a stack led by a family with metrics', () => {
    expect(messages(yamlTheme(`font-family: 'Spectral, "Comic Sans MS", serif'\ntext-measure: serif\ntitle-font-family: 'Inter, sans-serif'`))).toEqual([]);
  });
});

describe('recipe text in the chart', () => {
  it('drops control characters, which XML does not allow even escaped', () => {
    const source = '---\netna: 1\n---\n\n# Bad\u0001 Title\u000b\n\n## Mix\u0002 it\n\n- 1 g salt\u0008\n\nStir.\n';
    const svg = renderDag(parseRecipe(source, { units }));
    // eslint-disable-next-line no-control-regex
    expect(svg).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    expect(svg).toContain('Bad Title');
  });
});
