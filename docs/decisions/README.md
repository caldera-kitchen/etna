# Decision records

Short Architecture Decision Records (ADRs) capturing *why* Etna is the way it is — so
settled debates don't get relitigated. Each record states the question, the decision, the
reasoning, and the alternative we rejected.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-ingredients-enter-at-their-step.md) | Ingredients are introduced at the step where they enter | Accepted |
| [0002](0002-markdown-canonical-yaml-derived.md) | Markdown is canonical; the typed YAML is derived | Accepted |
| [0003](0003-leaf-vs-parent-headings.md) | Heading meaning is by structural role (leaf = step, parent = component) | Accepted |
| [0004](0004-loose-vocabulary-strict-topology.md) | Loose on vocabulary, strict on topology | Accepted |
| [0005](0005-provenance-and-versioning.md) | Provenance lives in the generated file; one bundled toolchain version | Accepted |
| [0006](0006-acyclic-dataflow-and-callouts.md) | Canonical graph is acyclic dataflow; control flow is callout annotations + an optional procedure view | Accepted |
| [0007](0007-drop-tags.md) | Drop authored tags from the format | Accepted |
| [0008](0008-single-step-sub-preparations.md) | Single-step sub-preparations nest as sub-components | Accepted |
| [0009](0009-choose-and-callout-strictness.md) | `Choose` for exclusive alternatives; callout strictness follows topology | Accepted; its informational keywords replaced by 0019 |
| [0010](0010-traditional-parts-as-headings.md) | Traditional form: a part is a heading, paired by name | Accepted |
| [0011](0011-notes-last-h2.md) | Notes are one section, the last H2, printed only when asked | Accepted |
| [0012](0012-group-links-mean-all.md) | A link to a group means all of its sub-components | Accepted |
| [0013](0013-headings-name-things-or-actions.md) | Headings name things or actions, in the author's words | Accepted |
| [0014](0014-em-dash-qualifiers-and-remarks.md) | An em dash introduces a qualifier or a remark | Accepted |
| [0015](0015-fonts-free-always.md) | Fonts: free always | Accepted |
| [0016](0016-preparation-steps-are-the-authors-choice.md) | Preparation steps are the author's choice; the chart draws an edgeless step apart | Accepted |
| [0017](0017-one-color-vocabulary.md) | One color vocabulary (desk, paper, ink); palettes and styles; sheets print as ink on paper | Accepted |
| [0018](0018-type-roles-and-match-the-card.md) | Type roles (title, body); charts measure from the fonts and can match a card style | Accepted |
| [0019](0019-open-callout-labels.md) | Callout labels are open; only `Checkpoint` and `Choose` are keywords | Accepted |
| [0020](0020-charts-fitted-to-the-sheet.md) | A chart is fitted to a screen or a sheet, and takes the layout that prints largest | Accepted |
| [0021](0021-a-chart-box-is-the-heading-and-the-marked-words.md) | A chart box is the step's heading and the words its instruction marks | Accepted |
| [0022](0022-a-mark-may-have-a-kind-read-from-the-registries.md) | A mark may have a kind, read from the registries | Accepted |

New decisions get the next number.
