import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api';

describe('apiFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.cookie = 'eciencia_csrf_token=; Max-Age=0; path=/';
  });

  it('envia credenciales y token CSRF en solicitudes mutantes', async () => {
    document.cookie = 'eciencia_csrf_token=test-csrf; path=/';
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/clientes', { method: 'POST', body: JSON.stringify({}) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Headers).get('X-CSRF-Token')).toBe('test-csrf');
  });

  it('renueva sesion y reintenta una solicitud cuando recibe 401', async () => {
    document.cookie = 'eciencia_csrf_token=test-csrf; path=/';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await apiFetch('/clientes');

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(fetchMock.mock.calls[2][0]).toContain('/clientes');
  });
});
