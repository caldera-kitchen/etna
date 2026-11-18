// The chart themes' free fonts for the chart pane, loaded on first use: the font CSS (WOFF2 as
// data: URLs, about 300 KB for the three bundled families) is not part of the GUI's first load.
// The chart is drawn at once with the stack's fallbacks and drawn again when its fonts arrive;
// the layout never depends on the font, so nothing moves.

const loaded = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

/** The @font-face rules of those of `families` loaded so far ('' for the others). */
export function loadedChartFontCss(families: readonly string[]): string {
  return families.map((family) => loaded.get(family) ?? '').join('');
}

/** Whether every one of `families` the bundle carries has been loaded. */
export const chartFontsLoaded = (families: readonly string[]): boolean => families.every((family) => loaded.has(family));

/**
 * Load the bundle's CSS for `families` (each family a lazy chunk; a family the bundle does not
 * carry is recorded as having none). Resolves to true when anything new arrived.
 */
export async function loadChartFonts(families: readonly string[]): Promise<boolean> {
  const wanted = families.filter((family) => !loaded.has(family));
  if (wanted.length === 0) return false;
  const { families: loaders } = await import('virtual:etna-chart-fonts');
  await Promise.all(
    wanted.map((family) => {
      let p = pending.get(family);
      if (!p) {
        const load = Object.hasOwn(loaders, family) ? loaders[family] : null;
        p = (load ? load() : Promise.resolve(''))
          .then((css) => void loaded.set(family, css))
          .finally(() => pending.delete(family));
        pending.set(family, p);
      }
      return p;
    }),
  );
  return true;
}
