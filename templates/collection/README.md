# My recipes

> **Template.** This folder is what a new Etna recipe collection starts from: copy it into a
> new repository and make it your own. The notes at the top of `.github/workflows/etna.yml` say
> what its checks do and which Etna version they use.

A collection of recipes in the [Etna](https://github.com/caldera-kitchen/etna) format: one plain
Markdown file per recipe, checked and indexed automatically.

## Layout

```text
recipes/
  <recipe-name>/
    recipe.md        one recipe; the folder name is its address
archive/             recipes kept for the record; never checked, listed or searched
densities.md         optional: your own weights per cup, laid over Etna's defaults
themes/              optional: your own card or chart themes, one folder each
catalog.json         built by CI; what the web GUI loads to browse and search
```

A folder name uses lower-case letters, digits and hyphens: `recipes/potato-soup/recipe.md`.

## Adding a recipe

1. Make a folder under `recipes/` and put a `recipe.md` in it. The Etna repository has a
   starter (`templates/recipe-starter.md`), the recipes that ship with it and lessons through
   them (`cookbook/`), and a guide from any source to a chartable recipe
   (`docs/contributing-a-recipe.md`).
2. Open a pull request. CI runs two checks:
   - **Lint**: the recipe follows the Etna rules. Errors block the merge; warnings do not.
   - **Format**: the recipe is in the canonical source style. If this fails, run
     `etna fmt recipes/<recipe-name>` and commit the result.
3. Merge. CI rebuilds `catalog.json` on `main` and commits it.

## Working on your own computer

You need [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 24 or newer. The Etna
tools come from the Etna repository: clone it once, anywhere outside this collection, and install
its tools:

```bash
git clone https://github.com/caldera-kitchen/etna.git
cd etna/tools
npm ci
```

The command is `node bin/etna.js`, run from that `tools/` folder. To type `etna` from anywhere
instead, either make an alias for your shell session (or put the line in your shell's startup
file with the full path written out):

```bash
alias etna="node $PWD/bin/etna.js"
```

or run `npm link` once, which installs a global `etna` command that points at that clone. The
Etna README's [Getting started](https://github.com/caldera-kitchen/etna#getting-started) says the
same.

Then, from this collection's folder:

```bash
etna lint .
```

checks every recipe against the Etna rules, as CI does;

```bash
etna fmt .
```

rewrites any recipe that is not in the canonical source style (`etna fmt --check .` only says
which, as CI does); and

```bash
etna serve .
```

opens the collection in a local web GUI: browse, search, recipe cards, flow charts. It works
offline and changes no file. Stop it with Ctrl+C.

## Viewing it on the web

Point the Etna web GUI at this repository (`owner/name`) once it is public. With
`catalog.json` present it offers full search; without it, a list of recipe names.

## License

Say here how your recipes may be used. A recipe can also carry its own `license:` in its
frontmatter.
