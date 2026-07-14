import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', // Usa procesos hijos en lugar de hilos (worker_threads) para evitar memory leaks o crashes con supertest
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
  },
});
