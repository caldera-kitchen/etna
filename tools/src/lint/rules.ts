// The linter's rule table: every rule id it can emit, with its severity.
//
// `rules.yaml` is the authority. This table is a copy the linter can use without touching the
// file system (it must run in a browser); `tests/lint/rules.test.ts` asserts the two agree.

/** `error` fails the file; `warning` passes and informs; `info` is a hint for review, never a problem. */
export type Severity = 'error' | 'warning' | 'info';

export const SEVERITY = {
  // Both forms.
  'missing-frontmatter-field': 'error',
  'unknown-form': 'error',
  'missing-title': 'error',
  'title-not-plain-text': 'warning',
  'ingredient-unparsed': 'warning',
  'missing-quantity': 'warning',
  'include-as-text': 'warning',
  'notes-misplaced': 'error',
  'picture-line': 'warning',
  'picture-unread': 'warning',

  // The picture's files (checked only when the caller passes the files in `image/`).
  'picture-file': 'warning',
  'picture-not-square': 'warning',
  'picture-size': 'warning',
  'picture-location': 'warning',
  'picture-not-in-etna': 'info',

  // Structured form.
  'no-steps': 'error',
  'step-missing-instruction': 'error',
  'component-has-content': 'error',
  'unresolved-reference': 'error',
  'ambiguous-reference': 'error',
  'choose-too-few-branches': 'error',
  'callout-near-miss': 'error',
  'duplicate-heading': 'warning',
  'quantity-on-group-reference': 'warning',
  'optional-near-miss': 'warning',
  'chart-box-long': 'warning',
  'stray-asterisk': 'warning',

  // Traditional form.
  'missing-sections': 'error',
  'no-ingredients': 'warning',
  'no-directions': 'warning',
  'unpaired-part': 'info',

  // Collection level (emitted by `lintPath`, not `lintRecipe`).
  'missing-recipe-file': 'error',
  'invalid-slug': 'warning',
} as const satisfies Record<string, Severity>;

export type RuleId = keyof typeof SEVERITY;
