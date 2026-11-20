# From any recipe to a chartable Etna recipe

How to take a recipe you have, in whatever shape it is in, and turn it into an Etna recipe that
lints clean, prints as a card and draws as a flow chart; then how to share it. The rules live in
[`SPEC.md`](../SPEC.md); the conversion procedure lives in
[`structuring-playbook.md`](structuring-playbook.md). This page is the route between them.

Four stages. Stop after any of them and you still have something useful.

| Stage | You end with | Checked by |
|---|---|---|
| 1. Capture | the recipe's text, with its source | you |
| 2. Traditional form | `recipe.md` with an ingredient list and numbered directions | `etna lint`, `etna fmt` |
| 3. Structured form | each ingredient listed at the step that uses it | `etna restructure check`, `etna lint` |
| 4. Share | a pull request, or a collection of your own in the viewer | the collection's CI |

## 1. Capture the text

Get the words onto your screen, unchanged, and note where they came from.

- **A web page.** Copy the ingredient list and the method. Keep the yield and any notes the
  author wrote. Record the URL.
- **A PDF or an e-book.** Select and copy the text. If it copies as one run of words, paste
  it anyway: the next stage sorts it.
- **A scan, a photo or a card in handwriting.** Give the image to an AI assistant and ask for a
  faithful transcription, nothing added or tidied: amounts as written, abbreviations as
  written, the author's order. Read it against the picture before you go on. A transcription
  may fix a spelling, never an amount.
- **Your own recipe.** Write it down the way you would say it to a friend.

Whatever the source, the rule that governs everything after this is: **the words are the
author's; the structure is Etna's.** Nothing is invented at any later stage. If the source
never says how long to bake, the Etna recipe does not say either.

## 2. Write the traditional form

The traditional form is what most recipes already are: a title, an ingredient list and numbered
directions, with a short frontmatter block on top. Start from
[`templates/recipe-starter.md`](../templates/recipe-starter.md) (paste it into a chat as
context and ask for the draft, or copy its skeleton and type) and name the folder after the
title: `recipes/potato-soup/recipe.md`. Here is the Potato Soup that ships with Etna, in
`cookbook/potato-soup-traditional-form/recipe.md`; its title says "(Traditional Form)" only
because the cookbook keeps the two forms side by side.

```markdown
---
etna: 1
form: traditional
source: Vincent Lucarelli
license: CC BY-SA 4.0
extra:
  servings: 1
  course: Main
  categories: [Soups]
  keywords: soup
---

# Potato Soup (Traditional Form)

## Ingredients

- 1 tbsp olive oil
- 2 medium onions, diced
- 1 large leek, diced
- 4 medium celery stalks, diced
- 2 tsp kosher salt
- 1/4 tsp black pepper
- 4 cups water
- 3 lb russet potatoes, diced
- 2 tbsp unsalted butter
- 2 tbsp unbleached white flour
- 2 cups whole milk

## Directions

1. Heat a heavy bottom soup pan over medium heat. Add the olive oil and onion. While the onion cooks, clean and dice the leeks and then add them to the pan. While the onions and leeks cook, clean and slice the celery. Add celery to the pan and cook for a few minutes. The onions should be starting to brown at this point.
2. Add the salt and pepper, cover, and cook for 5 minutes. Stir two or three times during this time.
3. Add the water and increase heat to high. While the water heats, clean and dice the potatoes. Once the water is boiling, carefully add the potatoes.
4. Reduce heat and simmer for 15 minutes.
5. While the potatoes boil, prepare the white sauce. Over medium heat melt the butter, add the flour, then slowly incorporate the milk.
6. After the potatoes have boiled 15 minutes, add the white sauce and simmer on medium-low another 15-25 minutes until potatoes are tender.
```

What matters here, from SPEC §4 and §6:

- One line per ingredient, `quantity unit item, preparation — remark`. A comma introduces how it
  is prepared (`onions, diced`); a spaced em dash introduces a remark that is not preparation
  (`— optional`, `— 52%`, `— to taste`). An ingredient with no amount says its use after the
  dash: `- flour — for dusting`.
- Potato Soup has one list. A recipe made in parts gives each part a `###` heading on both
  sides, and the same name pairs them (SPEC §4.1): the cookbook's Italian Wedding Soup
  (Traditional Form) has `### Chicken Stock`, `### Meatballs`, `### Breads for Soup` and
  `### Wedding Soup` under `## Ingredients`, and the same four and `### Serve` under
  `## Directions`. A qualifier goes after an em dash, as in the structured wedding soup's
  `## Breads for Soup — optional`.
- What the recipe makes goes in the frontmatter, as `yield: 12 servings` in the wedding soup.
- Notes go in a final `## Notes`, one `- ` item each (§4.2).

Then, from the folder that holds `recipes/`:

```bash
etna fmt recipes/potato-soup
```

```bash
etna lint recipes/potato-soup
```

`fmt` rewrites the file into the canonical style (fractions, units, `350°F`, list markers,
part headings) and `lint` reports anything the rules reject: an error must be fixed, a
warning is advice. Open the folder in the viewer to see the card:

```bash
etna serve .
```

An AI assistant can do stage 2 for you. Give it the starter file and the text from stage 1,
and ask for the traditional form; run `fmt` and `lint` on what comes back and read it once
against the source. [`skill/SKILL.md`](../skill/SKILL.md) is the procedure an agent follows to
put a recipe into Etna's format; give it to the assistant too.

## 3. Make it chartable: the structured form

A flow chart needs to know where each ingredient enters, and that is what the structured form
records: every leaf heading is a step with the ingredients that join at it, every parent heading
is a component, and a link line says that one component's result feeds another (SPEC §4 to §7).

The same Potato Soup, structured, in `cookbook/potato-soup/recipe.md`:

```markdown
---
etna: 1
source: Vincent Lucarelli
license: CC BY-SA 4.0
extra:
  servings: 1
  course: Main
  categories: [Soups]
  keywords: soup
---

# Potato Soup

## Soup

### Cook the onion and leeks

- 1 tbsp olive oil
- 2 medium onions, diced
- 1 large leek, diced

Heat a heavy bottom soup pan over *medium heat*. Add the olive oil and onion. While the onion cooks, clean and dice the leeks and then add them to the pan.

### Add the celery

- 4 medium celery stalks, diced

While the onions and leeks cook, clean and slice the celery. Add celery to the pan and cook for a few minutes. The onions should be starting to brown at this point.

### Season and cover

- 2 tsp kosher salt
- 1/4 tsp black pepper

Add the salt and pepper, cover, and cook for *5 minutes*. Stir two or three times during this time.

### Add the water and potatoes

- 4 cups water
- 3 lb russet potatoes, diced

Add the water and *increase heat to high*. While the water heats, clean and dice the potatoes. Once the water is boiling, carefully add the potatoes.

### Simmer the potatoes

Reduce heat and simmer for *15 minutes*.

### White sauce

#### Prepare the white sauce

- 2 tbsp unsalted butter
- 2 tbsp unbleached white flour
- 2 cups whole milk

While the potatoes boil, prepare the white sauce. Over *medium heat* melt the butter, add the flour, then slowly incorporate the milk.

### Add the white sauce

- [white sauce](#white-sauce)

After the potatoes have boiled 15 minutes, add the white sauce and simmer on *medium-low* another *15-25 minutes* until potatoes are tender.
```

Each ingredient line moved, unchanged, to the step that uses it, and the first direction was
cut in two where the celery comes in. The white sauce is made while the potatoes simmer, so it
is a component of its own, and `- [white sauce](#white-sauce)` brings it in at *Add the white
sauce*. Every sentence of the directions is still there, word for word and in order. The words
between asterisks are the author's marks, what each step's chart box shows (SPEC §5.3): they add
no words, and restructuring does not add them.

The procedure is the [structuring playbook](structuring-playbook.md). Its rules in one
paragraph: a component is a noun for what is made, a step is a verb phrase for what is done; a
component earns its heading only when the recipe makes more than one thing; cut a direction
where a new ingredient enters, and never merge two directions into one; keep every sentence of
the directions word for word; ingredient lines stay byte for byte as they were (a line used at
two steps is split into portions that add up); alternatives become a `> **Choose** —` callout
over the branches (§5.2); notes stay in `## Notes`, except a note about one step, which may
become a callout under that step, word for word. A preheat or pan-prep step is yours to
place: as the chain's first step it is a step, as its own `##` before the components it
stands apart and the chart draws it first under "Before you start".

Keep the traditional file beside the new one while you work, because the checker compares them:

```bash
etna restructure check recipes/potato-soup/traditional.md recipes/potato-soup/recipe.md
```

It proves that every ingredient line and every sentence survived, lists what is new by
necessity (headings, links, callout keywords) and fails on anything lost or altered. Run on
the cookbook's two Potato Soups, it accounts for all 11 ingredient lines and all 15 sentences
and passes: the titles differ there on purpose, by exactly " (Traditional Form)" on the
original's, the one title difference the checker accepts. When it
reports zero lost or altered and `etna lint` is clean, delete the traditional copy; the
structured file still prints as a card and now also draws the chart. In the viewer, the Flow
chart tab shows each step's box with its heading and any words its instruction marks (SPEC
§5.3), fitted to the screen or a page (where text that would print under 7 pt brings a line
offering the Dense style), and saves it as SVG or PDF.

This stage is where an assistant helps most, and where the playbook matters most. Hand it the
playbook, SPEC §4 to §7 and the traditional file, ask for the structured form and for a list of
every judgment it made (where it cut, what it named, anything it was unsure of), then run the
checker. Anything the checker rejects goes back; anything the assistant was unsure of is your
decision, not its guess.

## 4. Share it

**Into a shared collection.** Fork the collection, add `recipes/<name>/recipe.md`, and open a
pull request. The collection's CI runs `etna lint` (errors block) and `etna fmt --check`
(run `etna fmt` locally and commit if it fails). A recipe that references another recipe
(`[biga](../biga/)`) must point at one that exists in that collection. Say in the pull request
where the recipe came from and whether it is in the traditional or the structured form; both
are welcome, and a traditional recipe can be structured later by anyone.

**A collection of your own.** Copy [`templates/collection/`](../templates/collection/) into a
new repository: it holds the layout, a CI workflow and a README to fill in. Put your recipes
under `recipes/`, optionally your own `densities.md` and `themes/`, and run `etna serve .` to
browse, search, print cards and draw charts offline. Once the repository is public on GitHub,
the hosted viewer opens it by its `owner/name` and reads it directly; with the `catalog.json`
that CI builds on `main`, it offers full search.

**Your own copy of someone else's.** Fork, and edit as you like; pull upstream when you want
their changes. Nothing in Etna ties a recipe to one collection: a recipe folder moved between
collections keeps working, because the recipe is the Markdown file and nothing else.

## A picture, if you have one

A recipe may have one picture, added at any stage: a photograph **you took** of the dish. Not
one saved from a web page or copied from a book, even with credit; that photograph belongs to
whoever took it. The rules are in SPEC §4.3.

The picture lives in a folder named `image` beside `recipe.md`, as up to two copies of the
same photograph, each made for the one place that shows it:

| File | Shown by | Size |
|---|---|---|
| `image/etna.jpg` | the viewer, and a card whose style has a place for a picture | 1200 × 1200 pixels, under 768 KiB |
| `image/markdown.jpg` | GitHub and other Markdown readers, through the picture line | 320 × 320 pixels, under 100 KiB |

Either copy may come alone; neither stands in for the other.

**1. Take out the location.** A phone writes the place a photograph was taken into the file,
and every copy made from it keeps it. Remove it from the photograph you start from:

- On an iPhone, in Photos: Share, then Options at the top, turn off Location, and save or
  send the copy.
- On a Mac, in Photos: File > Export, with Location Information left unchecked.

**2. Make the two copies.** Cut the photograph to a square, then save it at each size. On a
Mac, Terminal's `sips` does both, from a JPEG or an iPhone's HEIC alike. Find the shorter side:

```bash
sips -g pixelWidth -g pixelHeight photo.jpg
```

Cut the middle square, here for a photograph 3024 pixels on its shorter side:

```bash
sips -c 3024 3024 -s format png photo.jpg --out square.png
```

Then make the folder and the two copies:

```bash
mkdir recipes/potato-soup/image
```

```bash
sips -Z 1200 -s format jpeg -s formatOptions 80 square.png --out recipes/potato-soup/image/etna.jpg
```

```bash
sips -Z 320 -s format jpeg -s formatOptions 80 square.png --out recipes/potato-soup/image/markdown.jpg
```

Any photo editor does the same: crop to a square, and export a JPEG at each size with quality
about 80. A busy photograph may come out over 768 KiB at 1200 pixels; export it again at
quality 70.

**3. Write the picture line.** With `markdown.jpg`, put one image line as the first thing under
the title, in your own words for what the picture shows:

```markdown
# Potato Soup

![A bowl of potato soup](image/markdown.jpg)
```

GitHub shows the picture there. A screen reader reads the words for both copies, and a card
never prints them. A recipe kept in the traditional form takes the same line.

**4. Check it.** `etna lint` reports a file it cannot use, a picture that is not square or is
outside the sizes above, a location still in the file, and a picture line that names the
wrong address or a missing file. `etna serve .` then shows the picture on the card, where a
Picture switch leaves it out of the print, and its Check tab runs the same checks.

An AI assistant can run these commands for you. The photograph is yours to hand it; it never
finds one for you.

## Licenses

Say in the collection's README how the recipes may be used, or give a recipe its own
`license:` in its frontmatter. Ingredient lists and bare instructions are facts; the author's
words, notes and photographs are theirs. When you transcribe a recipe from a book or a site,
credit it in `source:` and check its terms before you publish it.
