// The text of the paging script and its Content-Security-Policy hash.
//
// The script is built from the source of two functions (paging.ts and fit.ts), so the text — and
// so the hash — is whatever this build of the renderer runs; the page's policy is written from the
// same text in the same call, and cannot disagree with it.

import { decideFit } from './fit.ts';
import { pagingProgram } from './paging.ts';
import { sha256Base64 } from './sha256.ts';

let cached: { text: string; hash: string } | null = null;

/** Function source without comment-only lines, blank lines and indentation. Strings are untouched. */
function compact(source: string): string {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'))
    .join('\n');
}

/** The paging script's text, ready to go between <script> and </script>, and its `sha256-…` source. */
export function pagingScript(): { text: string; hash: string } {
  if (cached === null) {
    const text = `(${compact(pagingProgram.toString())})(${compact(decideFit.toString())});`;
    // Inside a <script> element the text must not close it; the program has no such text.
    if (/<\/script/i.test(text) || /<!--/.test(text)) throw new Error('paging script contains </script> or <!--');
    cached = { text, hash: `sha256-${sha256Base64(text)}` };
  }
  return cached;
}
