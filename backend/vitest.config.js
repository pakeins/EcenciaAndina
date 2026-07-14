import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks', // Usa procesos hijos en lugar de hilos (worker_threads) para evitar memory leaks o crashes con supertest
    fileParallelism: false, // EJECUTA LOS TESTS EN SERIE PARA EVITAR EL BUG DE COVERAGE DE V8
    setupFiles: ['dotenv/config'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
    environment: 'node',
  },
});
