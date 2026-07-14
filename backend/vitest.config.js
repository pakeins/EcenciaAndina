import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    setupFiles: ['dotenv/config'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'src/test/**',
        '**/*.test.js',
        '**/*.suite.js',
        'node_modules/**',
      ],
    },
    environment: 'node',
  },
});
