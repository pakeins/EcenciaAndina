/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HistorialPedidos from './HistorialPedidos';
import { apiFetch } from '@/lib/api';
import { MemoryRouter } from 'react-router-dom';

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
  };
});

describe('HistorialPedidos', () => {
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
        <MemoryRouter>
          <HistorialPedidos />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Historial de Pedidos')).toBeInTheDocument();
  });
});
