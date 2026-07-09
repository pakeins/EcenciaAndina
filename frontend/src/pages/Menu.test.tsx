/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Menu from './Menu';
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

describe('Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente y simula carga inicial (smoke test)', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/alimentos/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_categoria_menu: 1, nombre_categoria: 'Sopas' },
            { id_categoria_menu: 2, nombre_categoria: 'Segundos' },
          ])
        });
      }
      if (url.includes('/alimentos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { id_alimento: 1, nombre_alimento: 'Locro', id_categoria_menu: 1 }
          ])
        });
      }
      if (url.includes('/productos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      if (url.includes('/menu')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              fecha: '2026-06-10',
              estado: 'activo',
              opciones: {
                '1': ['Locro de Papa'],
                '2': ['Seco de Pollo']
              },
              imagen_url: null,
            }
          ])
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <Menu />
          </MemoryRouter>
        </QueryClientProvider>
      );
    });

    expect(screen.getAllByText(/Menú/i)[0]).toBeInTheDocument();
  });
});
