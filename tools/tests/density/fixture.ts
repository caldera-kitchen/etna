// An artificial density file for tests. The numbers mean nothing.

export const FIXTURE = `# Test densities

Some prose.

| Ingredient | Fact | Source |
|---|---|---|
| before the section | 1 cup = 1 g | test |

## Reference densities

The rows.

\`\`\`markdown
| Ingredient | Fact | Source |
|---|---|---|
| inside a code block | 1 cup = 2 g | test |
\`\`\`

| Ingredient | Fact | Source | Aliases | Liquid | Note |
|---|---|---|---|---|---|
| \`blarg\` | 1/2 cup = 1 oz | test | | no | code span in the name |
| glorp syrup | 2 tbsp = 45 g | test | | yes | sticky \\| runny |
| quux water | 1 cup = 200 g | test | | | |
| zorb flour | 1 cup = 100 g | test | test zorb flour; zorb meal | | |

## Other section

| Ingredient | Fact | Source |
|---|---|---|
| ignored | 1 cup = 1 g | test |
`;
