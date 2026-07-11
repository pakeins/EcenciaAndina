/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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

  it('permite buscar productos', async () => {
    const mockProducts = [
      { id: 'prod1', nombre: 'Locro de Papa', precio: 3.5, activo: true, id_categoria: 1, categoria_nombre: 'Sopas', descripcion: '' },
      { id: 'prod2', nombre: 'Chaulafan', precio: 4.5, activo: true, id_categoria: 2, categoria_nombre: 'Segundos', descripcion: '' }
    ];
    const mockCategories = [{ id_categoria: 1, nombre_categoria: 'Sopas' }, { id_categoria: 2, nombre_categoria: 'Segundos' }];
    
    (apiFetch as any).mockImplementation((url: string) => {
      if (url.includes('/productos')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockProducts) });
      }
      if (url.includes('/categorias')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategories) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await act(async () => {
      render(<MemoryRouter><Productos /></MemoryRouter>);
    });

    const searchInput = screen.getByPlaceholderText(/Buscar producto.../i);
    
    fireEvent.change(searchInput, { target: { value: 'Locro' } });
    
    expect(screen.queryByText('Chaulafan')).not.toBeInTheDocument();
  });

  it('permite abrir el modal de nuevo producto', async () => {
    (apiFetch as any).mockImplementation((url: string) => {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    await act(async () => {
      render(<MemoryRouter><Productos /></MemoryRouter>);
    });

    const btnNuevo = screen.getByText('Nuevo Producto');
    fireEvent.click(btnNuevo);

    expect(screen.getByText('Nombre del Producto *')).toBeInTheDocument();
  });
});
