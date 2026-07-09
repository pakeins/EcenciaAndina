/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Productos from './Productos';
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

describe('Productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se renderiza correctamente y simula carga de datos (smoke test)', async () => {
    const mockProducts = [
      {
        id: 'prod1',
        nombre: 'Locro de Papa',
        precio: 3.5,
        activo: true,
        id_categoria: 1,
        categoria_nombre: 'Sopas',
        descripcion: 'Sopa típica ecuatoriana'
      }
    ];
    const mockCategories = [
      {
        id_categoria: 1,
        nombre_categoria: 'Sopas'
      }
    ];

    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/productos')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProducts)
        });
      }
      if (url.includes('/categorias')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories)
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <Productos />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Catálogo de Productos')).toBeInTheDocument();
  });
});
