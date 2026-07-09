import { defineConfig } from 'vitest/config';

// Credenciales dummy para que los modulos que crean el cliente de Supabase
// puedan importarse en entornos sin .env (Cloud Build). Los tests siempre
// inyectan sus propios clientes simulados.
export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.js'],
    hookTimeout: 60000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      // Excluir archivos de infraestructura que no son logica de negocio
      exclude: [
        'index.js',           // Bootstrap de Express (puerto, middlewares globales)
        'src/test/**',        // Archivos de test no se cuentan
        'node_modules/**',
      ],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
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
