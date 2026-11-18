// The kinds of a mark (SPEC §5.3, "Kinds"; ADR 0022). Each mark is a run of words
// from a recipe in cookbook/, or a generic mark that takes the same path through the reader
// (`for 5 minutes`, `at 350°F`, `on high`).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { createKindRegistries, kindsOf, type MarkKind } from '../../src/core/kinds.ts';
import { ETNA_ROOT, loadKindRegistries } from '../../src/node/files.ts';

const registries = loadKindRegistries();
/** The kinds of a mark as `kind=words`, a temperature with its role, a tool with its kind. */
const read = (mark: string): string[] =>
  kindsOf(mark, registries).map((k: MarkKind) => `${k.kind}${k.role ? `:${k.role}` : ''}${k.tool ? `:${k.tool.kind}` : ''}=${k.words}`);

describe('durations', () => {
  it('are a number or a range with a time unit', () => {
    expect(read('15-25 minutes')).toEqual(['duration=15-25 minutes']);
    expect(read('for 5 minutes')).toEqual(['duration=5 minutes']);
    expect(read('another 5–10 minutes')).toEqual(['duration=5–10 minutes']);
    expect(read('about 2 1/2 to 3 hours')).toEqual(['duration=2 1/2 to 3 hours']);
    expect(read('2 to 4 minutes')).toEqual(['duration=2 to 4 minutes']);
    expect(read('for 30 Seconds')).toEqual(['duration=30 Seconds']);
    expect(read('20 min')).toEqual(['duration=20 min']);
    expect(read('30 minute rest')).toEqual(['duration=30 minute']);
  });

  it('take a word for the number, and a word between the number and the unit, from the registry', () => {
    expect(read('a few minutes')).toEqual(['duration=a few minutes']);
    expect(read('5 more minutes')).toEqual(['duration=5 more minutes']);
  });

  it('include overnight', () => {
    expect(read('salted water overnight')).toEqual(['duration=overnight']);
    expect(read('in the fridge overnight')).toEqual(['tool:appliance=fridge', 'duration=overnight']);
  });

  it('are not a number with another unit', () => {
    expect(read('about 100 g')).toEqual([]);
    expect(read('1.5–2 mm thick')).toEqual([]);
    expect(read('12 even rolls')).toEqual([]);
  });
});

describe('temperatures', () => {
  it('are a number with °F, °C or degrees', () => {
    expect(read('at 275°F')).toEqual(['temperature:set=275°F']);
    expect(read('78–80°F')).toEqual(['temperature:unknown=78–80°F']);
  });

  it('are one temperature when the other unit follows in parentheses', () => {
    expect(read('180°F (82°C)')).toEqual(['temperature:unknown=180°F (82°C)']);
  });

  it('are set by at or an oven word in the mark', () => {
    expect(read('at 78°F')).toEqual(['temperature:set=78°F']);
    expect(read('preheat oven to 275°F')).toEqual(['action=preheat', 'tool:appliance=oven', 'temperature:set=275°F']);
    expect(read('Preheat your oven to 180°C (350°F)')).toEqual(['action=Preheat', 'tool:appliance=oven', 'temperature:set=180°C (350°F)']);
  });

  it('are reached by to, until, registers, internal or stop at', () => {
    expect(read('to 190°F internal')).toEqual(['temperature:reach=190°F']);
    expect(read('to 170°F')).toEqual(['temperature:reach=170°F']);
    expect(read('stop at 170°F')).toEqual(['temperature:reach=170°F']);
    expect(read('Cool to 110°F')).toEqual(['action=Cool', 'temperature:reach=110°F']);
    expect(read('internal temperature of 165°F')).toEqual(['temperature:reach=165°F']);
    expect(read('190°F internal temperature')).toEqual(['temperature:reach=190°F']);
  });

  it('take the cue that runs into them as their own words', () => {
    expect(read('until it registers 160°F')).toEqual(['temperature:reach=160°F']);
  });

  it('have no role when their own words say none', () => {
    expect(read('85°F')).toEqual(['temperature:unknown=85°F']);
    expect(read('170°F')).toEqual(['temperature:unknown=170°F']);
  });

  it('each take their role from the words since the one before', () => {
    expect(read('Roast at 400°F to 165°F')).toEqual(['action=Roast', 'temperature:set=400°F', 'temperature:reach=165°F']);
    expect(read('Bake at 275°F for 50-70 minutes to 190°F internal temperature')).toEqual(['action=Bake', 'temperature:set=275°F', 'duration=50-70 minutes', 'temperature:reach=190°F']);
  });
});

describe('settings', () => {
  it('are a level that is the whole mark, follows on, over, to or at, or has a dial after it', () => {
    expect(read('medium-low')).toEqual(['setting=medium-low']);
    expect(read('on high')).toEqual(['setting=high']);
    expect(read('medium heat')).toEqual(['setting=medium heat']);
    expect(read('on high speed')).toEqual(['setting=high speed']);
    expect(read('return to high')).toEqual(['action=return', 'setting=high']);
  });

  it('are a speed with its number', () => {
    expect(read('speed 6')).toEqual(['setting=speed 6']);
    expect(read('Speed 2 for 4 minutes')).toEqual(['setting=Speed 2', 'duration=4 minutes']);
  });

  it('are a mode anywhere', () => {
    expect(read('fan on')).toEqual(['setting=fan']);
  });

  it('are not a level that sizes a tool or is part of a longer word', () => {
    expect(read('medium sauce pan')).toEqual(['tool:cookware=sauce pan']);
    expect(read('high-speed blender')).toEqual(['tool:machine=high-speed blender']);
  });
});

describe('tools', () => {
  it('are a name or alias in the tools registry, with its kind', () => {
    expect(read('in a Vitamix')).toEqual(['tool:machine=Vitamix']);
    expect(read('using Vitamix')).toEqual(['tool:machine=Vitamix']);
    expect(read('dough hook')).toEqual(['tool:utensil=dough hook']);
    expect(read('on a cookie sheet')).toEqual(['tool:cookware=cookie sheet']);
    expect(read('on cooling rack')).toEqual(['tool:utensil=cooling rack']);
    expect(read('8-inch skillet')).toEqual(['tool:cookware=skillet']);
    expect(read('electric whisk')).toEqual(['tool:machine=electric whisk']);
  });

  it('take the longest name, and a plural', () => {
    expect(read('in double boiler')).toEqual(['tool:cookware=double boiler']);
    expect(read('2 (9-inch) round cake pans')).toEqual(['tool:cookware=cake pans']);
  });
});

describe('cues', () => {
  it('open with until, till or when, and end at a comma or a shape', () => {
    expect(read('until doubled')).toEqual(['cue=until doubled']);
    expect(read('until potatoes are tender')).toEqual(['cue=until potatoes are tender']);
    expect(read('freeze until firm')).toEqual(['action=freeze', 'cue=until firm']);
    expect(read('or until doubled in size')).toEqual(['cue=until doubled in size']);
  });

  it('without an opening word stay untyped', () => {
    expect(read('light and foamy')).toEqual([]);
    expect(read('smooth, soft, and tacky')).toEqual([]);
  });
});

describe('actions', () => {
  it('open the mark with an operation or its alias', () => {
    expect(kindsOf('Reduce heat', registries)).toMatchObject([{ kind: 'action', words: 'Reduce', operation: 'reduce' }]);
    expect(kindsOf('rotate halfway', registries)).toMatchObject([{ kind: 'action', operation: 'rotate' }]);
    expect(kindsOf('Whirl in a Vitamix', registries)).toMatchObject([{ kind: 'action', operation: 'blend' }, { kind: 'tool', words: 'Vitamix' }]);
    expect(read('knead for 20 minutes')).toEqual(['action=knead', 'duration=20 minutes']);
    expect(read('proof at least 60 minutes')).toEqual(['action=proof', 'duration=60 minutes']);
  });

  it('may open with let', () => {
    expect(kindsOf('Let rest 1 hour', registries)).toMatchObject([{ kind: 'action', words: 'Let rest', operation: 'rest' }, { kind: 'duration' }]);
  });

  it('are the word that is also a tool when it opens the mark, the tool elsewhere', () => {
    expect(read('Whisk eggs and vanilla')).toEqual(['action=Whisk']);
    expect(read('whisk attachment')).toEqual(['tool:utensil=whisk attachment']);
    expect(read('microwave')).toEqual(['action=microwave']);
    expect(read('in the microwave for 30 seconds')).toEqual(['tool:appliance=microwave', 'duration=30 seconds']);
  });

  it('are not an operation later in the mark', () => {
    expect(read('Stir two or three times')).toEqual(['action=Stir']);
    expect(read('just to combine')).toEqual([]);
  });
});

describe('a mark with several things', () => {
  it('gives each, in the order written', () => {
    expect(read('Blend on high in a Vitamix for 5 minutes')).toEqual(['action=Blend', 'setting=high', 'tool:machine=Vitamix', 'duration=5 minutes']);
    expect(read('Raise 60–75 minutes at 78–80°F until 60–70% risen')).toEqual(['action=Raise', 'duration=60–75 minutes', 'temperature:set=78–80°F', 'cue=until 60–70% risen']);
  });
});

describe('the registries', () => {
  it('are the only words: an empty registry types shapes alone', () => {
    const empty = createKindRegistries({
      operations: { operations: [] },
      tools: { tools: [] },
      modifiers: { modifiers: [] },
      stopConditions: { categories: [{ kind: 'duration', units: [{ name: 'minute' }] }, { kind: 'temperature', units: [{ name: 'F', aliases: ['°F'] }] }] },
    });
    const kinds = (mark: string) => kindsOf(mark, empty).map((k) => `${k.kind}${k.role ? `:${k.role}` : ''}`);
    expect(kinds('Blend on high in a Vitamix for 5 minutes')).toEqual(['duration']);
    expect(kinds('Let dough rise at 78°F until doubled')).toEqual(['temperature:unknown']);
  });

  it('name no tool or modifier twice', () => {
    const yaml = (name: string) => parseYaml(readFileSync(join(ETNA_ROOT, 'registries', name), 'utf8'));
    for (const [file, key] of [
      ['tools.yaml', 'tools'],
      ['modifiers.yaml', 'modifiers'],
    ]) {
      const all = (yaml(file)[key] as { name: string; aliases?: string[] }[]).flatMap((e) => [e.name, ...(e.aliases ?? [])].map((t) => t.toLowerCase()));
      expect(all.filter((t, i) => all.indexOf(t) !== i), file).toEqual([]);
    }
  });

  it('say what is wrong with a file that has no list', () => {
    expect(() => createKindRegistries({ operations: {}, tools: { tools: [] }, modifiers: { modifiers: [] }, stopConditions: { categories: [] } })).toThrow(/operations registry/);
  });
});

describe('reading', () => {
  it('is the same every time and leaves the mark as it was', () => {
    const mark = 'Speed 6 for 6-8 minutes';
    expect(kindsOf(mark, registries)).toEqual(kindsOf(mark, registries));
    for (const k of kindsOf(mark, registries)) expect(mark.slice(k.start, k.end)).toBe(k.words);
  });
});
