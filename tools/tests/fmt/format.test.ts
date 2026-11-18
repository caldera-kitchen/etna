import { describe, expect, it } from 'vitest';
import { UNDECIDED_TEMPERATURE } from '../../src/fmt/index.ts';
import { formatOnce } from '../../src/fmt/pass.ts';
import { direction, format, ingredient, meaningDifferences, parse, proseDifferences, structured, traditional, units } from './helpers.ts';

describe('ingredient quantity', () => {
  it('writes Unicode fractions as ASCII', () => {
    expect(ingredient('- 1½ cups flour')).toBe('- 1 1/2 cups flour');
    expect(ingredient('- 1 ½ cups flour')).toBe('- 1 1/2 cups flour');
    expect(ingredient('- ¾ cup sugar')).toBe('- 3/4 cup sugar');
    expect(ingredient('- ¹⁄₁₆ tsp cardamom')).toBe('- 1/16 tsp cardamom');
  });

  it('writes ranges with a plain hyphen', () => {
    expect(ingredient('- 2–3 cloves garlic')).toBe('- 2-3 cloves garlic');
    expect(ingredient('- 2 to 3 cloves garlic')).toBe('- 2-3 cloves garlic');
    expect(ingredient('- 14 - 28 g salt')).toBe('- 14-28 g salt');
    expect(ingredient('- 1 to 1½ cups milk')).toBe('- 1-1 1/2 cups milk');
  });

  it('keeps integers, decimals and ASCII fractions as written', () => {
    expect(ingredient('- 2 eggs')).toBe('- 2 eggs');
    expect(ingredient('- 1.50 kg flour')).toBe('- 1.50 kg flour');
    expect(ingredient('- .5 g saffron')).toBe('- .5 g saffron');
    expect(ingredient('- 2/4 cup oil')).toBe('- 2/4 cup oil'); // never reduced
    expect(ingredient('- 1 1/2 cups milk')).toBe('- 1 1/2 cups milk');
  });
});

describe('ingredient unit', () => {
  it('uses the symbol when the unit has one', () => {
    expect(ingredient('- 250 grams flour')).toBe('- 250 g flour');
    expect(ingredient('- 1 gram salt')).toBe('- 1 g salt');
    expect(ingredient('- 2 tablespoons oil')).toBe('- 2 tbsp oil');
    expect(ingredient('- 1 Tbsp. oil')).toBe('- 1 tbsp oil');
    expect(ingredient('- 2 pounds beef')).toBe('- 2 lb beef');
    expect(ingredient('- 2 lbs. beef')).toBe('- 2 lb beef');
    expect(ingredient('- 8 ounces cheese')).toBe('- 8 oz cheese');
    expect(ingredient('- 500 mL milk')).toBe('- 500 ml milk');
    expect(ingredient('- 4 fluid ounces cream')).toBe('- 4 fl oz cream');
  });

  it('makes a word unit agree with the quantity', () => {
    expect(ingredient('- 1 cloves garlic')).toBe('- 1 clove garlic');
    expect(ingredient('- 2 clove garlic')).toBe('- 2 cloves garlic');
    expect(ingredient('- 1/2 cups milk')).toBe('- 1/2 cup milk');
    expect(ingredient('- 1 1/2 cup milk')).toBe('- 1 1/2 cups milk');
    expect(ingredient('- 2-3 sprig thyme')).toBe('- 2-3 sprigs thyme');
    expect(ingredient('- 1 small bags chips')).toBe('- 1 small bag chips');
    expect(ingredient('- 3 pinch salt')).toBe('- 3 pinches salt');
  });

  it('never pluralizes a symbol or a size word', () => {
    expect(ingredient('- 2 g salt')).toBe('- 2 g salt');
    expect(ingredient('- 3 tbsp oil')).toBe('- 3 tbsp oil');
    expect(ingredient('- 2 large eggs')).toBe('- 2 large eggs');
    expect(ingredient('- 1 Large egg')).toBe('- 1 large egg');
    expect(ingredient('- 3 medium onions, diced')).toBe('- 3 medium onions, diced');
  });

  it('does not take the first word of an item for a unit', () => {
    expect(ingredient('- 2 eggs')).toBe('- 2 eggs');
    expect(ingredient('- 2 grams-worth of saffron')).toBe('- 2 grams-worth of saffron');
    expect(ingredient('- 14-ounce can tomatoes')).toBe('- 14-ounce can tomatoes'); // no quantity at all
  });
});

describe('ingredient line shape', () => {
  it('uses single spaces and `, ` before the note', () => {
    expect(ingredient('- 2  cups   flour ,sifted')).toBe('- 2 cups flour, sifted');
    expect(ingredient('- 1 sheet  phyllo  pastry')).toBe('- 1 sheet phyllo pastry');
    expect(ingredient('-   2 cups flour,  sifted')).toBe('- 2 cups flour, sifted');
    expect(ingredient('- 113 grams butter,softened')).toBe('- 113 g butter, softened');
  });

  it('keeps the item and the note as written', () => {
    expect(ingredient('- 400 grams Potatoes, cut into ⅛ths')).toBe('- 400 g Potatoes, cut into ⅛ths');
    expect(ingredient('- 195 grams Flour, 1½ cups')).toBe('- 195 g Flour, 1½ cups');
    expect(ingredient('- 2 pounds Carrots, cut into 1½-inch pieces')).toBe('- 2 lb Carrots, cut into 1½-inch pieces');
    expect(ingredient('- 16 ounces (ca. 425 grams) can mango slices')).toBe('- 16 oz (ca. 425 grams) can mango slices');
    expect(ingredient('- 1 cup Flour (sifted, twice), Plain')).toBe('- 1 cup Flour (sifted, twice), Plain');
    expect(ingredient('- 2 cups **strong** flour, sifted')).toBe('- 2 cups **strong** flour, sifted');
  });

  it('leaves a line with no quantity alone apart from spacing', () => {
    expect(ingredient('- salt')).toBe('- salt');
    expect(ingredient('- Kosher  Salt ,to taste')).toBe('- Kosher Salt, to taste');
    expect(ingredient('- a few grams of saffron')).toBe('- a few grams of saffron');
    expect(ingredient('- ½-inch piece ginger')).toBe('- ½-inch piece ginger');
  });

  it('reads a thousands separator and writes the plain number', () => {
    expect(ingredient('- 1,000 grams flour')).toBe('- 1000 g flour');
  });

  it('leaves alone what it cannot read with certainty', () => {
    expect(ingredient('- **2 cups** flour')).toBe('- **2 cups** flour'); // the amount is inside markup
    expect(ingredient('- 00 Flour')).toBe('- 00 Flour');
    expect(ingredient('- 2 cups `a  b`,x')).toBe('- 2 cups `a  b`,x'); // code span: spacing kept
    expect(ingredient('- 30 g Flour 1,5 type')).toBe('- 30 g Flour 1,5 type');
  });

  it('canonicalizes only the amount of an item that continues on further lines', () => {
    const source = traditional({ ingredients: '- 2  tablespoons   butter ,cold\n  and  cubed\n- 1 cups milk', directions: '1. Mix.' });
    expect(format(source).output).toContain('- 2 tbsp butter ,cold\n  and  cubed\n- 1 cup milk\n');
  });

  it('formats ingredient bullets under a structured step too', () => {
    const out = format(structured('- 115 grams dark chocolate ,chopped\n- 2 Large eggs\n\nMelt, then stir.')).output;
    expect(out).toContain('- 115 g dark chocolate, chopped\n- 2 large eggs\n\nMelt, then stir.\n');
  });
});

describe('reference lines', () => {
  it('canonicalizes a leading amount and leaves the link untouched', () => {
    const out = format(
      structured('- 80  grams   [mango  chutney](../mango-chutney/) ,chopped\n- [pasta](#pasta)\n- 1½ cups [Stock](../stock/)\n\nCombine.'),
    ).output;
    expect(out).toContain('- 80 g [mango  chutney](../mango-chutney/) ,chopped\n- [pasta](#pasta)\n- 1 1/2 cups [Stock](../stock/)\n');
  });
});

describe('callouts', () => {
  it('writes exactly `> **Keyword** — text`', () => {
    const cases: [string, string][] = [
      ['> **Checkpoint**: stop if it splits.', '> **Checkpoint** — stop if it splits.'],
      ['> **Checkpoint** - stop if it splits.', '> **Checkpoint** — stop if it splits.'],
      ['> **Note** -- keeps well.', '> **Note** — keeps well.'],
      ['> **Tip** – use a scale.', '> **Tip** — use a scale.'],
      ['>**Tip**  —   use a scale.', '> **Tip** — use a scale.'],
      ['>   __Substitute__ — margarine.', '> **Substitute** — margarine.'],
      ['> **Checkpoint** — already canonical.', '> **Checkpoint** — already canonical.'],
    ];
    for (const [before, after] of cases) {
      expect(format(structured(`Stir.\n\n${before}`)).output).toContain(`\n\n${after}\n`);
    }
  });

  it('keeps the keyword, the text and later lines as written', () => {
    const out = format(structured('Stir.\n\n> **checkpont**: if  it looks broken,\n> blend   again.')).output;
    expect(out).toContain('> **checkpont** — if  it looks broken,\n> blend   again.\n');
  });

  it('leaves a blockquote that is not a callout alone', () => {
    const source = structured('Stir.\n\n> **Note:** colon inside the bold\n\n> just a quote - with a dash\n\n> **Choose**');
    expect(format(source).output).toBe(source);
  });
});

describe('traditional step labels and note leads', () => {
  it('writes `1. **Label** — text`', () => {
    expect(direction('**Mix** - Beat the butter.')).toBe('**Mix** — Beat the butter.');
    expect(direction('**Mix**: Beat the butter.')).toBe('**Mix** — Beat the butter.');
    expect(direction('**Mix** -- Beat the butter.')).toBe('**Mix** — Beat the butter.');
    expect(direction('**Mix** –  Beat the butter.')).toBe('**Mix** — Beat the butter.');
    expect(direction('__Day 1 - Dough__ — Beat the butter.')).toBe('**Day 1 - Dough** — Beat the butter.');
    expect(direction('**Mix** — Beat the butter.')).toBe('**Mix** — Beat the butter.');
  });

  it('does not treat bold text that merely starts a sentence as a label', () => {
    expect(direction('**Beat** the butter - until light.')).toBe('**Beat** the butter - until light.');
    expect(direction('**Mix:** Beat the butter.')).toBe('**Mix:** Beat the butter.');
    expect(direction('Pizza — Oil the sheet pan.')).toBe('Pizza — Oil the sheet pan.');
  });

  it('writes a note lead as `**Label** — text`', () => {
    const out = format(traditional({ ingredients: '- salt', notes: '**Storage**: keeps three days.\n\n**Source** - my aunt.\n\nPlain - note.' })).output;
    expect(out).toContain('## Notes\n\n**Storage** — keeps three days.\n\n**Source** — my aunt.\n\nPlain - note.\n');
  });

  it('never touches a group label, numbering that renders otherwise, or the _none_ placeholder', () => {
    const source = traditional({ ingredients: '### Frosting - rich\n\n- 1 g salt', directions: '3. Third.\n4. Fourth.' });
    expect(format(source).output).toBe(source);
    const none = traditional({ ingredients: '- 1 g salt', directions: '_none_' });
    expect(format(none).output).toBe(none);
  });
});

describe('temperatures in prose', () => {
  it('rewrites every spelling of a scaled temperature to 350°F / 180°C', () => {
    for (const written of ['350 °F', '350° F', '350 ° F', '350℉', '350 ℉', '350 degrees F', '350 degrees Fahrenheit', '350ºF', '350°f', '350-degree F']) {
      expect(direction(`Bake at ${written} until done.`), written).toBe('Bake at 350°F until done.');
    }
    for (const written of ['180 °C', '180° C', '180 ° C', '180℃', '180 ℃', '180 degrees C', '180 degrees Celsius', '180ºC', '180 degree celsius']) {
      expect(direction(`Bake at ${written} until done.`), written).toBe('Bake at 180°C until done.');
    }
  });

  it('handles the end of a sentence, brackets and pairs', () => {
    expect(direction('Preheat to 425 degrees F.')).toBe('Preheat to 425°F.');
    expect(direction('Preheat to 350 F.')).toBe('Preheat to 350°F.');
    expect(direction('Bake at 325F/300F for an hour.')).toBe('Bake at 325°F/300°F for an hour.');
    expect(direction('Dough at 74F for 2 hours.')).toBe('Dough at 74°F for 2 hours.');
    expect(direction('Add 2 c flour and 1 f of nothing; 3 Fold.')).toBe('Add 2 c flour and 1 f of nothing; 3 Fold.');
    expect(direction('Heat to 180 °C (350 °F).')).toBe('Heat to 180°C (350°F).');
    expect(direction('Drop to 160ºC/320ºF and bake.')).toBe('Drop to 160°C/320°F and bake.');
    expect(direction('Hold at 37.5 °C.')).toBe('Hold at 37.5°C.');
  });

  it('keeps the separator of a range', () => {
    expect(direction('Raise at 78–80 °F until risen.')).toBe('Raise at 78–80°F until risen.');
    expect(direction('Microwave to 110° F - 120° F.')).toBe('Microwave to 110°F - 120°F.');
    expect(direction('Until it registers 160 to 165 degrees F.')).toBe('Until it registers 160 to 165°F.');
    expect(direction('Bring to 100-110ºF/ 38-43ºC.')).toBe('Bring to 100-110°F/ 38-43°C.');
  });

  it('does not report the open end of a range whose other end states the scale', () => {
    const result = format(traditional({ ingredients: '- salt', directions: '1. Bake at 350° to 375°F, or 160 - 170 degrees C.' }));
    expect(result.output).toContain('1. Bake at 350° to 375°F, or 160 - 170°C.\n');
    expect(result.notes).toEqual([]);
  });

  it('closes the blank line before a list nested in a direction, as between items', () => {
    const out = format(traditional({ ingredients: '- salt', directions: '1. One.\n2. Two.\n\n   - Spiral mixer.\n   - KitchenAid.\n\n3. Three.' })).output;
    expect(out).toContain('2. Two.\n   - Spiral mixer.\n   - KitchenAid.\n3. Three.');
  });

  it('never touches a number that is not a temperature', () => {
    const untouched = [
      'Fold in thirds, turn 90 degrees and fold again.',
      'Give it a 90° turn on the counter.',
      'Bake 60–75 minutes, about 2 1/2 hours, in a 9-inch pan.',
      'Add 350 g flour, 5 C. of water and 2 F-clamps.',
      'Use 3 degrees of freedom.',
      'Mix 1½ cups with 2 – 3 tbsp and 10 to 12 grams.',
      'Heat to `350 °F` exactly.',
      'Already 350°F and 180°C.',
    ];
    for (const text of untouched) expect(direction(text), text).toBe(text);
    // An angle is not a temperature with its scale missing.
    const result = format(traditional({ ingredients: '- salt', directions: '1. Turn 90 degrees and repeat.\n2. Rotate the pan 180°, then bake.' }));
    expect(result.notes).toEqual([]);
  });

  it('never joins lines', () => {
    expect(format(structured('Bake at 350\n°F until done.')).output).toContain('Bake at 350\n°F until done.\n');
  });

  it('applies in structured instructions, callouts, directions, notes and ingredient notes', () => {
    const s = format(structured('- 120 grams water, 110 ° F\n\nBake at 350 degrees F.\n\n> **Checkpoint** — pull at 200 °F.')).output;
    expect(s).toContain('- 120 g water, 110°F\n\nBake at 350°F.\n\n> **Checkpoint** — pull at 200°F.\n');
    const t = format(
      traditional({ ingredients: '- 120 grams water, about 110 °F', directions: '1. **Bake** — at 350 ℉.\n   Then 400° F.', notes: 'Proof at 78–80 °F.\n\n**Storage** — below 40 °F.' }),
    ).output;
    expect(t).toContain('- 120 g water, about 110°F\n');
    expect(t).toContain('1. **Bake** — at 350°F.\n   Then 400°F.\n');
    expect(t).toContain('Proof at 78–80°F.\n\n**Storage** — below 40°F.\n');
  });

  it('covers directions and notes that are not a numbered step or a paragraph', () => {
    const out = format(
      traditional({ ingredients: '- salt', directions: 'Heat the oven to 350 °F first.\n\n1. Bake.', notes: '- Try 375 °F next time.\n\n> Baked at 400° F once.\n\n### At 350 °F' }),
    ).output;
    expect(out).toContain('Heat the oven to 350°F first.\n\n1. Bake.\n');
    expect(out).toContain('- Try 375°F next time.\n\n> Baked at 400°F once.\n\n### At 350 °F\n'); // a heading is never touched
  });


  it('leaves headings, the title, item names and the preamble alone', () => {
    const source = '---\netna: 1\n---\n\n# Bake at 350 °F\n\nServe at 70 °F.\n\n## Heat to 350 °F\n\n- 100 g water (110 °F), warm\n\nStir.\n';
    expect(format(source).output).toBe(source);
  });
});

describe('a temperature with no scale stated', () => {
  const directions = (...steps: string[]) => traditional({ ingredients: '- salt', directions: steps.map((s, i) => `${i + 1}. ${s}`).join('\n') });
  const steps = (source: string) => {
    const lines = format(source).output.split('\n');
    return lines.slice(lines.indexOf('## Directions') + 2).filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ''));
  };
  const none = 'scale not stated, and the recipe gives no other temperature';

  it('rule 1: takes the scale every other temperature in the recipe states', () => {
    const f = directions('Heat the oven to 350 °F.', 'Cook the custard to 170 degrees.', 'Chill to 40° before churning.', 'Proof at 78-degree warmth.');
    expect(steps(f)).toEqual(['Heat the oven to 350°F.', 'Cook the custard to 170°F.', 'Chill to 40°F before churning.', 'Proof at 78°F warmth.']);
    expect(format(f).notes).toEqual([]);

    const c = directions('Heat the oven to 180 °C.', 'Hold the water bath at 65 degrees.', 'Serve at 8°.');
    expect(steps(c)).toEqual(['Heat the oven to 180°C.', 'Hold the water bath at 65°C.', 'Serve at 8°C.']);
    expect(format(c).notes).toEqual([]);
  });

  it('rule 1: the scale may be stated anywhere in the recipe', () => {
    // … in an ingredient note, for a direction:
    const a = format(traditional({ ingredients: '- 120 grams water, 110°F', directions: '1. Let rise at 78 degrees.' }));
    expect(a.output).toContain('1. Let rise at 78°F.\n');
    // … in a direction, for an ingredient note:
    const b = format(traditional({ ingredients: '- 120 grams Water, 90 degrees', directions: '1. Bake at 350°F.' }));
    expect(b.output).toContain('- 120 g Water, 90°F\n');
    // … in a heading or the preamble, which are themselves never rewritten:
    const c = format('---\netna: 1\n---\n\n# Test\n\nServe at 60 °C.\n\n## Poach\n\nHold at 75 degrees.\n');
    expect(c.output).toBe('---\netna: 1\n---\n\n# Test\n\nServe at 60 °C.\n\n## Poach\n\nHold at 75°C.\n');
    expect([...a.notes, ...b.notes, ...c.notes]).toEqual([]);
  });

  it('rule 2: reads 300 or more as Fahrenheit', () => {
    expect(direction('Heat the oven to 350 degrees.')).toBe('Heat the oven to 350°F.');
    expect(direction('Cook 350 degrees for 20 minutes.')).toBe('Cook 350°F for 20 minutes.');
    expect(direction('Use a preheated 350° oven (325° for a glass pan).')).toBe('Use a preheated 350°F oven (325°F for a glass pan).');
    expect(direction('Fry at exactly 300 degrees.')).toBe('Fry at exactly 300°F.');
    expect(direction('Fry at 299 degrees.')).toBe('Fry at 299 degrees.');
    const result = format(traditional({ ingredients: '- 500 grams sugar, cooked to 310 degrees', directions: '1. Pour.' }));
    expect(result.output).toContain('- 500 g sugar, cooked to 310°F\n');
    expect(result.notes).toEqual([]);
  });

  it('rule 2 feeds rule 1: once 350 degrees is °F, that is the scale the recipe states', () => {
    // A second run would see `350°F` and apply it to the rest, so the first run does.
    const source = directions('Cook the custard to 170 degrees.', 'Heat the oven to 350 degrees.', 'Chill to 40°.');
    const result = format(source);
    expect(steps(source)).toEqual(['Cook the custard to 170°F.', 'Heat the oven to 350°F.', 'Chill to 40°F.']);
    expect(result.notes).toEqual([]);
    expect(format(result.output).output).toBe(result.output);
    expect(formatOnce(source, units)).toBe(result.output);
  });

  it('rule 3: leaves it alone and says why when neither decides', () => {
    const source = traditional({ ingredients: '- 120 grams Water, 90 degrees', directions: '1. Cook the custard to 170 degrees.\n2. Chill to 40° before churning.' });
    const result = format(source);
    expect(result.output).toContain('- 120 g Water, 90 degrees\n');
    expect(result.output).toContain('1. Cook the custard to 170 degrees.\n2. Chill to 40° before churning.\n');
    expect(result.notes).toEqual([
      { line: 10, message: `temperature undecided: 90 degrees: ${none}` },
      { line: 14, message: `temperature undecided: 170 degrees: ${none}` },
      { line: 15, message: `temperature undecided: 40°: ${none}` },
    ]);
    // The notes are easy to list: they share one prefix, and nothing else carries it.
    expect(result.notes.every((n) => n.message.startsWith(`${UNDECIDED_TEMPERATURE}: `))).toBe(true);
    expect(format(result.output).notes).toEqual(result.notes.map((n) => ({ ...n })));
  });

  it('rule 4: a recipe that states both °F and °C gives no context, so only the value decides', () => {
    const source = directions('Heat the oven to 180°C (350°F).', 'Raise it to 425 degrees.', 'Cook the custard to 170 degrees.');
    const result = format(source);
    expect(steps(source)).toEqual(['Heat the oven to 180°C (350°F).', 'Raise it to 425°F.', 'Cook the custard to 170 degrees.']);
    expect(result.notes).toEqual([{ line: 16, message: 'temperature undecided: 170 degrees: scale not stated, and the recipe uses both °F and °C' }]);
  });

  it('does not call 300 or more Celsius, even in a Celsius recipe', () => {
    const source = directions('Heat the oven to 180°C.', 'Sear on a 500 degree stone.', 'Rest at 60 degrees.');
    const result = format(source);
    expect(steps(source)).toEqual(['Heat the oven to 180°C.', 'Sear on a 500 degree stone.', 'Rest at 60°C.']);
    expect(result.notes).toEqual([{ line: 15, message: 'temperature undecided: 500 degrees: scale not stated; the recipe uses °C, but 500 is too high to be Celsius' }]);
  });

  it('treats a range as one expression and keeps its separator', () => {
    expect(direction('Bake at 350 to 375 degrees.')).toBe('Bake at 350 to 375°F.');
    expect(direction('Bake at 350-375 degrees.')).toBe('Bake at 350-375°F.');
    expect(direction('Bake at 350° – 375°.')).toBe('Bake at 350°F – 375°F.');
    // Both ends must reach 300 for the value to decide.
    const low = directions('Cook the syrup until it registers 285-300 degrees.', 'Or between 236 and 239 degrees.');
    expect(format(low).output).toBe(low);
    expect(format(low).notes.map((n) => n.message)).toEqual([`temperature undecided: 300 degrees: ${none}`, `temperature undecided: 239 degrees: ${none}`]);
    // With a scale from the recipe, the whole range takes it.
    const known = directions('Cool to 110°F.', 'Cook the syrup until it registers between 236 and 239 degrees.', 'Hold at 160 to 165 degrees.');
    expect(steps(known)).toEqual(['Cool to 110°F.', 'Cook the syrup until it registers between 236 and 239°F.', 'Hold at 160 to 165°F.']);
  });

  it('still ignores angles, whatever the recipe says about its scale', () => {
    const source = directions(
      'Bake at 350°F.',
      'Fold in thirds, turn 90 degrees and fold again.',
      'Rotate the pan 180°, then bake.',
      'Give the dough a 90° turn.',
      'Rotate the tray 30 degrees.',
      'Cut at a 45 degree angle.',
      'Turn the oven down to 180 degrees.',
    );
    const result = format(source);
    expect(steps(source)).toEqual([
      'Bake at 350°F.',
      'Fold in thirds, turn 90 degrees and fold again.',
      'Rotate the pan 180°, then bake.',
      'Give the dough a 90° turn.',
      'Rotate the tray 30 degrees.',
      'Cut at a 45 degree angle.',
      'Turn the oven down to 180°F.', // the oven, not the pan
    ]);
    expect(result.notes).toEqual([]);
    const alone = format(directions('Turn 90 degrees and repeat.', 'Rotate the pan 180°, then bake.'));
    expect(alone.changed).toBe(false);
    expect(alone.notes).toEqual([]);
  });

  it('leaves angles of any size and temperature differences alone', () => {
    const lines = [
      'Slice the scallions on a 30-degree bias.',
      'Hold the knife at 20 degrees.',
      'Cut the bread at a 60° angle.',
      'Lower the oven by 25 degrees.',
      'It should be about 5 degrees cooler than the room.',
      'Stop within 2 degrees of the target.',
    ];
    const source = directions('Bake at 350°F.', ...lines, 'Proof at 78 degrees.');
    expect(steps(source)).toEqual(['Bake at 350°F.', ...lines, 'Proof at 78°F.']);
    expect(format(source).notes).toEqual([]);
  });

  it('never changes a digit, and never touches code or a number without a degree mark', () => {
    const source = directions('Bake at 350°F.', 'Use `200 degrees` in the app, 200 g of flour and 2 or 3 eggs.', 'Hold at 62.5 degrees for 1 1/2 hours.');
    expect(steps(source)).toEqual(['Bake at 350°F.', 'Use `200 degrees` in the app, 200 g of flour and 2 or 3 eggs.', 'Hold at 62.5°F for 1 1/2 hours.']);
    expect(format(source).output.replace(/\D/g, '')).toBe(source.replace(/\D/g, ''));
  });
});

describe('frontmatter', () => {
  const body = '\n# Test\n\n## Step\n\nStir.\n';

  it('orders the keys: etna, form, source, yield, license, version, others, extra', () => {
    const source = `---\nextra:\n  calories: 2517\n  tags: [a, b]\nversion: v1.0.2\ncuisine: Italian\nlicense: CC BY-SA 4.0\nyield: 12 rolls\nsource: Vincent Lucarelli\nserves: 4\nform: structured\netna: 1\n---\n${body}`;
    expect(format(source).output).toBe(
      `---\netna: 1\nform: structured\nsource: Vincent Lucarelli\nyield: 12 rolls\nlicense: CC BY-SA 4.0\nversion: v1.0.2\ncuisine: Italian\nserves: 4\nextra:\n  calories: 2517\n  tags: [a, b]\n---\n${body}`,
    );
  });

  it('moves key blocks as text: quoting, spacing, comments and block scalars are kept', () => {
    const source = `---\nyield:   "8 servings"   # as written\n# where it came from\nsource: 'Aunt: May'\nextra:\n  note: |\n    two\n    lines\n  # inner comment\n  n: 1\netna: 1\n---\n${body}`;
    expect(format(source).output).toBe(
      `---\netna: 1\n# where it came from\nsource: 'Aunt: May'\nyield:   "8 servings"   # as written\nextra:\n  note: |\n    two\n    lines\n  # inner comment\n  n: 1\n---\n${body}`,
    );
  });

  it('changes nothing when the keys are already in order', () => {
    const source = `---\netna:   1\nsource:   "x"\nextra: {a: 1}\n---\n${body}`;
    expect(format(source).output).toBe(source);
  });

  it('leaves the frontmatter alone when it cannot move blocks safely, and says so', () => {
    for (const fm of ['source: x\n\netna: 1', 'source: x\netna: 1\n# trailing comment', '"yi\\u0065ld": 4\netna: 1']) {
      const source = `---\n${fm}\n---\n${body}`;
      const result = format(source);
      expect(result.output, fm).toBe(source);
      expect(result.notes.map((n) => n.message).join(), fm).toMatch(/frontmatter keys left in their order/);
    }
  });
});

describe('layout', () => {
  it('puts exactly one blank line between blocks and around headings', () => {
    const source = '---\netna: 1\nform: traditional\n---\n# Test\n## Ingredients\n**Dough**\n- 1 g salt\n\n\n\n**Glaze**\n\n- 2 g sugar\n## Directions\n1. Mix.\n\n\n## Notes\nKeeps.\n';
    expect(format(source).output).toBe(
      '---\netna: 1\nform: traditional\n---\n\n# Test\n\n## Ingredients\n\n### Dough\n\n- 1 g salt\n\n### Glaze\n\n- 2 g sugar\n\n## Directions\n\n1. Mix.\n\n## Notes\n\nKeeps.\n',
    );
  });

  it('uses `-` as the bullet marker', () => {
    expect(format(structured('* 1 g salt\n* 2 g sugar\n\nStir.')).output).toContain('- 1 g salt\n- 2 g sugar\n');
    expect(format(structured('+ 1 g salt\n+ 2 g sugar\n\nStir.')).output).toContain('- 1 g salt\n- 2 g sugar\n');
    const nested = format(traditional({ ingredients: '- salt', notes: '* one\n  * inner\n* two' })).output;
    expect(nested).toContain('- one\n  - inner\n- two\n');
  });

  it('removes blank lines between the items of a list', () => {
    const out = format(traditional({ ingredients: '- 1 g salt\n\n- 2 g sugar\n\n\n- 3 g yeast', directions: '1. One.\n\n2. Two.\n\n3. Three.' })).output;
    expect(out).toContain('- 1 g salt\n- 2 g sugar\n- 3 g yeast\n');
    expect(out).toContain('1. One.\n2. Two.\n3. Three.\n');
  });

  it('removes trailing white space, runs of blank lines and extra newlines at the end', () => {
    const source = '---\netna: 1\n---\n\n\n# Test   \n\n## Step\t\n\n- 1 g salt  \n \nStir. \nThen rest. \n\n\n\n';
    expect(format(source).output).toBe('---\netna: 1\n---\n\n# Test\n\n## Step\n\n- 1 g salt\n\nStir.\nThen rest.\n');
    expect(format('---\netna: 1\n---\n\n# Test\n\n## Step\n\nStir.').output).toBe('---\netna: 1\n---\n\n# Test\n\n## Step\n\nStir.\n');
  });

  it('turns CRLF line endings into LF', () => {
    expect(format('---\r\netna: 1\r\n---\r\n\r\n# Test\r\n\r\n## Step\r\n\r\nStir.\r\n').output).toBe('---\netna: 1\n---\n\n# Test\n\n## Step\n\nStir.\n');
  });

  it('does not re-wrap or join lines', () => {
    const source = structured('Stir the pot\nfor a while,\nthen stop\\\nand rest.');
    expect(format(source).output).toBe(source);
  });

  it('keeps trailing spaces that are a hard line break, and reports them', () => {
    const source = structured('Stir the pot.  \nThen rest.');
    const result = format(source);
    expect(result.output).toBe(source);
    expect(result.notes).toEqual([{ line: 9, message: 'trailing spaces kept: they are a hard line break' }]);
  });

  it('leaves fenced code, HTML and unrecognized blocks untouched', () => {
    const source = structured(
      'Stir.\n\n```\n* 2  cups   flour   \n\n\n350 °F\n```\n\n<!-- a  comment   -->\n\n| a | b |\n|---|---|\n| 1 tablespoons | 2  cups |\n\n1. an ordered list in a step at 350 °F\n\n![photo](step  1.jpg)',
    );
    expect(format(source).output).toBe(source);
  });

  it('keeps link reference definitions stacked', () => {
    const source = structured('See [a] and [b].\n\n[a]: https://example.org/a\n[b]: https://example.org/b');
    expect(format(source).output).toBe(source);
  });

  it('only adds or removes blank lines between blocks, never inside a list item', () => {
    const source = traditional({ ingredients: '- salt', directions: '1. First.\n   - nested\n   - bullets\n2. Second.\n\n   Still second.' });
    expect(format(source).output).toBe(source);
  });

  it('does not merge two neighboring bullet lists by unifying their markers', () => {
    const source = structured('* 1 g salt\n\n+ 2 g sugar\n\nStir.');
    const result = format(source);
    expect(result.output).toBe(source);
    expect(parse(result.output).nodes[0].blocks.filter((b) => b.kind === 'ingredients')).toHaveLength(2);
  });

  it('does not turn a bullet into a heading underline or a thematic break', () => {
    const source = traditional({ ingredients: '- salt', notes: 'Text\n\n* - -\n* b\n\nMore\n\n+\n+ b' });
    expect(format(source).output).toBe(source);
  });
});

describe('what the formatter refuses', () => {
  const unreadable: [string, string, RegExp][] = [
    ['malformed frontmatter', '---\netna: [1\n---\n\n# T\n\n## S\n\n* 1 grams salt  \n', /malformed frontmatter/],
    ['unclosed frontmatter', '---\netna: 1\n\n# T\n\n* 1 grams salt  \n', /malformed frontmatter/],
    ['no frontmatter', '# T\n\n## S\n\n* 1 grams salt  \n', /no frontmatter/],
    ['no etna key', '---\nform: traditional\n---\n\n# T\n\n* 1 grams salt  \n', /no integer `etna`/],
    ['a later format version', '---\netna: 2\n---\n\n# T\n\n* 1 grams salt  \n', /unsupported format version/],
    ['an unknown form', '---\netna: 1\nform: classic\n---\n\n# T\n\n* 1 grams salt  \n', /unknown form/],
  ];
  for (const [name, source, message] of unreadable) {
    it(`returns ${name} unchanged, with a note`, () => {
      const result = format(source);
      expect(result.output).toBe(source);
      expect(result.changed).toBe(false);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].message).toMatch(message);
      expect(result.notes[0].message).toMatch(/file left unchanged/);
    });
  }

  it('still formats a recipe the linter would reject for other reasons', () => {
    const result = format('---\netna: 1\n---\n\n## Step without a title\n\n* 2 grams salt\n');
    expect(result.output).toBe('---\netna: 1\n---\n\n## Step without a title\n\n- 2 g salt\n');
  });
});

describe('formatRecipe', () => {
  const messy =
    '---\nextra:\n  id: 7\nform: traditional\netna: 1\n---\n# Messy   \n## Ingredients\n**Dough**\n* 1½ Cups  flour ,sifted\n* 2 – 3 Cloves garlic\n\n* 1 to 2 tablespoons water, 110 ° F\n* salt\n\n\n## Directions\n1. __Mix__ - Heat to 350 degrees F.  \n\n2. **Bake**: at 180 ℃; turn 90 degrees; rest at 70 degrees.\n## Notes\n**Storage** -- keeps 3 days at 40 ° F.';

  it('reports whether anything changed', () => {
    const result = format(messy);
    expect(result.changed).toBe(true);
    expect(result.output).toBe(
      '---\netna: 1\nform: traditional\nextra:\n  id: 7\n---\n\n# Messy\n\n## Ingredients\n\n### Dough\n\n- 1 1/2 cups flour, sifted\n- 2-3 cloves garlic\n- 1-2 tbsp water, 110°F\n- salt\n\n## Directions\n\n1. **Mix** — Heat to 350°F.\n2. **Bake** — at 180°C; turn 90 degrees; rest at 70 degrees.\n\n## Notes\n\n**Storage** — keeps 3 days at 40°F.\n',
    );
    expect(result.notes).toEqual([{ line: 20, message: 'temperature undecided: 70 degrees: scale not stated, and the recipe uses both °F and °C' }]);
    const again = format(result.output);
    expect(again.changed).toBe(false);
    expect(again.output).toBe(result.output);
  });

  it('is idempotent, and reaches the canonical form in a single pass', () => {
    const once = format(messy).output;
    expect(format(once).output).toBe(once);
    expect(formatOnce(messy, units)).toBe(once);
  });

  it('preserves meaning', () => {
    const before = parse(messy);
    const after = parse(format(messy).output);
    expect(meaningDifferences(before, after)).toEqual([]);
    expect(proseDifferences(before, after)).toEqual([]);
  });
});

describe('traditional parts', () => {
  const parts = traditional({
    ingredients: '**Beans**\n\n- 100 g beans\n- salt\n\n**Sauce**\n\n- 10 g oil\n\n**Finish**\n\n- 100 g cream',
    directions:
      '1. **Beans** — Rinse and soak the beans.\n2. Drain and cook the beans.\n3. **Sauce** — While the beans cook, heat the oil.\n4. Blend.\n5. **Finish** — Combine at 350 degrees F.',
  });
  const migrated = traditional({
    ingredients: '### Beans\n\n- 100 g beans\n- salt\n\n### Sauce\n\n- 10 g oil\n\n### Finish\n\n- 100 g cream',
    directions:
      '### Beans\n\n1. Rinse and soak the beans.\n2. Drain and cook the beans.\n\n### Sauce\n\n1. While the beans cook, heat the oil.\n2. Blend.\n\n### Finish\n\n1. Combine at 350°F.',
  });

  it('writes bold-line groups and run-heading labels as part headings, numbering each part from 1', () => {
    const result = format(parts);
    expect(result.output).toBe(migrated);
    expect(result.notes).toEqual([]);
    expect(meaningDifferences(parse(parts), parse(result.output))).toEqual([]);
    expect(proseDifferences(parse(parts), parse(result.output))).toEqual([]);
  });

  it('changes nothing in a recipe already written with part headings, and is reached in one pass', () => {
    expect(format(migrated).output).toBe(migrated);
    expect(format(migrated).changed).toBe(false);
    expect(formatOnce(parts, units)).toBe(migrated);
  });

  it('always rewrites a bold-line group, also when the directions have no labels', () => {
    const source = traditional({ ingredients: '- 1 g salt\n\n**Glaze**\n\n- 2 g sugar', directions: '1. Mix.\n2. Glaze.' });
    expect(format(source).output).toBe(traditional({ ingredients: '- 1 g salt\n\n### Glaze\n\n- 2 g sugar', directions: '1. Mix.\n2. Glaze.' }));
  });

  it('keeps labels that each name one step and match no group as step names', () => {
    const source = traditional({ ingredients: '**Dough**\n\n- 1 g salt', directions: '1. **Mix** — Mix.\n2. **Bake** — Bake.' });
    expect(format(source).output).toBe(traditional({ ingredients: '### Dough\n\n- 1 g salt', directions: '1. **Mix** — Mix.\n2. **Bake** — Bake.' }));
  });

  it('makes every label a part when one is: by a group name, with one step each', () => {
    const source = traditional({ ingredients: '**Cake**\n\n- 1 g flour\n\n**Frosting**\n\n- 1 g sugar', directions: '1. **Cake** — Bake.\n2. **frosting** — Whip.' });
    expect(format(source).output).toBe(
      traditional({ ingredients: '### Cake\n\n- 1 g flour\n\n### Frosting\n\n- 1 g sugar', directions: '### Cake\n\n1. Bake.\n\n### frosting\n\n1. Whip.' }),
    );
  });

  it('leaves the steps before the first part label in an unnamed leading part', () => {
    const source = traditional({ ingredients: '- 1 g salt', directions: '1. Preheat.\n2. **Dough** — Mix.\n3. Knead.\n4. **Bake** — Bake.' });
    expect(format(source).output).toBe(
      traditional({ ingredients: '- 1 g salt', directions: '1. Preheat.\n\n### Dough\n\n1. Mix.\n2. Knead.\n\n### Bake\n\n1. Bake.' }),
    );
  });

  it('keeps step-name labels inside a recipe that already has part headings', () => {
    const source = traditional({ ingredients: '- 1 g salt', directions: '### Dough\n\n1. **Mix** — Mix.\n2. Knead.' });
    expect(format(source).output).toBe(source);
  });

  it('writes the numbers of a list as they render', () => {
    const source = traditional({ ingredients: '- 1 g salt', directions: '1. Mix.\n1. Knead.\n1. Bake.' });
    expect(format(source).output).toBe(traditional({ ingredients: '- 1 g salt', directions: '1. Mix.\n2. Knead.\n3. Bake.' }));
  });

  const undecided = (directions: string, ingredients = '- 1 g salt') => {
    const source = traditional({ ingredients, directions });
    const result = format(source);
    const sectionOf = (s: string) => s.slice(s.indexOf('## Directions'));
    expect(sectionOf(result.output)).toBe(sectionOf(source));
    return result.notes.filter((n) => n.message.startsWith('parts undecided')).map((n) => n.message);
  };

  it('leaves the directions alone and says why when it cannot be sure', () => {
    expect(undecided('1. **Dough** — Mix.\n2. Knead.\n3. **Dough** — Shape.')).toEqual([expect.stringContaining('"Dough" is used twice')]);
    expect(undecided('1. **…** — Mix.\n2. Knead.')).toEqual([expect.stringContaining('empty or only punctuation')]);
    expect(undecided('1. **Dough** — Mix.\n2. Knead.\n\nRest overnight.\n\n3. **Bake** — Bake.')).toEqual([expect.stringContaining('between or around the numbered steps')]);
    expect(undecided('1. **Dough** — Mix.\n   - by hand\n   - or by machine\n2. Knead.\n3. **Bake** — Bake.')).toEqual([expect.stringContaining('has nested content')]);
    expect(undecided('1. **Roast** — Roast.\n2. Combine.')).toEqual([expect.stringContaining('the only label, "Roast", is on the first step')]);
    expect(
      undecided('1. **Mix** — Mix.\n2. **Shape** — Shape.\n3. **Glaze** — Glaze.', '**Glaze**\n\n- 1 g sugar'),
    ).toEqual([expect.stringContaining('only 1 of 3 labels name an ingredient group')]);
    expect(undecided('1. **Dough *rich*** — Mix.\n2. Knead.\n3. **Bake** — Bake.')).toEqual([expect.stringContaining('carries formatting')]);
    expect(undecided('1. **Preheat** — oven to 410°F.\n2. **Dough** — Mix.\n3. Shape.')).toEqual([expect.stringContaining('"Preheat" reads as the start of its sentence')]);
    // Without its label the text would open a block of another kind inside the list item.
    for (const opening of ['# of beans matters.', '- Soak the beans.', '2. Soak the beans.', '> Soak the beans.', '+ Soak.', '<b>Soak</b> the beans.']) {
      expect(undecided(`1. **Beans** — ${opening}\n2. Drain.\n3. **Sauce** — Simmer.`)).toEqual([expect.stringContaining('would start with Markdown syntax')]);
    }
    // Numbering each part from 1 would change what "step 2" points at.
    expect(undecided('1. **Dough** — Mix.\n2. Knead.\n3. **Bake** — Shape the loaf.\n4. Repeat step 2, then bake.')).toEqual([
      expect.stringContaining('refers to a step by number ("step 2")'),
    ]);
  });

  it('refuses a rewrite that would change how the recipe reads', () => {
    // `### Bake #` would lose its `#` as a closing sequence.
    const notes = undecided('1. **Dough** — Mix.\n2. Knead.\n3. **Bake #** — Bake.');
    expect(notes).toEqual([expect.stringContaining('would have changed how the recipe reads')]);
  });

  it('never rewrites a structured recipe', () => {
    const source = structured('**Dough**\n\n- 1 g salt\n\nMix.');
    expect(format(source).output).toBe(source);
  });
});

describe('the Notes section of a structured recipe', () => {
  const SOURCE = '---\netna: 1\n---\n\n# Test\n\n## Bake\n\n- 1 g salt\n\nBake at 350 degrees F.\n\n## Notes\n\n**Storage**: keeps three days below 40 ° F.\n\n* Try 375 °F next time.\n\n\n### At 350 °F\n';

  it('formats it as it formats a traditional recipe\'s notes, and keeps it last', () => {
    const out = format(SOURCE).output;
    expect(out).toContain('## Notes\n\n**Storage** — keeps three days below 40°F.\n\n- Try 375°F next time.\n\n### At 350 °F\n');
    expect(out.trimEnd().endsWith('### At 350 °F')).toBe(true);
    expect(parse(out).notes?.items.map((n) => n.form)).toEqual(['paragraph', 'item']);
    expect(parse(out).nodes.map((n) => n.heading.text)).toEqual(['Bake']);
  });

  it('is idempotent', () => {
    const once = format(SOURCE).output;
    expect(format(once)).toMatchObject({ output: once, changed: false, notes: [] });
  });
});

describe('callout keywords that name an Object.prototype member', () => {
  it('format like any other keyword, and keep their meaning', () => {
    const source = '---\netna: 1\n---\n\n# Proto\n\n## Mix\n\n- 2 g salt\n\nStir.\n\n> **constructor** — hello\n\n> **__proto__** — there\n';
    const result = format(source);
    expect(result.output).toContain('**constructor**');
    expect(result.output).toContain('**__proto__**');
    expect(meaningDifferences(parse(source), parse(result.output))).toEqual([]);
  });
});
