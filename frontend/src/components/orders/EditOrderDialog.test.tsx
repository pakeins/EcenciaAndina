import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditOrderDialog } from './EditOrderDialog';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  API_BASE_URL: 'http://localhost:3000/api',
}));

const queryClient = new QueryClient();

describe('EditOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  });

  const renderComponent = (open = true) => {
    const mockOrder = {
      id_orden: '1',
      estado: 'reservado' as const,
      fecha_pedido: new Date().toISOString(),
      detalles: []
    } as Parameters<typeof EditOrderDialog>[0]['order'];

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <EditOrderDialog open={open} onOpenChange={vi.fn()} order={mockOrder} onUpdate={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('se renderiza correctamente', () => {
    renderComponent();
    expect(screen.getByText('Editar Pedido')).toBeInTheDocument();
    expect(screen.getByText(/Modificando pedido de/i)).toBeInTheDocument();
  });
});
