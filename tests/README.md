# Etna test suite

Fixtures that pin the behavior of the linter. Each case is a directory:

```
linter/<case>/input.md       a recipe (or fragment)
linter/<case>/expected.yaml  the findings the linter should produce
```

Findings reference stable rule ids from [`../rules.yaml`](../rules.yaml).

`etna lint` lives in `../tools/src/lint/`, and `../tools/tests/lint/fixtures.test.ts` runs
every case in `linter/` (`cd ../tools && npx vitest run tests/lint`). There is a firing case
for every rule, plus clean recipes that must produce no findings. A case compares `rule`,
`severity` and `at` (the nearest enclosing heading, or `null`), in source order. A case whose
input is a small collection has an `input/` directory of recipe directories instead of
`input.md`, and each expected finding also names its `recipe` directory; that is how the
collection-level rules (`missing-recipe-file`, `invalid-slug`) and external references are
covered.
