import { describe, expect, it } from 'vitest';

import { hasRecipeNotes } from '../../src/web/prefs.ts';

describe('hasRecipeNotes', () => {
  const section = (n: number) => ({ items: Array.from({ length: n }, () => ({})) });
  it('is true only for a notes section with something in it', () => {
    expect(hasRecipeNotes({ notes: section(1), traditional: null } as never)).toBe(true);
    expect(hasRecipeNotes({ notes: null, traditional: { notes: section(2) } } as never)).toBe(true);
    expect(hasRecipeNotes({ notes: section(0), traditional: null } as never)).toBe(false);
    expect(hasRecipeNotes({ notes: null, traditional: null } as never)).toBe(false);
  });
});
