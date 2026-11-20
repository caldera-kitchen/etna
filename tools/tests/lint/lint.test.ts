import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { run } from '../../src/lint/cli.ts';
import { hasErrors, lintRecipe, type Finding, type LintOptions } from '../../src/lint/index.ts';
import { formatResults, lintPath, summarize, unitCandidates } from '../../src/lint/node.ts';
import { ETNA_ROOT, loadUnits } from '../../src/node/files.ts';

const units = loadUnits();
const lint = (source: string, options?: LintOptions) => lintRecipe(parseRecipe(source, { units }), options);
const rules = (findings: Finding[]) => findings.map((f) => f.rule);
const FIXTURES = join(ETNA_ROOT, 'tests', 'linter');

const HEAD = '---\netna: 1\n---\n\n';

describe('lintRecipe', () => {
  it('reports the line and column of what it found, and the enclosing heading', () => {
    const findings = lint(`${HEAD}# Test\n\n## Blend\n\n- 100 g milk\n- salt\n\nBlend.\n\n## Rest\n`);
    expect(findings).toEqual([
      { rule: 'missing-quantity', severity: 'warning', message: 'The ingredient "salt" has no quantity; add one, or say its use after an em dash (\u2014 to taste, \u2014 for dusting).', line: 10, column: 1, at: 'Blend' },
      { rule: 'step-missing-instruction', severity: 'error', message: 'The step "Rest" has no instruction.', line: 14, column: 1, at: 'Rest' },
    ]);
  });

  it('is silent on a quantity-less ingredient whose remark says its use (SPEC §6)', () => {
    const findings = lint(`${HEAD}# Test\n\n## Blend\n\n- 100 g milk\n- salt \u2014 to taste\n- flour \u2014 for dusting\n\nBlend.\n`);
    expect(findings.filter((f) => f.rule === 'missing-quantity')).toEqual([]);
  });

  it('sorts findings by line, then column', () => {
    const findings = lint(`---\nform: odd\n---\n\n# *Test*\n\n## A\n\n- salt\n- 2 cups\n\n## A\n\nStir.\n`);
    const lines = findings.map((f) => f.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(rules(findings)).toEqual(['missing-frontmatter-field', 'unknown-form', 'title-not-plain-text']);
  });

  it('hasErrors is true only when a finding is an error', () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors(lint(`${HEAD}# Test\n\n## Boil\n\n- salt\n\nBoil.\n`))).toBe(false);
    expect(hasErrors(lint(`${HEAD}# Test\n\n## Boil\n\n- salt\n`))).toBe(true);
  });

  it('treats an empty or null form as absent, and is strict about its spelling', () => {
    expect(lint(`---\netna: 1\nform:\n---\n\n# Test\n\n## Stir\n\nStir.\n`)).toEqual([]);
    expect(rules(lint(`---\netna: 1\nform: Traditional\n---\n\n# Test\n\n## Ingredients\n\n- 1 g salt\n`))).toEqual(['unknown-form']);
  });

  it('reports an unclosed frontmatter block as malformed', () => {
    const findings = lint(`---\netna: 1\n\n# Test\n\n## Stir\n\nStir.\n`);
    expect(rules(findings)).toContain('missing-frontmatter-field');
    expect(findings[0].message).toMatch(/malformed/);
  });

  it('accepts only an integer etna', () => {
    for (const value of ['1.5', '"1"', 'true', '[1]']) {
      expect(rules(lint(`---\netna: ${value}\n---\n\n# Test\n\n## Stir\n\nStir.\n`)), value).toEqual(['missing-frontmatter-field']);
    }
    expect(lint(`---\netna: 2\n---\n\n# Test\n\n## Stir\n\nStir.\n`)).toEqual([]);
  });

  it('finds a second H1 in a traditional recipe too', () => {
    const findings = lint(`---\netna: 1\nform: traditional\n---\n\n# Test\n\n## Ingredients\n\n- 1 g salt\n\n# Again\n\n## Directions\n\n1. Stir.\n`);
    expect(findings.map((f) => [f.rule, f.line, f.at])).toEqual([['missing-title', 12, 'Ingredients']]);
  });

  it('does not lint ingredient bullets that are reference links', () => {
    expect(lint(`${HEAD}# Test\n\n## Base\n\n- 1 g salt\n\nStir.\n\n## Finish\n\n- [base](#base)\n\nServe.\n`)).toEqual([]);
  });

  it('an ordered list is not instruction prose', () => {
    expect(rules(lint(`${HEAD}# Test\n\n## Cook\n\n1. Stir.\n2. Serve.\n`))).toEqual(['step-missing-instruction']);
  });

  it('flags a Choose callout above the first heading', () => {
    const findings = lint(`${HEAD}# Test\n\n> **Choose** — one.\n\n## A\n\nStir.\n\n## B\n\nServe.\n`);
    expect(findings.map((f) => [f.rule, f.at])).toEqual([['choose-too-few-branches', null]]);
  });

  it('accepts a Choose component whose branches are subtrees', () => {
    const source = `${HEAD}# Test\n\n## Method\n\n> **Choose** — one.\n\n### Oven\n\n#### Heat\n\nHeat.\n\n#### Bake\n\nBake.\n\n### Pan\n\nFry.\n`;
    expect(lint(source)).toEqual([]);
  });

  it('says nothing about the same ingredient line in each branch of a Choose (SPEC §5.2)', () => {
    const source = `${HEAD}# Test\n\n## Method\n\n> **Choose** — one.\n\n### Oven\n\n- 1 cup item\n- 200 g flour\n\nBake.\n\n### Pan\n\n- 1 cup item\n- 200 g flour\n\nFry.\n`;
    expect(lint(source)).toEqual([]);
  });

  it('is quiet about any callout label but one that looks like a mistake for a keyword (SPEC §5.1)', () => {
    const callout = (k: string) => lint(`${HEAD}# Test\n\n## Cook\n\nStir.\n\n> **${k}** — text.\n`);
    for (const k of ['Note', 'Tip', 'Warning', 'Make ahead', 'Variation', 'Substitute']) expect(callout(k), k).toEqual([]);
    // `Optional` is an aside like any other: the heading qualifier is what designates, and the linter keeps no list of words.
    expect(callout('Optional')).toEqual([]);
    expect(callout('Chose').map((f) => [f.rule, f.severity, f.message])).toEqual([
      ['callout-near-miss', 'error', 'The callout label "Chose" looks like a mistake for the keyword "Choose". Write "Choose" if that is meant; for an aside, use another word.'],
    ]);
    expect(callout('checkpoint').map((f) => f.rule)).toEqual(['callout-near-miss']);
  });

  it('does not crash on an anchor with a malformed percent escape, and still checks the others', () => {
    const findings = lint(`${HEAD}# Test\n\n## Base\n\nStir.\n\n## Finish\n\n- [base](#50%)\n- [base](#base)\n- [gone](#gone)\n\nServe.\n`);
    expect(findings.map((f) => [f.rule, f.line])).toEqual([
      ['unresolved-reference', 13],
      ['unresolved-reference', 15],
    ]);
    expect(findings[0].message).toMatch(/malformed anchor/);
  });

  it('explains a reference that lands on the title instead of a heading of the same text', () => {
    const findings = lint(`${HEAD}# Test Pesto\n\n## Test Pesto\n\nBlend.\n\n## Finish\n\n- [pesto](#test-pesto)\n\nServe.\n`);
    expect(rules(findings)).toEqual(['unresolved-reference']);
    expect(findings[0].message).toMatch(/repeats the title, so its anchor is #test-pesto-1/);
  });

  it('reports an empty bullet as unparsed', () => {
    const findings = lint(`${HEAD}# Test\n\n## Mix\n\n-\n- 1 g salt\n\nMix.\n`);
    expect(findings.map((f) => [f.rule, f.message])).toEqual([['ingredient-unparsed', 'An ingredient bullet is empty.']]);
  });
});

describe('traditional parts', () => {
  const lint = (ingredients: string, directions: string) =>
    lintRecipe(parseRecipe(`---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n${ingredients}\n\n## Directions\n\n${directions}\n`, { units })).map((f) => [f.rule, f.at]);

  it('reads both spellings without findings', () => {
    expect(lint('**Beans**\n\n- 1 g beans', '1. **Beans** — Soak.\n2. Cook.')).toEqual([]);
    expect(lint('### Beans\n\n- 1 g beans', '### Beans\n\n1. Soak.\n2. Cook.')).toEqual([]);
  });

  it('does not warn when only the ingredients have parts', () => {
    expect(lint('### Beans\n\n- 1 g beans\n\n### Sauces\n\n- 1 g oil', '1. **Sauce** — Fry.\n2. Cook.')).toEqual([]);
  });

  it('warns on a near-miss name, and not on a part that has nothing in the other section', () => {
    expect(lint('### Beans\n\n- 1 g beans\n\n### Sauces\n\n- 1 g oil', '### Beans\n\n1. Soak.\n\n### Sauce\n\n1. Fry.\n\n### Assembly\n\n1. Combine.')).toEqual([
      ['unpaired-part', 'Sauce'],
    ]);
    expect(lint('### Topping\n\n- 1 g sugar', '### Bake\n\n1. Bake.')).toEqual([]);
  });

  it('reports a near miss as a hint, and pairs a heading with a qualifier after an em dash', () => {
    const r = lintRecipe(parseRecipe(`---\netna: 1\nform: traditional\n---\n\n# T\n\n## Ingredients\n\n### Sauces\n\n- 1 g oil\n\n## Directions\n\n### Sauce\n\n1. Fry.\n`, { units }));
    expect(r.map((f) => [f.rule, f.severity])).toEqual([['unpaired-part', 'info']]);
    expect(lint('### Mix-ins — for 1024 g of mashed potato\n\n- 1 g butter', '### Mix-ins\n\n1. Fold in.')).toEqual([]);
  });
});

describe('external references', () => {
  const source = `${HEAD}# Test\n\n## Mix\n\n- [stock](../test-stock/)\n- 80 g [chutney](../test-chutney/)\n- 5 g [salt](https://example.com/salt)\n\nMix.\n`;

  it('are not checked without a resolver', () => {
    expect(lint(source)).toEqual([]);
  });

  it('are checked with one; web links are not recipe references', () => {
    const asked: string[] = [];
    const findings = lint(source, {
      resolveExternal: (target) => {
        asked.push(target);
        return target === '../test-stock/';
      },
    });
    expect(asked).toEqual(['../test-stock/', '../test-chutney/']);
    expect(findings.map((f) => [f.rule, f.severity, f.line, f.at])).toEqual([['unresolved-reference', 'error', 10, 'Mix']]);
  });

  it('must be a sibling recipe directory on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'etna-lint-'));
    try {
      const recipe = (refs: string) => `${HEAD}# Test\n\n## Mix\n\n${refs}\n\nMix.\n`;
      mkdirSync(join(dir, 'recipes', 'test-a'), { recursive: true });
      mkdirSync(join(dir, 'recipes', 'test-b'), { recursive: true });
      mkdirSync(join(dir, 'archive', 'test-old'), { recursive: true });
      writeFileSync(join(dir, 'recipes', 'test-a', 'recipe.md'), recipe('- 1 g salt'));
      writeFileSync(join(dir, 'archive', 'test-old', 'recipe.md'), recipe('- 1 g salt'));
      writeFileSync(
        join(dir, 'recipes', 'test-b', 'recipe.md'),
        recipe('- [a](../test-a/)\n- [a](../test-a)\n- [old](../../archive/test-old/)\n- [file](../test-a/recipe.md)\n- [none](../test-none/)'),
      );
      const results = lintPath(dir);
      expect(results.map((r) => r.slug)).toEqual(['test-a', 'test-b']); // archive/ is not scanned
      expect(results[0].findings).toEqual([]);
      expect(results[1].findings.map((f) => [f.rule, f.line])).toEqual([
        ['unresolved-reference', 11],
        ['unresolved-reference', 12],
        ['unresolved-reference', 13],
      ]);
      // Linting one file resolves against its own siblings as well.
      expect(lintPath(join(dir, 'recipes', 'test-b', 'recipe.md'))[0].findings).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('unitCandidates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'etna-units-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('counts the first word of unit-less items across a collection', () => {
    const write = (slug: string, body: string) => {
      mkdirSync(join(dir, slug), { recursive: true });
      writeFileSync(join(dir, slug, 'recipe.md'), body);
    };
    write('test-a', `---\netna: 1\nform: traditional\n---\n\n# A\n\n## Ingredients\n\n- 2 Heaping spoons flour\n- 3 eggs\n- 1 heaping spoon sugar\n- 200 g butter\n- salt\n\n## Directions\n\n1. Mix.\n`);
    write('test-b', `${HEAD}# B\n\n## Mix\n\n- 1 heaping spoon cocoa\n- 2 eggs, beaten\n- 1 (14-oz) tin tomatoes\n- [a](../test-a/)\n\nMix.\n`);
    mkdirSync(join(dir, 'test-empty'));

    const all = unitCandidates(dir);
    expect(all.map((c) => [c.word, c.count])).toEqual([
      ['heaping', 3],
      ['eggs', 2],
      ['14-oz', 1],
    ]);
    expect(all[0].examples).toEqual(['2 Heaping spoons flour', '1 heaping spoon sugar', '1 heaping spoon cocoa']);
    expect(unitCandidates(dir, 1).map((c) => c.word)).toEqual(['heaping']);
  });
});

describe('formatResults', () => {
  const results = lintPath(join(FIXTURES, 'collection-missing-recipe-file', 'input')).concat(
    lintPath(join(FIXTURES, 'collection-invalid-slug', 'input')),
  );

  it('summarizes', () => {
    expect(summarize(results)).toEqual({ recipes: 4, errors: 1, warnings: 1, notes: 0, failed: 1 });
  });

  it('prints one line per finding and a summary line', () => {
    const lines = formatResults(results, 'text').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('test-leftovers/  error  missing-recipe-file  The recipe directory "test-leftovers" contains no recipe.md.');
    expect(lines[1]).toMatch(/Test-Cookies\/recipe\.md:1:1  warning  invalid-slug  The directory name "Test-Cookies" is not a valid slug/);
    expect(lines[2]).toBe('4 recipes checked: 1 error, 1 warning.');
  });

  it('quiet lists errors only but still counts warnings', () => {
    const lines = formatResults(results, 'text', { quiet: true }).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('4 recipes checked: 1 error, 1 warning (warnings not shown).');
  });

  it('emits JSON with the same findings', () => {
    const data = JSON.parse(formatResults(results, 'json'));
    expect(data.summary).toEqual({ recipes: 4, errors: 1, warnings: 1, notes: 0, failed: 1 });
    expect(data.files.map((f: { slug: string }) => f.slug)).toEqual(['test-leftovers', 'Test-Cookies']);
    expect(data.files[0].file).toBeNull();
    expect(data.files[0].findings[0]).toEqual({
      rule: 'missing-recipe-file',
      severity: 'error',
      message: 'The recipe directory "test-leftovers" contains no recipe.md.',
      line: 1,
      column: 1,
      at: null,
    });
    const quiet = JSON.parse(formatResults(results, 'json', { quiet: true }));
    expect(quiet.files.map((f: { slug: string }) => f.slug)).toEqual(['test-leftovers']);
  });
});

describe('etna lint', () => {
  afterEach(() => vi.restoreAllMocks());

  const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => void out.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...args) => void err.push(args.join(' ')));
    return { out, err };
  };

  it('exits 1 when there is an error, 0 when there are only warnings', async () => {
    const io = capture();
    expect(await run([join(FIXTURES, 'collection-missing-recipe-file', 'input')])).toBe(1);
    expect(io.out.join('\n')).toMatch(/missing-recipe-file/);
    expect(await run([join(FIXTURES, 'collection-invalid-slug', 'input')])).toBe(0);
    expect(io.out.join('\n')).toMatch(/2 recipes checked: 0 errors, 1 warning\./);
  });

  it('takes a single file and several paths', async () => {
    const io = capture();
    expect(await run([join(FIXTURES, 'step-missing-instruction', 'input.md'), join(FIXTURES, 'clean-flat', 'input.md')])).toBe(1);
    const lines = io.out.join('\n').split('\n');
    expect(lines.filter((l) => l.includes('  error  step-missing-instruction  '))).toHaveLength(3);
    expect(lines[0]).toMatch(/input\.md:7:1  error  step-missing-instruction  The step "Blend the base" has ingredients but no instruction\.$/);
    expect(lines.at(-1)).toBe('2 recipes checked: 3 errors, 0 warnings.');
  });

  it('reports an info-level hint as one note: no warning, exit 0', async () => {
    const io = capture();
    expect(await run([join(FIXTURES, 'unpaired-part', 'input.md')])).toBe(0);
    const lines = io.out.join('\n').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/input\.md:27:1  info  unpaired-part  /);
    expect(lines[1]).toBe('1 recipe checked: 0 errors, 0 warnings, 1 note.');
  });

  it('--quiet counts notes but does not list them', async () => {
    const io = capture();
    expect(await run(['--quiet', join(FIXTURES, 'unpaired-part', 'input.md')])).toBe(0);
    expect(io.out.join('\n')).toBe('1 recipe checked: 0 errors, 0 warnings, 1 note (notes not shown).');
  });

  it('--quiet hides warnings, --json prints JSON', async () => {
    const io = capture();
    expect(await run(['--quiet', '--json', join(FIXTURES, 'collection-invalid-slug', 'input')])).toBe(0);
    const data = JSON.parse(io.out.join('\n'));
    expect(data.files).toEqual([]);
    expect(data.summary.warnings).toBe(1);
  });

  it('--unit-candidates prints the report instead of linting', async () => {
    const io = capture();
    expect(await run(['--unit-candidates', '--json', join(FIXTURES, 'clean-components', 'input.md')])).toBe(0);
    expect(JSON.parse(io.out.join('\n'))).toEqual([{ word: 'scallions', count: 1, examples: ['2 scallions, sliced'] }]);
  });

  it('prints help, and rejects bad usage with exit code 2', async () => {
    const io = capture();
    expect(await run(['--help'])).toBe(0);
    expect(io.out.join('\n')).toMatch(/Usage: etna lint/);
    expect(await run([])).toBe(2);
    expect(await run(['--nope', '.'])).toBe(2);
    expect(await run([join(FIXTURES, 'no-such-case')])).toBe(2);
    expect(io.err.join('\n')).toMatch(/no such file or directory/);
  });
});
