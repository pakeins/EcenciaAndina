import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const supabaseJsPath = require.resolve('@supabase/supabase-js');

const mockCreateClient = vi.fn(() => ({ type: 'supabase-client' }));

delete require.cache[supabaseJsPath];
require.cache[supabaseJsPath] = {
  id: supabaseJsPath,
  filename: supabaseJsPath,
  loaded: true,
  exports: {
    createClient: mockCreateClient
  }
};

describe('supabase config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes supabase client and getAdminClient works', async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    process.env.SUPABASE_URL = 'http://test-url.com';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const supabasePath = require.resolve('../config/supabase.js');
    delete require.cache[supabasePath];

    // Use dynamic import with query parameter to bypass cache
    const supabaseConfig = await import('../config/supabase.js?t=1');

    expect(mockCreateClient).toHaveBeenCalledWith(
      'http://test-url.com',
      'test-key',
      expect.any(Object)
    );

    const adminClient = supabaseConfig.getAdminClient();
    expect(adminClient).toEqual({ type: 'supabase-client' });

    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('logs error when env vars are missing', async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Use empty strings to trigger the warning without crashing the mock client creation
    process.env.SUPABASE_URL = '';
    process.env.SUPABASE_SERVICE_ROLE_KEY = '';

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const supabasePath = require.resolve('../config/supabase.js');
    delete require.cache[supabasePath];

    await import('../config/supabase.js?t=2');

    expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Faltan credenciales de Supabase en el archivo .env');

    consoleErrorSpy.mockRestore();
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
});
