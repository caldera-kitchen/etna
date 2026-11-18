import { describe, expect, it } from 'vitest';
import { formatQuantity, isPlural, parseQuantity } from '../../src/core/index.ts';

const q = (text: string) => parseQuantity(text);

describe('parseQuantity', () => {
  it.each([
    ['2 cups', 2, '2'],
    ['2.5 g', 2.5, '2.5'],
    ['.5 g', 0.5, '.5'],
    ['1/2 cup', 0.5, '1/2'],
    ['1 1/2 cups', 1.5, '1 1/2'],
    ['½ cup', 0.5, '½'],
    ['1½ cups', 1.5, '1½'],
    ['1 ½ cups', 1.5, '1 ½'],
    ['¹⁄₁₆ tsp', 1 / 16, '¹⁄₁₆'],
    ['13⅓ g', 13 + 1 / 3, '13⅓'],
    ['1,000 g flour', 1000, '1,000'],
  ])('reads %s', (text, value, raw) => {
    const r = q(text)!;
    expect(r.quantity.min.value).toBeCloseTo(value);
    expect(r.quantity.raw).toBe(raw);
    expect(r.quantity.max).toBeNull();
  });

  it.each([
    ['2-3 cloves', 2, 3, '-'],
    ['2–3 cloves', 2, 3, '–'],
    ['2 to 3 cloves', 2, 3, 'to'],
    ['1 1/2-2 cups', 1.5, 2, '-'],
  ])('reads the range %s', (text, min, max, sep) => {
    const r = q(text)!;
    expect(r.quantity.min.value).toBeCloseTo(min);
    expect(r.quantity.max!.value).toBeCloseTo(max);
    expect(r.quantity.rangeSeparator).toBe(sep);
  });

  it('does not read a hyphenated measure as a range or quantity', () => {
    expect(q('2-inch piece ginger')).toBeNull();
    expect(q('1 14-ounce can tomatoes')!.quantity.raw).toBe('1');
  });

  it('rejects things that only look like numbers', () => {
    expect(q('00 Flour')).toBeNull();
    expect(q('few pinches salt')).toBeNull();
    expect(q('salt')).toBeNull();
    expect(q('1/0 cup')).toBeNull();
    // Composed glyphs and absurd integers degrade the same way instead of reaching the arithmetic.
    expect(q('¹⁄₀ cup')).toBeNull();
    expect(q('1¹⁄₀ cup')).toBeNull();
    expect(q(`${'9'.repeat(400)} g`)).toBeNull();
  });
});

describe('formatQuantity', () => {
  const fmt = (text: string, opts = {}) => formatQuantity(q(text)!.quantity, opts);
  it('gives the canonical source form by default', () => {
    expect(fmt('1½ cups')).toBe('1 1/2');
    expect(fmt('½ cup')).toBe('1/2');
    expect(fmt('2 to 3 cloves')).toBe('2-3');
    expect(fmt('2–3 cloves')).toBe('2-3');
    expect(fmt('2.625 g')).toBe('2.625');
    expect(fmt('1,000 g')).toBe('1000');
  });
  it('lets a theme choose the display', () => {
    expect(fmt('1 1/2 cups', { fractions: 'unicode' })).toBe('1 ½');
    expect(fmt('2-3 cloves', { range: ' to ' })).toBe('2 to 3');
    expect(fmt('5/16 tsp', { fractions: 'unicode' })).toBe('5/16');
  });
});

describe('isPlural', () => {
  it('is singular up to and including 1, plural above and for ranges', () => {
    expect(isPlural(q('1/2 cup')!.quantity)).toBe(false);
    expect(isPlural(q('1 cup')!.quantity)).toBe(false);
    expect(isPlural(q('1 1/2 cups')!.quantity)).toBe(true);
    expect(isPlural(q('1/2-1 cup')!.quantity)).toBe(true);
    expect(isPlural(q('0.75 g')!.quantity)).toBe(true);
    expect(isPlural(q('1.0 g')!.quantity)).toBe(false);
  });
});
