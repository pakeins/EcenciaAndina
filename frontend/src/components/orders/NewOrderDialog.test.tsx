import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NewOrderDialog } from './NewOrderDialog';
import * as useClientsAndConvenios from '@/hooks/useClientsAndConvenios';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/useClientsAndConvenios');

const queryClient = new QueryClient();

describe('NewOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = (open = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NewOrderDialog open={open} onOpenChange={vi.fn()} onCreate={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('se renderiza correctamente', () => {
    vi.spyOn(useClientsAndConvenios, 'useClientsAndConvenios').mockReturnValue({
      clientes: [{ id: '1', nombre: 'Juan', apellido: 'Perez', cedula: '123' } as unknown as ReturnType<typeof useClientsAndConvenios.useClientsAndConvenios>['clientes'][number]],
      convenios: [],
      isLoading: false,
      refetchClients: vi.fn(),
    });

    renderComponent();
    expect(screen.getByText('Nuevo Pedido')).toBeInTheDocument();
    expect(screen.getByText('Registre un pedido manualmente')).toBeInTheDocument();
  });
});
