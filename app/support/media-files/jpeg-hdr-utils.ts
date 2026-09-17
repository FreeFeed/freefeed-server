import { readFile, writeFile } from 'fs/promises';

import { exiftoolPath } from 'exiftool-vendored';

import { runImageMagick } from '../image-magick';
import { spawnAsync } from '../spawn-async';

export type ImageSize = { width: number; height: number };

export type JpegSegment = {
  offset: number;
  data: Buffer;
};

const MPF_SEGMENT_LENGTH = 90;
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_MARKER_PREFIX = 0xff;

/**
 * Checks for the JPEG start-of-image marker.
 */
export function isJpeg(data: Buffer): boolean {
  return data.length >= JPEG_SOI.length && data.subarray(0, JPEG_SOI.length).equals(JPEG_SOI);
}

/**
 * Extracts the source ICC profile into a standalone profile file.
 */
export async function extractIccProfile(sourcePath: string, targetPath: string): Promise<boolean> {
  try {
    await runImageMagick('convert', [sourcePath, targetPath]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates the primary JPEG preview without EXIF/GPS/private metadata.
 */
export async function createCleanBaseJpeg(
  sourcePath: string,
  targetPath: string,
  width: number,
  height: number,
  quality: number,
  iccPath: string | null,
): Promise<void> {
  await runImageMagick('convert', [
    sourcePath,
    '-auto-orient',
    ['-resize', `${width}!x${height}!`],
    // Drop all profiles first, then put back only the original ICC profile.
    '+profile',
    '*',
    ...(iccPath ? ['-profile', iccPath] : []),
    ['-quality', quality.toString()],
    targetPath,
  ]);
}

/**
 * Returns ImageMagick-reported pixel dimensions.
 */
export async function identifySize(filePath: string): Promise<ImageSize> {
  const { stdout } = await runImageMagick('identify', ['-format', '%w %h', filePath]);
  const match = stdout.trim().match(/^(\d+)\s+(\d+)$/);

  if (!match) {
    throw new Error(`Cannot identify image size: ${filePath}`);
  }

  const width = parseInt(match[1], 10);
  const height = parseInt(match[2], 10);

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image size ${width}x${height}: ${filePath}`);
  }

  return { width, height };
}

/**
 * Reads the numeric EXIF orientation, defaulting to the normal orientation.
 */
export async function readOrientation(filePath: string): Promise<number> {
  const exe = await exiftoolPath();
  const { stdout } = await spawnAsync(exe, ['-n', '-s3', '-Orientation', filePath]);
  const orientation = parseInt(stdout.trim(), 10);
  return orientation >= 1 && orientation <= 8 ? orientation : 1;
}

/**
 * Returns ImageMagick operations equivalent to an EXIF orientation.
 */
export function orientationArgs(orientation: number): string[] {
  switch (orientation) {
    case 2:
      return ['-flop'];
    case 3:
      return ['-rotate', '180'];
    case 4:
      return ['-flip'];
    case 5:
      return ['-transpose'];
    case 6:
      return ['-rotate', '90'];
    case 7:
      return ['-transverse'];
    case 8:
      return ['-rotate', '270'];
    default:
      return [];
  }
}

/**
 * Swaps dimensions for orientations that rotate the image by 90 degrees.
 */
export function orientSize(size: ImageSize, orientation: number): ImageSize {
  return orientation >= 5 ? { width: size.height, height: size.width } : size;
}

/**
 * Scales a subject size by the same ratio as source -> target.
 */
export function scaledSize(target: ImageSize, source: ImageSize, subject: ImageSize): ImageSize {
  return {
    width: Math.max(1, Math.round((target.width * subject.width) / source.width)),
    height: Math.max(1, Math.round((target.height * subject.height) / source.height)),
  };
}

/**
 * Reads a JPEG file, inserts an MPF index, and appends its gain map JPEG.
 */
export async function assembleMpfJpeg(
  basePath: string,
  gainMapPath: string,
  targetPath: string,
): Promise<void> {
  const [base, gainMap] = await Promise.all([readFile(basePath), readFile(gainMapPath)]);
  await writeFile(targetPath, assembleMpfJpegBuffers(base, gainMap));
}

/**
 * Inserts an MPF index into a primary JPEG and appends its gain map JPEG.
 */
function assembleMpfJpegBuffers(base: Buffer, gainMap: Buffer): Buffer {
  const insertOffset = findMetadataInsertOffset(base);
  // MPF stores the final primary image size, including the MPF segment itself.
  const primaryLength = base.length + MPF_SEGMENT_LENGTH;
  const mpf = buildMpfSegment({
    mpfOffset: insertOffset,
    primaryLength,
    gainMapLength: gainMap.length,
  });

  return Buffer.concat([base.subarray(0, insertOffset), mpf, base.subarray(insertOffset), gainMap]);
}

/**
 * Finds an APP segment with the given marker and payload prefix.
 */
export function findJpegSegment(
  jpeg: Buffer,
  marker: number,
  payloadPrefix: Buffer,
): JpegSegment | null {
  for (const segment of jpegSegments(jpeg)) {
    if (
      segment.marker === marker &&
      segment.data.subarray(4, 4 + payloadPrefix.length).equals(payloadPrefix)
    ) {
      return { offset: segment.offset, data: segment.data };
    }
  }

  return null;
}

/**
 * Wraps payload bytes into a JPEG APP segment.
 */
export function jpegSegment(marker: number, payload: Buffer): Buffer {
  const segment = Buffer.alloc(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = marker;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return segment;
}

/**
 * Finds the offset before JPEG image data/table segments where metadata belongs.
 */
export function findMetadataInsertOffset(jpeg: Buffer): number {
  const segments = jpegSegments(jpeg);
  const lastSegment = segments.at(-1);

  if (!lastSegment?.terminal) {
    throw new Error('Cannot find JPEG metadata insert offset');
  }

  return lastSegment.offset;
}

/**
 * Builds the APP2 MPF segment with entries for primary image and gain map.
 */
function buildMpfSegment({
  mpfOffset,
  primaryLength,
  gainMapLength,
}: {
  mpfOffset: number;
  primaryLength: number;
  gainMapLength: number;
}): Buffer {
  const data = Buffer.alloc(86);
  data.write('MPF\0', 0, 'latin1');

  // MPF contains a TIFF-like little-endian directory after the "MPF\0" header.
  const tiff = 4;
  data.write('II', tiff, 'latin1');
  data.writeUInt16LE(42, tiff + 2);
  data.writeUInt32LE(8, tiff + 4);

  const ifd = tiff + 8;
  data.writeUInt16LE(3, ifd);
  let entry = ifd + 2;

  // MPFVersion, NumberOfImages, and MPEntry array.
  writeIfdEntry(data, entry, 0xb000, 7, 4, Buffer.from('0100', 'latin1'));
  entry += 12;
  writeIfdEntry(data, entry, 0xb001, 4, 1, 2);
  entry += 12;
  writeIfdEntry(data, entry, 0xb002, 7, 32, 50);
  entry += 12;
  data.writeUInt32LE(0, entry);

  const mpEntries = tiff + 50;
  writeMpEntry(data, mpEntries, 0x00030000, primaryLength, 0);
  writeMpEntry(data, mpEntries + 16, 0, gainMapLength, mpImageOffset(primaryLength, mpfOffset));

  return jpegSegment(0xe2, data);
}

/**
 * Returns the gain map MPF offset relative to the TIFF header start.
 */
function mpImageOffset(primaryLength: number, mpfOffset: number): number {
  const offset = primaryLength - (mpfOffset + 8);

  if (offset < 0) {
    throw new Error('Invalid MPF image offset');
  }

  return offset;
}

/**
 * Writes one 12-byte TIFF IFD entry into the MPF payload.
 */
function writeIfdEntry(
  data: Buffer,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number | Buffer,
): void {
  data.writeUInt16LE(tag, offset);
  data.writeUInt16LE(type, offset + 2);
  data.writeUInt32LE(count, offset + 4);

  if (Buffer.isBuffer(value)) {
    value.copy(data, offset + 8);
  } else {
    data.writeUInt32LE(value, offset + 8);
  }
}

/**
 * Writes one 16-byte MP image entry.
 */
function writeMpEntry(
  data: Buffer,
  offset: number,
  attributes: number,
  size: number,
  imageOffset: number,
): void {
  data.writeUInt32LE(attributes, offset);
  data.writeUInt32LE(size, offset + 4);
  data.writeUInt32LE(imageOffset, offset + 8);
  data.writeUInt16LE(0, offset + 12);
  data.writeUInt16LE(0, offset + 14);
}

/**
 * Parses JPEG metadata segments up to the image tables or scan data.
 */
function jpegSegments(jpeg: Buffer): {
  marker: number;
  offset: number;
  data: Buffer;
  terminal: boolean;
}[] {
  if (!isJpeg(jpeg)) {
    throw new Error('Not a JPEG file');
  }

  const segments = [];
  let offset = 2;

  while (offset < jpeg.length) {
    if (offset + 4 > jpeg.length) {
      throw new Error(`Truncated JPEG marker at offset ${offset}`);
    }

    if (jpeg[offset] !== JPEG_MARKER_PREFIX) {
      throw new Error(`Invalid JPEG marker at offset ${offset}`);
    }

    const marker = jpeg[offset + 1];
    const terminal = [0xda, 0xdb, 0xc0, 0xc2, 0xc4, 0xd9].includes(marker);

    if (terminal) {
      segments.push({ marker, offset, data: Buffer.alloc(0), terminal });
      return segments;
    }

    const segmentLength = 2 + jpeg.readUInt16BE(offset + 2);

    if (offset + segmentLength > jpeg.length) {
      throw new Error(`Truncated JPEG segment at offset ${offset}`);
    }

    segments.push({
      marker,
      offset,
      data: jpeg.subarray(offset, offset + segmentLength),
      terminal,
    });
    offset += segmentLength;
  }

  return segments;
}
