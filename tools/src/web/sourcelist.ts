// Which sources the app opens, in what order, and where each came from: the folders `etna serve`
// offers (this computer), the recipes a static build carries as its default (this site), the
// repositories kept in this browser's settings, and the ones a link carried (`?repo=`) for this
// visit. Pure and browser-safe.
//
// A link's repositories are added on top of the kept ones, never in their place, and nothing a
// link carries is kept unless the user asks (Keep). So opening a link cannot hide the user's own
// repositories, and the next add or remove cannot save the link's list over them.
//
// The site's default is the site's, as a folder from `etna serve` is the computer's: it is listed
// from the build each time, never copied into the settings. What the reader does to it is kept
// as for any source (hidden, moved), and removing it is kept too (`removed`), so it does not
// come back on the next visit; Put back undoes that.

import { parseRepo } from './repo.ts';
import { MAX_SOURCES, specId, type Settings, type SourceSpec } from './settings.ts';

export type Origin = 'computer' | 'site' | 'browser' | 'link';

export interface SourceEntry {
  id: string;
  kind: 'local' | 'site' | 'github';
  origin: Origin;
  /** The kept repository's spec; null for a folder on this computer and for the site's own. */
  spec: SourceSpec | null;
  hidden: boolean;
}

/** The repositories a link carries: `?repo=` (repeatable), valid names only, no duplicates, at most 20. */
export function linkRepos(search: string): string[] {
  const names = new URLSearchParams(search).getAll('repo').map(parseRepo).filter((r): r is string => r !== null);
  return [...new Set(names)].slice(0, MAX_SOURCES);
}

/** The address's query without `repo` (one, or all when `repo` is null). */
export function searchWithout(search: string, repo: string | null): string {
  const params = new URLSearchParams(search);
  const kept = params.getAll('repo').filter((r) => repo !== null && parseRepo(r) !== repo);
  params.delete('repo');
  for (const r of kept) params.append('repo', r);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Every source, in the order shown and searched: this computer's folders, the site's own (unless
 * the reader removed them), the kept repositories, then the link's (those not kept already),
 * rearranged by `order` where it names them.
 */
export function sourceEntries(locals: readonly { id: string }[], settings: Settings, link: readonly string[], site: readonly { id: string }[] = []): SourceEntry[] {
  const hide = new Set(settings.hide ?? []);
  const removed = new Set(settings.removed ?? []);
  const out: SourceEntry[] = [];
  const seen = new Set<string>();
  const push = (e: SourceEntry) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    out.push(e);
  };
  for (const l of locals) push({ id: l.id, kind: 'local', origin: 'computer', spec: null, hidden: hide.has(l.id) });
  for (const d of site) if (!removed.has(d.id)) push({ id: d.id, kind: 'site', origin: 'site', spec: null, hidden: hide.has(d.id) });
  for (const spec of settings.sources ?? []) push({ id: specId(spec), kind: 'github', origin: 'browser', spec, hidden: hide.has(specId(spec)) });
  for (const repo of link) push({ id: repo, kind: 'github', origin: 'link', spec: repo, hidden: false });
  const order = settings.order ?? [];
  const rank = (e: SourceEntry) => {
    const i = order.indexOf(e.id);
    return i === -1 ? order.length : i;
  };
  // A stable sort: the ones `order` names first, in its order; the rest as they came.
  return out.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
}

/** The settings with `repo` kept, or why not. */
export function addSource(settings: Settings, repo: string): { ok: true; value: Settings } | { ok: false; error: string } {
  const sources = settings.sources ?? [];
  if (sources.some((s) => specId(s) === repo)) return { ok: false, error: `${repo} is already in the list.` };
  if (sources.length >= MAX_SOURCES) return { ok: false, error: `This browser keeps at most ${MAX_SOURCES} repositories. Remove one first.` };
  return { ok: true, value: { ...settings, sources: [...sources, repo], hide: (settings.hide ?? []).filter((h) => h !== repo) } };
}

/** The settings without the kept source `id` (and without it in `hide` and `order`). */
export function removeSource(settings: Settings, id: string): Settings {
  return {
    ...settings,
    sources: (settings.sources ?? []).filter((s) => specId(s) !== id),
    hide: (settings.hide ?? []).filter((h) => h !== id),
    order: (settings.order ?? []).filter((o) => o !== id),
  };
}

/** The settings with the site's own source `id` removed: kept in `removed`, and gone from `hide` and `order`. */
export function removeSiteSource(settings: Settings, id: string): Settings {
  return {
    ...settings,
    removed: [...(settings.removed ?? []).filter((r) => r !== id), id],
    hide: (settings.hide ?? []).filter((h) => h !== id),
    order: (settings.order ?? []).filter((o) => o !== id),
  };
}

/** The settings with the site's own source `id` listed again (Put back). */
export function restoreSiteSource(settings: Settings, id: string): Settings {
  return { ...settings, removed: (settings.removed ?? []).filter((r) => r !== id) };
}

/** The site's own sources the reader removed, of those this build has: what Put back offers. */
export function removedSiteSources<T extends { id: string }>(settings: Settings, site: readonly T[]): T[] {
  const removed = new Set(settings.removed ?? []);
  return site.filter((d) => removed.has(d.id));
}

export function setHidden(settings: Settings, id: string, hidden: boolean): Settings {
  const rest = (settings.hide ?? []).filter((h) => h !== id);
  return { ...settings, hide: hidden ? [...rest, id] : rest };
}

/**
 * The settings with `id` moved one place up (`-1`) or down (`1`) among the sources that keep a
 * place (all but a link's). Unchanged at either end.
 */
export function moveSource(settings: Settings, entries: readonly SourceEntry[], id: string, delta: -1 | 1): Settings {
  const ids = entries.filter((e) => e.origin !== 'link').map((e) => e.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= ids.length) return settings;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return { ...settings, order: ids };
}

/** Why a source did not load, in words: the reader's own message, or what a network failure or GitHub's answer means. */
export function friendlyError(message: string): string {
  const m = message.trim();
  if (/^(TypeError: )?(Failed to fetch|NetworkError|Load failed|fetch failed)/i.test(m)) return 'GitHub could not be reached (no network, or something blocked the request).';
  if (/^404\b/.test(m)) return 'GitHub has no public repository by this name, or it has no recipes/ folder (404).';
  if (/^403\b/.test(m)) return 'GitHub refused for now (403): it allows 60 requests an hour without signing in. Try again later, or add a catalog.json to the repository.';
  return m || 'it failed without saying why.';
}

/** True when the entry can be moved up or down. */
export function canMove(entries: readonly SourceEntry[], id: string, delta: -1 | 1): boolean {
  const ids = entries.filter((e) => e.origin !== 'link').map((e) => e.id);
  const i = ids.indexOf(id);
  return i !== -1 && i + delta >= 0 && i + delta < ids.length;
}
