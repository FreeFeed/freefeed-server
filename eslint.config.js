import globals from 'globals';
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import { fixupPluginRules } from '@eslint/compat';
import youDontNeedLodashUnderscore from 'eslint-plugin-you-dont-need-lodash-underscore';
import lodash from 'eslint-plugin-lodash';
import promise from 'eslint-plugin-promise';

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    settings: {
      'import-x/resolver-next': [
        createNodeResolver({ extensions: ['.js', '.ts', '.jsx', '.mjs'] }),
      ],
    },
  },
  {
    files: ['test/**'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
  },
  js.configs.recommended,
  ts.configs.strict,
  ts.configs.stylistic,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  promise.configs['flat/recommended'],
  {
    plugins: {
      'you-dont-need-lodash-underscore': fixupPluginRules(youDontNeedLodashUnderscore),
      lodash: fixupPluginRules(lodash),
    },
    rules: {
      ...youDontNeedLodashUnderscore.configs['compatible-warn'].rules,
      ...lodash.configs['recommended'].rules,
    },
  },
  {
    files: ['test/**'],
    rules: {
      'promise/no-callback-in-promise': 'off',
      'promise/always-return': 'off',
    },
  },
  {
    files: ['app/controllers/api/**'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    rules: {
      'import-x/no-duplicates': 'error',
      'import-x/no-extraneous-dependencies': 'error',
      'import-x/no-mutable-exports': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
        },
      ],
      'consistent-return': 'error',
      curly: 'error',
      'func-name-matching': 'error',
      'max-statements-per-line': ['error', { max: 1 }],
      'no-await-in-loop': 'error',
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-native-reassign': 'error',
      'no-nested-ternary': 'error',
      'no-constant-condition': 'error',
      'no-restricted-properties': [
        'warn',
        {
          object: '_',
          property: 'extend',
          message: 'consider using [...arr] or { ...obj } instead',
        },
      ],
      'no-shadow': ['error', { allow: ['err', 'res'] }],
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-computed-key': 'error',
      'no-var': 'error',
      'no-warning-comments': 'warn',
      'object-shorthand': ['error', 'properties'],
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'block' },
        { blankLine: 'always', prev: '*', next: 'for' },
        { blankLine: 'always', prev: '*', next: 'if' },
        { blankLine: 'always', prev: '*', next: 'switch' },
        { blankLine: 'always', prev: '*', next: 'try' },
        { blankLine: 'always', prev: '*', next: 'while' },
        { blankLine: 'always', prev: 'block', next: '*' },
        { blankLine: 'always', prev: 'for', next: '*' },
        { blankLine: 'always', prev: 'if', next: '*' },
        { blankLine: 'always', prev: 'switch', next: '*' },
        { blankLine: 'always', prev: 'try', next: '*' },
        { blankLine: 'always', prev: 'while', next: '*' },
      ],
      'prefer-const': 'error',
      'prefer-destructuring': 'error',
      'prefer-numeric-literals': 'warn',
      'prefer-object-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'require-atomic-updates': 'off',
      'require-await': 'error',
      'spaced-comment': ['error', 'always', { exceptions: ['/'] }],
      strict: ['error', 'never'],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }],
      '@typescript-eslint/parameter-properties': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      'you-dont-need-lodash-underscore/find': 'error',
      'you-dont-need-lodash-underscore/find-index': 'error',
      'you-dont-need-lodash-underscore/includes': 'error',
      'you-dont-need-lodash-underscore/uniq': 'off',
      'lodash/prefer-lodash-method': 'off',
      'lodash/prefer-lodash-typecheck': 'off',
      'lodash/import-scope': 'off', // TODO set to `['warn', 'member']`
      'lodash/prefer-constant': 'off',
      'lodash/prefer-noop': 'off',
      'lodash/prefer-lodash-chain': 'off',
    },
  },

  // Must be the last
  prettierRecommended,
]);
