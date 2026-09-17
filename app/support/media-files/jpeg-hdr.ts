import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { exiftoolPath } from 'exiftool-vendored';

import { runImageMagick } from '../image-magick';
import { spawnAsync } from '../spawn-async';

import { createAppleJpegHdrPreview } from './jpeg-apple-hdr';
import {
  assembleMpfJpeg,
  createCleanBaseJpeg,
  extractIccProfile,
  findMetadataInsertOffset,
  identifySize,
  isJpeg,
  jpegSegment,
  orientationArgs,
  orientSize,
  readOrientation,
  scaledSize,
} from './jpeg-hdr-utils';

type CreateJpegHdrPreviewOptions = {
  sourcePath: string;
  targetPath: string;
  width: number;
  height: number;
  quality?: number;
};

export type JpegHdrPreviewInfo = {
  numberOfImages?: number;
  mpImage2Length?: number;
  directoryItemLength?: number;
  gainMapImageLength?: number;
  iccProfileDescription?: string;
  validate?: string;
  warnings: string[];
};

/**
 * Creates a JPEG Ultra HDR preview from a JPEG source with an embedded gain map.
 *
 * Returns false when the source does not expose a JPEG gain map. Throws on
 * unexpected processing or validation failures.
 */
export async function createJpegHdrPreview({
  sourcePath,
  targetPath,
  width,
  height,
  quality = 90,
}: CreateJpegHdrPreviewOptions): Promise<boolean> {
  const appleResult = await createAppleJpegHdrPreview({
    sourcePath,
    targetPath,
    width,
    height,
    quality,
  });

  if (appleResult !== null) {
    return appleResult;
  }

  const workDir = await mkdtemp(join(dirname(targetPath), '.hdr-'));

  try {
    const gainMapPath = join(workDir, 'gain-map.jpg');
    const resizedGainMapPath = join(workDir, 'gain-map-resized.jpg');
    const iccPath = join(workDir, 'profile.icc');
    const basePath = join(workDir, 'base.jpg');

    const gainMap = await extractGainMap(sourcePath);

    if (!gainMap) {
      return false;
    }

    await writeFile(gainMapPath, gainMap);

    const [sourceSize, gainMapSize, orientation] = await Promise.all([
      identifySize(sourcePath),
      identifySize(gainMapPath),
      readOrientation(sourcePath),
    ]);
    // The gain map must keep the same relative scale as in the original file.
    const gainMapTarget = scaledSize(
      { width, height },
      orientSize(sourceSize, orientation),
      orientSize(gainMapSize, orientation),
    );

    const hasIcc = await extractIccProfile(sourcePath, iccPath);

    await createCleanBaseJpeg(
      sourcePath,
      basePath,
      width,
      height,
      quality,
      hasIcc ? iccPath : null,
    );
    await resizeGainMap(gainMapPath, resizedGainMapPath, gainMapTarget, orientation);

    const resizedGainMapSize = await stat(resizedGainMapPath).then((s) => s.size);
    const baseWithXmpPath = join(workDir, 'base-with-xmp.jpg');
    await insertApp1Xmp(basePath, baseWithXmpPath, resizedGainMapSize);
    await assembleMpfJpeg(baseWithXmpPath, resizedGainMapPath, targetPath);

    // The generated file must be self-consistent before it enters previews storage.
    const info = await inspectJpegHdrPreview(targetPath);
    const { validate, numberOfImages, mpImage2Length, directoryItemLength, gainMapImageLength } =
      info;

    return (
      validate === 'OK' &&
      numberOfImages === 2 &&
      mpImage2Length === resizedGainMapSize &&
      directoryItemLength === resizedGainMapSize &&
      gainMapImageLength === resizedGainMapSize
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * Reads the pieces that prove a generated JPEG is usable as an Ultra HDR preview.
 */
export async function inspectJpegHdrPreview(filePath: string): Promise<JpegHdrPreviewInfo> {
  const [tags, validation] = await Promise.all([
    exiftool([
      '-G1',
      '-a',
      '-s',
      '-MPF:all',
      '-MPImage2:all',
      '-XMP-GContainer:all',
      '-ICC_Profile:ProfileDescription',
      '-Google:GainMapImage',
      filePath,
    ]),
    exiftool(['-G1', '-a', '-s', '-warning', '-validate', filePath]),
  ]);

  return {
    numberOfImages: intTag(tags, 'NumberOfImages'),
    mpImage2Length: intTagInGroup(tags, 'MPImage2', 'MPImageLength'),
    directoryItemLength: intTag(tags, 'DirectoryItemLength') ?? intTag(tags, 'DirectoryLength'),
    gainMapImageLength: binaryLength(tags, 'GainMapImage') ?? binaryLength(tags, 'MPImage2'),
    iccProfileDescription: stringTag(tags, 'ProfileDescription'),
    validate: stringTag(validation, 'Validate'),
    warnings: tagValues(validation, 'Warning'),
  };
}

/**
 * Extracts the JPEG gain map payload from known ExifTool tag names.
 */
async function extractGainMap(sourcePath: string): Promise<Buffer | null> {
  const exe = await exiftoolPath();
  const gainMap = await extractGainMapTag(exe, sourcePath, 'GainMapImage');

  if (gainMap) {
    return gainMap;
  }

  return extractGainMapTag(exe, sourcePath, 'MPImage2');
}

/**
 * Extracts one binary ExifTool tag and accepts only JPEG payloads.
 */
async function extractGainMapTag(
  exe: string,
  sourcePath: string,
  tag: string,
): Promise<Buffer | null> {
  try {
    const { stdout } = await spawnAsync(exe, ['-b', `-${tag}`, sourcePath], { binary: true });
    return isJpeg(stdout) ? stdout : null;
  } catch {
    return null;
  }
}

/**
 * Resizes the extracted gain map to match the primary preview scale.
 */
async function resizeGainMap(
  sourcePath: string,
  targetPath: string,
  targetSize: { width: number; height: number },
  orientation: number,
): Promise<void> {
  await runImageMagick('convert', [
    sourcePath,
    ...orientationArgs(orientation),
    ['-resize', `${targetSize.width}!x${targetSize.height}!`],
    ['-quality', '90'],
    targetPath,
  ]);
}

/**
 * Inserts APP1 XMP metadata into the primary JPEG.
 */
async function insertApp1Xmp(
  basePath: string,
  targetPath: string,
  gainMapLength: number,
): Promise<void> {
  const base = await readFile(basePath);
  const xmp = buildPrimaryXmp(gainMapLength);
  const insertOffset = findMetadataInsertOffset(base);
  await writeFile(
    targetPath,
    Buffer.concat([base.subarray(0, insertOffset), xmp, base.subarray(insertOffset)]),
  );
}

/**
 * Builds the APP1 XMP segment that describes the appended gain map.
 */
function buildPrimaryXmp(gainMapLength: number): Buffer {
  const xml =
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `<rdf:Description rdf:about="" xmlns:GContainer="http://ns.google.com/photos/1.0/container/" ` +
    `xmlns:GItem="http://ns.google.com/photos/1.0/container/item/">\n` +
    `<GContainer:Directory><rdf:Seq>` +
    `<rdf:li rdf:parseType="Resource"><GContainer:Item rdf:parseType="Resource">` +
    `<GItem:Mime>image/jpeg</GItem:Mime><GItem:Semantic>Primary</GItem:Semantic>` +
    `</GContainer:Item></rdf:li>` +
    `<rdf:li rdf:parseType="Resource"><GContainer:Item rdf:parseType="Resource">` +
    `<GItem:Length>${gainMapLength}</GItem:Length><GItem:Mime>image/jpeg</GItem:Mime>` +
    `<GItem:Semantic>GainMap</GItem:Semantic></GContainer:Item></rdf:li>` +
    `</rdf:Seq></GContainer:Directory>\n</rdf:Description>\n` +
    `<rdf:Description rdf:about="" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/">` +
    `<hdrgm:Version>1.0</hdrgm:Version>` +
    `</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
  const payload = Buffer.concat([
    // Standard APP1 XMP namespace prefix.
    Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'),
    Buffer.from(xml, 'utf8'),
  ]);

  return jpegSegment(0xe1, payload);
}

/**
 * Runs ExifTool and returns text output.
 */
async function exiftool(args: string[]): Promise<string> {
  const exe = await exiftoolPath();
  const { stdout } = await spawnAsync(exe, args);
  return stdout;
}

/**
 * Reads the first integer value from an ExifTool tag.
 */
function intTag(output: string, tag: string): number | undefined {
  const value = stringTag(output, tag);
  return value ? firstInteger(value) : undefined;
}

/**
 * Reads the first integer value from a tag in a specific ExifTool group.
 */
function intTagInGroup(output: string, group: string, tag: string): number | undefined {
  const value = stringTagInGroup(output, group, tag);
  return value ? firstInteger(value) : undefined;
}

/**
 * Reads the byte length from ExifTool binary tag output.
 */
function binaryLength(output: string, tag: string): number | undefined {
  const value = stringTag(output, tag);
  return value ? firstInteger(value) : undefined;
}

/**
 * Extracts the first decimal integer from a string.
 */
function firstInteger(value: string): number | undefined {
  const match = value.match(/\d+/);
  return match ? parseInt(match[0], 10) : undefined;
}

/**
 * Reads the first ExifTool tag value regardless of group.
 */
function stringTag(output: string, tag: string): string | undefined {
  return tagValues(output, tag)[0];
}

/**
 * Reads the first ExifTool tag value from the given group.
 */
function stringTagInGroup(output: string, group: string, tag: string): string | undefined {
  const re = new RegExp(`^\\[${group}\\]\\s+${tag}\\s+:\\s+(.+)$`, 'gm');
  return [...output.matchAll(re)].map((m) => m[1])[0];
}

/**
 * Reads all ExifTool tag values with the given tag name.
 */
function tagValues(output: string, tag: string): string[] {
  const re = new RegExp(`^\\[[^\\]]+\\]\\s+${tag}\\s+:\\s+(.+)$`, 'gm');
  return [...output.matchAll(re)].map((m) => m[1]);
}
