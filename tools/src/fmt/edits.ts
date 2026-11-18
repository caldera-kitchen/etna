// Targeted text edits. The formatter never re-serializes a document: it collects small
// replacements at known source offsets and applies them, so everything else passes through
// byte for byte.

export interface Edit {
  /** 0-based offsets into the source; `end` is exclusive. */
  start: number;
  end: number;
  text: string;
}

/**
 * Apply edits to `source`. Edits that change nothing are ignored. When two edits overlap,
 * the one given first wins and the other is dropped — callers list the edits that must not
 * be lost first.
 */
export function applyEdits(source: string, edits: Edit[]): string {
  const kept: Edit[] = [];
  for (const e of edits) {
    if (e.start > e.end || e.start < 0 || e.end > source.length) continue;
    if (source.slice(e.start, e.end) === e.text) continue;
    if (kept.some((k) => overlaps(k, e))) continue;
    kept.push(e);
  }
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let at = 0;
  for (const e of kept) {
    out += source.slice(at, e.start) + e.text;
    at = e.end;
  }
  return out + source.slice(at);
}

function overlaps(a: Edit, b: Edit): boolean {
  // Two insertions at the same point, or an insertion strictly inside another edit, also clash.
  if (a.start === a.end && b.start === b.end) return a.start === b.start;
  return a.start < b.end && b.start < a.end;
}

/** 1-based line number of `offset` in `source`. */
export function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}
