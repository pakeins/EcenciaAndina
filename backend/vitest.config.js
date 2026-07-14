import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        isolate: false // Runs tests in the same context so v8 coverage isn't lost across files
      }
    },
    setupFiles: ['dotenv/config'],
    coverage: {
      all: true,
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
  },
});
