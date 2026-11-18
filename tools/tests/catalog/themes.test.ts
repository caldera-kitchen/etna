import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildCatalog, collectionThemes, serializeCatalog } from '../../src/catalog/node.ts';
import { ETNA_ROOT } from '../../src/node/files.ts';

const RECIPE = `---
etna: 1
form: traditional
---

# Toast

## Ingredients

- 1 slice bread

## Directions

1. Toast the bread.
`;

const tmp = mkdtempSync(join(tmpdir(), 'etna-catalog-themes-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function collection(name: string, themes: Record<string, string[] | null>): string {
  const root = join(tmp, name);
  mkdirSync(join(root, 'recipes', 'toast'), { recursive: true });
  writeFileSync(join(root, 'recipes', 'toast', 'recipe.md'), RECIPE);
  for (const [theme, files] of Object.entries(themes)) {
    mkdirSync(join(root, 'themes', theme), { recursive: true });
    for (const f of files ?? []) writeFileSync(join(root, 'themes', theme, f), 'x');
  }
  return root;
}

describe('catalog themes', () => {
  it('lists folders under themes/ that hold a theme.yaml, in code-point order', () => {
    const root = collection('present', {
      postcard: ['theme.yaml', 'card.html'],
      'a-first': ['theme.yaml'],
      'b2': ['theme.yaml'],
      empty: null,
      'no-manifest': ['card.html'],
    });
    const c = buildCatalog(root);
    expect(c.themes).toEqual(['a-first', 'b2', 'postcard']);
    // The same when pointed at recipes/.
    expect(buildCatalog(join(root, 'recipes')).themes).toEqual(['a-first', 'b2', 'postcard']);
  });

  it('ignores folders whose name is not a valid slug, files, and symbolic links', () => {
    const root = collection('invalid', { Postcard: ['theme.yaml'], 'two words': ['theme.yaml'], 'under_score': ['theme.yaml'], ok: ['theme.yaml'] });
    writeFileSync(join(root, 'themes', 'theme.yaml'), 'x');
    symlinkSync(join(root, 'themes', 'ok'), join(root, 'themes', 'linked'));
    expect(collectionThemes(root)).toEqual(['ok']);
  });

  it('leaves the key out when there are none, so existing catalogs do not change', () => {
    const root = collection('absent', { empty: null });
    const c = buildCatalog(root);
    expect('themes' in c).toBe(false);
    expect(serializeCatalog(c)).not.toContain('themes');
    expect('themes' in buildCatalog(join(ETNA_ROOT, 'cookbook'))).toBe(false);
  });

  it('serializes deterministically, with version, themes, recipes in that order', () => {
    const root = collection('determinism', { zeta: ['theme.yaml'], alpha: ['theme.yaml'] });
    const a = serializeCatalog(buildCatalog(root));
    expect(a).toBe(serializeCatalog(buildCatalog(root)));
    expect(Object.keys(JSON.parse(a))).toEqual(['version', 'themes', 'recipes']);
    expect(JSON.parse(a).version).toBe(1);
    // Key order is fixed whatever order the object was built in.
    const c = buildCatalog(root);
    expect(serializeCatalog({ recipes: c.recipes, themes: c.themes, version: 1 })).toBe(a);
  });
});
