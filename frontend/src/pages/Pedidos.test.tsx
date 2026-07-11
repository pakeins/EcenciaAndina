/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import Pedidos from './Pedidos';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'administrador' } }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useNavigate: () => vi.fn(),
    Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  };
});

// Mocking subcomponents if needed
vi.mock('@/components/orders/NewOrderDialog', () => ({
  NewOrderDialog: () => <div data-testid="new-order-dialog" />
}));
vi.mock('@/components/orders/EditOrderDialog', () => ({
  EditOrderDialog: () => <div data-testid="edit-order-dialog" />
}));

describe('Pedidos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente y simula carga de datos (smoke test)', async () => {
    const mockOrders = [
      {
        id_orden: 'o1',
        created_at: new Date().toISOString(),
        id_cliente: 'c1',
        id_estado: 1,
        total_productos: 2,
        total_pagar: 7.5,
        clientes: {
          nombre: 'Juan',
          apellido: 'Perez',
          telefono: '0999999999',
          tipos_cliente: { nombre_tipo: 'Cliente Convenio' }
        },
        estados_orden: { nombre_estado: 'Reservado' },
        opciones: { sopa: 'Locro', segundo: 'Seco' }
      }
    ];
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOrders)
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Pedidos />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(screen.getByText('Lista de Pedidos')).toBeInTheDocument();
  });

  it('filtra pedidos por busqueda y estado', async () => {
    const mockOrders = [
      {
        id_orden: 'o1', created_at: new Date().toISOString(), id_cliente: 'c1', id_estado: 1, total_productos: 2, total_pagar: 7.5,
        clientes: { nombre: 'Juan', apellido: 'Perez', telefono: '0999999999', tipos_cliente: { nombre_tipo: 'Cliente Convenio' } },
        estados_orden: { nombre_estado: 'Pendiente' }, opciones: { sopa: 'Locro', segundo: 'Seco' }
      },
      {
        id_orden: 'o2', created_at: new Date().toISOString(), id_cliente: 'c2', id_estado: 2, total_productos: 1, total_pagar: 3.5,
        clientes: { nombre: 'Maria', apellido: 'Gomez', telefono: '0988888888', tipos_cliente: { nombre_tipo: 'Cliente Normal' } },
        estados_orden: { nombre_estado: 'Entregado' }, opciones: { segundo: 'Chaulafan' }
      }
    ];
    (apiFetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOrders) });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Pedidos />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    const searchInput = screen.getByPlaceholderText(/buscar/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Juan' } });
    });
    
    expect(screen.queryByText('Maria Gomez')).not.toBeInTheDocument();
  });
});
