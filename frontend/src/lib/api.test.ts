import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, API_BASE_URL, handleGlobalLogout } from './api';

describe('api.ts', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    // Evitar que handleGlobalLogout redirija durante los tests
    Object.defineProperty(window, 'location', {
      value: { pathname: '/test', href: '' },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('apiFetch', () => {
    it('construye correctamente la url con API_BASE_URL si es relativa', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await apiFetch('/test-endpoint');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE_URL}/test-endpoint`, expect.any(Object));
    });

    it('no modifica la url si ya es absoluta', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await apiFetch('https://external.com/api');
      expect(fetch).toHaveBeenCalledWith('https://external.com/api', expect.any(Object));
    });

    it('añade el token a las cabeceras si existe en sessionStorage', async () => {
      sessionStorage.setItem('token', 'fake-token');
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      
      await apiFetch('/test');
      
      const args = vi.mocked(fetch).mock.calls[0][1];
      expect((args?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer fake-token');
    });

    it('intenta renovar el token si la respuesta es 401 y hay refresh_token', async () => {
      sessionStorage.setItem('token', 'old-token');
      sessionStorage.setItem('refresh_token', 'refresh-token');

      // Primer fetch falla (401)
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
      
      // Segundo fetch es el /auth/refresh que es exitoso
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'new-token', refresh_token: 'new-refresh-token' }), { status: 200 })
      );

      // Tercer fetch es el reintento de la petición original, ahora exitoso
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

      const res = await apiFetch('/test-retry');
      
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(sessionStorage.getItem('token')).toBe('new-token');
      expect(sessionStorage.getItem('refresh_token')).toBe('new-refresh-token');
      expect(res.status).toBe(200);
    });

    it('falla con excepcion "Sesión expirada" si el refresh token falla (ej. 403)', async () => {
      sessionStorage.setItem('token', 'old-token');
      sessionStorage.setItem('refresh_token', 'refresh-token');

      // 401 original
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
      
      // /auth/refresh falla (403)
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));

      await expect(apiFetch('/test-fail')).rejects.toThrow('Sesión expirada');
      // Debe haber limpiado el storage
      expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('lanza excepcion y desloguea si es 401 y no hay refresh token', async () => {
      sessionStorage.setItem('token', 'old-token'); // pero no refresh_token
      vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));

      await expect(apiFetch('/test-no-refresh')).rejects.toThrow('Sesión expirada');
      expect(sessionStorage.getItem('token')).toBeNull();
    });

    it('re-lanza cualquier otro error no manejado', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      await expect(apiFetch('/test-network')).rejects.toThrow('Network error');
    });
  });

  describe('handleGlobalLogout', () => {
    it('limpia sessionStorage y redirige si no esta en login', () => {
      sessionStorage.setItem('token', 't');
      sessionStorage.setItem('refresh_token', 'rt');
      sessionStorage.setItem('user', 'u');

      handleGlobalLogout();

      expect(sessionStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('refresh_token')).toBeNull();
      expect(sessionStorage.getItem('user')).toBeNull();
      expect(window.location.href).toBe('/login');
    });
  });
});
