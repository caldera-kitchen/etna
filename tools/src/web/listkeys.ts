// Keyboard movement through a list that is a single Tab stop (a "roving" tab index): which row
// a key moves to. Pure and browser-safe; main.tsx moves the focus.

/**
 * The row `key` moves to from row `index`, in a list of `count` rows where a page holds `page`
 * rows; null when the key does not move (not a moving key, or an empty list). Movement stops at
 * the ends (no wrapping), and an index outside the list is first brought back into it.
 */
export function moveIndex(key: string, index: number, count: number, page = 10): number | null {
  if (count <= 0) return null;
  const at = Math.min(Math.max(Number.isFinite(index) ? Math.trunc(index) : 0, 0), count - 1);
  const step = Math.max(1, Math.trunc(page) || 1);
  switch (key) {
    case 'ArrowDown':
      return Math.min(at + 1, count - 1);
    case 'ArrowUp':
      return Math.max(at - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageDown':
      return Math.min(at + step, count - 1);
    case 'PageUp':
      return Math.max(at - step, 0);
    default:
      return null;
  }
}

/** The row that holds the list's one Tab stop: the remembered row if it is still there, else the open recipe's row, else the first. -1 for an empty list. */
export function tabStopIndex(keys: readonly string[], remembered: string | null, open: string | null): number {
  if (keys.length === 0) return -1;
  if (remembered !== null) {
    const i = keys.indexOf(remembered);
    if (i !== -1) return i;
  }
  if (open !== null) {
    const i = keys.indexOf(open);
    if (i !== -1) return i;
  }
  return 0;
}

/** The tab a key moves to in a row of `count` tabs (Left/Right wrap, Home/End go to the ends); null for any other key. */
export function moveTab(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
