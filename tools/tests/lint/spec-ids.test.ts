// SPEC.md §9 states every rule, each with its id; rules.yaml is the machine copy. The two
// must list the same ids, each under the right severity.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ETNA_ROOT, loadRules } from '../../src/node/files.ts';

const spec = readFileSync(join(ETNA_ROOT, 'SPEC.md'), 'utf8');
const section = spec.slice(spec.indexOf('\n## 9. '), spec.indexOf('\n## 10. '));
const catalog = loadRules();

/** A backticked rule id: lowercase words joined by hyphens. */
const ID = /`([a-z]+(?:-[a-z]+)+)`/g;
const idsIn = (text: string): string[] => [...text.matchAll(ID)].map((m) => m[1]);

/** The bullets of the list that follows a bold `**Label…**` line in §9, each joined onto one line. */
function bullets(label: string): string[] {
  const start = section.indexOf(`**${label}`);
  expect(start, `no "${label}" list in SPEC §9`).toBeGreaterThan(-1);
  const out: string[] = [];
  for (const line of section.slice(start).split('\n').slice(1)) {
    if (line.startsWith('- ')) out.push(line);
    else if (line.startsWith('  ') && out.length > 0) out[out.length - 1] += ' ' + line.trim();
    else if (line.trim() === '' && out.length === 0) continue;
    else break;
  }
  return out;
}

const lists = {
  error: bullets('Errors'),
  warning: bullets('Warnings'),
  info: bullets('Hints'),
};

describe('SPEC §9 vs rules.yaml', () => {
  it('lists the same ids', () => {
    expect(new Set(idsIn(section))).toEqual(new Set(catalog.map((r) => r.id)));
  });

  it('puts an id on every bullet', () => {
    for (const list of Object.values(lists)) {
      for (const bullet of list) expect(idsIn(bullet).length, bullet).toBeGreaterThan(0);
    }
  });

  it('lists each id under its severity', () => {
    for (const rule of catalog) {
      const where = rule.severity;
      const list = lists[where as keyof typeof lists];
      expect(list, `${rule.id}: no list for ${where}`).toBeDefined();
      expect(list.some((b) => idsIn(b).includes(rule.id)), `${rule.id} is not under ${where} in SPEC §9`).toBe(true);
    }
  });
});
