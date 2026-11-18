// Runs in <head> before the first paint (build.ts inlines it into index.html): puts the chosen
// palette, light or dark, and corners on <html> (and the favicon), so the page never flashes
// the default look first. It only reads; main.tsx owns the settings from then on.

import { applyAppearance, parseAppearance, type Appearance } from './appearance.ts';

let appearance: Appearance = {};
try {
  const data = JSON.parse(localStorage.getItem('etna.settings') ?? 'null') as unknown;
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) appearance = parseAppearance((data as Record<string, unknown>).appearance);
} catch {
  // No storage, or nothing readable in it: today's look.
}
try {
  applyAppearance(document, appearance, matchMedia('(prefers-color-scheme: dark)').matches);
} catch {
  // A very old browser: app.css alone still gives the default look.
}
