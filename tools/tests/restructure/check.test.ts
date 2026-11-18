import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';
import { checkRestructure, formatReport, sentences, withoutDivided, type CheckReport, type FindingKind } from '../../src/restructure/index.ts';
import { run } from '../../src/restructure/cli.ts';

const units = loadUnits();
const parse = (source: string) => parseRecipe(source, { units });
const check = (original: string, structured: string): CheckReport => checkRestructure(parse(original), parse(structured));
const kinds = (r: CheckReport, severity?: string): FindingKind[] => r.findings.filter((f) => !severity || f.severity === severity).map((f) => f.kind);
const lost = (r: CheckReport) => kinds(r, 'lost');

const ORIGINAL = `---
etna: 1
form: traditional
source: Grandma
extra:
  mg_recipe_id: 7
---

# Tomato Soup

## Ingredients

- 30 g butter
- 1 onion, diced
- 800 g tomatoes
- salt
- 120 g cream

## Directions

1. Melt the butter and soften the onion, about 5 minutes. Add the tomatoes and a pinch of salt.
2. Simmer 20 minutes. Blend until smooth. Stir in the cream and season with salt.

## Notes

Freezes well.
`;

const STRUCTURED = `---
etna: 1
source: Grandma
extra:
  mg_recipe_id: 7
---

# Tomato Soup

## Soften the onion

- 30 g butter
- 1 onion, diced

Melt the butter and soften the onion, about 5 minutes.

## Add the tomatoes

- 800 g tomatoes
- salt

Add the tomatoes and a pinch of salt.

## Simmer and blend

Simmer 20 minutes. Blend until smooth.

## Finish

- 120 g cream
- salt

Stir in the cream and season with salt.

## Notes

Freezes well.
`;

const edit = (s: string, from: string, to: string): string => {
  if (!s.includes(from)) throw new Error(`fixture has no ${from}`);
  return s.replace(from, to);
};

describe('a faithful conversion', () => {
  it('passes and lists what is new and what to review', () => {
    const r = check(ORIGINAL, STRUCTURED);
    expect(lost(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts.ingredients).toEqual({ original: 5, accounted: 5 });
    expect(r.counts.sentences).toEqual({ original: 5, kept: 5 });
    expect(r.counts.notes).toEqual({ original: 1, kept: 1 });
    const salt = r.findings.find((f) => f.kind === 'ingredient-multi-step');
    expect(salt?.message).toBe('"salt" is listed at two steps without an amount');
    expect(salt?.original).toEqual([16]);
    expect(salt?.structured).toEqual([20, 31]);
    expect(kinds(r, 'new').filter((k) => k === 'step-heading')).toHaveLength(4);
    const text = formatReport(r, { original: 'a.md', structured: 'b.md' });
    expect(text).toContain('Result: PASS');
    // Worded for whoever converted the recipe, a contributor as much as a collection's owner.
    expect(text).toContain(`Accepted changes (they pass; read each one before you share the recipe): ${r.counts.review}`);
    expect(text).not.toMatch(/\bowner\b/);
  });

  it('ignores form:, white space and temperature notation', () => {
    const o = edit(ORIGINAL, 'Simmer 20 minutes.', 'Simmer   20 minutes at 200 ° F.');
    const s = edit(STRUCTURED, 'Simmer 20 minutes.', 'Simmer 20 minutes\nat 200°F.');
    expect(lost(check(o, s))).toEqual([]);
  });

  it('takes adding or removing marks in an instruction as no difference (ADR 0021)', () => {
    const marked = edit(
      edit(STRUCTURED, 'Melt the butter and soften the onion, about 5 minutes.', 'Melt the butter and soften *the onion*, about *5 minutes*.'),
      'Simmer 20 minutes. Blend until smooth.',
      'Simmer _20 minutes_. Blend ***until smooth***.',
    );
    const plain = check(ORIGINAL, STRUCTURED);
    const r = check(ORIGINAL, marked);
    expect(lost(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual(plain.counts);
    expect(kinds(r)).toEqual(kinds(plain));
    // And the other way round: an original that was marked, a conversion that is not.
    const back = check(edit(ORIGINAL, 'Simmer 20 minutes.', 'Simmer *20 minutes*.'), STRUCTURED);
    expect(lost(back)).toEqual([]);
  });

  it('allows parts to be reordered against each other, not within themselves', () => {
    const o = `---\netna: 1\nform: traditional\n---\n\n# Two\n\n## Directions\n\n### Sauce\n\n1. Make the sauce. Cool it.\n\n### Pasta\n\n1. Boil the pasta.\n`;
    const ok = `---\netna: 1\n---\n\n# Two\n\n## Pasta\n\n### Boil\n\nBoil the pasta.\n\n## Sauce\n\n### Make\n\nMake the sauce. Cool it.\n`;
    expect(lost(check(o, ok))).toEqual([]);
    const bad = edit(ok, 'Make the sauce. Cool it.', 'Cool it. Make the sauce.');
    expect(lost(check(o, bad))).toEqual(['sentence-reordered']);
  });
});

describe('ingredient findings', () => {
  it('reports a missing line', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, '- 800 g tomatoes\n', ''));
    expect(lost(r)).toEqual(['ingredient-missing']);
    expect(r.findings[0].original).toEqual([15]);
    expect(r.ok).toBe(false);
  });

  it('reports an added line', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, '- 120 g cream\n', '- 120 g cream\n- 1 bay leaf\n'));
    expect(lost(r)).toEqual(['ingredient-added']);
    expect(r.findings[0].message).toContain('"1 bay leaf"');
  });

  it('reports a changed amount, unit or note', () => {
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '800 g tomatoes', '700 g tomatoes')))).toEqual(['ingredient-changed']);
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '1 onion, diced', '1 onion, sliced')))).toEqual(['ingredient-changed']);
    const r = check(ORIGINAL, edit(STRUCTURED, '- salt\n\nAdd', '- 1 pinch salt\n\nAdd'));
    expect(lost(r)).toEqual(['ingredient-added']);
    expect(r.findings[0].message).toBe('"1 pinch salt" is not in the original, which lists "salt" without an amount: an amount was added');
    const only = check(edit(ORIGINAL, '- 800 g tomatoes', '- tomatoes'), edit(STRUCTURED, '- 800 g tomatoes', '- 2 cans tomatoes'));
    expect(lost(only)).toEqual(['ingredient-changed']);
    expect(only.findings[0].message).toContain('an amount was added (2 cans)');
  });

  it('accepts a different spelling of the same amount and unit', () => {
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '- 30 g butter', '- 30 grams butter')))).toEqual([]);
  });

  it('reports a line with an amount listed twice', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, '- 800 g tomatoes\n', '- 800 g tomatoes\n- 30 g butter\n'));
    expect(lost(r)).toEqual(['ingredient-duplicated']);
  });

  it('reports a line without an amount listed twice under one step', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, '- 120 g cream\n- salt\n', '- 120 g cream\n- salt\n- salt\n'));
    expect(lost(r)).toEqual(['ingredient-duplicated']);
  });

  const DIVIDED = `---\netna: 1\nform: traditional\n---\n\n# Pie\n\n## Ingredients\n\n- 750 g blueberries, frozen, divided\n- 2 1/2 cups flour, divided\n\n## Directions\n\n1. Cook 300 g of the berries. Add the rest.\n`;
  const split = (a: string, b: string, c = '1 1/2 cups flour', d = '1 cup flour') =>
    `---\netna: 1\n---\n\n# Pie\n\n## Cook\n\n- ${a}\n- ${c}\n\nCook 300 g of the berries.\n\n## Add\n\n- ${b}\n- ${d}\n\nAdd the rest.\n`;

  it('accepts a split whose portions sum exactly, dropping "divided" from the note', () => {
    const r = check(DIVIDED, split('300 g blueberries, frozen', '450 g blueberries, frozen'));
    expect(lost(r)).toEqual([]);
    const msgs = r.findings.filter((f) => f.kind === 'ingredient-split').map((f) => f.message);
    expect(msgs).toEqual(['"750 g blueberries, frozen, divided" is split 300 g + 450 g = 750 g', '"2 1/2 cups flour, divided" is split 1 1/2 cups + 1 cup = 2 1/2 cups']);
  });

  it('reports a split that does not sum', () => {
    const r = check(DIVIDED, split('300 g blueberries, frozen', '400 g blueberries, frozen'));
    expect(lost(r)).toEqual(['split-sum']);
    expect(r.findings[0].message).toBe('"750 g blueberries, frozen, divided" is split into 300 g + 400 g = 700 g, not 750 g');
  });

  it('reports a split portion with a new note', () => {
    expect(lost(check(DIVIDED, split('300 g blueberries, frozen', '450 g blueberries, the rest')))).toEqual(['split-note']);
  });

  it('accepts a line kept with its amount at one step and listed without it at another', () => {
    const r = check(DIVIDED, split('750 g blueberries, frozen, divided', 'blueberries, frozen', '2 1/2 cups flour, divided', 'flour'));
    expect(lost(r)).toEqual([]);
    expect(kinds(r, 'review').filter((k) => k === 'ingredient-multi-step')).toHaveLength(2);
  });

  it('accepts a sub-recipe line turned into a link to that recipe', () => {
    const o = `---\netna: 1\nform: traditional\n---\n\n# Pie\n\n## Ingredients\n\n- 1 recipe Another Recipe\n\n## Directions\n\n1. Roll out the crust.\n`;
    const s = `---\netna: 1\n---\n\n# Pie\n\n## Roll\n\n- 1 recipe [another recipe](../another-recipe/)\n\nRoll out the crust.\n`;
    const r = check(o, s);
    expect(lost(r)).toEqual([]);
    expect(kinds(r, 'review')).toContain('ingredient-linked');
  });
});

describe('direction findings', () => {
  it('reports a missing sentence', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, 'Simmer 20 minutes. Blend', 'Blend'));
    expect(lost(r)).toEqual(['sentence-missing']);
    expect(r.findings[0].original).toEqual([22]);
  });

  it('reports an added sentence', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, 'Blend until smooth.', 'Blend until smooth. Taste it.'));
    expect(lost(r)).toEqual(['sentence-added']);
  });

  it('reports an altered sentence with a word diff', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, 'Blend until smooth.', 'Blend until very smooth.'));
    expect(lost(r)).toEqual(['sentence-altered']);
    expect(r.findings[0].message).toBe('sentence altered: Blend until {+very+} smooth.');
  });

  it('reports a sentence cut in two', () => {
    const s = edit(STRUCTURED, 'Melt the butter and soften the onion, about 5 minutes.', 'Melt the butter.\n\n## Soften\n\nSoften the onion, about 5 minutes.');
    expect(lost(check(ORIGINAL, s))).toContain('sentence-altered');
  });

  it('reports a reordered sentence', () => {
    const r = check(ORIGINAL, edit(STRUCTURED, 'Simmer 20 minutes. Blend until smooth.', 'Blend until smooth. Simmer 20 minutes.'));
    expect(lost(r)).toEqual(['sentence-reordered']);
  });

  it('accepts sentences moved into a callout, and lists the keyword as new', () => {
    const s = edit(STRUCTURED, 'Simmer 20 minutes. Blend until smooth.', 'Simmer 20 minutes.\n\n> **Checkpoint** — Blend until smooth.');
    const r = check(ORIGINAL, s);
    expect(lost(r)).toEqual([]);
    expect(kinds(r, 'new')).toContain('callout');
  });

  it('reports a callout with words of its own', () => {
    const s = edit(STRUCTURED, 'Blend until smooth.', 'Blend until smooth.\n\n> **Checkpoint** — Check the seasoning.');
    expect(lost(check(ORIGINAL, s))).toEqual(['sentence-added']);
  });

  it('keeps a step name as a heading, and reports one that is lost', () => {
    const o = edit(ORIGINAL, '2. Simmer 20 minutes.', '2. **Simmer** — Simmer 20 minutes.');
    const kept = check(o, edit(STRUCTURED, '## Simmer and blend', '## Simmer'));
    expect(lost(kept)).toEqual([]);
    expect(kinds(kept, 'review')).toContain('step-name-kept');
    expect(lost(check(o, STRUCTURED))).toEqual(['step-name-lost']);
  });

  it('treats a bullet between instructions as a sentence break', () => {
    expect(sentences('Mix 4 minutes • Rest 10 minutes. Add salt.')).toEqual(['Mix 4 minutes', 'Rest 10 minutes.', 'Add salt.']);
    expect(withoutDivided('softened, divided')).toBe('softened');
    expect(withoutDivided('divided')).toBeNull();
    expect(withoutDivided("divided — such as an 8oz can Hunt's Sauce")).toBe("— such as an 8oz can Hunt's Sauce");
    expect(withoutDivided('softened, divided — 20%')).toBe('softened — 20%');
  });
});

describe('title, frontmatter and notes', () => {
  it('reports a changed title', () => {
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '# Tomato Soup', '# Tomato soup')))).toEqual(['title-changed']);
  });

  it("accepts a twin's title: the structured title followed by exactly \" (Traditional Form)\"", () => {
    const twin = edit(ORIGINAL, '# Tomato Soup', '# Tomato Soup (Traditional Form)');
    expect(check(twin, STRUCTURED).findings.map((f) => f.kind)).not.toContain('title-changed');
    expect(lost(check(twin, STRUCTURED))).toEqual([]);
  });

  it('still reports a different suffix, a different case, or the suffix on the structured side', () => {
    for (const title of ['# Tomato Soup (Traditional)', '# Tomato Soup (traditional form)', '# Tomato Soup(Traditional Form)', '# Tomato Soup  (Traditional Form)']) {
      expect(lost(check(edit(ORIGINAL, '# Tomato Soup', title), STRUCTURED)), title).toEqual(['title-changed']);
    }
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '# Tomato Soup', '# Tomato Soup (Traditional Form)')))).toEqual(['title-changed']);
  });

  it('passes both twin pairs the cookbook ships', () => {
    for (const slug of ['potato-soup', 'italian-wedding-soup']) {
      const read = (s: string) => parse(readFileSync(join(ETNA_ROOT, 'cookbook', s, 'recipe.md'), 'utf8'));
      const r = checkRestructure(read(`${slug}-traditional-form`), read(slug));
      expect(lost(r), slug).toEqual([]);
    }
  });

  it('reports a removed, added or changed frontmatter key', () => {
    expect(lost(check(ORIGINAL, edit(STRUCTURED, 'source: Grandma\n', '')))).toEqual(['frontmatter-changed']);
    expect(lost(check(ORIGINAL, edit(STRUCTURED, 'source: Grandma\n', 'source: Grandma\nyield: 4\n')))).toEqual(['frontmatter-changed']);
    const r = check(ORIGINAL, edit(STRUCTURED, 'mg_recipe_id: 7', 'mg_recipe_id: 8'));
    expect(r.findings[0].message).toBe('frontmatter key "extra.mg_recipe_id" changed: 7 → 8');
  });

  it('reports a note missing, altered or added', () => {
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '\n## Notes\n\nFreezes well.\n', '')))).toEqual(['note-missing']);
    expect(lost(check(ORIGINAL, edit(STRUCTURED, 'Freezes well.', 'Freezes very well.')))).toEqual(['note-missing']);
    expect(lost(check(ORIGINAL, edit(STRUCTURED, 'Freezes well.', 'Freezes well.\n\nServes 4.')))).toEqual(['note-added']);
  });

  it('lists a paragraph note written as one list item, and the reverse, without failing', () => {
    let r = check(ORIGINAL, edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes well.\n'));
    expect(lost(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(kinds(r, 'review').filter((k) => k.startsWith('note'))).toEqual(['note-listed']);
    expect(r.findings.find((f) => f.kind === 'note-listed')!.message).toBe('paragraph written as a list item, word for word: "Freezes well."');
    expect(r.counts.notes).toEqual({ original: 1, kept: 1 });

    const listed = edit(ORIGINAL, '\nFreezes well.\n', '\n- Freezes well.\n');
    r = check(listed, STRUCTURED);
    expect(lost(r)).toEqual([]);
    expect(kinds(r, 'review').filter((k) => k.startsWith('note'))).toEqual(['note-listed']);
    expect(r.findings.find((f) => f.kind === 'note-listed')!.message).toBe('list item written as a paragraph, word for word: "Freezes well."');

    // An item on both sides is no change; an item with other words is still altered.
    expect(kinds(check(listed, edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes well.\n')), 'review')).not.toContain('note-listed');
    expect(lost(check(ORIGINAL, edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes very well.\n')))).toEqual(['note-missing']);
  });

  it('reads each item of a list of notes as a note of its own', () => {
    const original = edit(ORIGINAL, '\nFreezes well.\n', '\nFreezes well.\n\n**Storage** — keeps three days.\n');
    const r = check(original, edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes well.\n- **Storage** — keeps three days.\n'));
    expect(lost(r)).toEqual([]);
    expect(kinds(r, 'review').filter((k) => k.startsWith('note'))).toEqual(['note-listed', 'note-listed']);
    expect(r.counts.notes).toEqual({ original: 2, kept: 2 });
    // Two notes run together into one item are altered, not listed.
    expect(lost(check(original, edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes well. **Storage** — keeps three days.\n')))).not.toEqual([]);
  });

  it('reports a note placed anywhere but the Notes section', () => {
    const moved = edit(edit(STRUCTURED, '\n## Notes\n\nFreezes well.\n', ''), '# Tomato Soup\n', '# Tomato Soup\n\nFreezes well.\n');
    let r = check(ORIGINAL, moved);
    expect(lost(r)).toEqual(['note-misplaced']);
    expect(r.findings[0].message).toBe('note is before the first step, not in the Notes section: "Freezes well."');
    r = check(ORIGINAL, edit(edit(STRUCTURED, '\n## Notes\n\nFreezes well.\n', ''), 'season with salt.', 'season with salt. Freezes well.'));
    expect(kinds(r, 'lost')).toContain('note-misplaced');
    expect(r.findings.find((f) => f.kind === 'note-misplaced')!.message).toBe(
      'note is in the prose of the step "Finish" (a note may move to its step only as a callout, word for word), not in the Notes section: "Freezes well."',
    );
  });

  it('keeps the text before the first heading where it was', () => {
    const withIntro = edit(ORIGINAL, '# Tomato Soup\n', '# Tomato Soup\n\nA weeknight soup.\n');
    expect(lost(check(withIntro, edit(STRUCTURED, '# Tomato Soup\n', '# Tomato Soup\n\nA weeknight soup.\n')))).toEqual([]);
    expect(lost(check(withIntro, edit(STRUCTURED, 'Freezes well.', 'A weeknight soup.\n\nFreezes well.')))).toEqual(['note-misplaced']);
  });

  it('reports a conversion still marked traditional', () => {
    expect(lost(check(ORIGINAL, ORIGINAL))).toContain('not-structured');
  });
});

describe('the command\'s exit status', () => {
  const file = (slug: string) => join(ETNA_ROOT, 'cookbook', slug, 'recipe.md');

  it('is 0 on a pass and for help, 1 on a finding and 2 on a usage error', async () => {
    const log = console.log;
    const err = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      expect(await run(['check', file('potato-soup-traditional-form'), file('potato-soup')])).toBe(0);
      expect(await run(['check', file('potato-soup-traditional-form'), file('navy-bean-soup'), '--json'])).toBe(1);
      expect(await run(['check', file('potato-soup-traditional-form')])).toBe(2);
      expect(await run(['--help'])).toBe(0);
    } finally {
      console.log = log;
      console.error = err;
    }
  });
});

describe('inner numbers and Choose separators', () => {
  const head = '---\netna: 1\nform: traditional\n---\n\n# Bread\n\n## Ingredients\n\n- 1000 g flour\n- 880 g water\n\n## Directions\n\n';
  const sHead = '---\netna: 1\n---\n\n# Bread\n\n';

  it('lists a dropped leading "N)" of a direction, without failing', () => {
    const original = head + '1. 1) Mix the flour and water. Rest.\n2. 2) Bake.\n';
    const structured = sHead + '## Mix\n\n- 1000 g flour\n- 880 g water\n\nMix the flour and water. Rest.\n\n## Bake\n\nBake.\n';
    const r = check(original, structured);
    expect(r.ok).toBe(true);
    const dropped = r.findings.filter((f) => f.kind === 'inner-number-dropped');
    expect(dropped.map((f) => f.severity)).toEqual(['review', 'review']);
    expect(dropped[0].message).toMatch(/^inner number dropped: "1\)"/);
    expect(dropped[1].message).toMatch(/^inner number dropped: "2\)"/);
    expect(dropped[0].original).toEqual([15]);
  });

  it('says nothing about a direction without its own number', () => {
    const r = check(head + '1. Mix the flour and water. Rest.\n', sHead + '## Mix\n\n- 1000 g flour\n- 880 g water\n\nMix the flour and water. Rest.\n');
    expect(r.ok).toBe(true);
    expect(kinds(r)).not.toContain('inner-number-dropped');
  });

  const ALTERNATIVES =
    head +
    '1. Mix the flour and water.\n2. Shape a small loaf. Bake in a cold oven.\n3. - OR -\n4. Shape a large loaf. Bake in a pot.\n';
  const branchA = '### Small loaf\n\n#### Shape a small loaf\n\nShape a small loaf.\n\n#### Bake in a cold oven\n\nBake in a cold oven.\n\n';
  const branchB = '### Large loaf\n\n#### Shape a large loaf\n\nShape a large loaf.\n\n#### Bake in a pot\n\nBake in a pot.\n';
  const mix = '## Mix\n\n- 1000 g flour\n- 880 g water\n\nMix the flour and water.\n\n';

  it('accepts the separator between two alternatives moving into the Choose callout', () => {
    const r = check(ALTERNATIVES, sHead + mix + '## Bake\n\n> **Choose** — OR -\n\n' + branchA + branchB);
    expect(lost(r)).toEqual([]);
    expect(r.counts.sentences).toEqual({ original: 6, kept: 6 });
    const sep = r.findings.filter((f) => f.kind === 'choose-separator');
    expect(sep).toHaveLength(1);
    expect(sep[0].severity).toBe('review');
    expect(sep[0].original).toEqual([17]);
  });

  it('still fails a Choose callout whose sentence was not between the branches', () => {
    // The separator stands before the first alternative in this original: nothing to accept, but it is in order anyway.
    const before = head + '1. Mix the flour and water.\n2. - OR -\n3. Shape a small loaf. Bake in a cold oven.\n4. Shape a large loaf. Bake in a pot.\n';
    expect(check(before, sHead + mix + '## Bake\n\n> **Choose** — OR -\n\n' + branchA + branchB).ok).toBe(true);
    // The branches swapped: the separator would sit between them, but they are out of order.
    const swapped = check(ALTERNATIVES, sHead + mix + '## Bake\n\n> **Choose** — OR -\n\n' + branchB.replace(/\n$/, '\n\n') + branchA);
    expect(lost(swapped)).toContain('sentence-reordered');
    expect(kinds(swapped)).not.toContain('choose-separator');
  });

  it('does not accept a moved sentence that is not a Choose callout', () => {
    const r = check(ALTERNATIVES, sHead + mix + '## Bake\n\n> **Note** — OR -\n\n' + branchA + branchB);
    expect(lost(r)).toContain('sentence-reordered');
  });

  it('does not accept a separator moved into the Choose from anywhere but the branch boundary', () => {
    // A sentence of the first branch moved up into the callout.
    const r = check(ALTERNATIVES, sHead + mix + '## Bake\n\n> **Choose** — Shape a small loaf.\n\n' + branchA.replace('Shape a small loaf.\n\n#### Bake', 'OR -\n\n#### Bake') + branchB);
    expect(r.ok).toBe(false);
  });
});

describe("an amount on a link to the recipe's own component", () => {
  const original = '---\netna: 1\nform: traditional\n---\n\n# Pancakes\n\n## Ingredients\n\n### Dry Mix\n\n- 500 g flour\n- 20 g sugar\n\n### Pancakes\n\n- 133 g dry mix\n- 1 egg\n\n## Directions\n\n### Dry Mix\n\n1. Whisk the flour and sugar.\n\n### Pancakes\n\n1. Whisk the egg into the dry mix. Fry.\n';
  const structured = (line: string) =>
    `---\netna: 1\n---\n\n# Pancakes\n\n## Dry Mix\n\n### Whisk\n\n- 500 g flour\n- 20 g sugar\n\nWhisk the flour and sugar.\n\n## Pancakes\n\n### Mix and fry\n\n${line}\n- 1 egg\n\nWhisk the egg into the dry mix. Fry.\n`;

  it('accounts for the line it names, with the same amount and words, as "now a link"', () => {
    const r = check(original, structured('- 133 g [dry mix](#dry-mix)'));
    expect(r.ok).toBe(true);
    expect(r.counts.ingredients).toEqual({ original: 4, accounted: 4 });
    const linked = r.findings.filter((f) => f.kind === 'ingredient-linked');
    expect(linked).toHaveLength(1);
    expect(linked[0].severity).toBe('review');
    expect(linked[0].message).toContain("now a link to this recipe's own component");
  });

  it('fails when the amount differs, and still treats a link without amount as new', () => {
    expect(check(original, structured('- 130 g [dry mix](#dry-mix)')).ok).toBe(false);
    const both = check(original, structured('- 133 g dry mix\n- [dry mix](#dry-mix)'));
    expect(both.ok).toBe(true);
    expect(kinds(both, 'new')).toContain('link');
  });
});

describe('a number inside a direction', () => {
  const original = '---\netna: 1\nform: traditional\n---\n\n# Dough\n\n## Ingredients\n\n- 500 g flour\n\n## Directions\n\n1. Combine water and yeast in a bucket with lid. 2. Add flour and stir.\n';
  const s = (body: string) => `---\netna: 1\n---\n\n# Dough\n\n## Combine\n\nCombine water and yeast in a bucket with lid.\n\n## Add flour\n\n- 500 g flour\n\n${body}\n`;

  it('is kept, escaped where it begins a step', () => {
    expect(check(original, s('2\\. Add flour and stir.')).ok).toBe(true);
  });

  it('fails when dropped, and says how to keep it', () => {
    const r = check(original, s('Add flour and stir.'));
    expect(r.ok).toBe(false);
    expect(r.findings.find((f) => f.severity === 'lost')!.message).toMatch(/^inner number "2\." dropped from inside a direction: keep it; where it begins a step, escape it \(2\\\.\)/);
  });
});

describe('a bullet list under a direction', () => {
  // As in Easter Bread: the list is indented less than the direction's text, so Markdown ends
  // the numbered list there; its items still belong after direction 1.
  const original =
    '---\netna: 1\nform: traditional\n---\n\n# Bread\n\n## Ingredients\n\n- 500 g flour\n\n## Directions\n\n1. Add flour to mixer bowl.\n\n  - Spiral Mixer - Speed 2 for 4 minutes. Stop when it reaches 85°F, whichever comes first.\n  - KitchenAid - Mix on low for 5 minutes. Rest 30 minutes.\n\n2. Shape the dough into a ball.\n';
  const s = (mix: string, shape: string) =>
    `---\netna: 1\n---\n\n# Bread\n\n## Mix\n\n- 500 g flour\n\nAdd flour to mixer bowl.\n\n${mix}\n\n## Shape\n\n${shape}\n`;
  const spiral = 'Spiral Mixer - Speed 2 for 4 minutes. Stop when it reaches 85°F, whichever comes first.';
  const kitchenaid = 'KitchenAid - Mix on low for 5 minutes. Rest 30 minutes.';

  it('reads each item as its own sentences, so the items written as prose in order pass', () => {
    const r = check(original, s(`${spiral}\n\n${kitchenaid}`, 'Shape the dough into a ball.'));
    expect(lost(r)).toEqual([]);
    expect(r.counts.sentences).toEqual({ original: 6, kept: 6 });
    // one paragraph is as good as two
    expect(check(original, s(`${spiral} ${kitchenaid}`, 'Shape the dough into a ball.')).ok).toBe(true);
  });

  it('keeps the items in their place: after the direction they follow, before the next', () => {
    const r = check(original, s(kitchenaid, `Shape the dough into a ball.\n\n${spiral}`));
    expect(lost(r)).toContain('sentence-reordered');
  });

  it('never joins two items into one sentence', () => {
    const r = check(original, s(`${spiral}\n\n${kitchenaid}`, 'Shape the dough into a ball.'));
    expect(r.findings.some((f) => /first\.KitchenAid/.test(f.message))).toBe(false);
  });
});

describe('a bare name the original lists in two parts', () => {
  const original =
    '---\netna: 1\nform: traditional\n---\n\n# Cupcakes\n\n## Ingredients\n\n### Cupcakes\n\n- 120 g flour\n- 1 tsp Vanilla\n\n### Frosting\n\n- 120 g Powdered Sugar\n- 1/2 tsp Vanilla\n\n## Directions\n\n### Cupcakes\n\n1. Mix flour and vanilla. Bake.\n\n### Frosting\n\n1. Beat sugar and vanilla. Beat in more vanilla.\n';
  const structured = (frosting: string) =>
    `---\netna: 1\n---\n\n# Cupcakes\n\n## Cupcakes\n\n### Mix and bake\n\n- 120 g flour\n- 1 tsp Vanilla\n\nMix flour and vanilla. Bake.\n\n## Frosting\n\n${frosting}\n`;

  it('is paired with the line of its own part, not the first line of that name', () => {
    const r = check(original, structured('### Beat\n\n- 120 g Powdered Sugar\n- 1/2 tsp Vanilla\n\nBeat sugar and vanilla.\n\n### Beat in more\n\n- Vanilla\n\nBeat in more vanilla.'));
    expect(r.ok).toBe(true);
    const multi = r.findings.filter((f) => f.kind === 'ingredient-multi-step');
    expect(multi).toHaveLength(1);
    expect(multi[0].message).toMatch(/^"1\/2 tsp Vanilla" is listed with its amount at one step and without an amount at one more \("Vanilla" at line \d+ paired by its part, "Frosting"/);
    expect(multi[0].original).toEqual([18]);
  });

  it('in a flat conversion, is paired by position: the line listed nearest before it', () => {
    const flat =
      '---\netna: 1\n---\n\n# Cupcakes\n\n## Mix and bake\n\n- 120 g flour\n- 1 tsp Vanilla\n\nMix flour and vanilla. Bake.\n\n## Beat\n\n- 120 g Powdered Sugar\n- 1/2 tsp Vanilla\n\nBeat sugar and vanilla.\n\n## Beat in more\n\n- Vanilla\n\nBeat in more vanilla.\n';
    const r = check(original, flat);
    expect(r.ok).toBe(true);
    const multi = r.findings.find((f) => f.kind === 'ingredient-multi-step')!;
    expect(multi.original).toEqual([18]);
    expect(multi.message).toContain('paired by position');
  });

  it('reports for review what neither its part nor its place decides', () => {
    const flat =
      '---\netna: 1\n---\n\n# Cupcakes\n\n## Mix and bake\n\n- 120 g flour\n- 1 tsp Vanilla\n- 120 g Powdered Sugar\n- 1/2 tsp Vanilla\n\nMix flour and vanilla. Bake.\n\nBeat sugar and vanilla.\n\n## Beat in more\n\n- Vanilla\n\nBeat in more vanilla.\n';
    const r = check(original, flat);
    expect(r.ok).toBe(true);
    const amb = r.findings.filter((f) => f.kind === 'ingredient-ambiguous');
    expect(amb).toHaveLength(1);
    expect(amb[0].severity).toBe('review');
    expect(amb[0].original).toEqual([13, 18]);
  });
});

describe('a note moved to its step as a callout', () => {
  const TIP = 'Keep it below a boil once the cream is in.';
  const original = edit(ORIGINAL, '\nFreezes well.\n', `\n- Freezes well.\n- ${TIP}\n`);
  const kept = edit(STRUCTURED, '\nFreezes well.\n', '\n- Freezes well.\n');
  const withCallout = (s: string, callout: string) => edit(s, 'season with salt.\n', `season with salt.\n\n${callout}\n`);
  const moved = withCallout(kept, `> **Tip** — ${TIP}`);

  it('accepts a note that is now, word for word, a callout under its step and no longer in Notes', () => {
    const r = check(original, moved);
    expect(lost(r)).toEqual([]);
    expect(r.ok).toBe(true);
    const m = r.findings.filter((f) => f.kind === 'note-moved');
    expect(m).toHaveLength(1);
    expect(m[0].severity).toBe('review');
    expect(m[0].message).toBe(`note moved to its step, "Finish", as a "Tip" callout, word for word: "${TIP}"`);
    expect(m[0].original).toEqual([27]);
    expect(m[0].structured).toEqual([35]);
    expect(r.counts.notes).toEqual({ original: 2, kept: 2 });
    expect(r.counts.sentences).toEqual({ original: 5, kept: 5 });
    expect(r.findings.find((f) => f.kind === 'callout')!.message).toBe('callout keyword "Tip" (its text is checked with the notes)');
    expect(formatReport(r, { original: 'a.md', structured: 'b.md' })).toContain('note-moved: note moved to its step');
  });

  it('accepts any aside label, a paragraph note, Checkpoint; never Choose', () => {
    for (const label of ['Note', 'Make ahead', 'Checkpoint']) {
      const r = check(original, withCallout(kept, `> **${label}** — ${TIP}`));
      expect(r.ok).toBe(true);
      expect(r.findings.find((f) => f.kind === 'note-moved')!.message).toContain(`as a "${label}" callout`);
    }
    const paragraph = edit(ORIGINAL, '\nFreezes well.\n', `\nFreezes well.\n\n${TIP}\n`);
    expect(check(paragraph, withCallout(STRUCTURED, `> **Tip** — ${TIP}`)).ok).toBe(true);
    const choose = check(original, withCallout(kept, `> **Choose** — ${TIP}`));
    expect(choose.ok).toBe(false);
    expect(kinds(choose)).not.toContain('note-moved');
  });

  it('keeps the other notes checked in order', () => {
    const three = edit(original, `- ${TIP}\n`, `- ${TIP}\n- Serves 4.\n`);
    expect(check(three, edit(moved, '- Freezes well.\n', '- Freezes well.\n- Serves 4.\n')).ok).toBe(true);
    expect(lost(check(three, edit(moved, '- Freezes well.\n', '- Serves 4.\n- Freezes well.\n')))).toEqual(['note-reordered']);
  });

  it('fails a note that moved and changed a word', () => {
    const r = check(original, withCallout(kept, `> **Tip** — ${TIP.replace('boil', 'simmer')}`));
    expect(lost(r).sort()).toEqual(['note-missing', 'sentence-added']);
    expect(r.findings.find((f) => f.kind === 'note-missing')!.message).toBe(
      'note moved to a callout of the step "Finish" and altered: Keep it below a [-boil-] {+simmer+} once the cream is in.',
    );
    // A note cut in two, one half moved: not word for word either.
    const two = edit(ORIGINAL, '\nFreezes well.\n', `\n- Freezes well. ${TIP}\n`);
    expect(check(two, withCallout(STRUCTURED, `> **Tip** — ${TIP}`).replace('\nFreezes well.\n', '\n- Freezes well.\n')).ok).toBe(false);
    // A note's bold lead is part of its words: it does not become the callout's label.
    const lead = edit(ORIGINAL, '\nFreezes well.\n', `\n- Freezes well.\n- **Tip** — ${TIP}\n`);
    expect(check(lead, moved).ok).toBe(false);
  });

  it('fails a note that is both in Notes and in a callout, or in two callouts', () => {
    let r = check(original, withCallout(edit(STRUCTURED, '\nFreezes well.\n', `\n- Freezes well.\n- ${TIP}\n`), `> **Tip** — ${TIP}`));
    expect(lost(r)).toEqual(['note-repeated']);
    expect(r.findings[0].message).toBe(`note is in the Notes section and again in a "Tip" callout of the step "Finish": "${TIP}"`);
    r = check(original, edit(moved, 'Add the tomatoes and a pinch of salt.\n', `Add the tomatoes and a pinch of salt.\n\n> **Tip** — ${TIP}\n`));
    expect(lost(r)).toEqual(['note-repeated']);
    expect(r.findings[0].message).toBe(`note is in another callout and again in a "Tip" callout of the step "Finish": "${TIP}"`);
    expect(r.findings.filter((f) => f.kind === 'note-moved')).toHaveLength(1);
  });

  it('fails a callout whose text is in neither the directions nor the notes', () => {
    const r = check(original, withCallout(edit(STRUCTURED, '\nFreezes well.\n', `\n- Freezes well.\n- ${TIP}\n`), '> **Tip** — Use a heavy pot.'));
    expect(lost(r)).toEqual(['sentence-added']);
    expect(r.findings[0].message).toBe('callout sentence not in the original, under "Finish": "Use a heavy pot."');
  });

  it('fails a note moved into the prose of a step', () => {
    const r = check(original, edit(kept, 'season with salt.\n', `season with salt. ${TIP}\n`));
    expect(lost(r).sort()).toEqual(['note-misplaced', 'sentence-added']);
    expect(r.findings.find((f) => f.kind === 'note-misplaced')!.message).toBe(
      `note is in the prose of the step "Finish" (a note may move to its step only as a callout, word for word), not in the Notes section: "${TIP}"`,
    );
  });

  it('leaves to the directions a callout that is a direction sentence', () => {
    // The original says it twice, in the directions and in a note; the callout is the direction's.
    const twice = edit(original, 'season with salt.\n', `season with salt. ${TIP}\n`);
    const s = withCallout(edit(STRUCTURED, '\nFreezes well.\n', `\n- Freezes well.\n- ${TIP}\n`), `> **Checkpoint** — ${TIP}`);
    const r = check(twice, s);
    expect(r.ok).toBe(true);
    expect(kinds(r)).not.toContain('note-moved');
  });
});
