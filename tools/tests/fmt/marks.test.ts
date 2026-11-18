// The formatter and marks (SPEC §13, "Marks"; ADR 0021): a mark written with underscores is
// written with asterisks, in a structured step's instruction only; nothing else about a mark
// changes, also where a temperature in or beside it is rewritten.

import { describe, expect, it } from 'vitest';

import { allSteps } from '../../src/core/index.ts';
import { format, parse, structured, traditional } from './helpers.ts';

/** Format one structured step's instruction and return it. */
const instruction = (text: string): string => {
  const out = format(structured(`- 1 l stock\n\n${text}`)).output;
  return out.slice(out.indexOf('- 1 l stock\n\n') + '- 1 l stock\n\n'.length).trimEnd();
};
const marksOf = (source: string) => allSteps(parse(source).nodes).map((s) => s.marks);

describe('etna fmt and marks', () => {
  it('writes a mark with asterisks', () => {
    expect(instruction('Simmer on _medium-low_ another _15-25 minutes_.')).toBe('Simmer on *medium-low* another *15-25 minutes*.');
  });

  it('writes bold with emphasis as three asterisks, either way it nests', () => {
    expect(instruction('Then ___stir___ well.')).toBe('Then ***stir*** well.');
    expect(instruction('Then **_stir_** and _**taste**_.')).toBe('Then ***stir*** and ***taste***.');
  });

  it('writes a mark inside bold with asterisks, and leaves bold alone as written', () => {
    expect(instruction('**simmer on _medium-low_** and __cover__.')).toBe('**simmer on *medium-low*** and __cover__.');
  });

  it('leaves a mark written with asterisks, and text with no marks, as it is', () => {
    for (const text of ['Simmer on *medium-low* heat.', 'Simmer gently.', 'Use the snake_case_name and a file_name.']) expect(instruction(text)).toBe(text);
  });

  it('keeps every mark where it is when it rewrites a temperature inside or beside one', () => {
    expect(instruction('Bake at _350 degrees F_ until _golden_.')).toBe('Bake at *350°F* until *golden*.');
    expect(instruction('Bake at *350 degrees F* until golden.')).toBe('Bake at *350°F* until golden.');
    expect(instruction('Bake at 350 degrees F _until golden_.')).toBe('Bake at 350°F *until golden*.');
  });

  it('gives the same marks before and after', () => {
    const source = structured('- 1 l stock\n\nSimmer on _medium-low_, then ___stir___ until **_thick_** and *glossy*.');
    expect(marksOf(format(source).output)).toEqual(marksOf(source));
    expect(marksOf(source)).toEqual([['medium-low', 'stir', 'thick', 'glossy']]);
  });

  it('is settled after one run', () => {
    const once = format(structured('- 1 l stock\n\nSimmer on _medium-low_ and ___stir___.')).output;
    expect(format(once).output).toBe(once);
    expect(format(once).changed).toBe(false);
  });

  it('leaves emphasis outside an instruction as written: a callout, an ingredient line, the notes, a traditional recipe, _none_', () => {
    const step = structured('- 1 l _hot_ stock\n\nSimmer.\n\n> **Note** — _gently_.\n\n## Notes\n\n_Keeps_ a week.');
    expect(format(step).output).toBe(step);
    const old = traditional({ ingredients: '- 1 g salt', directions: '1. Simmer _gently_.' });
    expect(format(old).output).toBe(old);
    const none = traditional({ ingredients: '- 1 g salt', directions: '_none_' });
    expect(format(none).output).toBe(none);
  });
});
