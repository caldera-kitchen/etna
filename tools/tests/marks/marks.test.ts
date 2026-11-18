// `etna marks` (SPEC §5.3): what each step's box will say, the kind of each mark, the lines the
// box takes. The steps are sentences of cookbook/potato-soup and cookbook/easter-bread, word for
// word with asterisks added; "Serve hot." is a placeholder step. "Thermapen" is marked so that
// the kneading box, its heading on one line, runs to six lines, and so that one mark is untyped.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { run } from '../../src/marks/cli.ts';
import { marksOf } from '../../src/marks/index.ts';
import { loadKindRegistries, loadUnits } from '../../src/node/files.ts';

const SOURCE = `---
etna: 1
---

# Potato Soup

## Simmer the potatoes

*Reduce heat* and simmer for *15 minutes*.

## Prepare the white sauce

- 2 tbsp unsalted butter
- 2 tbsp unbleached white flour
- 2 cups whole milk

While the potatoes boil, prepare the white sauce. Over *medium heat* melt the butter, add the flour, then slowly incorporate the milk.

## Add the white sauce

After the potatoes have boiled 15 minutes, add the white sauce and simmer on *medium-low* another *15-25 minutes* *until potatoes are tender*.

## Knead in a spiral mixer

Spiral Mixer - *Speed 2 for 4 minutes*. *30 minute rest*. *Speed 6 for 6-8 minutes*, checking dough temperature with a *Thermapen*. Stop when the dough begins to soften and bubbles can be heard popping under the hook, or when the dough reaches *85°F*, whichever comes first.

## Serve

Serve hot.
`;

const report = marksOf(parseRecipe(SOURCE, { units: loadUnits() }), loadKindRegistries());

describe('the marks of a recipe', () => {
  it('give each step its heading, marks and kinds, in order', () => {
    expect(report.steps.map((s) => s.heading)).toEqual(['Simmer the potatoes', 'Prepare the white sauce', 'Add the white sauce', 'Knead in a spiral mixer', 'Serve']);
    expect(report.steps[2].marks.map((m) => [m.text, m.kinds.map((k) => k.kind)])).toEqual([
      ['medium-low', ['setting']],
      ['15-25 minutes', ['duration']],
      ['until potatoes are tender', ['cue']],
    ]);
    expect(report.steps[4].marks).toEqual([]);
  });

  it('count the lines of a box as lint does, and flag one over five', () => {
    expect(report.steps.map((s) => [s.lines, s.long])).toEqual([
      [3, false],
      [2, false],
      [5, false],
      [6, true],
      [1, false],
    ]);
  });

  it('sum up steps, kinds, untyped marks and temperatures without a role', () => {
    expect(report.summary).toEqual({
      steps: 5,
      withMarks: 4,
      withoutMarks: 1,
      marks: 11,
      byKind: { duration: 5, temperature: 1, setting: 4, tool: 0, cue: 1, action: 1 },
      untyped: 1,
      roleUnknown: 1,
      long: 1,
    });
  });
});

describe('etna marks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-marks-'));
  const file = join(dir, 'recipe.md');
  writeFileSync(file, SOURCE);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const capture = async (argv: string[]) => {
    const out: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((text: string) => void out.push(text));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      return { code: await run(argv), text: out.join('\n') };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  };

  it('prints each step and the summary as text', async () => {
    const { code, text } = await capture([file]);
    expect(code).toBe(0);
    expect(text).toContain('Knead in a spiral mixer  (line 23; 6 lines, over five: mark fewer words)');
    expect(text).toContain('setting "Speed 2", duration "4 minutes"');
    expect(text).toContain('temperature "85°F" (role unknown)');
    expect(text).toContain('Serve  (line 27; 1 line, heading only)');
    expect(text).toContain('Summary: 5 steps, 4 with marks, 1 without; 1 box over five lines.');
    expect(text).toContain('Untyped marks: 1. Temperatures whose role is unknown: 1.');
  });

  it('prints JSON with --format json', async () => {
    const { code, text } = await capture(['--format', 'json', file]);
    expect(code).toBe(0);
    const json = JSON.parse(text);
    expect(json.recipes[0].steps[0].marks[0]).toEqual({ text: 'Reduce heat', kinds: [{ kind: 'action', words: 'Reduce', operation: 'reduce' }] });
    expect(json.summary.marks).toBe(11);
  });

  it('refuses an unknown format', async () => {
    expect((await capture(['--format', 'yaml', file])).code).toBe(2);
  });
});
