/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import Convenios from './Convenios';
import { apiFetch } from '@/lib/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Mock dependencias
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

describe('Convenios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = async () => {
    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Convenios />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });
  };

  it('se renderiza correctamente y maneja carga de datos', async () => {
    const mockConvenios = [
      {
        id_convenio: 'conv1',
        nombre_convenio: 'Convenio de Prueba',
        empresa: 'Empresa A',
        activo: true,
        fecha_caducidad: '2026-12-31',
        cupo_maximo: 50,
        porcentaje_descuento: 10,
        registrados_count: 5
      }
    ];
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockConvenios)
    });

    await renderComponent();

    // Validar renderizado básico
    expect(screen.getByText('Convenios')).toBeInTheDocument();
    expect(screen.getByText(/Nuevo Convenio/i)).toBeInTheDocument();
  });
});
