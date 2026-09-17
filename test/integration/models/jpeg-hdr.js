import { copyFile, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { describe, it } from 'mocha';
import expect from 'unexpected';
import { exiftoolPath } from 'exiftool-vendored';

import { nodeDirname } from '../../../app/support/node-dirname';
import { runImageMagick } from '../../../app/support/image-magick';
import { spawnAsync } from '../../../app/support/spawn-async';
import { processMediaFile } from '../../../app/support/media-files/process';
import {
  createJpegHdrPreview,
  inspectJpegHdrPreview,
} from '../../../app/support/media-files/jpeg-hdr';

const __dirname = nodeDirname(import.meta.url);

describe('JPEG HDR previews', () => {
  const sourcePath = join(
    __dirname,
    '../../fixtures/media-files/Ultra_HDR_Samples_Originals_01.jpg',
  );
  const appleFixtures = [
    {
      name: 'Apple HDR 0.2 image with AROT curves',
      sourcePath: join(__dirname, '../../fixtures/media-files/apple_gainmap_new_arot.jpg'),
      width: 384,
      height: 512,
      gainMapWidth: 192,
      gainMapHeight: 256,
      version: '0.2.0.0',
      isoSegments: 0,
      curveSizes: [188, 188],
    },
    {
      name: 'Apple HDR 0.1 image with AROT curves',
      sourcePath: join(__dirname, '../../fixtures/media-files/apple_gainmap_old_arot.jpg'),
      width: 384,
      height: 512,
      gainMapWidth: 192,
      gainMapHeight: 256,
      version: '0.1.0.0',
      isoSegments: 0,
      curveSizes: [188, 188],
    },
    {
      name: 'ISO Apple HDR image with only a primary AROT curve',
      sourcePath: join(
        __dirname,
        '../../fixtures/media-files/apple_gainmap_new_iso_primary_arot.jpg',
      ),
      width: 384,
      height: 512,
      gainMapWidth: 192,
      gainMapHeight: 256,
      version: '0.2.0.0',
      isoSegments: 2,
      curveSizes: [188],
    },
  ];

  it('should create a valid clean Ultra HDR JPEG preview', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'freefeed-hdr-'));

    try {
      const targetPath = join(workDir, 'preview.jpg');
      const created = await createJpegHdrPreview({
        sourcePath,
        targetPath,
        width: 1020,
        height: 768,
        quality: 95,
      });

      expect(created, 'to be true');

      const info = await inspectJpegHdrPreview(targetPath);
      expect(info, 'to satisfy', {
        numberOfImages: 2,
        mpImage2Length: expect.it('to be greater than', 0),
        directoryItemLength: expect.it('to be greater than', 0),
        gainMapImageLength: expect.it('to be greater than', 0),
        iccProfileDescription: 'Display P3',
        validate: 'OK',
        warnings: [],
      });
      expect(info.mpImage2Length, 'to be', info.directoryItemLength);
      expect(info.gainMapImageLength, 'to be', info.directoryItemLength);

      const { stdout: dimensions } = await runImageMagick('identify', [
        '-format',
        '%w %h',
        targetPath,
      ]);
      expect(dimensions, 'to be', '1020 768');

      const { stdout: metadata } = await spawnAsync(await exiftoolPath(), [
        '-G1',
        '-a',
        '-s',
        '-GPS:all',
        '-EXIF:all',
        targetPath,
      ]);
      expect(metadata, 'not to contain', '[GPS]');
      expect(metadata, 'not to contain', '[ExifIFD]');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('should create HDR previews during image media processing', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'freefeed-hdr-process-'));

    try {
      const localPath = join(workDir, 'ultra-hdr.jpg');
      await copyFile(sourcePath, localPath);

      const result = await processMediaFile(localPath, 'ultra-hdr.jpg');
      const { image, imageHDR } = result.previews;

      expect(imageHDR, 'to be defined');

      for (const [variant, preview] of Object.entries(image)) {
        const hdrVariant = `${variant}-hdr`;
        expect(imageHDR, 'to have key', hdrVariant);
        expect(imageHDR[hdrVariant], 'to equal', { ...preview, ext: 'jpg' });
        expect(result.files, 'to have key', hdrVariant);
      }

      const [[maxVariant]] = Object.entries(imageHDR).sort((a, b) => b[1].w - a[1].w);
      const info = await inspectJpegHdrPreview(result.files[maxVariant].path);
      expect(info, 'to satisfy', {
        numberOfImages: 2,
        validate: 'OK',
        warnings: [],
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('should apply the primary EXIF orientation to the gain map', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'freefeed-hdr-orientation-'));

    try {
      const orientedSourcePath = join(workDir, 'source.jpg');
      const sourceGainMapPath = join(workDir, 'source-gain-map.jpg');
      const expectedGainMapPath = join(workDir, 'expected-gain-map.jpg');
      const actualGainMapPath = join(workDir, 'actual-gain-map.jpg');
      const targetPath = join(workDir, 'preview.jpg');
      const exe = await exiftoolPath();

      await copyFile(sourcePath, orientedSourcePath);
      await spawnAsync(exe, ['-overwrite_original', '-Orientation#=6', orientedSourcePath]);

      expect(
        await createJpegHdrPreview({
          sourcePath: orientedSourcePath,
          targetPath,
          width: 768,
          height: 1020,
          quality: 90,
        }),
        'to be true',
      );

      const [{ stdout: sourceGainMap }, { stdout: actualGainMap }] = await Promise.all([
        spawnAsync(exe, ['-b', '-GainMapImage', orientedSourcePath], { binary: true }),
        spawnAsync(exe, ['-b', '-MPImage2', targetPath], { binary: true }),
      ]);
      await Promise.all([
        writeFile(sourceGainMapPath, sourceGainMap),
        writeFile(actualGainMapPath, actualGainMap),
      ]);
      await runImageMagick('convert', [
        sourceGainMapPath,
        '-rotate',
        '90',
        '-resize',
        '192!x255!',
        '-quality',
        '90',
        expectedGainMapPath,
      ]);

      const [{ stdout: expectedPixels }, { stdout: actualPixels }] = await Promise.all([
        runImageMagick('convert', [expectedGainMapPath, 'rgb:-'], { binary: true }),
        runImageMagick('convert', [actualGainMapPath, 'rgb:-'], { binary: true }),
      ]);
      expect(actualPixels, 'to equal', expectedPixels);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  for (const fixture of appleFixtures) {
    it(`should create a clean ${fixture.name} preview`, async () => {
      const workDir = await mkdtemp(join(tmpdir(), 'freefeed-apple-hdr-'));

      try {
        const targetPath = join(workDir, 'preview.jpg');
        const created = await createJpegHdrPreview({
          sourcePath: fixture.sourcePath,
          targetPath,
          width: fixture.width,
          height: fixture.height,
          quality: 90,
        });

        expect(created, 'to be true');
        expect(await inspectJpegHdrPreview(targetPath), 'to satisfy', {
          numberOfImages: 2,
          mpImage2Length: expect.it('to be greater than', 0),
          gainMapImageLength: expect.it('to be greater than', 0),
          iccProfileDescription: 'Display P3',
          validate: 'OK',
          warnings: [],
        });

        const { stdout: metadata } = await spawnAsync(await exiftoolPath(), [
          '-G3:1',
          '-a',
          '-s',
          '-ee3',
          '-ImageWidth',
          '-ImageHeight',
          '-HDRGainCurveSize',
          '-HDRGainMapVersion',
          '-UniformResourceName',
          '-Make',
          '-Model',
          '-MakerNote:all',
          '-XMP-hdrgm:all',
          '-XMP-GContainer:all',
          targetPath,
        ]);

        expect(numericTagValues(metadata, 'ImageWidth'), 'to equal', [
          fixture.width,
          fixture.gainMapWidth,
        ]);
        expect(numericTagValues(metadata, 'ImageHeight'), 'to equal', [
          fixture.height,
          fixture.gainMapHeight,
        ]);
        expect(numericTagValues(metadata, 'HDRGainCurveSize'), 'to equal', fixture.curveSizes);
        expect(tagValues(metadata, 'HDRGainMapVersion'), 'to equal', [fixture.version]);
        expect(tagValues(metadata, 'UniformResourceName'), 'to have length', fixture.isoSegments);
        expect(metadata, 'not to contain', '[Apple]');
        expect(metadata, 'not to contain', '[IFD0]');
        expect(metadata, 'not to contain', '[XMP-hdrgm]');
        expect(metadata, 'not to contain', '[XMP-GContainer]');
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });
  }
});

function numericTagValues(output, tag) {
  return tagValues(output, tag).map((value) => parseInt(value, 10));
}

function tagValues(output, tag) {
  const re = new RegExp(`^\\[[^\\]]+\\]\\s+${tag}\\s+:\\s+(.+)$`, 'gm');
  return [...output.matchAll(re)].map((match) => match[1]);
}
