// The recipe list's order (main.tsx): alphabetical, or the order a source states for itself.
// Pure and browser-safe.
//
// The rule: when nothing is searched and the list shows one source alone (it is the only one
// listed, or the list is narrowed to it), and that source states an order, its recipes come in
// that order; the ones the order leaves out follow, alphabetically. Otherwise, with several
// sources on the list, every recipe is alphabetical, as before. A source states an order through
// its README (site-source.ts `statedOrder`: the recipes it links, each traditional twin right
// after its dish): a static build's default source, read at build time,
// and a folder `etna serve` lists, read when the app asks. A GitHub repository states none: its
// README would be one more request.

/** An order as a source or the bundle hands it: slugs, each once; anything else is dropped. */
export function readOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 200);
  return [...new Set(out)].slice(0, 5000);
}

/**
 * The rows of an unsearched list, sorted. `order` is the stated order of the one source the list
 * shows alone, or null (several sources, or one that states none): then by slug, and by source
 * for the same slug.
 */
export function listOrder<T extends { sourceId: string; slug: string }>(rows: readonly T[], order: readonly string[] | null): T[] {
  const alphabetical = (a: T, b: T) => a.slug.localeCompare(b.slug) || a.sourceId.localeCompare(b.sourceId);
  if (!order || order.length === 0) return [...rows].sort(alphabetical);
  const rank = new Map(order.map((slug, i) => [slug, i]));
  const at = (r: T) => rank.get(r.slug) ?? Number.POSITIVE_INFINITY;
  return [...rows].sort((a, b) => at(a) - at(b) || alphabetical(a, b));
}
