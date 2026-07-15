const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'n8n/**',          // archivos internos y caché de n8n
      'coverage/**',     // reportes de cobertura generados
      'test_output.txt',
      'seed-menu.js',
      'check-db.js',
      'create-table.js',
      'test-smtp.js',
      'keep-tunnel-alive.js',
      'get-outlook-token.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.js', '**/*.suite.js', 'vitest.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
];
