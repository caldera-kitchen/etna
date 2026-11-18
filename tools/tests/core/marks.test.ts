// A step's marks (SPEC §5, "Marks"; ADR 0021): the words its instruction paragraphs write with
// Markdown emphasis, read from the parsed tree, in source order, outermost only, as plain text.

import { describe, expect, it } from 'vitest';

import { allSteps, parseRecipe, type Step } from '../../src/core/index.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const recipe = (body: string, form = '') => parseRecipe(`---\netna: 1\n${form}---\n\n# Soup\n\n${body}\n`, { units });
const steps = (body: string): Step[] => allSteps(recipe(body).nodes);
const marks = (prose: string): string[] => steps(`## Simmer\n\n- 1 l stock\n\n${prose}`)[0].marks;

describe('the marks of a step', () => {
  it('are the emphasized runs of its instruction, in the order written, as written', () => {
    expect(marks('Simmer on *medium-low* another *15-25 minutes*, stirring.')).toEqual(['medium-low', '15-25 minutes']);
  });

  it('are none when nothing is emphasized', () => {
    expect(marks('Simmer on medium-low another 15-25 minutes.')).toEqual([]);
  });

  it('read underscores as asterisks', () => {
    expect(marks('Simmer on _medium-low_ until *thick*.')).toEqual(['medium-low', 'thick']);
  });

  it('come from every instruction paragraph of the step', () => {
    expect(marks('Bring to *a boil*.\n\nThen lower to *a simmer*.')).toEqual(['a boil', 'a simmer']);
  });

  it('take a mark inside bold, and bold inside a mark, as their words', () => {
    expect(marks('Stir **on *medium-low*** now.')).toEqual(['medium-low']);
    expect(marks('Stir on ***medium-low*** now.')).toEqual(['medium-low']);
    expect(marks('Stir *on **medium-low** heat* now.')).toEqual(['on medium-low heat']);
  });

  it('are the outermost emphasis only', () => {
    expect(marks('Stir *on _medium_ heat* now.')).toEqual(['on medium heat']);
  });

  it('give a link its text, and code its value', () => {
    expect(marks('Add *[the stock](#stock)* and *`2 tbsp`*.')).toEqual(['the stock', '2 tbsp']);
  });

  it('count a line break or a run of spaces as one space', () => {
    expect(marks('Simmer *until\nthe potatoes   are tender*.')).toEqual(['until the potatoes are tender']);
    expect(marks('Simmer *until  \nthick*.')).toEqual(['until thick']);
  });

  it('keep punctuation written inside the asterisks', () => {
    expect(marks('Simmer *until thick,* then serve.')).toEqual(['until thick,']);
  });

  it('are not read from callouts, ingredient lines or the heading', () => {
    const [step] = steps('## Simmer *gently*\n\n- 1 l *hot* stock\n\nSimmer.\n\n> **Checkpoint** — *thick* and glossy.');
    expect(step.marks).toEqual([]);
  });

  it('are not read from the Notes, the preamble or a component', () => {
    const r = recipe('*Preamble* words.\n\n## Soup base\n\n### Simmer\n\n- 1 l stock\n\nSimmer *gently*.\n\n## Notes\n\n*Keeps* a week.');
    expect(allSteps(r.nodes).map((s) => s.marks)).toEqual([['gently']]);
  });

  it('are none in a traditional recipe, which has no steps', () => {
    const r = recipe('## Ingredients\n\n- 1 l stock\n\n## Directions\n\n1. Simmer *gently*.', 'form: traditional\n');
    expect(r.traditional).not.toBeNull();
    expect(allSteps(r.nodes)).toEqual([]);
  });

  it('leave a lone asterisk and an escaped one as text', () => {
    expect(marks('Simmer * gently, or 2 \\* 3 minutes.')).toEqual([]);
  });
});
