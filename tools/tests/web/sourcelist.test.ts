import { describe, expect, it } from 'vitest';

import { importSettings, parseSettingsText, serializeSettings, type Settings } from '../../src/web/settings.ts';
import {
  addSource,
  canMove,
  friendlyError,
  linkRepos,
  moveSource,
  removedSiteSources,
  removeSiteSource,
  removeSource,
  restoreSiteSource,
  searchWithout,
  setHidden,
  sourceEntries,
} from '../../src/web/sourcelist.ts';

const locals = [{ id: 'recipe-collection' }, { id: 'desserts' }];

describe('linkRepos', () => {
  it('reads valid ?repo= names, once each, at most 20', () => {
    expect(linkRepos('?repo=a/b&repo=https://github.com/c/d&repo=../x&repo=a/b')).toEqual(['a/b', 'c/d']);
    expect(linkRepos('')).toEqual([]);
    expect(linkRepos(`?${Array.from({ length: 30 }, (_, i) => `repo=o/r${i}`).join('&')}`)).toHaveLength(20);
  });

  it('drops one repository from the address and keeps the rest of the query', () => {
    expect(searchWithout('?repo=a/b&x=1&repo=c/d', 'a/b')).toBe('?x=1&repo=c%2Fd');
    expect(searchWithout('?repo=a/b', 'a/b')).toBe('');
  });
});

describe('sourceEntries: a link adds, it never replaces', () => {
  const mine: Settings = { sources: ['me/recipes', 'me/baking'] };

  it('lists this computer, then the kept repositories, then the link’s', () => {
    const e = sourceEntries(locals, mine, ['friend/soups']);
    expect(e.map((x) => [x.id, x.origin])).toEqual([
      ['recipe-collection', 'computer'],
      ['desserts', 'computer'],
      ['me/recipes', 'browser'],
      ['me/baking', 'browser'],
      ['friend/soups', 'link'],
    ]);
  });

  it('shows a link repository that is already kept once, as kept', () => {
    const e = sourceEntries([], mine, ['me/baking', 'friend/soups']);
    expect(e.map((x) => [x.id, x.origin])).toEqual([
      ['me/recipes', 'browser'],
      ['me/baking', 'browser'],
      ['friend/soups', 'link'],
    ]);
  });

  it('never puts the link’s repositories into the settings on add or remove', () => {
    const link = ['friend/soups'];
    const added = addSource(mine, 'me/new');
    expect(added.ok && added.value.sources).toEqual(['me/recipes', 'me/baking', 'me/new']);
    const removed = removeSource(mine, 'me/baking');
    expect(removed.sources).toEqual(['me/recipes']);
    // The link's repository is still shown for the visit, and still not kept.
    expect(sourceEntries([], removed, link).find((x) => x.id === 'friend/soups')?.origin).toBe('link');
  });

  it('keeps a link repository on request (Keep)', () => {
    const kept = addSource(mine, 'friend/soups');
    expect(kept.ok).toBe(true);
    if (kept.ok) expect(sourceEntries([], kept.value, ['friend/soups']).find((x) => x.id === 'friend/soups')?.origin).toBe('browser');
  });

  it('refuses a duplicate and a 21st repository', () => {
    expect(addSource(mine, 'me/recipes')).toEqual({ ok: false, error: expect.stringMatching(/already/) });
    const full: Settings = { sources: Array.from({ length: 20 }, (_, i) => `o/r${i}`) };
    expect(addSource(full, 'o/new')).toEqual({ ok: false, error: expect.stringMatching(/at most 20/) });
  });
});

describe('hide and order', () => {
  it('hides and shows a folder or a repository, and adding a hidden one shows it', () => {
    const s = setHidden({}, 'desserts', true);
    expect(sourceEntries(locals, s, []).find((x) => x.id === 'desserts')?.hidden).toBe(true);
    expect(setHidden(s, 'desserts', false).hide).toEqual([]);
    const hiddenRepo: Settings = { sources: ['a/b'], hide: ['c/d'] };
    const added = addSource(hiddenRepo, 'c/d');
    expect(added.ok && added.value.hide).toEqual([]);
  });

  it('moves a source up or down, and order puts it there', () => {
    const s: Settings = { sources: ['a/b'] };
    const e = sourceEntries(locals, s, ['l/k']);
    const moved = moveSource(s, e, 'a/b', -1);
    expect(moved.order).toEqual(['recipe-collection', 'a/b', 'desserts']);
    expect(sourceEntries(locals, moved, ['l/k']).map((x) => x.id)).toEqual(['recipe-collection', 'a/b', 'desserts', 'l/k']);
    // At the ends, and for a link's repository, nothing moves.
    expect(moveSource(s, e, 'recipe-collection', -1)).toBe(s);
    expect(moveSource(s, e, 'l/k', -1)).toBe(s);
    expect(canMove(e, 'a/b', 1)).toBe(false);
    expect(canMove(e, 'a/b', -1)).toBe(true);
    expect(canMove(e, 'l/k', -1)).toBe(false);
  });

  it('forgets a removed source everywhere', () => {
    const s: Settings = { sources: ['a/b', 'c/d'], hide: ['a/b'], order: ['a/b', 'c/d'] };
    expect(removeSource(s, 'a/b')).toEqual({ sources: ['c/d'], hide: [], order: ['c/d'] });
  });

  it('lists sources an order does not name after the ones it does, as they came', () => {
    const e = sourceEntries(locals, { sources: ['a/b', 'c/d'], order: ['c/d', 'gone/repo'] }, []);
    expect(e.map((x) => x.id)).toEqual(['c/d', 'recipe-collection', 'desserts', 'a/b']);
  });
});

describe('friendlyError', () => {
  it('says what a failure means', () => {
    expect(friendlyError('Failed to fetch')).toMatch(/could not be reached/);
    expect(friendlyError('TypeError: fetch failed')).toMatch(/could not be reached/);
    expect(friendlyError('404 Not Found — https://api.github.com/x')).toMatch(/no public repository/);
    expect(friendlyError('403 Forbidden — x')).toMatch(/60 requests/);
    expect(friendlyError('catalog.json is larger than 32768 KB')).toBe('catalog.json is larger than 32768 KB');
  });
});

describe('the site’s own source (a static build’s default)', () => {
  const site = [{ id: 'cookbook' }];

  it('is listed for a first-time visitor, from the build, with nothing in the settings', () => {
    const first: Settings = {};
    const e = sourceEntries([], first, [], site);
    expect(e.map((x) => [x.id, x.kind, x.origin, x.spec, x.hidden])).toEqual([['cookbook', 'site', 'site', null, false]]);
    // Listing it wrote nothing: a first visit leaves the settings empty.
    expect(serializeSettings(first)).toBe('{"etna-settings":1}');
  });

  it('comes after this computer’s folders and before the kept repositories and the link’s', () => {
    const e = sourceEntries(locals, { sources: ['me/recipes'] }, ['friend/soups'], site);
    expect(e.map((x) => [x.id, x.origin])).toEqual([
      ['recipe-collection', 'computer'],
      ['desserts', 'computer'],
      ['cookbook', 'site'],
      ['me/recipes', 'browser'],
      ['friend/soups', 'link'],
    ]);
  });

  it('stays listed when the reader adds a repository, and the add keeps only that repository', () => {
    const added = addSource({}, 'me/recipes');
    expect(added.ok && added.value).toEqual({ sources: ['me/recipes'], hide: [] });
    if (added.ok) expect(sourceEntries([], added.value, [], site).map((x) => x.id)).toEqual(['cookbook', 'me/recipes']);
  });

  it('once removed, is not listed again, and only the removal is kept', () => {
    const removed = removeSiteSource({ sources: ['me/recipes'], hide: ['cookbook'], order: ['me/recipes', 'cookbook'] }, 'cookbook');
    expect(removed).toEqual({ sources: ['me/recipes'], removed: ['cookbook'], hide: [], order: ['me/recipes'] });
    expect(sourceEntries([], removed, [], site).map((x) => x.id)).toEqual(['me/recipes']);
    // As a reload reads it back from storage.
    const reloaded = parseSettingsText(serializeSettings(removed));
    expect(reloaded.ok && sourceEntries([], reloaded.value.settings, [], site).map((x) => x.id)).toEqual(['me/recipes']);
    expect(removedSiteSources(removed, site)).toEqual(site);
  });

  it('is put back on request (Put back), where it was first listed', () => {
    const removed = removeSiteSource({ sources: ['me/recipes'] }, 'cookbook');
    const back = restoreSiteSource(removed, 'cookbook');
    expect(back.removed).toEqual([]);
    expect(sourceEntries([], back, [], site).map((x) => x.id)).toEqual(['cookbook', 'me/recipes']);
    expect(removedSiteSources(back, site)).toEqual([]);
  });

  it('is hidden, shown and moved like any source, and those choices are the reader’s, kept by its id', () => {
    const hidden = setHidden({}, 'cookbook', true);
    expect(sourceEntries([], hidden, [], site)[0]).toMatchObject({ id: 'cookbook', hidden: true });
    expect(setHidden(hidden, 'cookbook', false).hide).toEqual([]);
    const mine: Settings = { sources: ['me/recipes'] };
    const entries = sourceEntries([], mine, [], site);
    expect(canMove(entries, 'cookbook', 1)).toBe(true);
    const moved = moveSource(mine, entries, 'cookbook', 1);
    expect(moved.order).toEqual(['me/recipes', 'cookbook']);
    expect(moved.sources).toEqual(['me/recipes']);
    expect(sourceEntries([], moved, [], site).map((x) => x.id)).toEqual(['me/recipes', 'cookbook']);
  });

  it('a settings file from a site with a default changes nothing on a site without one, or with another', () => {
    const file = serializeSettings(removeSiteSource(setHidden({ sources: ['me/recipes'] }, 'cookbook', true), 'cookbook'), true);
    const loaded = importSettings(file);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.notes).toEqual([]);
    // No default here: the removal names nothing; the reader's repository is there.
    expect(sourceEntries([], loaded.value.settings, [], []).map((x) => x.id)).toEqual(['me/recipes']);
    // Another default: listed, since the reader never removed it.
    expect(sourceEntries([], loaded.value.settings, [], [{ id: 'starter' }]).map((x) => x.id)).toEqual(['starter', 'me/recipes']);
    // The same default on another address (a copy of the site): still removed.
    expect(sourceEntries([], loaded.value.settings, [], site).map((x) => x.id)).toEqual(['me/recipes']);
    // And kept when the settings are saved again there, so a later site with it still honors it.
    expect(JSON.parse(serializeSettings(loaded.value.settings)).removed).toEqual(['cookbook']);
  });

  it('a build with no default lists exactly what it listed before', () => {
    const mine: Settings = { sources: ['me/recipes'], hide: ['desserts'], removed: ['cookbook'] };
    expect(sourceEntries(locals, mine, ['friend/soups'], [])).toEqual(sourceEntries(locals, mine, ['friend/soups']));
    expect(sourceEntries([], {}, []).length).toBe(0);
  });
});
