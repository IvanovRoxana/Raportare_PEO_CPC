const browserGlobals = {
  AbortController: 'readonly',
  Blob: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  File: 'readonly',
  FormData: 'readonly',
  Headers: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  window: 'readonly',
};

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
};

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'amplify_outputs.json',
      'package-lock.json',
      'public/**',
      'data/**/*.json',
      '**/*.d.ts',
      '**/*.ts',
      '**/*.tsx',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
      },
    },
    rules: {
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-irregular-whitespace': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
  },
];
