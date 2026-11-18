import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { VNode } from 'preact';

import { DEFAULT_APPEARANCE, faviconHref, framePageCss, MARK_SVG, PALETTE_IDS, PALETTES, parseAppearance, printAttributes, resolveScheme, rootAttributes } from '../../src/web/appearance.ts';
import { Brand, MarkIcon } from '../../src/web/brand.tsx';

const WEB = join(import.meta.dirname, '../../src/web');

describe('rootAttributes', () => {
  it('gives today’s look to a visitor with nothing stored', () => {
    expect(rootAttributes(undefined, false)).toEqual({ 'data-palette': 'plain', 'data-scheme': 'light', 'data-radius': 'soft' });
    expect(rootAttributes({}, true)['data-scheme']).toBe('dark');
  });

  it('follows the device only when asked to', () => {
    expect(resolveScheme('system', true)).toBe('dark');
    expect(resolveScheme('system', false)).toBe('light');
    expect(resolveScheme('light', true)).toBe('light');
    expect(resolveScheme('dark', false)).toBe('dark');
  });

  it('puts each choice on its attribute', () => {
    expect(rootAttributes({ palette: 'nord', scheme: 'dark', corners: 'round' }, false)).toEqual({
      'data-palette': 'nord',
      'data-scheme': 'dark',
      'data-radius': 'round',
    });
  });
});

describe('printAttributes', () => {
  it('gives the light scheme of the chosen palette, whatever the screen shows', () => {
    expect(printAttributes(undefined)).toEqual({ 'data-palette': 'plain', 'data-scheme': 'light' });
    for (const id of PALETTE_IDS) {
      for (const scheme of ['system', 'light', 'dark'] as const) expect(printAttributes({ palette: id, scheme, corners: 'round' })).toEqual({ 'data-palette': id, 'data-scheme': 'light' });
    }
  });

  it('matches the page itself when the screen is light', () => {
    const shown = rootAttributes({ palette: 'slate', scheme: 'light' }, true);
    expect(printAttributes({ palette: 'slate', scheme: 'light' })).toEqual({ 'data-palette': shown['data-palette'], 'data-scheme': shown['data-scheme'] });
  });
});

describe('the palette list', () => {
  it('is Plain, Slate, Linen, Pistachio, then the standard schemes by name', () => {
    expect(PALETTES.map((t) => t.id)).toEqual(['plain', 'slate', 'linen', 'pistachio', 'catppuccin', 'nord', 'solarized']);
    expect(PALETTES.map((t) => t.label)).toEqual(['Plain', 'Slate', 'Linen', 'Pistachio', 'Catppuccin', 'Nord', 'Solarized']);
    expect([...PALETTE_IDS]).toEqual(PALETTES.map((t) => t.id));
    const standard = PALETTES.slice(4).map((t) => t.label);
    expect(standard).toEqual([...standard].sort());
    expect(DEFAULT_APPEARANCE.palette).toBe('plain');
  });

  it('puts every palette on data-palette, in light and dark', () => {
    for (const t of PALETTES) {
      expect(rootAttributes({ palette: t.id, scheme: 'light' }, true)['data-palette']).toBe(t.id);
      expect(rootAttributes({ palette: t.id, scheme: 'light' }, true)['data-scheme']).toBe('light');
      expect(rootAttributes({ palette: t.id, scheme: 'dark' }, false)['data-scheme']).toBe('dark');
    }
  });
});

describe('parseAppearance', () => {
  it('keeps known values and names what it dropped', () => {
    const ignored: string[] = [];
    expect(parseAppearance({ palette: 'linen', corners: 'pointy', scheme: 'dark', x: 1 }, ignored)).toEqual({ palette: 'linen', scheme: 'dark' });
    expect(ignored).toEqual(['appearance.corners', 'appearance.x']);
    expect(parseAppearance('linen')).toEqual({});
    expect(parseAppearance(undefined)).toEqual({});
  });

  it('drops a value that is not a palette, with a note', () => {
    const ignored: string[] = [];
    expect(parseAppearance({ palette: 'mauve', theme: 'slate' }, ignored)).toEqual({});
    expect(ignored).toEqual(['appearance.palette', 'appearance.theme']);
  });
});

describe('the look’s pieces', () => {
  it('makes the favicon from the Contour mark, in the palette’s accent for light and dark', () => {
    const href = faviconHref({ palette: 'linen' });
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    expect(decodeURIComponent(href)).toContain(MARK_SVG);
    expect(decodeURIComponent(href)).toContain('#187d61');
    expect(decodeURIComponent(href)).toContain('#66c2a5');
    expect(decodeURIComponent(faviconHref({}))).toContain(PALETTES[0].light.accent);
  });

  it('leaves the card page alone for Soft, the default', () => {
    expect(DEFAULT_APPEARANCE.corners).toBe('soft');
    expect(framePageCss('soft', 'light')).toBeNull();
    expect(framePageCss('round', 'light')).toMatch(/^@media screen\{/);
    expect(framePageCss('round', 'dark')).toContain('border-radius:14px');
    expect(framePageCss('square', 'light')).toContain('border-radius:0');
    expect(framePageCss('square', 'light')).not.toContain('print');
  });

  it('has a rule in palettes.css for every palette in light and dark, and Plain is app.css’s own colors', () => {
    const palettes = readFileSync(join(WEB, 'palettes.css'), 'utf8');
    const app = readFileSync(join(WEB, 'app.css'), 'utf8');
    for (const t of PALETTES) for (const s of ['light', 'dark']) expect(palettes).toContain(`[data-palette="${t.id}"][data-scheme="${s}"]`);
    expect(palettes.match(/\[data-palette="([a-z]+)"\]/g)?.length).toBe(PALETTES.length * 2);
    // The swatches agree with the stylesheet.
    for (const t of PALETTES) {
      for (const s of ['light', 'dark'] as const) {
        const block = new RegExp(`\\[data-palette="${t.id}"\\]\\[data-scheme="${s}"\\] \\{([^}]*)\\}`).exec(palettes)![1];
        for (const [token, key] of [['--ground', 'ground'], ['--paper', 'paper'], ['--ink', 'ink'], ['--accent', 'accent'], ['--rule', 'rule']] as const) expect(block).toContain(`${token}: ${t[s][key]};`);
      }
    }
    const plainLight = /\[data-palette="plain"\]\[data-scheme="light"\] \{([^}]*)\}/.exec(palettes)![1];
    const rootBlock = /:root \{([\s\S]*?)\n\}/.exec(app)![1];
    for (const [, name, value] of plainLight.matchAll(/(--[a-z-]+): (#[0-9a-f]{6})/g)) expect(rootBlock).toContain(`${name}: ${value}`);
    const plainDark = /\[data-palette="plain"\]\[data-scheme="dark"\] \{([^}]*)\}/.exec(palettes)![1];
    const darkBlock = /@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\}/.exec(app)![1];
    for (const [, name, value] of plainDark.matchAll(/(--[a-z-]+): (#[0-9a-f]{6})/g)) expect(darkBlock).toContain(`${name}: ${value}`);
  });

  it('draws the mark from constant markup, without script or links', () => {
    expect(MARK_SVG).not.toMatch(/script|href|on[a-z]+=/i);
  });
});

describe('the mark and the wordmark', () => {
  it('are fixed: the Contour mark beside the 24 px wordmark in the header, a link home', () => {
    let home = 0;
    const title = Brand({ href: '/etna/?repo=a/b', onHome: () => home++ }) as VNode<{ class: string; children: VNode<Record<string, unknown>> }>;
    // The heading holds one link: to this page with no recipe, named for where it goes.
    expect(title.type).toBe('h1');
    const link = title.props.children as VNode<{ class: string; href: string; 'aria-label': string; onClick: (e: unknown) => void; children: VNode<Record<string, unknown>>[] }>;
    expect(link.type).toBe('a');
    expect(link.props).toMatchObject({ class: 'brand', href: '/etna/?repo=a/b', 'aria-label': 'Etna, home' });
    // A plain click goes home in place; a click with a modifier (a new tab) is the browser's.
    let prevented = 0;
    link.props.onClick({ button: 0, preventDefault: () => prevented++ });
    link.props.onClick({ button: 0, metaKey: true, preventDefault: () => prevented++ });
    expect([home, prevented]).toEqual([1, 1]);
    const [mark, name] = link.props.children;
    expect(mark.type).toBe(MarkIcon);
    expect(mark.props).toMatchObject({ svg: MARK_SVG, size: 24, class: 'brand-mark' });
    const svg = MarkIcon(mark.props as Parameters<typeof MarkIcon>[0]) as VNode<Record<string, unknown>>;
    expect(svg.props).toMatchObject({ width: 24, height: 24, dangerouslySetInnerHTML: { __html: MARK_SVG } });
    expect(MARK_SVG).toContain('<circle cx="12.4" cy="12.4" r="1.9"/>');
    expect(name.type).toBe('span');
    expect(name.props.children).toBe('Etna');
    const app = readFileSync(join(WEB, 'app.css'), 'utf8');
    expect(/\.top h1 \{([^}]*)\}/.exec(app)![1]).toContain('font-size: 24px');
    const palettes = readFileSync(join(WEB, 'palettes.css'), 'utf8');
    expect(palettes).not.toMatch(/data-(word)?mark/);
  });
});
