require('@babel/register');
const config = require('config');


module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:import/typescript'
  ],
  parser:  '@typescript-eslint/parser',
  plugins: [
    'babel',
    'import',
    'lodash',
    'promise',
    'you-dont-need-lodash-underscore',
    '@typescript-eslint'
  ],
  env: {
    node: true,
    es6:  true
  },
  parserOptions: {
    ecmaVersion:  2018,
    sourceType:   'module',
    ecmaFeatures: { jsx: true }
  },
  rules: {
    'array-bracket-spacing':             [2, 'never'],
    'arrow-parens':                      2,
    'arrow-spacing':                     2,
    'brace-style':                       [2, '1tbs', { allowSingleLine: true }],
    'comma-spacing':                     2,
    'comma-style':                       2,
    'consistent-return':                 2,
    curly:                               2,
    'eol-last':                          2,
    'func-call-spacing':                 2,
    'func-name-matching':                2,
    'import/default':                    2,
    'import/named':                      2,
    'import/namespace':                  2,
    'import/newline-after-import':       [2, { count: 2 }],
    'import/no-duplicates':              2,
    'import/no-extraneous-dependencies': 2,
    'import/no-mutable-exports':         2,
    'import/no-named-as-default':        2,
    'import/no-named-as-default-member': 2,
    'import/no-unresolved':              2,
    'import/order':                      [
      2,
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'always'
      }
    ],
    indent:            [2, 2, { SwitchCase: 1 }],
    'key-spacing':     [2, { align: 'value' }],
    'keyword-spacing': 2,
    // By default the eslint-linebreak-style directive requires "windows" linebreaks
    // on Windows platform and "unix" linebreaks otherwise.
    // You can override this behavior by setting the eslint.linebreakStyle config
    // parameter explicitly to "windows" or "unix".
    'linebreak-style': [
      2,
      config.get('eslint.linebreakStyle') || (process.platform === 'win32' ? 'windows' : 'unix')
    ],
    'lodash/callback-binding':        2,
    'lodash/collection-method-value': 2,
    'lodash/collection-return':       2,
    'lodash/no-double-unwrap':        2,
    'lodash/no-extra-args':           2,
    'lodash/prefer-compact':          2,
    'lodash/prefer-filter':           2,
    'lodash/prefer-map':              2,
    'lodash/unwrap':                  2,
    'max-statements-per-line':        [2, { max: 1 }],
    'no-async-promise-executor':      2,
    'no-await-in-loop':               2,
    'no-control-regex':               0,
    'no-debugger':                    2,
    'no-duplicate-imports':           2,
    'no-else-return':                 2,
    'no-global-assign':               2,
    'no-lonely-if':                   2,
    'no-misleading-character-class':  2,
    'no-mixed-operators':             2,
    'no-multiple-empty-lines':        2,
    'no-native-reassign':             2,
    'no-nested-ternary':              2,
    'no-prototype-builtins':          0,
    'no-restricted-properties':       [
      1,
      {
        object:   '_',
        property: 'extend',
        message:  'consider using [...arr] or { ...obj } instead'
      }
    ],
    'no-shadow':                        [2, { allow: ['err', 'res'] }],
    'no-spaced-func':                   2,
    'no-tabs':                          2,
    'no-template-curly-in-string':      2,
    'no-throw-literal':                 2,
    'no-trailing-spaces':               2,
    'no-undef':                         2,
    'no-unneeded-ternary':              2,
    'no-unsafe-negation':               2,
    'no-useless-computed-key':          2,
    'no-var':                           2,
    'no-warning-comments':              1,
    'nonblock-statement-body-position': [2, 'below'],
    'object-curly-newline':             [2, { multiline: true }],
    'babel/object-curly-spacing':       [2, 'always'],
    'object-shorthand':                 [2, 'properties'],
    'padded-blocks':                    [2, 'never'],
    'padding-line-between-statements':  [
      2,
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
      { blankLine: 'always', prev: 'while', next: '*' }
    ],
    'prefer-arrow-callback':       [2, { allowNamedFunctions: true }],
    'prefer-const':                2,
    'prefer-destructuring':        2,
    'prefer-numeric-literals':     1,
    'prefer-object-spread':        2,
    'prefer-rest-params':          2,
    'prefer-spread':               2,
    'prefer-template':             2,
    'promise/param-names':         2,
    'promise/catch-or-return':     2,
    'promise/no-native':           0,
    quotes:                        [2, 'single', { avoidEscape: true, allowTemplateLiterals: true }],
    'require-atomic-updates':      0,
    'require-yield':               0,
    'rest-spread-spacing':         2,
    'require-await':               2,
    'space-before-blocks':         2,
    'space-before-function-paren': [
      2,
      {
        anonymous:  'always',
        asyncArrow: 'always',
        named:      'never'
      }
    ],
    'space-in-parens':        [2, 'never'],
    'space-infix-ops':        2,
    'space-unary-ops':        [2, { words: true, nonwords: false }],
    'spaced-comment':         [2, 'always', { exceptions: ['/'] }],
    strict:                   [2, 'never'],
    'template-curly-spacing': 2,
    'unicode-bom':            2,

    'you-dont-need-lodash-underscore/assign':     2,
    'you-dont-need-lodash-underscore/concat':     2,
    'you-dont-need-lodash-underscore/find':       2,
    'you-dont-need-lodash-underscore/find-index': 2,
    'you-dont-need-lodash-underscore/includes':   2,
    'you-dont-need-lodash-underscore/index-of':   2,
    'you-dont-need-lodash-underscore/keys':       2,
    'you-dont-need-lodash-underscore/repeat':     2,
    'you-dont-need-lodash-underscore/reverse':    2,
    'you-dont-need-lodash-underscore/to-lower':   2,
    'you-dont-need-lodash-underscore/to-upper':   2,
    'you-dont-need-lodash-underscore/trim':       2,
    'you-dont-need-lodash-underscore/values':     2,

    'no-unused-vars':                    'off',
    '@typescript-eslint/no-unused-vars': ['error']
  }
};
