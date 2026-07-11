import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, Mock } from 'vitest';
import { useClientsAndConvenios } from './useClientsAndConvenios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

describe('useClientsAndConvenios', () => {
  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  it('debe obtener clientes y convenios exitosamente', async () => {
    (apiFetch as Mock).mockImplementation(async (url: string) => {
      if (url === '/clientes') {
        return { ok: true, json: async () => [{ id: 1, nombre: 'Cliente 1' }] };
      }
      if (url === '/convenios') {
        return { ok: true, json: async () => [{ id: 1, nombre_empresa: 'Convenio 1' }] };
      }
      return { ok: false };
    });

    const { result } = renderHook(() => useClientsAndConvenios(), { wrapper: createWrapper() });
    
    // Al principio está cargando
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.clientes).toEqual([{ id: 1, nombre: 'Cliente 1' }]);
    expect(result.current.convenios).toEqual([{ id: 1, nombre_empresa: 'Convenio 1' }]);
    expect(result.current.isError).toBe(false);
  });

  it('debe manejar errores de la API', async () => {
    (apiFetch as Mock).mockImplementation(async (url: string) => {
      return { ok: false, status: 500 };
    });

    const { result } = renderHook(() => useClientsAndConvenios(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.clientes).toEqual([]);
    expect(result.current.convenios).toEqual([]);
  });
});
