// The recipe's picture (SPEC §4.3, §9): the picture line, the images Etna does not read, and
// the files in the recipe's `image/` folder.
//
// Pure and browser-safe: the caller passes the folder's files, when it can see them.

import type { Image, ImageReference, Nodes, Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { frontmatter } from 'micromark-extension-frontmatter';

import { imageOnly, isPictureAddress, readPicture } from '../core/index.ts';
import type { Pos, Recipe } from '../core/index.ts';
import type { RuleId } from './rules.ts';

/** One file directly in a recipe's `image/` folder. */
export interface PictureFile {
  /** The file's name in the folder, as written (`etna.jpg`). */
  name: string;
  /** The file's bytes, or only its start: enough to hold its header and Exif data. */
  bytes: Uint8Array;
  /** The whole file's size in bytes, when `bytes` holds only its start. Defaults to `bytes.length`. */
  size?: number;
}

type Add = (rule: RuleId, where: Pos | { line: number; column: number }, at: string | null, message: string) => void;

/** The names Etna reads in `image/`. */
const NAMES = ['etna.jpg', 'etna.png', 'markdown.jpg', 'markdown.png'];

/** The kind each ending promises. */
const KIND_OF_ENDING: Record<string, 'jpeg' | 'png'> = { jpg: 'jpeg', png: 'png' };

const KIB = 1024;
/** The sizes of SPEC §4.3. */
const ETNA_MIN_SIDE = 600;
const ETNA_MAX_BYTES = 768 * KIB;
const MARKDOWN_MAX_BYTES = 100 * KIB;

/** Text quoted inside a message: whitespace collapsed, long text cut short. */
function quote(text: string, max = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Lint the recipe's picture. The body's images are always checked; the files only when
 * `files` is given (the files directly in `image/`, an empty list for none). Without them,
 * nothing is said about a file, there or missing.
 */
export function lintPicture(recipe: Recipe, files: PictureFile[] | undefined, add: Add): void {
  lintImages(recipe, add);
  if (files === undefined) return;
  const shown = files.filter((f) => !f.name.startsWith('.'));
  const names = new Set(shown.map((f) => f.name));

  const picture = recipe.picture;
  if (picture) {
    const file = picture.address.slice('image/'.length);
    if (!names.has(file)) {
      add('picture-line', picture.pos, null, `The picture line points at ${picture.address}, which is not in the recipe's image folder: add the file, or remove the line.`);
    } else if (!names.has('etna.jpg') && !names.has('etna.png')) {
      add('picture-not-in-etna', picture.pos, null, `The picture line shows ${picture.address} to a Markdown reader, but there is no image/etna.jpg or image/etna.png, so Etna shows no picture: add one for Etna.`);
    }
  }

  lintFiles(shown, add);
}

// ---------------------------------------------------------------------- body

/**
 * Every image in the body. The image-only paragraph right after the title is the picture line
 * when its address is one of the two (the parser takes it out of the text), and a `picture-line`
 * warning otherwise; any other image is `picture-unread`.
 */
function lintImages(recipe: Recipe, add: Add): void {
  const tree = fromMarkdown(recipe.source, {
    extensions: [frontmatter(['yaml'])],
    mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
  }) as Root;

  // The block right after the title, read as the parser reads it: only when the title comes before every H2.
  let candidate: Image | ImageReference | null = null;
  const titleAt = tree.children.findIndex((n) => n.type === 'heading' && n.depth === 1);
  const sectionBefore = tree.children.slice(0, Math.max(0, titleAt)).some((n) => n.type === 'heading');
  const next = titleAt >= 0 && !sectionBefore ? tree.children[titleAt + 1] : undefined;
  if (next) candidate = imageOnly(next);

  if (candidate) {
    if (candidate.type === 'imageReference') {
      add('picture-line', pos(candidate), null, `The image under the title is written as a reference ("${quote(candidate.label ?? candidate.identifier, 40)}"), so Etna does not read it as the picture line and keeps only its words: write the address in the line itself, ![${quote(candidate.alt ?? '', 40)}](image/markdown.jpg).`);
    } else if (!isPictureAddress(candidate.url)) {
      add('picture-line', pos(candidate), null, `The image under the title points at "${quote(candidate.url, 60)}", so Etna does not read it as the picture line and keeps only its words: give the address image/markdown.jpg or image/markdown.png, written exactly so.`);
    }
  }

  const walk = (node: Nodes) => {
    if ((node.type === 'image' || node.type === 'imageReference') && node !== candidate) {
      const name = node.alt?.trim() ? `"${quote(node.alt, 40)}"` : node.type === 'image' ? `"${quote(node.url, 40)}"` : 'here';
      add('picture-unread', pos(node), headingBefore(recipe, pos(node)), `Etna shows no picture for the image ${name}; it keeps only its words. A recipe's picture is image/etna.jpg, and a picture line is the first thing under the title.`);
    }
    if ('children' in node) for (const child of node.children) walk(child as Nodes);
  };
  walk(tree);
}

function pos(node: { position?: unknown }): Pos {
  return node.position as Pos;
}

/** The text of the last heading before `where`, or null when there is none. */
function headingBefore(recipe: Recipe, where: Pos): string | null {
  let at: string | null = null;
  for (const h of recipe.headings) {
    if (h.pos.start.offset < where.start.offset) at = h.text;
    else break;
  }
  return at;
}

// --------------------------------------------------------------------- files

const TOP = { line: 1, column: 1 };

function lintFiles(files: PictureFile[], add: Add): void {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = new Set(sorted.map((f) => f.name));
  for (const stem of ['etna', 'markdown']) {
    if (names.has(`${stem}.jpg`) && names.has(`${stem}.png`)) {
      add('picture-file', TOP, null, `The image folder has both image/${stem}.jpg and image/${stem}.png; one name has one file: keep one of the two.`);
    }
  }

  for (const file of sorted) {
    const path = `image/${file.name}`;
    if (!NAMES.includes(file.name)) {
      add('picture-file', TOP, null, `The file ${path} is not one Etna uses: name the picture image/etna.jpg (or .png) for Etna, and image/markdown.jpg (or .png) for the picture line.`);
      continue;
    }
    const [stem, ending] = file.name.split('.');
    const info = readPicture(file.bytes);
    if (info === null) {
      add('picture-file', TOP, null, `The file ${path} is neither a JPEG nor a PNG: save the picture as one.`);
      continue;
    }
    if (info.kind !== KIND_OF_ENDING[ending]) {
      const other = info.kind === 'jpeg' ? 'jpg' : 'png';
      add('picture-file', TOP, null, `The file ${path} holds a ${info.kind === 'jpeg' ? 'JPEG' : 'PNG'}: name it image/${stem}.${other}.`);
      continue;
    }

    if (info.width !== info.height) {
      const shows = stem === 'etna' ? 'Etna shows its middle' : 'a Markdown reader shows it as it is';
      add('picture-not-square', TOP, null, `The picture ${path} is ${info.width} × ${info.height} pixels, not square: ${shows}. Crop it square.`);
    }

    const bytes = file.size ?? file.bytes.length;
    const kb = Math.ceil(bytes / KIB);
    if (stem === 'etna') {
      const side = Math.min(info.width, info.height);
      if (side < ETNA_MIN_SIDE) {
        add('picture-size', TOP, null, `The picture ${path} is ${side} pixels on its shorter side, under ${ETNA_MIN_SIDE}, so it prints soft: use one of at least ${ETNA_MIN_SIDE} pixels a side (1200 suits most).`);
      }
      if (bytes > ETNA_MAX_BYTES) {
        add('picture-size', TOP, null, `The picture ${path} is ${kb} KiB, over ${ETNA_MAX_BYTES / KIB} KiB: save it smaller.`);
      }
    } else if (bytes > MARKDOWN_MAX_BYTES) {
      add('picture-size', TOP, null, `The picture ${path} is ${kb} KiB, over ${MARKDOWN_MAX_BYTES / KIB} KiB: save it smaller.`);
    }

    if (info.location) {
      add('picture-location', TOP, null, `The picture ${path} carries the place it was taken: remove the location from the file before it goes into a public repository.`);
    }
  }
}
