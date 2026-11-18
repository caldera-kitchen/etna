// The Check tab's view of lint findings: what is a problem (counted on the tab's badge) and
// what is only a note (`info`: a hint for review, listed under its own heading, never counted).

import type { Finding } from '../lint/index.ts';

export interface CheckFindings {
  /** Errors and warnings, in the linter's order. */
  problems: Finding[];
  /** Info findings, in the linter's order. */
  notes: Finding[];
}

export function splitFindings(findings: readonly Finding[]): CheckFindings {
  return {
    problems: findings.filter((f) => f.severity !== 'info'),
    notes: findings.filter((f) => f.severity === 'info'),
  };
}

/** The Check tab's badge: errors when there are any, else warnings, else none. Info never counts. */
export function checkBadge(findings: readonly Finding[]): { kind: 'error' | 'warning'; count: number } | null {
  const errors = findings.filter((f) => f.severity === 'error').length;
  if (errors > 0) return { kind: 'error', count: errors };
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return warnings > 0 ? { kind: 'warning', count: warnings } : null;
}
