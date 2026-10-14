import { Buffer } from "node:buffer";

import { PHOTO_LONG_EDGE_PX } from "@/lib/nu-news/issue";

export const MAX_MCP_PHOTO_MB = 5;

const maxPhotoBytes = MAX_MCP_PHOTO_MB * 1024 * 1024;
const prepareAgain = `Turn the photo upright, remove all its metadata (EXIF, XMP, IPTC, comments), make it at most ${PHOTO_LONG_EDGE_PX} pixels on the long side, save it as a JPEG, and upload it again.`;

// Marker codes from ITU-T T.81 (JPEG), Table B.1.
const START_OF_SCAN = 0xda;
const HUFFMAN_TABLES = 0xc4;
const JPEG_EXTENSION = 0xc8;
const ARITHMETIC_TABLES = 0xcc;
const JFIF = 0xe0;
const ICC_PROFILE = 0xe2;
const ADOBE_COLOR = 0xee;
const LAST_APP = 0xef;
const COMMENT = 0xfe;

const isFrameHeader = (marker: number) => marker >= 0xc0 && marker <= 0xcf
  && marker !== HUFFMAN_TABLES && marker !== JPEG_EXTENSION && marker !== ARITHMETIC_TABLES;
const isMetadata = (marker: number) => marker === COMMENT
  || (marker > JFIF && marker <= LAST_APP && marker !== ICC_PROFILE && marker !== ADOBE_COLOR);

function* headerSegments(bytes: Buffer) {
  for (let offset = 2; offset + 4 <= bytes.length && bytes[offset] === 0xff;) {
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    yield { marker, body: bytes.subarray(offset + 4, offset + 2 + length) };
    if (marker === START_OF_SCAN) return;
    offset += 2 + length;
  }
}

export function checkNuNewsPhoto(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxPhotoBytes) throw new Error(`The photo must be a non-empty JPEG up to ${MAX_MCP_PHOTO_MB} MB.`);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error("The photo data is not a JPEG.");

  const segments = [...headerSegments(bytes)];
  if (segments.some(({ marker }) => isMetadata(marker))) throw new Error(`The photo has metadata. ${prepareAgain}`);
  const frame = segments.find(({ marker }) => isFrameHeader(marker));
  if (!frame) throw new Error("The photo could not be read as a JPEG.");
  const height = frame.body.readUInt16BE(1);
  const width = frame.body.readUInt16BE(3);
  if (Math.max(width, height) > PHOTO_LONG_EDGE_PX) throw new Error(`The photo is ${width} × ${height} pixels. ${prepareAgain}`);
}
