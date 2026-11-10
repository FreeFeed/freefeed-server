import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Module loaders', () => {
  for (const flag of ['--import', '--require']) {
    it(`resolves extensionless modules and transforms JSX with ${flag}`, () => {
      const directory = mkdtempSync(fileURLToPath(new URL('./loader-fixture-', import.meta.url)));

      try {
        const files = {
          'package.json': '{"type":"module"}',
          'index.js': 'export default "root";',
          'value.js': 'export default "js";',
          'value.ts': 'export default "ts";',
          'typed.ts': 'const value: string = "typed"; export default value;',
          'element.jsx': 'export default <span>test</span>;',
          'data.json': '{"value":42}',
        };

        for (const [name, content] of Object.entries(files)) {
          writeFileSync(join(directory, name), content);
        }

        mkdirSync(join(directory, 'nested'));
        writeFileSync(join(directory, 'nested/index.ts'), 'export default "index";');

        const registerURL = new URL('../../loaders/register.js', import.meta.url);
        const result = spawnSync(
          process.execPath,
          [
            flag,
            flag === '--import' ? registerURL.href : fileURLToPath(registerURL),
            '--input-type=module',
          ],
          {
            cwd: directory,
            encoding: 'utf8',
            input: `
              import assert from 'node:assert/strict';
              import { join } from 'node:path';
              import { createRequire } from 'node:module';
              import { pathToFileURL } from 'node:url';
              const value = async (path) => (await import(path)).default;
              assert.equal(await value('./value'), 'js');
              assert.equal(await value('./value.ts'), 'ts');
              assert.equal(await value('./typed'), 'typed');
              assert.equal((await value('./element')).type, 'span');
              assert.equal(await value('./nested'), 'index');
              assert.equal(await value('./nested/'), 'index');
              assert.equal(await value('.'), 'root');
              assert.equal(await value(pathToFileURL(join(process.cwd(), 'typed')).href), 'typed');
              assert.equal(await value(join(process.cwd(), 'typed')), 'typed');
              assert.equal((await import('./data', { with: { type: 'json' } })).default.value, 42);
              assert.equal(typeof (await import('react')).createElement, 'function');
              const require = createRequire(import.meta.url);
              assert.equal(require('./value').default, 'js');
              assert.equal(require('./typed').default, 'typed');
              await assert.rejects(import('./missing'), { code: 'ERR_MODULE_NOT_FOUND' });
              await assert.rejects(import('missing-loader-test-package'), { code: 'ERR_MODULE_NOT_FOUND' });
            `,
          },
        );
        assert.equal(result.status, 0, result.stderr || result.error?.message);
        assert.doesNotMatch(result.stderr, /DEP0205/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
