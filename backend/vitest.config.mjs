import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });
dotenv.config({ path: './.env.local', override: true });

export default defineConfig({
  test: {
    maxWorkers: 1,
    minWorkers: 1,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
      ],
    },
  },
});
