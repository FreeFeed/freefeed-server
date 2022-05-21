/**
 * Transpile imported/required files using esbuild
 */
const mmodule = require('module');
const fs = require('fs');
const path = require('path');

const esbuild = require('esbuild');
const sourceMapSupport = require('source-map-support');

const preprocess = require('./preprocess.cjs');

const allSourceMaps = new Map();

sourceMapSupport.install({
  handleUncaughtExceptions: false,
  retrieveSourceMap: (filename) => {
    if (allSourceMaps.has(filename)) {
      return {
        url: filename,
        map: allSourceMaps.get(filename),
      };
    }

    return null;
  },
});

const esbuildOptions = {
  format: 'cjs',
  logLevel: 'error',
  target: [`node${process.version.slice(1)}`],
  minify: false,
  sourcemap: true,
};

const loaders = {
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.jsx': 'jsx',
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.json': 'json',
};

/**
 * Patch the Node CJS loader to suppress the ESM error
 * https://github.com/nodejs/node/blob/069b5df/lib/internal/modules/cjs/loader.js#L1125
 *
 * As per https://github.com/standard-things/esm/issues/868#issuecomment-594480715
 */
const jsHandler = mmodule._extensions['.js'];
mmodule._extensions['.js'] = (mod, filename) => {
  try {
    jsHandler.call(this, mod, filename);
  } catch (error) {
    if (error.code !== 'ERR_REQUIRE_ESM') {
      throw error;
    }

    const content = fs.readFileSync(filename, 'utf8');
    mod._compile(transpile(content, filename), filename);
  }
};

for (const ext in loaders) {
  const defaultLoader = mmodule._extensions[ext] || mmodule._extensions['.js'];

  mmodule._extensions[ext] = (mod, filename) => {
    // Transpile all known types except for node_modules
    if (path.extname(filename) in loaders && !/node_modules/.test(filename)) {
      const defaultCompile = mod._compile;
      mod._compile = (code) => {
        mod._compile = defaultCompile;
        return mod._compile(transpile(code, filename), filename);
      };
    }

    defaultLoader(mod, filename);
  };
}

function transpile(code, filename) {
  const { code: newCode, map } = esbuild.transformSync(preprocess(code, filename), {
    ...esbuildOptions,
    loader: loaders[path.extname(filename)],
    sourcefile: filename,
  });
  allSourceMaps.set(filename, map);
  return newCode;
}
