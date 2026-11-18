// What Settings > About says about this build: its version and commit, the hosts it reads from,
// the fonts and licenses it carries, and the project's links. Pure and browser-safe: the build
// (about-data.ts) gathers the facts, this reads them back and words what depends on them.

/** A bundled font family, as the font cache's license file credits it. */
export interface FontCredit {
  family: string;
  /** The license file's copyright paragraph, as written there. */
  copyright: string;
  /** The license's name and version, from the license file (`SIL Open Font License 1.1`). */
  license: string;
  /** Index into `AboutData.fontLicenseTexts`: the license's text without the copyright paragraph. */
  text: number;
}

/** One of Etna's own licenses, from LICENSE or LICENSE-docs at the repository root. */
export interface EtnaLicense {
  /** The license's name, from the file's first line. */
  name: string;
  /** The file's copyright line, or null when it has none. */
  copyright: string | null;
  /** The whole text, or null when the page links to the license instead of showing it. */
  text: string | null;
}

/** The facts the build stamps into the bundle (build.ts, `about` in virtual:etna-data). */
export interface AboutData {
  /** tools/package.json `version`. */
  version: string;
  /** The full hash of the commit the build was made from, or null outside a Git checkout. */
  commit: string | null;
  /** That commit's date (YYYY-MM-DD), or null. */
  committed: string | null;
  /** True when files the build reads differed from that commit. */
  modified: boolean;
  /** The project's public repository (the `--source-url` build setting), or null when unset. */
  sourceUrl: string | null;
  fonts: FontCredit[];
  fontLicenseTexts: string[];
  /** The code's license (LICENSE) and the specification and documentation's (LICENSE-docs). */
  code: EtnaLicense | null;
  docs: EtnaLicense | null;
}

/**
 * A package whose code is in the bundle (app.js or one of its chunks), as the installed package's
 * own files describe it (about-data.ts `packageCredits`). The list is a lazy chunk of its own
 * (`virtual:etna-credits`), loaded when About is shown.
 */
export interface PackageCredit {
  name: string;
  version: string;
  /** package.json `license` (an SPDX expression), or null when it states none. */
  license: string | null;
  /** The first copyright line of its license files, or null when they have none. */
  copyright: string | null;
  /** package.json `author`, as written there (its name, and an address if it gives one), or null. */
  author: string | null;
  /** The names of the files `text` is made of (`LICENSE`, `NOTICE`, …); empty when the package has none. */
  files: string[];
  /** Those files' text, one after the other, or null when the package has no license file. */
  text: string | null;
}

/** The credits chunk's `packages`, or what is there of it: an entry of the wrong shape is dropped. */
export function readPackageCredits(raw: unknown): PackageCredit[] {
  if (!Array.isArray(raw)) return [];
  const strOrNull = (v: unknown) => v === null || typeof v === 'string';
  return raw.filter(
    (p): p is PackageCredit =>
      p !== null &&
      typeof p === 'object' &&
      typeof p.name === 'string' &&
      typeof p.version === 'string' &&
      strOrNull(p.license) &&
      strOrNull(p.copyright) &&
      strOrNull(p.author) &&
      strOrNull(p.text) &&
      Array.isArray(p.files) &&
      p.files.every((f: unknown) => typeof f === 'string'),
  );
}

/**
 * The packages as About lists them: those whose license files read the same word for word (the same
 * file names, the same text) share one entry, so one text is shown once. Packages with no license
 * file share an entry when they name the same license and author. Order is kept: an entry stands
 * where its first package stood.
 */
export function groupCredits(packages: PackageCredit[]): PackageCredit[][] {
  const groups = new Map<string, PackageCredit[]>();
  for (const p of packages) {
    const key = JSON.stringify([p.license, p.files, p.text, p.text === null ? p.author : null]);
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.values()];
}

export const NO_ABOUT: AboutData = { version: '', commit: null, committed: null, modified: false, sourceUrl: null, fonts: [], fontLicenseTexts: [], code: null, docs: null };

/** The bundle's `about`, or what is there of it: a value of the wrong shape counts as missing. */
export function readAbout(raw: unknown): AboutData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return NO_ABOUT;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  const license = (v: unknown): EtnaLicense | null => {
    if (v === null || typeof v !== 'object') return null;
    const l = v as Record<string, unknown>;
    const name = str(l.name);
    return name ? { name, copyright: str(l.copyright), text: str(l.text) } : null;
  };
  const texts = Array.isArray(r.fontLicenseTexts) ? r.fontLicenseTexts.filter((t): t is string => typeof t === 'string') : [];
  const fonts = Array.isArray(r.fonts)
    ? r.fonts.filter(
        (f): f is FontCredit =>
          f !== null && typeof f === 'object' && typeof f.family === 'string' && typeof f.copyright === 'string' && typeof f.license === 'string' && Number.isInteger(f.text) && f.text >= 0 && f.text < texts.length,
      )
    : [];
  return {
    version: str(r.version) ?? '',
    commit: str(r.commit),
    committed: str(r.committed),
    modified: r.modified === true,
    sourceUrl: str(r.sourceUrl),
    fonts,
    fontLicenseTexts: texts,
    code: license(r.code),
    docs: license(r.docs),
  };
}

/**
 * The `--source-url` build setting, checked: an https address with a host and a path, without
 * a query or fragment, returned without a trailing slash. Null when it is not one.
 */
export function parseSourceUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') return null;
  return `${url.origin}${path}`;
}

export interface ProjectLink {
  label: string;
  href: string;
}

/**
 * The project's links, from the one build setting: the repository itself, and on GitHub its
 * `docs/` folder and the guide to contributing a recipe, on the `main` branch. None when the
 * setting is unset, so the page shows no link rather than one that leads nowhere.
 */
export function projectLinks(sourceUrl: string | null): ProjectLink[] {
  if (!sourceUrl) return [];
  const links: ProjectLink[] = [{ label: 'Source code', href: sourceUrl }];
  if (new URL(sourceUrl).hostname === 'github.com') {
    links.push({ label: 'Documentation', href: `${sourceUrl}/tree/main/docs` });
    links.push({ label: 'Contributing a recipe', href: `${sourceUrl}/blob/main/docs/contributing-a-recipe.md` });
  }
  return links;
}

/** One place the app asks for something by itself, and when it does. */
export interface RequestHost {
  /** Who is asked, in words. */
  what: string;
  /** The host names, as the page's Content-Security-Policy admits them; empty for this site itself. */
  hosts: string[];
  why: string;
}

/**
 * Every host the app requests from, beyond the files it is made of. It follows the bundle: the
 * policy in index.html (build.ts `guiCsp`) admits these and no other.
 */
export function requestHosts(options: { localServer: boolean; fontMode: string }): RequestHost[] {
  const out: RequestHost[] = [];
  if (options.localServer) out.push({ what: 'etna serve, on this computer', hosts: [], why: 'to list and read the folders it was started with' });
  out.push({
    what: 'GitHub',
    hosts: ['raw.githubusercontent.com', 'api.github.com'],
    why: 'to read the public repositories you add (api.github.com only to list the files of one that has no catalog.json)',
  });
  if (options.fontMode === 'web') out.push({ what: 'Google Fonts', hosts: ['fonts.googleapis.com', 'fonts.gstatic.com'], why: 'to load a built-in card style’s fonts when a card is shown' });
  return out;
}

/** The short form for a sentence: "GitHub", "GitHub and Google Fonts", "etna serve, GitHub and Google Fonts". */
export function requestSummary(hosts: RequestHost[]): string {
  const names = hosts.map((h) => (h.hosts.length === 0 ? 'etna serve on this computer' : h.what));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The commit as a reader can compare it: its first 12 hex digits. */
export function shortCommit(hash: string): string {
  return hash.slice(0, 12);
}

/** The address of a Creative Commons license named in full, for the licenses that ask to be named by one; null for any other. */
export function creativeCommonsUrl(name: string): string | null {
  const m = /^Creative Commons Attribution(-ShareAlike)? (\d\.\d) International$/.exec(name);
  return m ? `https://creativecommons.org/licenses/by${m[1] ? '-sa' : ''}/${m[2]}/` : null;
}

/** What Etna is, in one paragraph: Settings › About opens with it, and the welcome (main.tsx) says it too. One wording, kept here. */
export const ETNA_IS =
  'Etna turns simple Markdown files into beautiful recipe cards and flow charts. ' +
  'Each recipe is one Markdown file, which you can read, print, and keep in a Git repository like any other document. ' +
  'Etna lets you browse and search your recipes, print them as cards, draw them as flow charts, and add them up into a shopping list.';
