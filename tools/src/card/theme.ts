// A card theme, built from its files. See themes/README.md for the contract.
//
// Pure and browser-safe: a theme arrives as file name → text, however the caller got it
// (read from disk, bundled into the GUI, fetched from someone's repository).

import { parse as parseYaml } from 'yaml';

import { layoutName, partsName, skeletonProblems, stylesheetProblems, THEME_CONTRACT, type LayoutName, type PartsName } from './contract.ts';
import { readWebfonts, webfontProblems, type WebFont } from './webfonts.ts';

export interface Theme {
  name: string;
  manifest: Record<string, unknown>; // parsed theme.yaml
  skeleton: string; // card.html: the card fragment with its slots
  css: string; // card.css: the theme's stylesheet (the core stylesheet is not included)
  /** The theme-contract version the theme was written for (`etna-theme:`); 1 when it does not say. */
  contract: number;
  /** How the theme lays out a structured recipe's steps (`options.layout`). */
  layout: LayoutName;
  /** How the theme arranges a traditional recipe's parts (`options.parts`): `sections` or `paired`. */
  parts: PartsName;
  /** The free fonts the theme uses, to be delivered by the renderer (`webfonts:`); empty when it declares none. */
  webfonts: WebFont[];
}

/** A card theme's stylesheet: always this file, beside the skeleton. */
export const STYLESHEET = 'card.css';

/**
 * Build a Theme from its files: file name -> text content (theme.yaml, card.html, card.css).
 *
 * Throws, naming the file and the reason, when a file is missing, when the theme was written
 * for a newer contract, when it is not a card theme, or when it carries anything a theme may
 * not: active content, remote content, or the page shell (see contract.ts) — or a `webfonts:`
 * entry that is not a plain family name and css2 spec (see webfonts.ts).
 */
export function parseTheme(files: Record<string, string>): Theme {
  const yaml = fileOf(files, 'theme.yaml');
  if (yaml === undefined) throw new Error('theme: theme.yaml is missing');
  let parsed: unknown;
  try {
    parsed = parseYaml(yaml);
  } catch (error) {
    throw new Error(`theme: theme.yaml is not valid YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
  const manifest = record(parsed);
  const name = text(manifest.name) ?? 'theme';
  const fail = (message: string): never => {
    throw new Error(`theme "${name}": ${message}`);
  };

  const contract = contractVersion(manifest['etna-theme'], fail);
  const kind = manifest.kind;
  if (kind !== undefined && kind !== 'card') {
    fail(kind === 'chart' ? 'is a chart theme (kind: chart), not a card theme' : `theme.yaml kind "${String(kind)}" is not "card"`);
  }

  const skeletonFile = text(manifest.skeleton) ?? 'card.html';
  const skeleton = fileOf(files, skeletonFile);
  if (skeleton === undefined) fail(`${skeletonFile} is missing`);
  const skeletonIssues = skeletonProblems(skeleton!);
  if (skeletonIssues.length > 0) fail(`${skeletonFile} ${skeletonIssues.join('; ')}`);

  const css = fileOf(files, STYLESHEET);
  if (css === undefined) fail(`${STYLESHEET} is missing`);
  const cssIssues = stylesheetProblems(css!);
  if (cssIssues.length > 0) fail(`${STYLESHEET} ${cssIssues.join('; ')}`);

  let layout: LayoutName = 'hoisted';
  try {
    layout = layoutName(record(manifest.options).layout, 'theme.yaml options.layout');
  } catch (error) {
    fail((error as Error).message);
  }
  let parts: PartsName = 'sections';
  try {
    parts = partsName(record(manifest.options).parts, 'theme.yaml options.parts');
  } catch (error) {
    fail((error as Error).message);
  }
  const fontIssues = webfontProblems(manifest.webfonts);
  if (fontIssues.length > 0) fail(`theme.yaml ${fontIssues.join('; ')}`);
  const webfonts = readWebfonts(manifest.webfonts);
  return { name, manifest, skeleton: skeleton!, css: css!, contract, layout, parts, webfonts };
}

/** `etna-theme:` → the contract version; missing means 1. */
function contractVersion(value: unknown, fail: (message: string) => never): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fail(`theme.yaml etna-theme must be a whole number (the theme-contract version), not ${JSON.stringify(value)}`);
  }
  if (value > THEME_CONTRACT) {
    return fail(
      `was written for theme contract ${value}, and this renderer knows contract ${THEME_CONTRACT} at most. ` +
        'Use a newer etna, or a version of the theme written for this one.',
    );
  }
  return value;
}

/** A file by name, without reaching into the object's prototype. */
function fileOf(files: Record<string, string>, name: string): string | undefined {
  return Object.hasOwn(files, name) && typeof files[name] === 'string' ? files[name] : undefined;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function text(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}
