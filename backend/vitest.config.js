import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', // Usa procesos hijos en lugar de hilos (worker_threads) para evitar memory leaks o crashes con supertest
    fileParallelism: false, // EJECUTA LOS TESTS EN SERIE PARA EVITAR EL BUG DE COVERAGE DE V8
    setupFiles: ['dotenv/config'],
    coverage: {
      provider: 'istanbul',
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
