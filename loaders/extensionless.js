// Adapted from https://github.com/barhun/extensionless (see extensionless.LICENSE).
import { extname } from 'node:path';

const extensions = ['js', 'ts', 'jsx'];
const knownExtensions = ['.js', '.ts', '.jsx', '.cjs', '.mjs', '.json', '.node', '.wasm'];
const pathPrefixes = ['./', '../', '/', 'file:', '.\\', '..\\', '\\'];

export function resolve(specifier, context, nextResolve) {
  const windowsPath = /^[/\\]?[a-z]:[/\\]/i.test(specifier);
  let error;

  if (
    context.conditions.includes('require') ||
    (!windowsPath &&
      !['.', '..'].includes(specifier) &&
      !pathPrefixes.some((p) => specifier.startsWith(p)))
  ) {
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      error = e;
    }
  }

  const target = error
    ? specifier
    : new URL((windowsPath ? 'file://' : '') + specifier, context.parentURL).href;
  const lookFor = context.importAttributes?.type === 'json' ? ['json'] : extensions;
  let postfixes = [];

  if (target.endsWith('/')) {
    postfixes = lookFor.map((ext) => `index.${ext}`);
  } else if (!knownExtensions.includes(extname(target))) {
    postfixes = lookFor.map((ext) => `.${ext}`).concat(lookFor.map((ext) => `/index.${ext}`));
  }

  for (const postfix of postfixes) {
    try {
      return nextResolve(target + postfix, context);
    } catch {
      // Try the next candidate, then preserve the original resolution error.
    }
  }

  if (error) {
    throw error;
  }

  return nextResolve(target, context);
}
