// What a recipe's picture file is (SPEC §4.3), read from its own bytes: its kind, its size in
// pixels as shown, and whether it carries the place it was taken.
//
// Headers only: no image is decoded, and the location's coordinates are never read. Pure: no
// file system, so it runs the same in a browser. It never throws on malformed or truncated
// input; whatever cannot be read is reported as absent.

/** The two addresses a picture line may give (SPEC §4.3), written exactly so. */
export const PICTURE_ADDRESSES = ['image/markdown.jpg', 'image/markdown.png'] as const;

/** True for an image address that makes a picture line. */
export function isPictureAddress(address: string): boolean {
  return (PICTURE_ADDRESSES as readonly string[]).includes(address);
}

export type PictureKind = 'jpeg' | 'png';

export interface PictureInfo {
  kind: PictureKind;
  /** Width and height in pixels as shown: a JPEG whose Exif orientation turns it a quarter has them swapped. */
  width: number;
  height: number;
  /** The Exif orientation (1–8) of a JPEG, 1 when it has none; always 1 for a PNG. */
  orientation: number;
  /** True when Exif data holds a GPS directory with a latitude or a longitude. */
  location: boolean;
}

/** Read a JPEG or PNG's header. Null for anything else, or a file too short to give its size. */
export function readPicture(bytes: Uint8Array): PictureInfo | null {
  try {
    return readJpeg(bytes) ?? readPng(bytes);
  } catch {
    return null;
  }
}

/** The media type of each kind, as a `data:` address names it. */
const MEDIA_TYPES: Readonly<Record<PictureKind, string>> = { jpeg: 'image/jpeg', png: 'image/png' };

/**
 * The picture as a `data:image/jpeg;base64,…` or `data:image/png;base64,…` address, the kind
 * read from its bytes (readPicture). Null for bytes that are neither a JPEG nor a PNG.
 */
export function pictureDataAddress(bytes: Uint8Array): string | null {
  const info = readPicture(bytes);
  return info === null ? null : `data:${MEDIA_TYPES[info.kind]};base64,${base64(bytes)}`;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 with padding, written here because Node's Buffer is not in a browser. */
function base64(b: Uint8Array): string {
  const out: string[] = [];
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out.push(BASE64[n >> 18] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + BASE64[n & 63]);
  }
  if (i + 1 === b.length) {
    const n = b[i] << 16;
    out.push(`${BASE64[n >> 18]}${BASE64[(n >> 12) & 63]}==`);
  } else if (i + 2 === b.length) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    out.push(`${BASE64[n >> 18]}${BASE64[(n >> 12) & 63]}${BASE64[(n >> 6) & 63]}=`);
  }
  return out.join('');
}

// ---------------------------------------------------------------------- bytes

function u16(b: Uint8Array, at: number, little: boolean): number {
  return little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1];
}

function u32(b: Uint8Array, at: number, little: boolean): number {
  return little
    ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0
    : ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
}

function startsWith(b: Uint8Array, at: number, sig: readonly number[]): boolean {
  if (at + sig.length > b.length) return false;
  return sig.every((v, i) => b[at + i] === v);
}

// ----------------------------------------------------------------------- Exif

interface ExifFacts {
  orientation: number;
  location: boolean;
}

const NO_EXIF: ExifFacts = { orientation: 1, location: false };

const TAG_ORIENTATION = 0x0112;
const TAG_GPS = 0x8825;
const TAG_LATITUDE = 0x0002;
const TAG_LONGITUDE = 0x0004;

/**
 * The orientation and the presence of a location in an Exif block that starts at its TIFF
 * header (`II` or `MM`, then 42). Only the first directory and its GPS directory are read.
 */
function readExif(block: Uint8Array): ExifFacts {
  if (block.length < 8) return NO_EXIF;
  const little = block[0] === 0x49 && block[1] === 0x49;
  const big = block[0] === 0x4d && block[1] === 0x4d;
  if (!little && !big) return NO_EXIF;
  if (u16(block, 2, little) !== 42) return NO_EXIF;

  /** The entries of the directory at `offset` that lie wholly inside the block. */
  const entries = (offset: number): { tag: number; at: number }[] => {
    if (offset < 8 || offset + 2 > block.length) return [];
    const count = u16(block, offset, little);
    const out: { tag: number; at: number }[] = [];
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + 12 * i;
      if (at + 12 > block.length) break;
      out.push({ tag: u16(block, at, little), at });
    }
    return out;
  };

  let orientation = 1;
  let location = false;
  for (const { tag, at } of entries(u32(block, 4, little))) {
    if (tag === TAG_ORIENTATION) {
      const value = u16(block, at + 8, little);
      if (value >= 1 && value <= 8) orientation = value;
    } else if (tag === TAG_GPS) {
      const gps = entries(u32(block, at + 8, little));
      location = gps.some((e) => e.tag === TAG_LATITUDE || e.tag === TAG_LONGITUDE);
    }
  }
  return { orientation, location };
}

// ----------------------------------------------------------------------- JPEG

const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

/** True for a start-of-frame marker, the segment that gives the size: C0–CF but DHT, JPG and DAC. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * A JPEG: walk the segments from the start up to the image data, taking the size from the
 * frame header and the orientation and location from an Exif APP1 segment.
 */
function readJpeg(b: Uint8Array): PictureInfo | null {
  if (!startsWith(b, 0, [0xff, 0xd8])) return null;
  let at = 2;
  let size: { width: number; height: number } | null = null;
  let exif: ExifFacts | null = null;
  // Every pass moves `at` forward by at least two bytes, so the walk ends.
  while (at + 4 <= b.length) {
    if (b[at] !== 0xff) break;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // a fill byte before the marker
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or the image data
    const length = u16(b, at + 2, false);
    if (length < 2) break;
    const body = b.subarray(at + 4, Math.min(b.length, at + 2 + length));
    // The orientation is the first Exif segment's; a location in any of them counts.
    if (marker === 0xe1 && startsWith(body, 0, EXIF_ID)) {
      const found = readExif(body.subarray(EXIF_ID.length));
      exif = exif === null ? found : { orientation: exif.orientation, location: exif.location || found.location };
    }
    if (isStartOfFrame(marker) && size === null && body.length >= 5) {
      size = { height: u16(body, 1, false), width: u16(body, 3, false) };
    }
    at += 2 + length;
  }
  if (size === null) return null;
  const { orientation, location } = exif ?? NO_EXIF;
  const turned = orientation >= 5; // stored on its side: shown turned a quarter
  return {
    kind: 'jpeg',
    width: turned ? size.height : size.width,
    height: turned ? size.width : size.height,
    orientation,
    location,
  };
}

// ------------------------------------------------------------------------ PNG

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];
const EXIF_CHUNK = [0x65, 0x58, 0x49, 0x66]; // "eXIf"
const IEND = [0x49, 0x45, 0x4e, 0x44];

/** A PNG: the size from its header chunk, and a location from an `eXIf` chunk read as Exif. */
function readPng(b: Uint8Array): PictureInfo | null {
  if (!startsWith(b, 0, PNG_SIGNATURE) || !startsWith(b, 12, IHDR) || b.length < 24) return null;
  const width = u32(b, 16, false);
  const height = u32(b, 20, false);
  let location = false;
  // Every pass moves `at` forward by at least twelve bytes, so the walk ends.
  for (let at = 8; at + 8 <= b.length; ) {
    const length = u32(b, at, false);
    if (startsWith(b, at + 4, IEND)) break;
    if (startsWith(b, at + 4, EXIF_CHUNK)) {
      let data = b.subarray(at + 8, Math.min(b.length, at + 8 + length));
      // Some writers keep the JPEG segment's "Exif\0\0" in front of the TIFF header.
      if (startsWith(data, 0, EXIF_ID)) data = data.subarray(EXIF_ID.length);
      location = readExif(data).location;
      break;
    }
    at += 12 + length;
  }
  return { kind: 'png', width, height, orientation: 1, location };
}
