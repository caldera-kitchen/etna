// The Check tab: info findings are listed apart from problems and never counted on the badge.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import type { Finding } from '../../src/lint/index.ts';
import { lintRecipe } from '../../src/lint/index.ts';
import { loadUnits } from '../../src/node/files.ts';
import { checkBadge, splitFindings } from '../../src/web/findings.ts';

const at = (severity: Finding['severity'], rule: string, line: number): Finding => ({ rule, severity, message: rule, line, column: 1, at: null });

describe('Check tab findings', () => {
  const error = at('error', 'no-steps', 3);
  const warning = at('warning', 'missing-quantity', 5);
  const info = at('info', 'unpaired-part', 9);

  it('lists info findings apart from problems, each in the linter order', () => {
    expect(splitFindings([error, info, warning])).toEqual({ problems: [error, warning], notes: [info] });
  });

  it('badges errors first, then warnings, and never counts info', () => {
    expect(checkBadge([error, warning, info])).toEqual({ kind: 'error', count: 1 });
    expect(checkBadge([warning, info, info])).toEqual({ kind: 'warning', count: 1 });
    expect(checkBadge([info])).toBeNull();
    expect(checkBadge([])).toBeNull();
  });

  it('shows an unpaired part as a note with no badge', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../tests/linter/unpaired-part/input.md', import.meta.url)), 'utf8');
    const findings = lintRecipe(parseRecipe(source, { units: loadUnits() }));
    expect(splitFindings(findings).problems).toEqual([]);
    expect(splitFindings(findings).notes.map((f) => [f.rule, f.severity])).toEqual([['unpaired-part', 'info']]);
    expect(checkBadge(findings)).toBeNull();
  });
});
