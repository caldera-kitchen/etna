// The picture reader (src/core/picture.ts): kind, size as shown, and whether a location is
// carried, from headers built here byte by byte.

import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { isPictureAddress, readPicture } from '../../src/core/index.ts';

// ------------------------------------------------------------------ builders

const u16 = (n: number, little: boolean) => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
const u32 = (n: number, little: boolean) => (little ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);

/** A TIFF block: a first directory with an orientation and, if asked, a GPS directory holding the given tags. */
function tiff(options: { little?: boolean; orientation?: number; gpsTags?: number[] }): number[] {
  const little = options.little ?? false;
  const entries: number[][] = [];
  if (options.orientation !== undefined) entries.push([...u16(0x0112, little), ...u16(3, little), ...u32(1, little), ...u16(options.orientation, little), 0, 0]);
  const ifd0Size = 2 + 12 * (entries.length + (options.gpsTags ? 1 : 0)) + 4;
  const gpsAt = 8 + ifd0Size;
  if (options.gpsTags) entries.push([...u16(0x8825, little), ...u16(4, little), ...u32(1, little), ...u32(gpsAt, little)]);
  const out = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little), ...u32(8, little), ...u16(entries.length, little), ...entries.flat(), ...u32(0, little)];
  if (options.gpsTags) {
    out.push(...u16(options.gpsTags.length, little));
    // Each tag as a BYTE count of 1 with the value inline: enough to be present.
    for (const tag of options.gpsTags) out.push(...u16(tag, little), ...u16(1, little), ...u32(1, little), 0, 0, 0, 0);
    out.push(...u32(0, little));
  }
  return out;
}

const segment = (marker: number, body: number[]) => [0xff, marker, ...u16(body.length + 2, false), ...body];
const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0];

/** A JPEG's headers: SOI, optional APP0 and Exif APP1, a baseline frame header, then the start of the image data. */
function jpeg(width: number, height: number, exif?: number[], frame = 0xc0): Uint8Array {
  const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = exif ? segment(0xe1, [...EXIF, ...exif]) : [];
  const sof = segment(frame, [8, ...u16(height, false), ...u16(width, false), 1, 1, 0x11, 0]);
  const sos = segment(0xda, [1, 1, 0, 0, 0x3f, 0]);
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...sof, ...sos, 0x12, 0x34, 0xff, 0xd9]);
}

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

const chunk = (type: string, data: number[]) => {
  const typed = [...type].map((ch) => ch.charCodeAt(0));
  return [...u32(data.length, false), ...typed, ...data, ...u32(crc32([...typed, ...data]), false)];
};

/** A whole flat-color PNG, with an `eXIf` chunk before the image data if asked. */
function png(width: number, height: number, exif?: number[]): Uint8Array {
  const ihdr = [...u32(width, false), ...u32(height, false), 8, 0, 0, 0, 0];
  const rows = new Uint8Array((width + 1) * height);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', ihdr),
    ...(exif ? chunk('eXIf', exif) : []),
    ...chunk('IDAT', [...deflateSync(rows)]),
    ...chunk('IEND', []),
  ]);
}

// --------------------------------------------------------------------- tests

describe('readPicture: kind and size', () => {
  it('reads a JPEG frame header', () => {
    expect(readPicture(jpeg(640, 480))).toEqual({ kind: 'jpeg', width: 640, height: 480, orientation: 1, location: false });
  });

  it('reads the size from a progressive frame header too', () => {
    expect(readPicture(jpeg(300, 200, undefined, 0xc2))).toMatchObject({ width: 300, height: 200 });
  });

  it('reads a PNG header', () => {
    expect(readPicture(png(40, 30))).toEqual({ kind: 'png', width: 40, height: 30, orientation: 1, location: false });
  });

  it('says nothing of anything else', () => {
    expect(readPicture(new Uint8Array())).toBeNull();
    expect(readPicture(new TextEncoder().encode('GIF89a not a picture'))).toBeNull();
    expect(readPicture(new Uint8Array(4096).map((_, i) => (i * 37) & 0xff))).toBeNull();
  });
});

describe('readPicture: orientation', () => {
  it.each([1, 2, 3, 4])('keeps the size of orientation %i (upright or flipped)', (orientation) => {
    expect(readPicture(jpeg(640, 480, tiff({ orientation })))).toMatchObject({ width: 640, height: 480, orientation });
  });

  it.each([5, 6, 7, 8])('swaps the size of orientation %i (turned a quarter)', (orientation) => {
    expect(readPicture(jpeg(640, 480, tiff({ orientation })))).toMatchObject({ width: 480, height: 640, orientation });
  });

  it('reads either byte order', () => {
    expect(readPicture(jpeg(640, 480, tiff({ little: true, orientation: 6 })))).toMatchObject({ width: 480, height: 640, orientation: 6 });
  });

  it('ignores an orientation out of range', () => {
    expect(readPicture(jpeg(640, 480, tiff({ orientation: 9 })))).toMatchObject({ width: 640, height: 480, orientation: 1 });
  });
});

describe('readPicture: location', () => {
  for (const little of [false, true]) {
    const order = little ? 'little-endian' : 'big-endian';
    it(`finds a latitude or a longitude in a JPEG (${order})`, () => {
      expect(readPicture(jpeg(32, 32, tiff({ little, gpsTags: [0x0001, 0x0002] })))?.location).toBe(true);
      expect(readPicture(jpeg(32, 32, tiff({ little, gpsTags: [0x0004] })))?.location).toBe(true);
    });

    it(`finds one in a PNG's eXIf chunk (${order})`, () => {
      expect(readPicture(png(32, 32, tiff({ little, gpsTags: [0x0002, 0x0004] })))?.location).toBe(true);
    });

    it(`reports none without a GPS position (${order})`, () => {
      expect(readPicture(jpeg(32, 32, tiff({ little, orientation: 1 })))?.location).toBe(false);
      // A GPS directory holding only, say, the version and the altitude is no position.
      expect(readPicture(jpeg(32, 32, tiff({ little, gpsTags: [0x0000, 0x0006] })))?.location).toBe(false);
      expect(readPicture(png(32, 32, tiff({ little, orientation: 1 })))?.location).toBe(false);
    });
  }

  it('reads an eXIf chunk that keeps the "Exif" prefix of a JPEG segment', () => {
    expect(readPicture(png(32, 32, [...EXIF, ...tiff({ gpsTags: [0x0002] })]))?.location).toBe(true);
  });

  it('does not take the letters GPS anywhere in a PNG for a location', () => {
    const text = [...'GPS eXIf'].map((c) => c.charCodeAt(0));
    const bytes = png(32, 32);
    const withText = new Uint8Array([...bytes.subarray(0, 33), ...chunk('tEXt', text), ...bytes.subarray(33)]);
    expect(readPicture(withText)).toMatchObject({ kind: 'png', location: false });
  });
});

describe('readPicture: damaged input', () => {
  it('never throws on any truncation of a JPEG or a PNG', () => {
    for (const whole of [jpeg(640, 480, tiff({ orientation: 6, gpsTags: [0x0002] })), png(40, 30, tiff({ gpsTags: [0x0002] }))]) {
      for (let n = 0; n <= whole.length; n++) expect(() => readPicture(whole.subarray(0, n))).not.toThrow();
    }
  });

  it('gives no size for a JPEG cut before its frame header', () => {
    const whole = jpeg(640, 480);
    expect(readPicture(whole.subarray(0, 24))).toBeNull();
  });

  it('survives Exif offsets and counts that point outside the block', () => {
    const bad = tiff({ orientation: 6, gpsTags: [0x0002] });
    bad.splice(4, 4, 0xff, 0xff, 0xff, 0xf0); // first directory far past the end
    expect(readPicture(jpeg(640, 480, bad))).toMatchObject({ width: 640, height: 480, location: false });
    const many = tiff({ orientation: 6 });
    many.splice(8, 2, 0xff, 0xff); // 65535 entries claimed
    expect(() => readPicture(jpeg(640, 480, many))).not.toThrow();
  });

  it('ends on a segment length of zero and on a run of fill bytes', () => {
    expect(readPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(readPicture(new Uint8Array([0xff, 0xd8, ...new Array(64).fill(0xff)]))).toBeNull();
  });

  it('survives a PNG chunk length past the end', () => {
    const bytes = png(40, 30);
    const broken = new Uint8Array(bytes);
    broken.set([0xff, 0xff, 0xff, 0xff], 33); // the length of the chunk after IHDR
    expect(readPicture(broken)).toMatchObject({ kind: 'png', width: 40, height: 30, location: false });
  });
});

describe('isPictureAddress', () => {
  it('takes the two addresses, written exactly so', () => {
    expect(isPictureAddress('image/markdown.jpg')).toBe(true);
    expect(isPictureAddress('image/markdown.png')).toBe(true);
    for (const other of ['image/etna.jpg', './image/markdown.jpg', 'image/Markdown.jpg', 'image/markdown.jpeg', 'https://example.com/image/markdown.jpg']) {
      expect(isPictureAddress(other), other).toBe(false);
    }
  });
});
