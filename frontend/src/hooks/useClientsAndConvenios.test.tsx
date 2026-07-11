import { renderHook, waitFor } from '@testing-library/react';
import { useClientsAndConvenios } from './useClientsAndConvenios';
import { apiFetch } from '@/lib/api';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

describe('useClientsAndConvenios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetch clientes y convenios correctamente', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/clientes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'c1', nombre: 'Test Cliente' }]) });
      }
      if (url.includes('/convenios')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 'conv1', nombre_empresa: 'Test Convenio' }]) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useClientsAndConvenios(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.clientes).toHaveLength(1);
    expect(result.current.convenios).toHaveLength(1);
  });

  it('maneja error cuando falla la petición de clientes', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/clientes')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useClientsAndConvenios(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toContain('Error al obtener clientes');
  });

  it('maneja error cuando falla la petición de convenios', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/convenios')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const { result } = renderHook(() => useClientsAndConvenios(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          {children}
        </QueryClientProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error?.message).toContain('Error al obtener convenios');
  });
});
