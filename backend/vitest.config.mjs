import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });
dotenv.config({ path: './.env.local', override: true });

export default defineConfig({
  test: {
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.jsx', 'src/**/*.tsx'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
    },
  },
});
