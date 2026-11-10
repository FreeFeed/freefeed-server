import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { transformSync } from 'esbuild';

export function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.jsx')) {
    const filename = fileURLToPath(url);
    const source = readFileSync(filename, 'utf8');

    const out = transformSync(source, {
      loader: 'jsx',
      format: 'esm',
      jsx: 'automatic',
      sourcemap: 'inline',
      sourcefile: filename,
    });

    return {
      format: 'module',
      source: out.code,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
