// The recipe catalog and its search. Pure and browser-safe: no file system, no Node APIs.
//
//   catalogEntry / catalogFromSlugs   recipe model (or bare slugs) → catalog records
//   createSearch                      one or more catalogs → fuzzy search (MiniSearch)
//
// Reading a collection from disk and writing catalog.json live in `node.ts`.

export type { Catalog, CatalogEntry, Search, SearchHit } from './types.ts';
export { catalogEntry, catalogFromSlugs } from './entry.ts';
export { createSearch } from './search.ts';
export { matchRanges } from './text.ts';
