// The picture rules (SPEC §4.3, §9) on files built in memory: what is checked with the folder's
// files, what without them, and the byte limits.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import { parseRecipe } from '../../src/core/index.ts';
import { lintRecipe, type PictureFile } from '../../src/lint/index.ts';
import { lintPath } from '../../src/lint/node.ts';
import { loadUnits } from '../../src/node/files.ts';

const units = loadUnits();

const LINE = '![A bowl of soup](image/markdown.jpg)';
const recipe = (under = LINE) => `---\netna: 1\n---\n\n# Test Soup\n\n${under}\n\n## Simmer\n\n- 1 kg potatoes\n\nSimmer until soft.\n`;
const lint = (source: string, pictures?: PictureFile[]) => lintRecipe(parseRecipe(source, { units }), { pictures });
const rules = (source: string, pictures?: PictureFile[]) => lint(source, pictures).map((f) => f.rule);

const be32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
function chunk(type: string, data: number[]): number[] {
  const typed = [...type].map((c) => c.charCodeAt(0));
  let c = 0xffffffff;
  for (const b of [...typed, ...data]) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return [...be32(data.length), ...typed, ...data, ...be32((c ^ 0xffffffff) >>> 0)];
}
/** A flat gray PNG. */
function png(width: number, height: number): Uint8Array {
  const rows = new Uint8Array((width + 1) * height);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', [...be32(width), ...be32(height), 8, 0, 0, 0, 0]), ...chunk('IDAT', [...deflateSync(rows)]), ...chunk('IEND', [])]);
}
/** A JPEG's headers only, with a frame header of the given size: all the linter reads. */
function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0xff, 0xd9]);
}
/** A file padded with zeros after its image data, to a whole size of `bytes`. */
const padded = (head: Uint8Array, bytes: number) => {
  const out = new Uint8Array(bytes);
  out.set(head);
  return out;
};

const file = (name: string, bytes: Uint8Array, size?: number): PictureFile => (size === undefined ? { name, bytes } : { name, bytes, size });
const GOOD = [file('etna.jpg', jpeg(1200, 1200)), file('markdown.jpg', jpeg(320, 320))];

describe('picture rules without the folder', () => {
  it('checks the body only', () => {
    expect(rules(recipe())).toEqual([]);
    expect(rules(recipe('![A bowl](image/etna.jpg)'))).toEqual(['picture-line']);
    expect(rules(recipe(`${LINE}\n\nA soup, ![a pot](pot.png) and all.`))).toEqual(['picture-unread']);
  });
});

describe('picture-line', () => {
  it('reports an image under the title at another address, and that image only once', () => {
    const f = lint(recipe('![A bowl](https://example.com/soup.jpg)'), GOOD);
    expect(f.map((x) => [x.rule, x.line, x.column, x.at])).toEqual([['picture-line', 7, 1, null]]);
    expect(f[0].message).toContain('https://example.com/soup.jpg');
  });

  it('reports a reference-style image under the title', () => {
    expect(rules(recipe('![A bowl][bowl]\n\n[bowl]: image/markdown.jpg'), GOOD)).toEqual(['picture-line']);
  });

  it("reports a picture line whose file is not in the folder", () => {
    const f = lint(recipe('![A bowl](image/markdown.png)'), GOOD);
    expect(f.map((x) => x.rule)).toEqual(['picture-line']);
    expect(f[0].message).toContain('image/markdown.png');
    expect(rules(recipe(), [])).toEqual(['picture-line']);
  });
});

describe('picture-unread', () => {
  it('reports every other image, in either form, at its place', () => {
    const source = `---\netna: 1\nform: traditional\n---\n\n# Test Soup\n\n${LINE}\n\nA headnote. ![first](a.jpg)\n\n![second](b.jpg)\n\n## Ingredients\n\n- 1 kg potatoes ![third][c]\n\n## Directions\n\n1. Simmer. [![fourth](d.jpg)](https://example.com)\n\n[c]: c.jpg\n`;
    const f = lint(source, GOOD);
    expect(f.map((x) => [x.rule, x.line, x.at])).toEqual([
      ['picture-unread', 10, null],
      ['picture-unread', 12, null],
      ['picture-unread', 16, 'Ingredients'],
      ['picture-unread', 20, 'Directions'],
    ]);
  });

  it('reads a second image-only paragraph as an image in the body', () => {
    expect(rules(recipe(`${LINE}\n\n![Another](image/markdown.jpg)`), GOOD)).toEqual(['picture-unread']);
  });
});

describe('picture-file', () => {
  it('ignores names that start with a dot', () => {
    expect(rules(recipe(), [...GOOD, file('.DS_Store', new Uint8Array([0, 1, 2]))])).toEqual([]);
  });

  it('reads names case and all', () => {
    expect(rules(recipe(), [file('Etna.JPG', jpeg(1200, 1200)), file('markdown.jpg', jpeg(320, 320))])).toEqual(['picture-file', 'picture-not-in-etna']);
  });

  it('reports a file that is no picture, one whose ending does not match, and a name with both endings', () => {
    const f = lint(recipe(), [file('etna.jpg', new TextEncoder().encode('hello')), file('markdown.jpg', png(320, 320)), file('markdown.png', png(320, 320))]);
    expect(f.map((x) => x.rule)).toEqual(['picture-file', 'picture-file', 'picture-file']);
    expect(f.map((x) => x.message).join('\n')).toMatch(/both image\/markdown\.jpg and image\/markdown\.png[\s\S]*image\/etna\.jpg is neither[\s\S]*image\/markdown\.jpg holds a PNG/);
  });
});

describe('picture-not-square', () => {
  it('compares width and height exactly, for either copy', () => {
    expect(rules(recipe(), [file('etna.png', png(1200, 1201)), file('markdown.jpg', jpeg(320, 320))])).toEqual(['picture-not-square']);
    expect(rules(recipe(), [GOOD[0], file('markdown.jpg', jpeg(320, 240))])).toEqual(['picture-not-square']);
  });
});

describe('picture-size', () => {
  const KIB = 1024;

  it('reports an etna copy under 600 pixels on its shorter side, never the markdown copy', () => {
    expect(rules(recipe(), [file('etna.jpg', jpeg(599, 599)), GOOD[1]])).toEqual(['picture-size']);
    expect(rules(recipe(), [file('etna.jpg', jpeg(600, 600)), file('markdown.jpg', jpeg(16, 16))])).toEqual([]);
  });

  it('allows the etna copy 768 KiB and the markdown copy 100 KiB, a KiB being 1024 bytes', () => {
    expect(rules(recipe(), [file('etna.jpg', padded(jpeg(1200, 1200), 768 * KIB)), file('markdown.jpg', padded(jpeg(320, 320), 100 * KIB))])).toEqual([]);
    const f = lint(recipe(), [file('etna.jpg', padded(jpeg(1200, 1200), 768 * KIB + 1)), file('markdown.jpg', padded(jpeg(320, 320), 100 * KIB + 1))]);
    expect(f.map((x) => [x.rule, x.message])).toEqual([
      ['picture-size', expect.stringContaining('image/etna.jpg is 769 KiB, over 768 KiB')],
      ['picture-size', expect.stringContaining('image/markdown.jpg is 101 KiB, over 100 KiB')],
    ]);
  });

  it('takes the size given apart from the bytes read', () => {
    expect(rules(recipe(), [file('etna.jpg', jpeg(1200, 1200), 2 * 1024 * KIB), GOOD[1]])).toEqual(['picture-size']);
    expect(rules(recipe(), [file('etna.jpg', padded(jpeg(1200, 1200), 800 * KIB), 700 * KIB), GOOD[1]])).toEqual([]);
  });
});

describe('picture-location', () => {
  it('reports a location without printing it', () => {
    // A JPEG whose Exif GPS directory holds a latitude of 45 and a longitude of 9.
    const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x88, 0x25, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 2, 0, 2, 0, 5, 0, 0, 0, 1, 0, 0, 0, 56, 0, 4, 0, 5, 0, 0, 0, 1, 0, 0, 0, 64, 0, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0, 1, 0, 0, 0, 9, 0, 0, 0, 1];
    const app1 = [0xff, 0xe1, 0, tiff.length + 8, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const located = jpeg(320, 320);
    const bytes = new Uint8Array([0xff, 0xd8, ...app1, ...located.subarray(2)]);
    const f = lint(recipe(), [GOOD[0], file('markdown.jpg', bytes)]);
    expect(f.map((x) => x.rule)).toEqual(['picture-location']);
    expect(f[0].message).toContain('image/markdown.jpg');
    expect(f[0].message).not.toMatch(/45|\b9\b/);
  });
});

describe('picture-not-in-etna', () => {
  it('is a hint for a picture line with no etna copy', () => {
    const f = lint(recipe(), [GOOD[1]]);
    expect(f.map((x) => [x.rule, x.severity, x.line])).toEqual([['picture-not-in-etna', 'info', 7]]);
    expect(rules(recipe(), [file('etna.png', png(600, 600)), GOOD[1]])).toEqual([]);
  });

  it('says nothing without a picture line', () => {
    expect(rules(recipe('A soup.'), [GOOD[1]])).toEqual([]);
  });
});

describe('lintPath and the image folder', () => {
  let root: string | null = null;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  const make = (slug: string, file: string, source: string) => {
    mkdirSync(join(root!, slug, 'image'), { recursive: true });
    writeFileSync(join(root!, slug, file), source);
  };

  it('reads the folder of a recipe directory, the size of a large file from the file system', () => {
    root = mkdtempSync(join(tmpdir(), 'etna-lint-picture-'));
    make('test-soup', 'recipe.md', recipe());
    writeFileSync(join(root, 'test-soup', 'image', 'markdown.jpg'), padded(jpeg(320, 320), 2 * 1024 * 1024));
    const [result] = lintPath(root);
    expect(result.findings.map((f) => f.rule)).toEqual(['picture-size', 'picture-not-in-etna']);
    expect(result.findings[0].message).toContain('2048 KiB');
  });

  it('does not read the folder for a loose Markdown file', () => {
    root = mkdtempSync(join(tmpdir(), 'etna-lint-picture-'));
    make('drafts', 'idea.md', recipe());
    expect(lintPath(join(root, 'drafts', 'idea.md'))[0].findings).toEqual([]);
  });
});
