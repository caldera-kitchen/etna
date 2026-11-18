// Data bundled into the web app at build time (see build.ts): the units registry and the
// card themes, read from the repo so the browser needs no extra requests, and how the themes'
// fonts are delivered (embedded from the local font cache, or loaded from Google Fonts).
declare module 'virtual:etna-data' {
  /** Text of registries/units.yaml. */
  export const unitsYaml: string;
  /** Text of registries/densities.md: the reference densities the shopping list totals with. */
  export const densitiesMd: string;
  /** Card themes: theme name → file name → file text. */
  export const themes: Record<string, Record<string, string>>;
  /** Chart themes: theme name → file name → file text. */
  export const chartThemes: Record<string, Record<string, string>>;
  /** How the GUI should deliver fonts for bundled themes. */
  export const fontMode: 'embedded' | 'web';
  /** Embedded @font-face CSS per bundled theme name; present only when fontMode is 'embedded' and that theme's fonts are cached. */
  export const fontCss: Record<string, string>;
  /** True in the bundle `etna serve` serves (it lists this computer's folders); false in a static build. */
  export const localServer: boolean;
  /** A static build's default source (`etna build-web --default-source`): absent when it has none. */
  export const defaultSource: { id: string; label: string; welcome: import('./welcome.ts').SiteWelcome; order: string[] } | undefined;
  /** What Settings › About says of the build: version, commit, links, font credits, licenses (about.ts). */
  export const about: import('./about.ts').AboutData;
}

// The bundled chart themes' free fonts (build.ts): family → a loader of its @font-face rules
// (data: URLs) for the chart SVG, each family a lazy chunk of its own.
declare module 'virtual:etna-chart-fonts' {
  export const families: Record<string, () => Promise<string>>;
}

// The chart PDFs' fonts (build.ts): every cached TrueType face, each file in a lazy chunk of
// its own, loaded only when a PDF embeds it.
declare module 'virtual:etna-pdf-fonts' {
  export const faces: { family: string; weight: number; load(): Promise<string> }[];
}

// The third-party packages whose code is in the bundle, with their license texts (build.ts, from
// the bundler's metafile): a lazy chunk of its own, loaded when Settings › About is shown.
declare module 'virtual:etna-credits' {
  export const packages: import('./about.ts').PackageCredit[];
}
