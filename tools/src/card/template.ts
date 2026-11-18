// The skeleton's slot syntax. Two forms, no loops and no logic:
//
//   {{name}}               replaced by the slot's HTML
//   {{#name}} … {{/name}}  kept when the slot has content, removed (markers and all) when it
//                          is empty or turned off
//
// Slot names are lower-case words joined by hyphens, optionally under one dotted namespace
// (`label.ingredients`). An unknown slot is empty.

const NAME = '[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)?';
const BLOCK_RE = new RegExp(`\\{\\{#(${NAME})\\}\\}([\\s\\S]*?)\\{\\{/\\1\\}\\}`, 'g');
const SLOT_RE = new RegExp(`\\{\\{(${NAME})\\}\\}`, 'g');
const ANY_RE = new RegExp(`\\{\\{[#/]?(${NAME})\\}\\}`, 'g');

/** True when the template mentions the slot, as a value or as a block. */
export function usesSlot(template: string, name: string): boolean {
  return template.includes(`{{${name}}}`) || template.includes(`{{#${name}}}`);
}

/** Every slot name the template mentions, as a value or a block, in order of first use. */
export function slotNames(template: string): string[] {
  return [...new Set([...template.matchAll(ANY_RE)].map((m) => m[1]))];
}

/**
 * Fill a template. Blocks are resolved first, on the template text alone, and values are
 * inserted in a single pass — so slot content is never itself read as template syntax.
 */
export function fillTemplate(template: string, slots: Record<string, string>): string {
  const value = (name: string) => (Object.hasOwn(slots, name) ? slots[name] : '');
  const filled = (name: string) => value(name) !== '';
  let text = template;
  // Blocks with different names may nest; repeat until none is left.
  for (let i = 0; i < 20; i++) {
    const next = text.replace(BLOCK_RE, (_all, name: string, inner: string) => (filled(name) ? inner : ''));
    if (next === text) break;
    text = next;
  }
  // Dropped blocks leave empty lines behind; remove them before any content goes in.
  text = text.replace(/^[ \t]*\n/gm, '');
  return text.replace(SLOT_RE, (_all, name: string) => value(name));
}
