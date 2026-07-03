import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, clearCsrfToken, csrfHeaders, rememberCsrfToken } from './api';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiFetch CSRF handling', () => {
  beforeEach(() => {
    window.__APP_CONFIG__ = {};
    clearCsrfToken();
    document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    vi.restoreAllMocks();
  });

  it('usa la URL del API desde la configuracion runtime', async () => {
    vi.resetModules();
    window.__APP_CONFIG__ = { apiBaseUrl: 'https://backend.example.com/api/' };

    const { API_BASE_URL: runtimeApiBaseUrl } = await import('./api');

    expect(runtimeApiBaseUrl).toBe('https://backend.example.com/api');
  });

  it('usa el token CSRF guardado cuando la cookie no es legible para el frontend', () => {
    rememberCsrfToken('token-from-session');

    expect(csrfHeaders()).toEqual({ 'X-CSRF-Token': 'token-from-session' });
  });

  it('recupera el token CSRF y reintenta una peticion mutante rechazada', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      calls.push([url, options]);

      if (calls.length === 1) {
        return jsonResponse({ error: 'Solicitud rechazada por proteccion CSRF.' }, 403);
      }

      if (url.endsWith('/auth/me')) {
        return jsonResponse({ user: { id: '1' }, csrfToken: 'fresh-token' });
      }

      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/menu/enviar', {
      method: 'POST',
      body: JSON.stringify({ sopas: ['Sopa'], segundos: ['Segundo'], guarniciones: ['Guarnicion'] }),
    });

    expect(response.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(calls[2][0]).toBe('http://localhost:3001/api/menu/enviar');
    expect(calls[2][1]?.headers).toMatchObject({ 'X-CSRF-Token': 'fresh-token' });
  });
});
