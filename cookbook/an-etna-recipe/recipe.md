---
etna: 1
source: the Etna tutorial
yield: 1 recipe file
license: CC BY-SA 4.0
extra:
  lesson: 17
  written: for the Etna tutorial; a recipe for writing a recipe
---

# An Etna Recipe

## Cook it once more

Make the dish with a notebook beside you. Write down what goes in, how much, and at which point. Weigh what you can: grams travel better than cups.

## The file

### Make a folder

- 1 folder — named for the dish
- 1 text file — named recipe.md

Name the folder for the dish, in lower case with a hyphen between the words: `potato-soup`. In it make a plain text file called `recipe.md`. One folder holds one recipe, and the folder's name is its address.

### Write the frontmatter

- 2 lines of three dashes
- 1 version line
- 3 lines about the recipe — optional

Open the file with a line of three dashes, write `etna: 1` under it, and close with three dashes again. That one line is all the format asks for. Three more are worth adding: `source` (whose recipe it is), `yield` (what it makes) and `license`. Anything else of your own goes under `extra`, where no tool will object to it.

## The recipe

### Give it a title

- 1 title — the dish's own name

Under the frontmatter, write one line that starts with a single `#`: `# Potato Soup`. A recipe has exactly one.

### Name each step

- 1 heading for each step

Each step is a `##` heading that says what the cook does, in a few words: "Whisk the eggs", not "Eggs" and not "Step 2". Read in order, the headings alone should tell the recipe.

> **Tip** — a step is one thing a cook does without stopping. If its name needs "and then", it is two steps.

### List what goes in

- 1 line for each ingredient — amount, unit, name

Under a step's heading, list what goes in at that step and nothing else, one to a line, each starting with a hyphen: `- 240 g heavy cream`. Say how it is prepared after a comma, `- 1 red onion, peeled`, and anything else after an em dash: `— or shallots`, `— optional`, `— to taste`. There is no separate list of ingredients to keep in step with the method.

> **Checkpoint** — if an ingredient goes in at two steps, list it at both, each with the amount that step takes.

### Say what to do

- 1 short paragraph for each step

Under the ingredients, say what to do with them in plain sentences. Times, temperatures and how to tell it is done belong here.

### Arrange the steps

> **Choose** — how the dish is put together.

#### One after another

For a simple dish, stop here. Each step takes what the one before it made, and you need say nothing more.

#### In parts

When part of the dish is made on its own (a dough, a filling, a sauce), make it a component: a `##` heading that names the part, with its steps as `###` headings under it. Where a later step uses the part, list a link to it as you would an ingredient: `- [dough](#dough)`.

### Add what a cook should know

- asides — optional

A line that starts `> **Tip** —` is an aside, printed under its step. Label it as you like: Tip, Warning, Make ahead, Storage. Two labels do more. `Checkpoint` marks a moment to look, and to act only if needed. `Choose`, under a heading, makes the headings beneath it alternatives: the cook makes one.

> **Note** — this page has one of each: a Tip, a Checkpoint, a Choose, and this Note.

## Check it

- [file](#the-file)
- [recipe](#the-recipe)

Run `etna lint` on the folder. It reads the file as the tools do and says, line by line, what is wrong and what is unclear. Then run `etna fmt`, which rewrites the file in the standard style and never rewords an instruction.

> **Warning** — `etna fmt` changes the file. Run `etna fmt --check` first to see whether it would.

## Look at it

Open it three ways: the file, the card (`etna card`) and the flow chart (`etna dag`). The chart is drawn from the file alone. If it shows the dish as you make it, the file says what you meant.

> **Variation** — a recipe already written as a list of ingredients and numbered directions can stay that way: add `form: traditional` to the frontmatter (lesson 1). It has a card and no chart.

## Notes

- This is a recipe for writing a recipe. Its components are the parts of the file, its steps are what you do, and its card and its chart are made by the same tools as any other recipe's. Every sentence in it is about the format: SPEC §2 (the folder), §3 (frontmatter), §4 (title, steps and components), §5 (steps and callouts), §6 (ingredient lines and links) and §13 (the standard style).
- "Cook it once more" comes before the first component and takes nothing in, so the chart sets it apart as preparation.
- "The file" and "The recipe" are components. "Check it" and "Look at it" come after them: closing steps, which take the components in through their links.
- "Arrange the steps" is a `Choose`: the chart draws "One after another" and "In parts" as alternatives, and "Add what a cook should know" follows either (lessons 6 and 14).
- The ingredient lines here are not food: `- 1 title — the dish's own name` is written as an ingredient so that you can see one. A shopping list made from this page asks for a folder and a title.
- Lessons 1 to 17 show most of these pieces in real dishes.
