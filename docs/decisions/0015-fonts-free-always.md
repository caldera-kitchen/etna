# 0015 — Fonts: free always

Status: Accepted

> Decided 2026-11-06; the font cache committed 2026-11-07. Supersedes the earlier decision
> that a theme names its preferred system fonts first (Futura, Yuppy SC) with free stand-ins
> as the fallback.

## Question

A card theme names its fonts in CSS font stacks. Should a bundled theme put the fonts it was
designed with first (often macOS system fonts) and fall back to free stand-ins, or use free
fonts only?

## Decision

- **No system font ever comes first.** Each bundled card theme's stacks are its chosen free
  font, delivered by `webfonts:`, then only a generic family (`Figtree, sans-serif`).
- All are under the SIL Open Font License 1.1, from Google Fonts.
- `etna fonts` caches them in `themes/.fonts/`, which is committed with their license texts;
  `etna card` embeds them in the card; the web GUI on GitHub Pages loads them from Google
  Fonts.
- **Chart themes too** (2026-11-08): each bundled chart theme's `font-family` and
  `title-font-family` start with its free font (JetBrains Mono, Arimo, Nunito Sans), then
  the system fonts as fallbacks. The SVG embeds it from the cache (WOFF2, data: URLs) unless
  `font-embedding: none`, and the PDF embeds it (TrueType).
- A theme of your own may still put a system font first.

## Reasoning

- A font in a stack wins over a later one whether it is installed or delivered, so a system
  font put first prints instead of the free font on a machine that has it: the same card
  would look different on different machines.
- A public web GUI cannot ship macOS system fonts.
- With the cache committed, a fresh clone prints the same cards offline.

## Rejected alternatives

- **Preferred system fonts first, free stand-ins as the fallback**: the earlier decision; it
  printed with the intended fonts only on a Mac that had them installed.

## See also

- `themes/README.md`, "Web fonts" (the normative theme contract); each card theme's README
  for its fonts.
