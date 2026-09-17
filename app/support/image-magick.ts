import config from 'config';
import createDebug from 'debug';

import { spawnAsync } from './spawn-async';
import type { SpawnAsyncArgs, SpawnAsyncOptions } from './spawn-async';

type ImageMagickCommand = 'convert' | 'identify';
type Runner = { command: string | null; useMagickCli: boolean };

const debug = createDebug('freefeed:image-magick');

let detectedRunner: Promise<Runner> | null = null;

export async function runImageMagick(
  command: ImageMagickCommand,
  args: SpawnAsyncArgs,
  options: SpawnAsyncOptions & { binary: true },
): Promise<{ stdout: Buffer; stderr: string }>;
export async function runImageMagick(
  command: ImageMagickCommand,
  args: SpawnAsyncArgs,
  options?: SpawnAsyncOptions,
): Promise<{ stdout: string; stderr: string }>;
export async function runImageMagick(
  command: ImageMagickCommand,
  args: SpawnAsyncArgs,
  options: SpawnAsyncOptions = {},
): Promise<{ stdout: string | Buffer; stderr: string }> {
  const runner = await getRunner();
  const runnerArgs = runner.useMagickCli ? magickArgs(command, args) : args;

  debug('run %s %o', runner.command ?? command, runnerArgs.flat());
  return await spawnAsync(runner.command ?? command, runnerArgs, options);
}

function getRunner(): Promise<Runner> {
  detectedRunner ??= detectRunner();
  return detectedRunner;
}

async function detectRunner(): Promise<Runner> {
  const { command } = config.imageMagick;

  if (command === 'legacy') {
    debug('using legacy ImageMagick commands');
    return { command: null, useMagickCli: false };
  }

  if (command !== 'auto') {
    debug('using configured ImageMagick command: %s', command);
    return { command, useMagickCli: true };
  }

  try {
    await spawnAsync('magick', ['-version']);
    debug('using ImageMagick 7 magick CLI');
    return { command: 'magick', useMagickCli: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    debug('magick CLI is not available, using legacy commands: %s', message);
    return { command: null, useMagickCli: false };
  }
}

function magickArgs(command: ImageMagickCommand, args: SpawnAsyncArgs): SpawnAsyncArgs {
  return command === 'identify' ? ['identify', ...args] : args;
}
