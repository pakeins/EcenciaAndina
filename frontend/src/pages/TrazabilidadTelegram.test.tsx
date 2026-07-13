import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrazabilidadTelegram from './TrazabilidadTelegram';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000',
}));

import { apiFetch } from '@/lib/api';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

const mockResponse = (data: unknown, ok = true) =>
  ({ ok, json: vi.fn().mockResolvedValue(data) } as unknown as Response);

const emptyResponse = {
  traces: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

describe('TrazabilidadTelegram', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(emptyResponse));
  });

  it('se renderiza correctamente y carga trazas vacias', async () => {
    await act(async () => {
      render(<TrazabilidadTelegram />, { wrapper });
    });

    await waitFor(() => {
      expect(screen.getByText('Trazabilidad Telegram')).toBeInTheDocument();
    });

    expect(apiFetch).toHaveBeenCalledOnce();
  });

  it('muestra error cuando la API falla', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ error: 'Server error' }, false)
    );

    await act(async () => {
      render(<TrazabilidadTelegram />, { wrapper });
    });

    await waitFor(() => {
      expect(screen.getByText(/No se pudo|Server error/i)).toBeInTheDocument();
    });
  });

  it('muestra trazas cuando hay resultados', async () => {
    const mockTraces = {
      traces: [
        {
          id: 'trace-1',
          chat_id: '123456',
          outcome: 'confirmed',
          created_at: '2026-07-01T12:00:00Z',
          order_id: 'order-1',
          message: 'Pedido confirmado',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse(mockTraces));

    await act(async () => {
      render(<TrazabilidadTelegram />, { wrapper });
    });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
  });

  it('tiene controles de fecha y filtro de outcome', async () => {
    await act(async () => {
      render(<TrazabilidadTelegram />, { wrapper });
    });

    await waitFor(() => {
      expect(screen.getByText('Trazabilidad Telegram')).toBeInTheDocument();
    });

    // Verify filter controls are present
    const inputs = document.querySelectorAll('input[type="date"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});
