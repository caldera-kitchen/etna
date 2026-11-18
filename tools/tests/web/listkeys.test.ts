import { describe, expect, it } from 'vitest';

import { moveIndex, moveTab, tabStopIndex } from '../../src/web/listkeys.ts';

describe('moveIndex', () => {
  it('moves one row with the arrows and stops at the ends', () => {
    expect(moveIndex('ArrowDown', 0, 5)).toBe(1);
    expect(moveIndex('ArrowDown', 4, 5)).toBe(4);
    expect(moveIndex('ArrowUp', 3, 5)).toBe(2);
    expect(moveIndex('ArrowUp', 0, 5)).toBe(0);
  });

  it('jumps to the ends with Home and End', () => {
    expect(moveIndex('Home', 3, 5)).toBe(0);
    expect(moveIndex('End', 1, 5)).toBe(4);
  });

  it('moves a page at a time, clamped', () => {
    expect(moveIndex('PageDown', 2, 50, 10)).toBe(12);
    expect(moveIndex('PageDown', 45, 50, 10)).toBe(49);
    expect(moveIndex('PageUp', 12, 50, 10)).toBe(2);
    expect(moveIndex('PageUp', 5, 50, 10)).toBe(0);
    expect(moveIndex('PageDown', 0, 50, 0)).toBe(1); // a page is at least one row
  });

  it('brings an index outside the list back into it first', () => {
    expect(moveIndex('ArrowDown', 9, 5)).toBe(4);
    expect(moveIndex('ArrowUp', -3, 5)).toBe(0);
    expect(moveIndex('ArrowDown', Number.NaN, 5)).toBe(1);
  });

  it('does nothing for other keys or an empty list', () => {
    expect(moveIndex('Enter', 1, 5)).toBeNull();
    expect(moveIndex(' ', 1, 5)).toBeNull();
    expect(moveIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('tabStopIndex', () => {
  const keys = ['a', 'b', 'c'];
  it('keeps the remembered row while it is there', () => {
    expect(tabStopIndex(keys, 'c', 'b')).toBe(2);
  });
  it('falls back to the open recipe, then the first row', () => {
    expect(tabStopIndex(keys, 'gone', 'b')).toBe(1);
    expect(tabStopIndex(keys, null, null)).toBe(0);
    expect(tabStopIndex(keys, null, 'gone')).toBe(0);
  });
  it('is -1 for an empty list', () => {
    expect(tabStopIndex([], 'a', 'a')).toBe(-1);
  });
});

describe('moveTab', () => {
  it('wraps with the arrows and goes to the ends with Home and End', () => {
    expect(moveTab('ArrowRight', 4, 5)).toBe(0);
    expect(moveTab('ArrowLeft', 0, 5)).toBe(4);
    expect(moveTab('ArrowRight', 1, 5)).toBe(2);
    expect(moveTab('Home', 3, 5)).toBe(0);
    expect(moveTab('End', 0, 5)).toBe(4);
  });
  it('ignores other keys', () => {
    expect(moveTab('ArrowDown', 0, 5)).toBeNull();
    expect(moveTab('ArrowRight', 0, 0)).toBeNull();
  });
});
