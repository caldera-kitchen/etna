// A card's sheets fitted to a frame narrower than a page (a phone), on screen only. Browser-safe.

/** Room left on each side of a fitted sheet, in CSS pixels: its shadow shows. */
export const FIT_GUTTER = 8;

/**
 * The zoom that fits content `natural` pixels wide into a frame `room` pixels wide, with
 * `FIT_GUTTER` on each side; null when it fits as it is (a frame as wide as a page or wider).
 */
export function fitZoom(natural: number, room: number): number | null {
  if (!(natural > room) || !(room > 0)) return null;
  return Math.max(0.1, Math.round(((room - 2 * FIT_GUTTER) / natural) * 10000) / 10000);
}

/** The style that zooms the sheets (and the unpaged flow) on screen and centers them; never for print. */
export function fitCss(zoom: number): string {
  return `@media screen{.card-sheets,.card-flow{zoom:${zoom}}.card-sheets{align-items:center}}`;
}

/**
 * Fit a card's sheets to the width of its frame when the frame is narrower than a page, so that
 * the whole sheet is in view, smaller, instead of its right side running past the edge. By a
 * style of its own in the frame's document: the card document is not changed, and printing (a
 * tab of its own) never sees it. Run once the card is paged, and again when the frame changes
 * width: the style is taken off before the page is measured.
 */
export function fitSheets(doc: Document): void {
  const root = doc.documentElement;
  if (!doc.head || !root) return;
  doc.getElementById('etna-fit-style')?.remove();
  const zoom = fitZoom(root.scrollWidth, root.clientWidth);
  if (zoom === null) return;
  const style = doc.createElement('style');
  style.id = 'etna-fit-style';
  style.textContent = fitCss(zoom);
  doc.head.append(style);
}
