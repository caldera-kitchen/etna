// The landing page: what the recipe view shows before a recipe is picked (main.tsx `Welcome`).
// Which form it takes, and the shape of what a static build tells it about its default source
// (site-source.ts `siteWelcome`, read from the folder at build time).

/** One recipe the welcome names: its slug, its title, and one line on it (null when the source gives none). */
export interface WelcomeSample {
  slug: string;
  title: string;
  line: string | null;
}

/** What the welcome says of a default source: written by the build (site-source.ts), read by engine.ts. */
export interface SiteWelcome {
  /** The structured recipes the README's `## Start with these` section names; without one, the first few in the source's own order: its README's when that links them, else the list's. */
  samples: WelcomeSample[];
  /** True when the order and the lines came from the folder's README. */
  ordered: boolean;
  /** How many recipes the source holds. */
  count: number;
  /** The first sample: the one whose file, card and chart the welcome links to; null when there is none. */
  example: { slug: string; title: string } | null;
}

/** How many recipes the welcome names: four dishes. */
export const SAMPLE_COUNT = 4;

/**
 * The full welcome or the short one. The full one is for a stranger: a static build (not `etna
 * serve`, which lists this computer's folders) whose reader has kept no repository of their own
 * and has not hidden it (`hidden`: the `welcome: short` setting). Anyone else gets the short
 * form, from which `asked` (the reader pressed "Show the welcome") brings the full one back for
 * the visit.
 */
export function welcomeForm(options: { localServer: boolean; kept: readonly unknown[] | undefined; hidden: boolean; asked: boolean }): 'full' | 'short' {
  if (options.asked) return 'full';
  return !options.localServer && !options.hidden && (options.kept?.length ?? 0) === 0 ? 'full' : 'short';
}

/** The site's welcome as the bundle carries it, checked; null when absent or not of this shape. */
export function readSiteWelcome(raw: unknown): SiteWelcome | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): v is string => typeof v === 'string';
  if (!Array.isArray(r.samples) || typeof r.ordered !== 'boolean' || typeof r.count !== 'number') return null;
  const samples: WelcomeSample[] = [];
  for (const s of r.samples) {
    if (s === null || typeof s !== 'object') return null;
    const x = s as Record<string, unknown>;
    if (!str(x.slug) || !str(x.title) || !(x.line === null || str(x.line))) return null;
    samples.push({ slug: x.slug, title: x.title, line: x.line });
  }
  let example: SiteWelcome['example'] = null;
  if (r.example !== null && typeof r.example === 'object') {
    const e = r.example as Record<string, unknown>;
    if (str(e.slug) && str(e.title)) example = { slug: e.slug, title: e.title };
  }
  return { samples, ordered: r.ordered, count: r.count, example };
}
