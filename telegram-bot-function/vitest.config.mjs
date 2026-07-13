import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: 1,
    minWorkers: 1,
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test_key',
      TELEGRAM_BOT_TOKEN: 'test_bot_token',
      TELEGRAM_WEBHOOK_SECRET: 'test_secret'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      exclude: ['src/test/**/*', 'node_modules/**/*']
    }
  }
});
