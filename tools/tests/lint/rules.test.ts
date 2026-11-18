// rules.yaml is the authority for rule ids and severities; the linter's table must match it.

import { describe, expect, it } from 'vitest';

import { SEVERITY } from '../../src/lint/index.ts';
import { loadRules } from '../../src/node/files.ts';

const catalog = loadRules();

describe('severity table vs rules.yaml', () => {
  it('gives every rule the catalog severity', () => {
    for (const [id, severity] of Object.entries(SEVERITY)) {
      const rule = catalog.find((r) => r.id === id);
      expect(rule, `${id} is not in rules.yaml`).toBeDefined();
      expect(severity, id).toBe(rule!.severity);
    }
  });

  it('covers every rule in the catalog', () => {
    const implemented = new Set(Object.keys(SEVERITY));
    expect(catalog.map((r) => r.id).filter((id) => !implemented.has(id))).toEqual([]);
  });

  it('uses only error, warning and info', () => {
    for (const r of catalog) expect(['error', 'warning', 'info'], r.id).toContain(r.severity);
  });

  it('keeps unpaired-part informational: a hint, never a problem', () => {
    expect(SEVERITY['unpaired-part']).toBe('info');
  });
});
