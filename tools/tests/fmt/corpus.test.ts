// Properties that must hold for every recipe we have: the recipes that ship with Etna and, when
// it is checked out next to this repository (or named by ETNA_COLLECTION), the author's
// collection.
//
// Nothing here writes to disk: `formatRecipe` is pure, and the recipes are only read.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatOnce } from '../../src/fmt/pass.ts';
import { ETNA_ROOT, findRecipes } from '../../src/node/files.ts';
import { allCallouts, allLines, format, meaningDifferences, parse, proseDifferences, units, withoutScales } from './helpers.ts';

const COLLECTION = join(process.env.ETNA_COLLECTION ?? join(ETNA_ROOT, '..', 'recipe-collection'), 'recipes');

const corpora: { name: string; dir: string | null }[] = [
  { name: 'cookbook', dir: join(ETNA_ROOT, 'cookbook') },
  { name: 'collection', dir: existsSync(COLLECTION) ? COLLECTION : null },
];

interface Case {
  slug: string;
  source: string;
  output: string;
  notes: string[];
}

/** The whole collection is formatted several times over; give it room on a slow machine. */
const TIMEOUT = 120_000;

function load(dir: string): Case[] {
  return findRecipes(dir)
    .filter((r) => r.file !== null)
    .map((r) => {
      const source = readFileSync(r.file!, 'utf8');
      const result = format(source);
      return { slug: r.slug, source, output: result.output, notes: result.notes.map((n) => n.message) };
    });
}

for (const corpus of corpora) {
  describe.skipIf(corpus.dir === null)(`every recipe in ${corpus.name}`, () => {
    let cached: Case[] | null = null;
    const cases = () => (cached ??= load(corpus.dir!));

    it('is read (none refused)', () => {
      expect(cases().length).toBeGreaterThan(0);
      const refused = cases().filter((c) => c.notes.some((n) => n.includes('file left unchanged')));
      expect(refused.map((c) => c.slug)).toEqual([]);
      // Neither safety net (meaning, Markdown structure) had to step in.
      const guarded = cases().filter((c) => c.notes.some((n) => n.includes('left as written')));
      expect(guarded.map((c) => c.slug)).toEqual([]);
    }, TIMEOUT);

    it('formats idempotently', () => {
      const failures = cases().filter((c) => {
        const again = format(c.output);
        return again.output !== c.output || again.changed;
      });
      expect(failures.map((c) => c.slug)).toEqual([]);
    }, TIMEOUT);

    it('reaches its canonical form in one pass', () => {
      const failures = cases().filter((c) => formatOnce(c.source.replace(/\r\n?/g, '\n'), units) !== c.output);
      expect(failures.map((c) => c.slug)).toEqual([]);
    }, TIMEOUT);

    it('keeps its meaning: quantities, units, items, notes, and the count and order of everything', () => {
      const failures: string[] = [];
      let lines = 0;
      for (const c of cases()) {
        const before = parse(c.source);
        const after = parse(c.output);
        lines += allLines(before).length;
        for (const d of meaningDifferences(before, after)) failures.push(`${c.slug}: ${d}`);
        expect(allCallouts(after).length).toBe(allCallouts(before).length);
      }
      expect(failures).toEqual([]);
      expect(lines).toBeGreaterThan(0);
    }, TIMEOUT);

    it('keeps every instruction and direction word for word, apart from temperature notation', () => {
      const failures: string[] = [];
      for (const c of cases()) {
        for (const d of proseDifferences(parse(c.source), parse(c.output))) failures.push(`${c.slug}: ${d}`);
      }
      expect(failures).toEqual([]);
    }, TIMEOUT);

    it('writes parts as headings: no bold-line group is left, and undecided directions are kept as written', () => {
      const failures: string[] = [];
      for (const c of cases()) {
        const before = parse(c.source);
        const after = parse(c.output);
        if (!after.traditional) continue;
        const legacy = after.traditional.ingredients?.items.filter((g) => g.legacy) ?? [];
        if (legacy.length > 0 && !c.notes.some((n) => n.includes('ingredient group'))) failures.push(`${c.slug}: bold-line group left`);
        const directions = (r: typeof before) => JSON.stringify(r.traditional?.directions?.items.map((d) => [d.number, d.label, withoutScales(d.raw), d.more && withoutScales(d.more)]) ?? null);
        if (c.notes.some((n) => n.startsWith('parts undecided')) && directions(before) !== directions(after)) failures.push(`${c.slug}: undecided directions changed`);
        // Every direction part is numbered 1…n once it has a heading.
        for (const p of after.traditional.directions?.parts ?? []) {
          if (p.heading && p.steps.some((s, i) => s.number !== i + 1)) failures.push(`${c.slug}: part ${p.label} numbered from ${p.steps[0].number}`);
        }
      }
      expect(failures).toEqual([]);
    }, TIMEOUT);

    it('comes out in canonical layout', () => {
      const failures: string[] = [];
      for (const c of cases()) {
        if (!c.output.endsWith('\n') || c.output.endsWith('\n\n')) failures.push(`${c.slug}: end of file`);
        if (/\n\n\n/.test(c.output)) failures.push(`${c.slug}: run of blank lines`);
        if (/\r/.test(c.output)) failures.push(`${c.slug}: carriage return`);
        // The corpus has no code blocks and no hard line breaks, so these hold without exception.
        if (/[ \t]\n/.test(c.output)) failures.push(`${c.slug}: trailing white space`);
        if (/^[*+] /m.test(c.output)) failures.push(`${c.slug}: bullet marker`);
        if (/[^\n]\n#{1,6} |\n#{1,6} [^\n]*\n[^\n]/.test(c.output)) failures.push(`${c.slug}: heading without blank lines`);
      }
      expect(failures).toEqual([]);
    });
  });
}

describe('the recipes in the repository', () => {
  it('are already canonical', () => {
    const changed = findRecipes(join(ETNA_ROOT, 'cookbook'))
      .filter((r) => r.file !== null)
      .filter((r) => format(readFileSync(r.file!, 'utf8')).changed);
    expect(changed.map((r) => r.slug)).toEqual([]);
  });
});

// --------------------------------------------------------------------- mutation

// Real recipes, roughed up: whatever is thrown at the formatter, formatting twice must equal
// formatting once and the recipe must read the same afterward.
describe('roughed-up recipes', () => {
  let seed = 20261105;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];
  const sometimes = (p: number, to: string) => (m: string) => (random() < p ? to : m);

  const mutations: ((s: string) => string)[] = [
    (s) => s.replace(/\n/g, sometimes(0.08, '\n\n')),
    (s) => s.replace(/\n/g, sometimes(0.08, '  \n')),
    (s) => s.replace(/\n/g, sometimes(0.08, ' \n')),
    (s) => s.replace(/\n\n/g, sometimes(0.15, '\n')),
    (s) => s.replace(/^- /gm, (m) => (random() < 0.5 ? pick(['* ', '+ ', '-  ', '*   ']) : m)),
    (s) => s.replace(/ /g, sometimes(0.03, '  ')),
    (s) => s.replace(/°F/g, () => pick([' °F', '° F', ' ° F', '℉', ' ℉', ' degrees F', ' degrees Fahrenheit', 'ºF', '°f', ' degrees', '°'])),
    (s) => s.replace(/ — /g, () => pick([' - ', ': ', ' -- ', ' – ', '  —  '])),
    (s) => s.replace(/\*\*([^*\n]+)\*\*/g, (m, inner: string) => (random() < 0.3 ? `__${inner}__` : m)),
    (s) => s.replace(/, /g, () => pick([',', ' , ', ',  ', ', '])),
    (s) => s.replace(/(\d) 1\/2/g, (m, d: string) => (random() < 0.5 ? `${d}½` : m)).replace(/1\/2/g, () => pick(['½', '1/2'])),
    (s) => s.replace(/^- (\d+) /gm, (m, d: string) => (random() < 0.2 ? `- ${d} to ${Number(d) + 1} ` : m)),
    (s) => s.replace(/\n/g, '\r\n'),
    (s) => s.replace(/\n$/, pick(['', '\n\n\n', '  \n'])),
    (s) => s.replace(/^(\d+)\. /gm, (m, d: string) => (random() < 0.3 ? `${d}.  ` : m)),
    (s) => {
      const lines = s.split('\n');
      const at = 8 + Math.floor(random() * Math.max(1, lines.length - 8));
      lines.splice(at, 0, pick(['> **Note** - x 350 °F', '<!-- c -->', '* * *', '- ', '    indented   ', '1. one', '* a\n* b', '## H  ', 'text  ', '```\n*  x   \n```']));
      return lines.join('\n');
    },
  ];

  const sources = corpora.flatMap((c) => (c.dir === null ? [] : findRecipes(c.dir).filter((r) => r.file !== null))).filter((_r, i) => i % 7 === 0);

  it.skipIf(sources.length === 0)('format idempotently and keep their meaning', () => {
    const texts = sources.map((r) => readFileSync(r.file!, 'utf8'));
    const failures: string[] = [];
    for (let i = 0; i < 400; i++) {
      let source = pick(texts);
      for (let k = 1 + Math.floor(random() * 4); k > 0; k--) source = pick(mutations)(source);
      const result = format(source);
      if (result.notes.some((n) => n.message.includes('file left unchanged'))) continue;
      const where = `mutant ${i}`;
      if (format(result.output).output !== result.output) failures.push(`${where}: not idempotent`);
      const before = parse(source.replace(/\r\n?/g, '\n'));
      const after = parse(result.output);
      for (const d of [...meaningDifferences(before, after), ...proseDifferences(before, after)]) failures.push(`${where}: ${d}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  }, TIMEOUT);
});
