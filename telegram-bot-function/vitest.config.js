import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });
dotenv.config({ path: './.env.local', override: true });

export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
    },
  },
});
