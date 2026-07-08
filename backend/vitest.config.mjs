import { defineConfig } from 'vitest/config';

// Credenciales dummy para que los modulos que crean el cliente de Supabase
// puedan importarse en entornos sin .env (Cloud Build). Los tests siempre
// inyectan sus propios clientes simulados.
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      }
    },
    env: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      TELEGRAM_BOT_USERNAME: 'eciencia_test_bot',
      TELEGRAM_BOT_TOKEN: 'dummy-telegram-token-for-tests',
      TELEGRAM_PRIVACY_CONTACT: 'privacy@example.test',
      TELEGRAM_PRIVACY_POLICY_URL: 'https://example.test/privacidad',
      TELEGRAM_CONSENT_VERSION: 'EC-LOPDP-TEST',
      TELEGRAM_INVITE_TOKEN_SECRET: 'test-secret-with-at-least-thirty-two-characters',
    },
  },
});
